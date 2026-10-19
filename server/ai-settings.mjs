// Réglages du fournisseur d'IA, stockés côté serveur dans .riffson-ai.json (jamais envoyés au navigateur :
// les clés n'en sortent que masquées). Fichier ignoré par git.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SETTINGS_FILE = path.join(root, '.riffson-ai.json');
// Nom du fichier avant que le projet ne s'appelle Riffson
const LEGACY_SETTINGS_FILE = path.join(root, '.gibson-ai.json');

/**
 * Reprend les réglages enregistrés sous l'ancien nom du projet. Si les deux fichiers existent
 * (l'app a déjà écrit le nouveau), on récupère les clés absentes du nouveau avant de supprimer l'ancien.
 */
const migrateLegacySettings = () => {
  if (!fs.existsSync(LEGACY_SETTINGS_FILE)) return;
  if (!fs.existsSync(SETTINGS_FILE)) {
    fs.renameSync(LEGACY_SETTINGS_FILE, SETTINGS_FILE);
    return;
  }
  try {
    const legacy = JSON.parse(fs.readFileSync(LEGACY_SETTINGS_FILE, 'utf8'));
    const current = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    current.providers = current.providers || {};
    for (const [id, entry] of Object.entries(legacy.providers || {})) {
      if (entry?.apiKey && !current.providers[id]?.apiKey) {
        current.providers[id] = { ...entry, ...current.providers[id], apiKey: entry.apiKey };
      }
    }
    saveSettings(current);
    fs.unlinkSync(LEGACY_SETTINGS_FILE);
  } catch (e) {
    console.error('[ai-settings] Migration de .gibson-ai.json impossible, fichier conservé :', e.message);
  }
};

/** Fournisseurs proposés dans le panneau Réglages. */
export const PROVIDERS = {
  gemini: {
    label: 'Google Gemini',
    needsKey: true,
    defaultModel: 'gemini-2.5-flash',
    suggestedModels: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3-flash-preview', 'gemini-3-pro-preview'],
    keyUrl: 'https://aistudio.google.com/apikey',
    envKey: 'GEMINI_API_KEY',
    vision: true,
  },
  claude: {
    label: 'Anthropic Claude',
    needsKey: true,
    defaultModel: 'claude-opus-5-5',
    suggestedModels: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'],
    keyUrl: 'https://console.anthropic.com/settings/keys',
    envKey: 'ANTHROPIC_API_KEY',
    vision: true,
  },
  mistral: {
    label: 'Mistral AI',
    needsKey: true,
    defaultModel: 'mistral-large-latest',
    suggestedModels: ['mistral-large-latest', 'mistral-medium-latest', 'mistral-small-latest'],
    defaultBaseUrl: 'https://api.mistral.ai/v1',
    keyUrl: 'https://console.mistral.ai/api-keys',
    envKey: 'MISTRAL_API_KEY',
    vision: true,
  },
  ollama: {
    label: 'Ollama (local, gratuit)',
    needsKey: false,
    defaultModel: 'llama3.1',
    suggestedModels: ['llama3.1', 'mistral', 'qwen2.5', 'gemma2', 'llava'],
    defaultBaseUrl: 'http://localhost:11434',
    keyUrl: 'https://ollama.com/download',
    vision: true, // selon le modèle (llava, llama3.2-vision…)
  },
  huggingface: {
    label: 'Hugging Face',
    needsKey: true,
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct',
    suggestedModels: ['meta-llama/Llama-3.3-70B-Instruct', 'Qwen/Qwen2.5-72B-Instruct', 'mistralai/Mistral-7B-Instruct-v0.3'],
    defaultBaseUrl: 'https://router.huggingface.co/v1',
    keyUrl: 'https://huggingface.co/settings/tokens',
    envKey: 'HF_TOKEN',
    vision: false,
  },
  openai_compatible: {
    label: 'Compatible OpenAI (LM Studio, OpenRouter, OpenAI…)',
    needsKey: false,
    defaultModel: '',
    suggestedModels: [],
    defaultBaseUrl: 'http://localhost:1234/v1',
    keyUrl: '',
    vision: true, // selon le modèle
  },
};

const PLACEHOLDER = /placeholder|your[_-]?api[_-]?key|xxx/i;

const isRealKey = (value) => typeof value === 'string' && value.trim().length > 8 && !PLACEHOLDER.test(value);

/** Réglages par défaut : Gemini si une clé est dans l'environnement, sinon le premier fournisseur clé en main. */
const defaults = (env) => {
  const providers = {};
  for (const [id, meta] of Object.entries(PROVIDERS)) {
    const key = meta.envKey && isRealKey(env[meta.envKey]) ? env[meta.envKey].trim() : '';
    providers[id] = { model: meta.defaultModel, baseUrl: meta.defaultBaseUrl || '', apiKey: key };
  }
  const firstWithKey = Object.keys(PROVIDERS).find(id => providers[id].apiKey);
  return { provider: firstWithKey || 'gemini', providers };
};

export function loadSettings(env = process.env) {
  const base = defaults(env);
  migrateLegacySettings();
  try {
    const saved = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    const providers = { ...base.providers };
    for (const id of Object.keys(PROVIDERS)) {
      if (saved.providers?.[id]) providers[id] = { ...providers[id], ...saved.providers[id] };
    }
    return { provider: PROVIDERS[saved.provider] ? saved.provider : base.provider, providers };
  } catch {
    return base; // pas encore de fichier (ou illisible) : réglages par défaut
  }
}

export function saveSettings(settings) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), { encoding: 'utf8', mode: 0o600 });
}

/** Applique une mise à jour venant du panneau. apiKey : '' ou absent = inchangée, null = supprimée. */
export function mergeSettings(current, update) {
  const next = { provider: current.provider, providers: { ...current.providers } };
  if (update?.provider && PROVIDERS[update.provider]) next.provider = update.provider;
  for (const [id, patch] of Object.entries(update?.providers || {})) {
    if (!PROVIDERS[id] || typeof patch !== 'object' || !patch) continue;
    const entry = { ...next.providers[id] };
    if (typeof patch.model === 'string') entry.model = patch.model.trim().slice(0, 200);
    if (typeof patch.baseUrl === 'string') entry.baseUrl = patch.baseUrl.trim().replace(/\/+$/, '').slice(0, 500);
    if (patch.apiKey === null) entry.apiKey = '';
    else if (typeof patch.apiKey === 'string' && patch.apiKey.trim()) entry.apiKey = patch.apiKey.trim().slice(0, 500);
    next.providers[id] = entry;
  }
  return next;
}

/** Version envoyée au navigateur : jamais la clé, seulement sa présence et ses 4 derniers caractères. */
export function publicSettings(settings) {
  const providers = {};
  for (const [id, entry] of Object.entries(settings.providers)) {
    providers[id] = {
      model: entry.model,
      baseUrl: entry.baseUrl,
      hasKey: Boolean(entry.apiKey),
      keyHint: entry.apiKey ? `…${entry.apiKey.slice(-4)}` : '',
    };
  }
  const catalog = Object.fromEntries(Object.entries(PROVIDERS).map(([id, meta]) => [id, {
    label: meta.label,
    needsKey: meta.needsKey,
    defaultModel: meta.defaultModel,
    suggestedModels: meta.suggestedModels,
    defaultBaseUrl: meta.defaultBaseUrl || '',
    hasBaseUrl: Boolean(meta.defaultBaseUrl),
    keyUrl: meta.keyUrl,
    vision: meta.vision,
  }]));
  return { provider: settings.provider, providers, catalog };
}
