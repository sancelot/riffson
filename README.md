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
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Production

`npm run build` puis `npm start` (port `PORT`, 3000 par défaut).

La clé Gemini reste côté serveur : le navigateur appelle `/api/*`
(`server/gemini-api.mjs`), jamais Gemini directement. Ne remettez pas la clé
dans `vite.config.ts` (`define`), elle se retrouverait dans le JavaScript public.
Le serveur de dev écoute sur `0.0.0.0` : toute machine du réseau local peut
utiliser le proxy, donc votre quota Gemini.
