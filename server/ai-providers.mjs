// Appels aux différents fournisseurs d'IA derrière une interface unique :
//   generate(config, { system, messages, schema, effort }) -> texte, ou objet JSON si `schema` est fourni
//   listModels(config) -> noms des modèles disponibles
// `messages` : [{ role: 'user' | 'assistant', text, image?: { mimeType, data (base64) } }]
// `schema`   : JSON Schema standard (type "object", "array", "string", "number"…)
import { GoogleGenAI } from '@google/genai';
import Anthropic from '@anthropic-ai/sdk';
import { PROVIDERS } from './ai-settings.mjs';

const CLOUD_TIMEOUT_MS = 120_000;       // services en ligne : réponse complète attendue en 2 min
const LOCAL_TIMEOUT_MS = 15 * 60_000;   // serveurs compatibles OpenAI locaux (LM Studio…) : lents sur CPU
// Ollama répond en flux : on attend tant que le modèle produit du texte, quelle que soit la durée totale.
const OLLAMA_FIRST_CHUNK_TIMEOUT_MS = 5 * 60_000; // chargement du modèle en mémoire + lecture de la consigne
const OLLAMA_IDLE_TIMEOUT_MS = 2 * 60_000;        // silence maximal entre deux morceaux de réponse
const OLLAMA_TOTAL_TIMEOUT_MS = 30 * 60_000;      // garde-fou contre une génération qui ne s'arrête jamais
const MAX_OUTPUT_TOKENS = 16_000;

/** Erreur destinée à l'utilisateur : le message s'affiche tel quel dans l'app. */
export class ProviderError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

const label = (config) => PROVIDERS[config.provider]?.label || config.provider;

/** Les modèles sans sortie structurée reçoivent le schéma dans la consigne, puis on extrait le JSON. */
const jsonInstruction = (schema) =>
  `\n\nRéponds UNIQUEMENT avec du JSON valide (aucun texte autour, pas de bloc de code) conforme à ce schéma JSON :\n${JSON.stringify(schema)}`;

export const extractJson = (raw) => {
  const text = String(raw || '').replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  try { return JSON.parse(text); } catch { /* on cherche le premier bloc JSON */ }
  const start = text.search(/[[{]/);
  const end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
  if (start >= 0 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch { /* invalide */ }
  }
  throw new ProviderError("Le modèle n'a pas renvoyé de JSON valide. Réessayez, ou choisissez un modèle plus capable dans Réglages.");
};

/** Message d'erreur lisible à partir d'une réponse HTTP d'un fournisseur. */
const httpError = (config, status, body) => {
  let detail = '';
  try {
    const parsed = JSON.parse(body);
    detail = parsed.error?.message || parsed.message || parsed.error || parsed.detail || '';
    if (typeof detail !== 'string') detail = JSON.stringify(detail);
  } catch { detail = String(body || '').slice(0, 300); }
  const who = label(config);
  // Gemini signale une clé invalide par un 400 « API key not valid »
  if (status === 400 && /api[ _-]?key/i.test(detail)) status = 401;
  if (status === 401 || status === 403) return new ProviderError(`${who} refuse la clé API (${status}). Vérifiez-la dans Réglages.${detail ? ` Détail : ${detail}` : ''}`, 401);
  if (status === 404) return new ProviderError(`${who} : modèle « ${config.model} » introuvable ou adresse incorrecte.${detail ? ` Détail : ${detail}` : ''}`, 404);
  if (status === 429) return new ProviderError(`${who} : quota ou limite de requêtes atteint. Réessayez plus tard.${detail ? ` Détail : ${detail}` : ''}`, 429);
  return new ProviderError(`${who} a répondu ${status}.${detail ? ` Détail : ${detail}` : ''}`);
};

const connectionError = (config, url, e) => {
  const where = new URL(url).origin;
  if (config.provider === 'ollama') {
    return new ProviderError(`Ollama ne répond pas sur ${where}. Est-il installé et lancé (commande « ollama serve ») ?`, 503);
  }
  return new ProviderError(`Impossible de joindre ${label(config)} (${where}) : ${e?.cause?.code || e?.message || 'erreur réseau'}.`, 503);
};

const fetchJson = async (config, url, init, timeoutMs = CLOUD_TIMEOUT_MS) => {
  let response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    if (e?.name === 'TimeoutError') throw new ProviderError(`${label(config)} n'a pas répondu en ${Math.round(timeoutMs / 1000)} s.`, 504);
    throw connectionError(config, url, e);
  }
  const body = await response.text();
  if (!response.ok) throw httpError(config, response.status, body);
  try { return JSON.parse(body); } catch { throw new ProviderError(`${label(config)} a renvoyé une réponse illisible.`); }
};

const requireKey = (config) => {
  if (PROVIDERS[config.provider]?.needsKey && !config.apiKey) {
    throw new ProviderError(`Aucune clé API pour ${label(config)}. Ajoutez-la dans l'onglet Réglages.`, 400);
  }
  if (!config.model) throw new ProviderError(`Aucun modèle choisi pour ${label(config)}. Choisissez-en un dans Réglages.`, 400);
};

const baseUrl = (config) => (config.baseUrl || PROVIDERS[config.provider]?.defaultBaseUrl || '').replace(/\/+$/, '');

// ---------------------------------------------------------------------------
// Google Gemini (SDK @google/genai)
// ---------------------------------------------------------------------------

/** Le SDK Gemini attend les types en majuscules (OBJECT, STRING…). */
const toGeminiSchema = (schema) => {
  if (!schema || typeof schema !== 'object') return schema;
  const out = { ...schema, type: String(schema.type).toUpperCase() };
  if (schema.properties) out.properties = Object.fromEntries(Object.entries(schema.properties).map(([k, v]) => [k, toGeminiSchema(v)]));
  if (schema.items) out.items = toGeminiSchema(schema.items);
  return out;
};

const gemini = {
  async generate(config, { system, messages, schema }) {
    const ai = new GoogleGenAI({ apiKey: config.apiKey });
    const contents = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [
        ...(m.image ? [{ inlineData: { mimeType: m.image.mimeType, data: m.image.data } }] : []),
        { text: m.text },
      ],
    }));
    try {
      const response = await ai.models.generateContent({
        model: config.model,
        contents,
        config: {
          systemInstruction: system || undefined,
          ...(schema ? { responseMimeType: 'application/json', responseSchema: toGeminiSchema(schema) } : {}),
        },
      });
      return response.text || '';
    } catch (e) {
      const status = e?.status || e?.code;
      if (typeof status === 'number') throw httpError(config, status, e.message);
      throw new ProviderError(`Impossible de joindre Google Gemini : ${e?.message || e}`, 503);
    }
  },
  async listModels(config) {
    const data = await fetchJson(config, `https://generativelanguage.googleapis.com/v1beta/models?pageSize=200`, {
      headers: { 'x-goog-api-key': config.apiKey },
    });
    return (data.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map(m => m.name.replace(/^models\//, ''));
  },
};

// ---------------------------------------------------------------------------
// Anthropic Claude (SDK officiel @anthropic-ai/sdk)
// ---------------------------------------------------------------------------

// Modèles qui acceptent le repli automatique côté serveur en cas de refus de sécurité
const CLAUDE_FALLBACK_MODELS = ['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5'];

/** Les sorties structurées de Claude exigent additionalProperties: false sur chaque objet. */
const toClaudeSchema = (schema) => {
  if (!schema || typeof schema !== 'object') return schema;
  const out = { ...schema };
  if (schema.type === 'object') {
    out.additionalProperties = false;
    out.properties = Object.fromEntries(Object.entries(schema.properties || {}).map(([k, v]) => [k, toClaudeSchema(v)]));
  }
  if (schema.items) out.items = toClaudeSchema(schema.items);
  return out;
};

const claudeError = (config, e) => {
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return httpError(config, e.status, e.message);
  if (e instanceof Anthropic.NotFoundError) return httpError(config, 404, e.message);
  if (e instanceof Anthropic.RateLimitError) return httpError(config, 429, e.message);
  if (e instanceof Anthropic.APIConnectionError) return new ProviderError(`Impossible de joindre Anthropic Claude : ${e.message}`, 503);
  if (e instanceof Anthropic.APIError) return httpError(config, e.status || 502, e.message);
  return e;
};

const claude = {
  async generate(config, { system, messages, schema, effort }) {
    const client = new Anthropic({ apiKey: config.apiKey, timeout: CLOUD_TIMEOUT_MS });
    const fallback = CLAUDE_FALLBACK_MODELS.includes(config.model);
    try {
      const response = await client.beta.messages.create({
        model: config.model,
        max_tokens: MAX_OUTPUT_TOKENS,
        ...(system ? { system } : {}),
        messages: messages.map(m => ({
          role: m.role,
          content: [
            ...(m.image ? [{ type: 'image', source: { type: 'base64', media_type: m.image.mimeType, data: m.image.data } }] : []),
            { type: 'text', text: m.text },
          ],
        })),
        output_config: {
          ...(effort ? { effort } : {}),
          ...(schema ? { format: { type: 'json_schema', schema: toClaudeSchema(schema) } } : {}),
        },
        // Si un filtre de sécurité refuse la demande, l'API la rejoue sur un modèle de repli
        ...(fallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {}),
      });
      if (response.stop_reason === 'refusal') {
        throw new ProviderError('Claude a refusé de répondre à cette demande. Reformulez-la.', 422);
      }
      return response.content.filter(b => b.type === 'text').map(b => b.text).join('');
    } catch (e) {
      throw claudeError(config, e);
    }
  },
  async listModels(config) {
    const client = new Anthropic({ apiKey: config.apiKey, timeout: CLOUD_TIMEOUT_MS });
    try {
      const ids = [];
      for await (const model of client.models.list()) ids.push(model.id);
      return ids;
    } catch (e) {
      throw claudeError(config, e);
    }
  },
};

// ---------------------------------------------------------------------------
// API « chat completions » façon OpenAI : Mistral, Hugging Face, serveurs compatibles
// ---------------------------------------------------------------------------

const openAiStyle = {
  async generate(config, { system, messages, schema }) {
    const imageUrl = (image) => {
      const url = `data:${image.mimeType};base64,${image.data}`;
      // Mistral attend l'URL directement, les autres un objet { url }
      return config.provider === 'mistral' ? url : { url };
    };
    const body = {
      model: config.model,
      max_tokens: MAX_OUTPUT_TOKENS,
      messages: [
        ...(system || schema ? [{ role: 'system', content: `${system || ''}${schema ? jsonInstruction(schema) : ''}`.trim() }] : []),
        ...messages.map(m => ({
          role: m.role,
          content: m.image
            ? [{ type: 'text', text: m.text }, { type: 'image_url', image_url: imageUrl(m.image) }]
            : m.text,
        })),
      ],
      // Mode JSON natif de Mistral ; ailleurs le support varie, la consigne + l'extraction suffisent
      ...(schema && config.provider === 'mistral' ? { response_format: { type: 'json_object' } } : {}),
    };
    const data = await fetchJson(config, `${baseUrl(config)}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
    }, config.provider === 'openai_compatible' ? LOCAL_TIMEOUT_MS : CLOUD_TIMEOUT_MS);
    const content = data.choices?.[0]?.message?.content;
    return Array.isArray(content) ? content.map(c => c.text || '').join('') : (content || '');
  },
  async listModels(config) {
    const data = await fetchJson(config, `${baseUrl(config)}/models`, {
      headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {},
    });
    return (data.data || data.models || []).map(m => m.id || m.name).filter(Boolean);
  },
};

// ---------------------------------------------------------------------------
// Ollama (API native, en local)
// ---------------------------------------------------------------------------

/**
 * Lit la réponse d'Ollama en flux (une ligne JSON par morceau). On n'abandonne que si le modèle
 * reste silencieux trop longtemps : une leçon peut prendre plusieurs minutes sur un modèle local,
 * tant qu'il produit du texte on l'attend.
 */
const readOllamaStream = async (config, url, body) => {
  const controller = new AbortController();
  let reason = '';
  let timer;
  const arm = (ms, why) => {
    clearTimeout(timer);
    timer = setTimeout(() => { reason = why; controller.abort(); }, ms);
  };
  const total = setTimeout(() => { reason = 'total'; controller.abort(); }, OLLAMA_TOTAL_TIMEOUT_MS);
  arm(OLLAMA_FIRST_CHUNK_TIMEOUT_MS, 'first');

  let content = '';
  try {
    let response;
    try {
      response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
    } catch (e) {
      if (controller.signal.aborted) throw e;
      throw connectionError(config, url, e);
    }
    if (!response.ok) throw httpError(config, response.status, await response.text());

    const decoder = new TextDecoder();
    let buffered = '';
    for await (const chunk of response.body) {
      arm(OLLAMA_IDLE_TIMEOUT_MS, 'idle');
      buffered += decoder.decode(chunk, { stream: true });
      const lines = buffered.split('\n');
      buffered = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        const part = JSON.parse(line);
        if (part.error) throw new ProviderError(`Ollama : ${part.error}`);
        content += part.message?.content || ''; // la réflexion (message.thinking) n'est pas renvoyée à l'élève
        if (part.done) return content;
      }
    }
    return content;
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    if (controller.signal.aborted) {
      const minutes = (ms) => `${Math.round(ms / 60_000)} min`;
      if (reason === 'first') throw new ProviderError(`Ollama n'a commencé à répondre qu'après ${minutes(OLLAMA_FIRST_CHUNK_TIMEOUT_MS)} : le modèle « ${config.model} » est sans doute trop lourd pour cet ordinateur. Essayez un modèle plus petit dans Réglages.`, 504);
      if (reason === 'idle') throw new ProviderError(`Ollama s'est arrêté de répondre pendant ${minutes(OLLAMA_IDLE_TIMEOUT_MS)} avec le modèle « ${config.model} ».`, 504);
      throw new ProviderError(`La génération avec « ${config.model} » dépasse ${minutes(OLLAMA_TOTAL_TIMEOUT_MS)}. Essayez un modèle plus petit dans Réglages.`, 504);
    }
    throw new ProviderError(`Réponse d'Ollama interrompue : ${e?.message || e}`);
  } finally {
    clearTimeout(timer);
    clearTimeout(total);
  }
};

const ollama = {
  async generate(config, { system, messages, schema }) {
    const request = (think) => readOllamaStream(config, `${baseUrl(config)}/api/chat`, {
      model: config.model,
      stream: true,
      // Ollama contraint la sortie sur un JSON Schema passé dans `format`
      ...(schema ? { format: schema } : {}),
      ...(think === false ? { think: false } : {}),
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        ...messages.map(m => ({ role: m.role, content: m.text, ...(m.image ? { images: [m.image.data] } : {}) })),
      ],
    });
    // Sorties structurées (leçons, scanner) : la « réflexion » des modèles qui en ont une (qwen3…)
    // allonge la génération d'environ 25 % sans meilleur résultat, on la coupe.
    // Les modèles sans réflexion ignorent l'option.
    if (schema) return request(false);
    // Coach : on garde la réflexion, mais certains modèles (qwen3.5…) réfléchissent jusqu'à remplir
    // leur contexte sans jamais répondre ; on redemande alors une réponse directe.
    const reply = await request();
    return reply.trim() ? reply : request(false);
  },
  async listModels(config) {
    const data = await fetchJson(config, `${baseUrl(config)}/api/tags`, {});
    return (data.models || []).map(m => m.name);
  },
};

const IMPLEMENTATIONS = { gemini, claude, mistral: openAiStyle, huggingface: openAiStyle, openai_compatible: openAiStyle, ollama };

/** Appelle le fournisseur configuré. Renvoie le texte, ou l'objet JSON décodé si `schema` est fourni. */
export async function generate(config, request) {
  requireKey(config);
  const impl = IMPLEMENTATIONS[config.provider];
  if (!impl) throw new ProviderError(`Fournisseur inconnu : ${config.provider}`, 400);
  if (request.messages.some(m => m.image) && !PROVIDERS[config.provider].vision) {
    throw new ProviderError(`${label(config)} ne lit pas les images dans cette configuration. Choisissez un autre fournisseur pour le scanner.`, 400);
  }
  const text = await impl.generate(config, request);
  return request.schema ? extractJson(text) : text;
}

export async function listModels(config) {
  if (PROVIDERS[config.provider]?.needsKey && !config.apiKey) {
    throw new ProviderError(`Ajoutez d'abord la clé API de ${label(config)}.`, 400);
  }
  const impl = IMPLEMENTATIONS[config.provider];
  if (!impl) throw new ProviderError(`Fournisseur inconnu : ${config.provider}`, 400);
  return (await impl.listModels(config)).sort();
}
