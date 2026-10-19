// API IA côté serveur (/api/*) : les clés ne quittent jamais le serveur.
// Le fournisseur (Gemini, Claude, Mistral, Ollama, Hugging Face…) se choisit dans l'onglet Réglages.
// Monté par Vite en dev/preview (vite.config.ts) et par server/serve.mjs en production.
import { generate, listModels, ProviderError } from './ai-providers.mjs';
import { loadSettings, saveSettings, mergeSettings, publicSettings, PROVIDERS } from './ai-settings.mjs';

const MAX_BODY_BYTES = 12 * 1024 * 1024; // photos de tablature comprises
const MAX_TEXT = 8000;
const MAX_HISTORY = 50;
const LEVELS = ['Débutant', 'Intermédiaire', 'Avancé', 'Inconnu'];
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif'];

const COACH_INSTRUCTION = `Tu es "Riffson", un coach guitare expert.
RÈGLES VISUELLES :
1. Titres Markdown (##).
2. Listes à puces.
3. Tags d'accords sur LIGNE SÉPARÉE (ex: \n\n[Em]\n\n).
4. Ton : Rock & Roll, concis.
5. Pédagogie : nomme les accords en entier la première fois (« Mi mineur (Em) ») avec leurs notes,
   et dis toujours ce que fait la main gauche (quel doigt, quelle case, quelle corde) et la main droite (quel doigt ou médiator, quel sens).
   Désigne les cordes par numéro et nom : corde 1 = Mi aigu (la plus fine) ... corde 6 = Mi grave (la plus épaisse).
DÉMOS JOUABLES : deux formats, à placer chacun seul sur sa propre ligne (jamais dans un bloc de code ni au milieu d'une phrase).
Place la démo TOUT DE SUITE après une phrase d'introduction, AVANT les explications, et reste bref ensuite :
la démo affiche déjà le diagramme de chaque accord (doigts, cases, cordes à vide), inutile de les re-décrire en détail.

1. SUITE D'ACCORDS (accords grattés : toutes les cordes ensemble) :
[ACCORDS:Nom|Tempo|accord:temps;accord:temps;...]
- accord : uniquement parmi les accords affichables en diagramme (voir plus bas) ; temps : nombre de coups de grattage (souvent 4).
- Exemple, cadence andalouse : [ACCORDS:Cadence andalouse|80|Am:4;G:4;F:4;E:4]
- À utiliser dès que l'élève demande des accords, une suite ou une grille d'accords, un accompagnement.

2. RIFF ou MÉLODIE (notes jouées UNE PAR UNE) :
[RIFF:Nom|Tempo|corde,case,durée;corde,case,durée;...]
- corde: 1(e) à 6(E) ; case: 0 à 22 (-1 pour silence) ; durée: 1.0 (noire), 0.5 (croche), 2.0 (blanche), 0.25 (double-croche).
- Exemple, Seven Nation Army : [RIFF:Seven Nation Army|120|5,7,1.5;5,7,0.5;5,10,0.75;5,7,0.75;5,5,0.5;5,3,2;5,2,2]
- Ne t'en sers JAMAIS pour présenter une suite d'accords. Pour un arpège (les notes d'un accord jouées l'une après l'autre),
  écris explicitement que ce sont les notes de l'accord jouées une par une, et pas l'accord gratté.`;

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const text = (value, name, max = MAX_TEXT) => {
  if (typeof value !== 'string' || !value.trim()) throw new HttpError(400, `Champ "${name}" manquant`);
  if (value.length > max) throw new HttpError(413, `Champ "${name}" trop long`);
  return value;
};

const level = (value) => {
  if (!LEVELS.includes(value)) throw new HttpError(400, 'Niveau invalide');
  return value;
};

const readJson = (req) => new Promise((resolve, reject) => {
  let size = 0;
  const chunks = [];
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      reject(new HttpError(413, 'Requête trop volumineuse'));
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on('end', () => {
    try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
    catch { reject(new HttpError(400, 'JSON invalide')); }
  });
  req.on('error', reject);
});

const lessonSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    description: { type: 'string' },
    content: { type: 'string' },
    duration: { type: 'string' },
    goalTitle: { type: 'string' },       // le morceau visé, ex : « Frère Jacques »
    goalDescription: { type: 'string' },
    recap: { type: 'array', items: { type: 'string' } },
    exercises: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          prompt: { type: 'string' },
          contextExplanation: { type: 'string' },
          leftHand: { type: 'string' },
          rightHand: { type: 'string' },
          chord: { type: 'string' },
          tempo: { type: 'number' },
          sequence: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                string: { type: 'number' },
                fret: { type: 'number' },
                duration: { type: 'number' },
                finger: { type: 'number' },
                lyric: { type: 'string' }
              },
              required: ['string', 'fret', 'duration']
            }
          },
          songTitle: { type: 'string' }
        },
        required: ['prompt', 'contextExplanation', 'leftHand', 'rightHand', 'tempo', 'sequence']
      }
    }
  },
  required: ['title', 'description', 'content', 'duration', 'goalTitle', 'recap', 'exercises']
};

// Tablature lue : une suite d'« événements » (une ou plusieurs notes jouées ensemble, et leur durée)
const scanSchema = {
  type: 'object',
  properties: {
    isTablature: { type: 'boolean' },
    title: { type: 'string' },
    tempo: { type: 'number' },
    events: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          notes: {
            type: 'array',
            items: {
              type: 'object',
              properties: { string: { type: 'number' }, fret: { type: 'number' } },
              required: ['string', 'fret']
            }
          },
          duration: { type: 'number' }
        },
        required: ['notes', 'duration']
      }
    }
  },
  required: ['isTablature', 'tempo', 'events']
};

const SCAN_INSTRUCTION = `Tu lis l'image d'une tablature de guitare et tu la transcris fidèlement.
D'ABORD : "isTablature" = true seulement si l'image contient vraiment une tablature (6 lignes horizontales avec des numéros
de cases). Sinon (photo, dessin, texte, partition sans tablature…) : isTablature = false et events = [] ; n'invente rien.
RÈGLES DE LECTURE :
- Une portée de tablature a 6 lignes horizontales. La ligne du HAUT est la corde 1 (Mi aigu, la plus fine) ;
  la 2e ligne est la corde 2 (Si) ; … ; la ligne du BAS est la corde 6 (Mi grave). Ne jamais inverser.
- Un nombre posé sur une ligne = la case à jouer sur cette corde (0 = corde à vide).
- Lis de gauche à droite, mesure après mesure, puis la portée suivante, de haut en bas de la page.
- Des nombres alignés verticalement (les uns au-dessus des autres) se jouent EN MÊME TEMPS :
  un seul événement contenant plusieurs notes.
- "duration" = durée de l'événement en temps (noire = 1, croche = 0.5, blanche = 2), d'après les hampes et
  ligatures sous la portée ; sans indication, répartis la mesure en 4 temps.
- "tempo" = nombre indiqué (ex. « ♩ = 110 »), sinon 80. "title" = titre du morceau s'il est écrit.
- Ignore les répétitions (« 6x », barres de reprise) : chaque mesure écrite une seule fois. Au plus 16 mesures.
- Ne transcris que les nombres réellement présents sur l'image, ne devine rien.
- Si un numéro rouge (1 à 6) est écrit à gauche d'une ligne, c'est le numéro de la corde : fie-toi à lui.`;

const routes = {
  // Conversation sans état côté serveur : le client renvoie l'historique à chaque message
  async chat(cfg, body) {
    const history = Array.isArray(body.history) ? body.history.slice(-MAX_HISTORY) : [];
    const messages = history.map((m) => ({
      role: m.role === 'model' ? 'assistant' : 'user',
      text: text(m.text, 'history.text')
    }));
    messages.push({ role: 'user', text: text(body.message, 'message') });
    const studentContext = typeof body.studentContext === 'string' ? body.studentContext.slice(0, 8000) : '';
    const reply = await generate(cfg, { system: `${COACH_INSTRUCTION}\n\n${studentContext}`, messages, effort: 'low' });
    return { text: reply };
  },

  async routine(cfg, body) {
    const reply = await generate(cfg, {
      effort: 'low',
      messages: [{ role: 'user', text: `Génère une routine d'entraînement quotidienne de 15 minutes pour un guitariste de niveau ${level(body.level)}.
Inclus des exercices techniques, un concept de théorie et un riff à pratiquer. Réponds en Markdown concis.` }]
    });
    return { text: reply };
  },

  async lesson(cfg, body) {
    const titles = Array.isArray(body.existingTitles)
      ? body.existingTitles.filter((t) => typeof t === 'string').slice(0, 100).map((t) => t.slice(0, 200))
      : [];
    const lesson = await generate(cfg, {
      schema: lessonSchema,
      effort: 'medium',
      messages: [{ role: 'user', text: `Crée une nouvelle leçon de guitare stimulante pour un niveau ${level(body.level)}.
Les leçons déjà apprises sont : ${titles.join(', ') || 'aucune'}.
La leçon doit être inédite. Inclus un titre, une description, un contenu pédagogique en markdown,
et des exercices interactifs (corde 1-6, case 0-12).
Pour les accords, utilise le format [NOM_ACCORD] sur une ligne seule, entouré de lignes vides.

STRUCTURE OBLIGATOIRE : la leçon vise un MORCEAU RECONNAISSABLE que l'élève connaît déjà.
- Choisis une mélodie dont tu connais les notes avec certitude : de préférence une chanson du domaine public
  (comptine, chant traditionnel, thème classique célèbre), sinon un riff très connu et court. Jamais de notes approximatives :
  à la fin, l'élève doit pouvoir dire « ah oui, c'est ce morceau ».
- "goalTitle" = le nom du morceau ; "goalDescription" = quel passage est joué.
- "exercises" = 3 à 5 étapes progressives, chacune avec sa "sequence" de notes (string, fret, duration en temps : 1 = noire,
  0.5 = croche ; "lyric" = syllabe chantée si le morceau a des paroles) et son "tempo" :
  d'abord les notes isolées, puis des fragments de phrase, et la DERNIÈRE étape = le passage complet au tempo du morceau.
- Le rythme doit être celui du morceau : c'est lui qui le rend reconnaissable.
- "recap" = 3 ou 4 phrases sur ce que l'élève a appris.

RÈGLES PÉDAGOGIQUES (l'élève peut être totalement novice) :
- Nomme toujours un accord en entier la première fois (ex : « Mi mineur (Em) ») et cite ses notes.
- Explique le lien entre la théorie et ce que l'élève joue (ex : un arpège = les notes de l'accord une par une).
- Pour chaque exercice, décris séparément la main gauche (doigt 1 index ... 4 auriculaire, case, corde, ou « rien à presser » pour une corde à vide)
  dans "leftHand" et la main droite (pouce, index, majeur, annulaire ou médiator, sens d'attaque) dans "rightHand".
- Désigne les cordes par leur numéro ET leur nom : corde 1 = Mi aigu (la plus fine) ... corde 6 = Mi grave (la plus épaisse).
- "finger" = doigt de la main gauche (absent pour une corde à vide). "chord" = accord tenu pendant l'exercice, seulement si la main gauche le tient vraiment.` }]
    });
    return { lesson };
  },

  async library(cfg, body) {
    const reply = await generate(cfg, {
      effort: 'low',
      messages: [{ role: 'user', text: `Explique de manière pédagogique le concept suivant : "${text(body.query, 'query', 500)}". Donne un diagramme si pertinent.
Public : Guitaristes de niveau ${level(body.level)}.
Utilise Markdown. Si tu mentionnes un accord, mets-le entre crochets sur une nouvelle ligne (ex: [C]).` }]
    });
    return { text: reply };
  },

  async scan(cfg, body) {
    if (!IMAGE_TYPES.includes(body.mimeType)) throw new HttpError(415, "Format d'image non supporté");
    // Notes déjà lues dans le navigateur (utils/tabImage.ts) : l'IA ne lit que le titre et le tempo
    if (body.metaOnly) {
      const meta = await generate(cfg, {
        schema: { type: 'object', properties: { title: { type: 'string' }, tempo: { type: 'number' } }, required: ['tempo'] },
        effort: 'low',
        messages: [{
          role: 'user',
          image: { mimeType: body.mimeType, data: text(body.image, 'image', MAX_BODY_BYTES) },
          text: 'Image de partition ou de tablature. Donne seulement "title" (le titre du morceau s\'il est écrit, sinon chaîne vide) et "tempo" (le nombre indiqué après le symbole de noire, ex. « ♩ = 110 » ; 0 si absent).'
        }]
      });
      return { title: meta?.title || '', tempo: meta?.tempo, events: [] };
    }
    const tab = await generate(cfg, {
      schema: scanSchema,
      effort: 'high', // lecture d'image minutieuse : chaque chiffre et chaque ligne compte
      messages: [{
        role: 'user',
        image: { mimeType: body.mimeType, data: text(body.image, 'image', MAX_BODY_BYTES) },
        text: SCAN_INSTRUCTION
      }]
    });
    // Image sans tablature : on ne garde rien, même si le modèle a tout de même inventé des notes
    if (tab?.isTablature === false) return { title: '', tempo: 0, events: [] };
    return { title: tab?.title || '', tempo: tab?.tempo, events: Array.isArray(tab?.events) ? tab.events : [] };
  }
};

// ---------------------------------------------------------------------------
// Réglages (/api/settings…) : réservés à la machine qui fait tourner le serveur
// ---------------------------------------------------------------------------

const LOOPBACK = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];

/**
 * Le serveur de dev écoute sur tout le réseau local : seul ce poste peut lire ou changer les clés.
 * L'exigence d'un corps JSON force aussi une requête « preflight » CORS, ce qui empêche un autre
 * site ouvert dans le navigateur de modifier les réglages en douce.
 */
const assertLocalSettingsAccess = (req) => {
  if (!LOOPBACK.includes(req.socket?.remoteAddress)) {
    throw new HttpError(403, "Les réglages de l'IA ne sont modifiables que depuis l'ordinateur qui fait tourner Riffson.");
  }
  if (req.method === 'POST' && !String(req.headers['content-type'] || '').includes('application/json')) {
    throw new HttpError(415, 'Requête JSON attendue');
  }
};

/** Configuration à tester : les réglages enregistrés, éventuellement surchargés par le formulaire non enregistré. */
const draftConfig = (settings, body) => {
  const draft = mergeSettings(settings, body?.draft);
  const provider = PROVIDERS[body?.provider] ? body.provider : draft.provider;
  return { provider, ...draft.providers[provider] };
};

const settingsRoutes = {
  async 'GET settings'(env) {
    return publicSettings(loadSettings(env));
  },
  async 'POST settings'(env, body) {
    const next = mergeSettings(loadSettings(env), body);
    saveSettings(next);
    return publicSettings(next);
  },
  async 'POST settings/test'(env, body) {
    const config = draftConfig(loadSettings(env), body);
    const started = Date.now();
    const reply = await generate(config, {
      effort: 'low',
      messages: [{ role: 'user', text: 'Test de connexion : réponds seulement « OK, Riffson est prêt ! »' }]
    });
    return { ok: true, reply: reply.trim().slice(0, 200), ms: Date.now() - started, provider: config.provider, model: config.model };
  },
  async 'POST settings/models'(env, body) {
    return { models: await listModels(draftConfig(loadSettings(env), body)) };
  },
};

/** Middleware Connect/Node : gère /api/<route>, passe la main pour le reste. */
export function createAiMiddleware(env = process.env) {
  return async (req, res, next) => {
    const match = req.url && req.url.match(/^\/api\/([\w/]+?)\/?(\?.*)?$/);
    if (!match) return next();

    const send = (status, payload) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(payload));
    };

    try {
      const route = match[1];
      if (route === 'settings' || route.startsWith('settings/')) {
        const handler = settingsRoutes[`${req.method} ${route}`];
        if (!handler) return send(404, { error: 'Route inconnue' });
        assertLocalSettingsAccess(req);
        return send(200, await handler(env, req.method === 'POST' ? await readJson(req) : {}));
      }

      const handler = Object.prototype.hasOwnProperty.call(routes, route) ? routes[route] : null;
      if (!handler) return send(404, { error: 'Route inconnue' });
      if (req.method !== 'POST') return send(405, { error: 'Méthode non autorisée' });
      const settings = loadSettings(env);
      const config = { provider: settings.provider, ...settings.providers[settings.provider] };
      send(200, await handler(config, await readJson(req)));
    } catch (e) {
      if (e instanceof HttpError || e instanceof ProviderError) return send(e.status, { error: e.message });
      console.error('[ai-api]', e);
      send(500, { error: "Erreur interne lors de l'appel à l'IA. Consultez la console du serveur." });
    }
  };
}
