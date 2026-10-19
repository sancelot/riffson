<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/c7b3e027-d638-413b-9537-5bf0e0e48746

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Run the app:
   `npm run dev`
3. Ouvrez l'onglet **Réglages** et choisissez le fournisseur d'IA : Gemini, Claude,
   Mistral, Ollama (local, sans clé), Hugging Face ou tout serveur compatible OpenAI.
   « Tester la connexion » affiche la cause exacte en cas de problème.
   (Une clé `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `MISTRAL_API_KEY` ou `HF_TOKEN`
   dans [.env.local](.env.local) est reprise automatiquement au premier lancement.)

## Production

`npm run build` puis `npm start` (port `PORT`, 3000 par défaut).

Les clés restent côté serveur : le navigateur appelle `/api/*`
(`server/ai-api.mjs`), jamais le fournisseur d'IA directement. Elles sont
enregistrées dans `.gibson-ai.json` (exclu de git) et ne sont jamais renvoyées
au navigateur. Ne mettez pas de clé dans `vite.config.ts` (`define`) : elle se
retrouverait dans le JavaScript public.

Le serveur de dev écoute sur `0.0.0.0` : les appareils du réseau local peuvent
utiliser l'IA (donc votre quota), mais seuls les accès depuis l'ordinateur
lui-même peuvent lire ou modifier les réglages.
