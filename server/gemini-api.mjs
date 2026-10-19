// Proxy Gemini côté serveur : la clé API ne quitte jamais le serveur.
// Monté par Vite en dev/preview (vite.config.ts) et par server/serve.mjs en production.
import { GoogleGenAI, Type } from '@google/genai';

const FAST_MODEL = 'gemini-3-flash-preview';
const PRO_MODEL = 'gemini-3-pro-preview';

const MAX_BODY_BYTES = 12 * 1024 * 1024; // photos de tablature comprises
const MAX_TEXT = 8000;
const MAX_HISTORY = 50;
const LEVELS = ['Débutant', 'Intermédiaire', 'Avancé', 'Inconnu'];
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif'];

const COACH_INSTRUCTION = `Tu es "Gibson", un coach guitare expert.
RÈGLES VISUELLES :
1. Titres Markdown (##).
2. Listes à puces.
3. Tags d'accords sur LIGNE SÉPARÉE (ex: \n\n[Em]\n\n).
4. Ton : Rock & Roll, concis.
5. Pédagogie : nomme les accords en entier la première fois (« Mi mineur (Em) ») avec leurs notes,
   et dis toujours ce que fait la main gauche (quel doigt, quelle case, quelle corde) et la main droite (quel doigt ou médiator, quel sens).
   Désigne les cordes par numéro et nom : corde 1 = Mi aigu (la plus fine) ... corde 6 = Mi grave (la plus épaisse).
NOUVELLE CAPACITÉ PRO : Tu peux générer des riffs avec RYTHME.
Utilise ce format STRICT pour les riffs :
[RIFF:Nom|Tempo|corde,case,durée;corde,case,durée;...]
- corde: 1(e) à 6(E)
- case: 0 à 22 (-1 pour silence)
- durée: 1.0 (noire), 0.5 (croche), 2.0 (blanche), 0.25 (double-croche).
Place chaque tag [RIFF:...] seul sur sa propre ligne, jamais dans un bloc de code ni au milieu d'une phrase.

Exemple pour Seven Nation Army :
[RIFF:Seven Nation Army|120|5,7,0.75;5,7,0.25;5,10,0.5;5,7,0.5;5,5,0.5;5,3,1.0;5,2,1.0]`;

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
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    description: { type: Type.STRING },
    content: { type: Type.STRING },
    duration: { type: Type.STRING },
    exercises: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          prompt: { type: Type.STRING },
          targetNote: { type: Type.STRING },
          targetFrequency: { type: Type.NUMBER },
          duration_sec: { type: Type.NUMBER },
          targetString: { type: Type.NUMBER },
          targetFret: { type: Type.NUMBER },
          finger: { type: Type.NUMBER },
          leftHand: { type: Type.STRING },
          rightHand: { type: Type.STRING },
          chord: { type: Type.STRING },
          songTitle: { type: Type.STRING }
        },
        required: ['prompt', 'targetNote', 'targetFrequency', 'targetString', 'targetFret', 'leftHand', 'rightHand']
      }
    }
  },
  required: ['title', 'description', 'content', 'duration']
};

const scanSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      prompt: { type: Type.STRING },
      targetString: { type: Type.NUMBER },
      targetFret: { type: Type.NUMBER },
      targetNote: { type: Type.STRING },
      targetFrequency: { type: Type.NUMBER }
    },
    required: ['prompt', 'targetString', 'targetFret', 'targetNote', 'targetFrequency']
  }
};

const routes = {
  // Conversation sans état côté serveur : le client renvoie l'historique à chaque message
  async chat(ai, body) {
    const history = Array.isArray(body.history) ? body.history.slice(-MAX_HISTORY) : [];
    const contents = history.map((m) => ({
      role: m.role === 'model' ? 'model' : 'user',
      parts: [{ text: text(m.text, 'history.text') }]
    }));
    contents.push({ role: 'user', parts: [{ text: text(body.message, 'message') }] });
    const studentContext = typeof body.studentContext === 'string' ? body.studentContext.slice(0, 4000) : '';
    const response = await ai.models.generateContent({
      model: FAST_MODEL,
      contents,
      config: { systemInstruction: `${COACH_INSTRUCTION}\n\n${studentContext}` }
    });
    return { text: response.text || '' };
  },

  async routine(ai, body) {
    const response = await ai.models.generateContent({
      model: FAST_MODEL,
      contents: `Génère une routine d'entraînement quotidienne de 15 minutes pour un guitariste de niveau ${level(body.level)}.
Inclus des exercices techniques, un concept de théorie et un riff à pratiquer. Réponds en Markdown concis.`
    });
    return { text: response.text || '' };
  },

  async lesson(ai, body) {
    const titles = Array.isArray(body.existingTitles)
      ? body.existingTitles.filter((t) => typeof t === 'string').slice(0, 100).map((t) => t.slice(0, 200))
      : [];
    const response = await ai.models.generateContent({
      model: PRO_MODEL,
      contents: `Crée une nouvelle leçon de guitare stimulante pour un niveau ${level(body.level)}.
Les leçons déjà apprises sont : ${titles.join(', ') || 'aucune'}.
La leçon doit être inédite. Inclus un titre, une description, un contenu pédagogique en markdown,
et des exercices interactifs (une note par exercice, avec corde 1-6 et case 0-12).
Pour les accords, utilise le format [NOM_ACCORD] sur une ligne seule, entouré de lignes vides.

RÈGLES PÉDAGOGIQUES (l'élève peut être totalement novice) :
- Nomme toujours un accord en entier la première fois (ex : « Mi mineur (Em) ») et cite ses notes.
- Explique le lien entre la théorie et ce que l'élève joue (ex : un arpège = les notes de l'accord une par une).
- Pour chaque exercice, décris séparément la main gauche (doigt 1 index ... 4 auriculaire, case, corde, ou « rien à presser » pour une corde à vide)
  dans "leftHand" et la main droite (pouce, index, majeur, annulaire ou médiator, sens d'attaque) dans "rightHand".
- Désigne les cordes par leur numéro ET leur nom : corde 1 = Mi aigu (la plus fine) ... corde 6 = Mi grave (la plus épaisse).
- "finger" = doigt de la main gauche (absent pour une corde à vide). "chord" = accord tenu pendant l'exercice, seulement si la main gauche le tient vraiment.`,
      config: { responseMimeType: 'application/json', responseSchema: lessonSchema }
    });
    return { lesson: JSON.parse(response.text || 'null') };
  },

  async library(ai, body) {
    const response = await ai.models.generateContent({
      model: FAST_MODEL,
      contents: `Explique de manière pédagogique le concept suivant : "${text(body.query, 'query', 500)}". Donne un diagramme si pertinent.
Public : Guitaristes de niveau ${level(body.level)}.
Utilise Markdown. Si tu mentionnes un accord, mets-le entre crochets sur une nouvelle ligne (ex: [C]).`
    });
    return { text: response.text || '' };
  },

  async scan(ai, body) {
    if (!IMAGE_TYPES.includes(body.mimeType)) throw new HttpError(415, "Format d'image non supporté");
    const response = await ai.models.generateContent({
      model: FAST_MODEL,
      contents: {
        parts: [
          { inlineData: { mimeType: body.mimeType, data: text(body.image, 'image', MAX_BODY_BYTES) } },
          { text: "Analyse cette tablature de guitare. Identifie les notes successives et retourne un tableau JSON d'exercices. Pour chaque note, précise : prompt (ex: 'Joue la case 2 sur la corde 3'), targetString (1-6), targetFret (0-22), targetNote (ex: 'A'), et targetFrequency (Hz)." }
        ]
      },
      config: { responseMimeType: 'application/json', responseSchema: scanSchema }
    });
    return { exercises: JSON.parse(response.text || '[]') };
  }
};

/** Middleware Connect/Node : gère POST /api/<route>, passe la main pour le reste. */
export function createGeminiMiddleware(apiKey) {
  const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

  return async (req, res, next) => {
    const match = req.url && req.url.match(/^\/api\/(\w+)\/?(\?.*)?$/);
    if (!match) return next();

    const send = (status, payload) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(payload));
    };

    const handler = Object.prototype.hasOwnProperty.call(routes, match[1]) ? routes[match[1]] : null;
    if (!handler) return send(404, { error: 'Route inconnue' });
    if (req.method !== 'POST') return send(405, { error: 'Méthode non autorisée' });
    if (!ai) return send(503, { error: 'GEMINI_API_KEY absente de la configuration du serveur' });

    try {
      send(200, await handler(ai, await readJson(req)));
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 502;
      if (status === 502) console.error('[gemini-api]', e);
      send(status, { error: status === 502 ? "Erreur lors de l'appel à Gemini" : e.message });
    }
  };
}
