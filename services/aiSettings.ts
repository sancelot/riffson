// Client du panneau Réglages : lit et modifie la configuration IA stockée côté serveur.
// Les clés API sont envoyées au serveur mais jamais relues : il ne renvoie que leurs 4 derniers caractères.

export type ProviderId = 'gemini' | 'claude' | 'mistral' | 'ollama' | 'huggingface' | 'openai_compatible';

export interface ProviderCatalogEntry {
  label: string;
  needsKey: boolean;
  defaultModel: string;
  suggestedModels: string[];
  defaultBaseUrl: string;
  hasBaseUrl: boolean;
  keyUrl: string;
  vision: boolean;
}

export interface ProviderPublicSettings {
  model: string;
  baseUrl: string;
  hasKey: boolean;
  keyHint: string;
}

export interface AiSettings {
  provider: ProviderId;
  providers: Record<ProviderId, ProviderPublicSettings>;
  catalog: Record<ProviderId, ProviderCatalogEntry>;
}

/** Modification d'un fournisseur. apiKey : absente = inchangée, null = supprimée. */
export interface ProviderDraft {
  model?: string;
  baseUrl?: string;
  apiKey?: string | null;
}

export interface SettingsUpdate {
  provider?: ProviderId;
  providers?: Partial<Record<ProviderId, ProviderDraft>>;
}

const request = async <T>(path: string, body?: unknown): Promise<T> => {
  const response = await fetch(`/api/${path}`, body === undefined
    ? undefined
    : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Erreur ${response.status}`);
  return data as T;
};

export const getAiSettings = () => request<AiSettings>('settings');

export const saveAiSettings = (update: SettingsUpdate) => request<AiSettings>('settings', update);

/** Teste un fournisseur avec les valeurs du formulaire, même non enregistrées. */
export const testAiProvider = (provider: ProviderId, draft: SettingsUpdate) =>
  request<{ ok: boolean; reply: string; ms: number; model: string }>('settings/test', { provider, draft });

export const listAiModels = (provider: ProviderId, draft: SettingsUpdate) =>
  request<{ models: string[] }>('settings/models', { provider, draft });
