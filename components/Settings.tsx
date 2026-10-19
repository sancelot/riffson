import React, { useEffect, useState } from 'react';
import { Bot, CheckCircle, ExternalLink, KeyRound, Loader2, PlugZap, RefreshCw, Save, Server, Trash2, XCircle } from 'lucide-react';
import {
  AiSettings, ProviderId, SettingsUpdate,
  getAiSettings, saveAiSettings, testAiProvider, listAiModels,
} from '../services/aiSettings';

type Feedback = { kind: 'success' | 'error' | 'info', text: string } | null;

const PROVIDER_ORDER: ProviderId[] = ['gemini', 'claude', 'mistral', 'ollama', 'huggingface', 'openai_compatible'];

const Settings: React.FC = () => {
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ProviderId>('gemini');
  // Formulaire du fournisseur sélectionné (la clé saisie n'est jamais relue depuis le serveur)
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [busy, setBusy] = useState<'save' | 'test' | 'models' | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const fillForm = (data: AiSettings, provider: ProviderId) => {
    setSelected(provider);
    setApiKey('');
    setModel(data.providers[provider].model);
    setBaseUrl(data.providers[provider].baseUrl || data.catalog[provider].defaultBaseUrl);
    setAvailableModels([]);
  };

  useEffect(() => {
    getAiSettings()
      .then(data => { setSettings(data); fillForm(data, data.provider); })
      .catch(e => setLoadError(e.message));
  }, []);

  if (loadError) {
    return (
      <div className="h-full overflow-y-auto p-6">
        <h1 className="text-2xl font-black text-white mb-4">Réglages de l'IA</h1>
        <p className="text-red-400">{loadError}</p>
      </div>
    );
  }
  if (!settings) {
    return <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-amber-500" /></div>;
  }

  const meta = settings.catalog[selected];
  const saved = settings.providers[selected];
  const activeMeta = settings.catalog[settings.provider];

  const draft = (apiKeyOverride?: string | null): SettingsUpdate => ({
    providers: {
      [selected]: {
        model,
        ...(meta.hasBaseUrl ? { baseUrl } : {}),
        ...(apiKeyOverride !== undefined ? { apiKey: apiKeyOverride } : apiKey ? { apiKey } : {}),
      },
    },
  });

  const run = async (kind: 'save' | 'test' | 'models', action: () => Promise<void>) => {
    setBusy(kind);
    setFeedback(null);
    try { await action(); }
    catch (e) { setFeedback({ kind: 'error', text: e instanceof Error ? e.message : String(e) }); }
    finally { setBusy(null); }
  };

  const handleTest = () => run('test', async () => {
    const result = await testAiProvider(selected, draft());
    setFeedback({ kind: 'success', text: `Connexion réussie en ${(result.ms / 1000).toFixed(1)} s avec ${result.model}. Réponse : « ${result.reply} »` });
  });

  const handleListModels = () => run('models', async () => {
    const { models } = await listAiModels(selected, draft());
    setAvailableModels(models);
    setFeedback(models.length
      ? { kind: 'info', text: `${models.length} modèle(s) disponible(s) : choisissez-en un dans la liste.` }
      : { kind: 'info', text: selected === 'ollama' ? 'Aucun modèle installé. Dans un terminal : ollama pull llama3.1' : 'Aucun modèle renvoyé par le fournisseur.' });
  });

  const handleSave = () => run('save', async () => {
    const next = await saveAiSettings({ provider: selected, ...draft() });
    setSettings(next);
    setApiKey('');
    setFeedback({ kind: 'success', text: `Enregistré : le coach utilise maintenant ${next.catalog[selected].label} (${next.providers[selected].model}).` });
  });

  const handleDeleteKey = () => run('save', async () => {
    const next = await saveAiSettings(draft(null));
    setSettings(next);
    setApiKey('');
    setFeedback({ kind: 'info', text: `Clé ${meta.label} supprimée.` });
  });

  const modelChoices = [...new Set([...availableModels, ...meta.suggestedModels])];

  return (
    <div className="h-full overflow-y-auto bg-slate-900 pb-24">
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-2"><Bot className="text-amber-500" /> Réglages de l'IA</h1>
          <p className="text-slate-400 text-sm mt-1">
            Choisissez le service d'intelligence artificielle utilisé par le coach, la génération de leçons, la bibliothèque et le scanner.
          </p>
          <p className="mt-3 inline-flex items-center gap-2 text-sm bg-slate-800 border border-slate-700 rounded-full px-3 py-1 text-slate-300">
            <span className={`w-2 h-2 rounded-full ${settings.providers[settings.provider].hasKey || !activeMeta.needsKey ? 'bg-green-500' : 'bg-red-500'}`} />
            Actif : <span className="font-bold text-white">{activeMeta.label}</span> · {settings.providers[settings.provider].model || 'aucun modèle'}
          </p>
        </div>

        {/* Choix du fournisseur */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {PROVIDER_ORDER.map(id => {
            const entry = settings.catalog[id];
            const configured = settings.providers[id].hasKey || !entry.needsKey;
            return (
              <button
                key={id}
                onClick={() => { fillForm(settings, id); setFeedback(null); }}
                className={`text-left p-3 rounded-xl border transition-all ${id === selected ? 'border-amber-500 bg-amber-500/10' : 'border-slate-700 bg-slate-800 hover:border-slate-500'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-white text-sm">{entry.label}</span>
                  {id === settings.provider && <span className="text-[10px] font-black uppercase bg-green-500 text-slate-900 rounded px-1.5 py-0.5">Actif</span>}
                </div>
                <p className={`text-xs mt-1 ${configured ? 'text-green-400' : 'text-slate-500'}`}>
                  {entry.needsKey ? (settings.providers[id].hasKey ? `Clé enregistrée ${settings.providers[id].keyHint}` : 'Clé à renseigner') : 'Sans clé (local)'}
                </p>
              </button>
            );
          })}
        </div>

        {/* Configuration du fournisseur sélectionné */}
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 space-y-4">
          <h2 className="text-lg font-bold text-white">{meta.label}</h2>

          {(meta.needsKey || selected === 'openai_compatible') && (
            <div>
              <label className="text-sm font-bold text-slate-300 flex items-center gap-2 mb-1"><KeyRound size={16} /> Clé API {!meta.needsKey && <span className="font-normal text-slate-500">(facultative)</span>}</label>
              <div className="flex gap-2">
                <input
                  type="password"
                  autoComplete="off"
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder={saved.hasKey ? `Clé enregistrée (${saved.keyHint}) : laisser vide pour la garder` : 'Collez votre clé API'}
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:ring-2 focus:ring-amber-500 outline-none"
                />
                {saved.hasKey && (
                  <button onClick={handleDeleteKey} disabled={busy !== null} className="px-3 rounded-lg bg-slate-700 text-slate-300 hover:text-red-400" title="Supprimer la clé enregistrée" aria-label="Supprimer la clé enregistrée">
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
              {meta.keyUrl && (
                <a href={meta.keyUrl} target="_blank" rel="noreferrer" className="text-xs text-amber-400 hover:underline inline-flex items-center gap-1 mt-1">
                  Obtenir une clé <ExternalLink size={12} />
                </a>
              )}
            </div>
          )}

          {selected === 'ollama' && (
            <p className="text-sm text-slate-400">
              Ollama fait tourner l'IA sur votre ordinateur, gratuitement et sans clé.{' '}
              <a href={meta.keyUrl} target="_blank" rel="noreferrer" className="text-amber-400 hover:underline inline-flex items-center gap-1">Installer Ollama <ExternalLink size={12} /></a>,
              puis téléchargez un modèle (ex. <code className="text-amber-300">ollama pull llama3.1</code>).
            </p>
          )}

          {meta.hasBaseUrl && (
            <div>
              <label className="text-sm font-bold text-slate-300 flex items-center gap-2 mb-1"><Server size={16} /> Adresse du service</label>
              <input
                value={baseUrl}
                onChange={e => setBaseUrl(e.target.value)}
                placeholder={meta.defaultBaseUrl}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-sm focus:ring-2 focus:ring-amber-500 outline-none"
              />
            </div>
          )}

          <div>
            <label className="text-sm font-bold text-slate-300 mb-1 block">Modèle</label>
            <div className="flex gap-2">
              <input
                list="gibson-model-choices"
                value={model}
                onChange={e => setModel(e.target.value)}
                placeholder={meta.defaultModel || 'nom du modèle'}
                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-sm focus:ring-2 focus:ring-amber-500 outline-none"
              />
              <datalist id="gibson-model-choices">
                {modelChoices.map(m => <option key={m} value={m} />)}
              </datalist>
              <button onClick={handleListModels} disabled={busy !== null} className="px-3 rounded-lg bg-slate-700 text-slate-200 text-sm font-bold flex items-center gap-1 whitespace-nowrap">
                {busy === 'models' ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Lister
              </button>
            </div>
            {availableModels.length > 0 && (
              <select
                value={availableModels.includes(model) ? model : ''}
                onChange={e => setModel(e.target.value)}
                className="mt-2 w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"
              >
                <option value="" disabled>Choisir parmi les {availableModels.length} modèles disponibles…</option>
                {availableModels.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            )}
            {!meta.vision && <p className="text-xs text-slate-500 mt-1">Le scanner de tablature (lecture d'images) n'est pas disponible avec ce fournisseur.</p>}
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <button onClick={handleTest} disabled={busy !== null} className="bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 px-5 rounded-xl flex items-center gap-2">
              {busy === 'test' ? <Loader2 size={18} className="animate-spin" /> : <PlugZap size={18} />} Tester la connexion
            </button>
            <button onClick={handleSave} disabled={busy !== null} className="bg-amber-500 hover:bg-amber-400 text-slate-900 font-black py-3 px-5 rounded-xl flex items-center gap-2">
              {busy === 'save' ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Enregistrer et utiliser
            </button>
          </div>

          {feedback && (
            <div className={`rounded-xl p-3 text-sm flex gap-2 items-start border ${
              feedback.kind === 'success' ? 'bg-green-500/10 border-green-500/40 text-green-300'
              : feedback.kind === 'error' ? 'bg-red-500/10 border-red-500/40 text-red-300'
              : 'bg-blue-500/10 border-blue-500/30 text-blue-200'}`}>
              {feedback.kind === 'error' ? <XCircle size={18} className="shrink-0" /> : <CheckCircle size={18} className="shrink-0" />}
              <span className="break-words min-w-0">{feedback.text}</span>
            </div>
          )}
        </div>

        <p className="text-xs text-slate-500 leading-relaxed">
          Les clés sont enregistrées sur cet ordinateur, dans le fichier <code>.gibson-ai.json</code> du projet (exclu de git),
          et ne sont jamais renvoyées au navigateur. Ces réglages ne sont modifiables que depuis l'ordinateur qui fait tourner Gibson.
        </p>
      </div>
    </div>
  );
};

export default Settings;
