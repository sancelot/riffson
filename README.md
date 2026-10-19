# 🎸 Gibson : coach de guitare avec IA

Application web pour **apprendre la guitare en partant de zéro**, avec un coach
d'intelligence artificielle. Chaque leçon vise un morceau que vous connaissez déjà :
vous l'écoutez, vous l'apprenez étape par étape, et à la fin vous le jouez en entier
pendant que l'application **vous écoute au micro** et valide chaque note.

L'IA est au choix : Google Gemini, Anthropic Claude, Mistral, Hugging Face, n'importe
quel serveur compatible OpenAI, ou **Ollama en local, gratuit et sans clé**.

> Interface en français. Licence [MIT](LICENSE).

---

## Fonctionnalités

### Leçons guidées
- **Un morceau reconnaissable par leçon** : « Au clair de la lune », l'intro de
  « Nothing Else Matters », le riff de « Seven Nation Army »…
- **Objectif écouté d'abord** : la leçon s'ouvre sur l'extrait à atteindre, en tablature animée,
  avec les paroles sous les notes.
- **Étapes progressives** : notes isolées, fragments, puis le passage complet au tempo du morceau.
- **Consignes main gauche / main droite** pour chaque note (corde, case, doigt, sens d'attaque).
- **Validation au micro** : détection de la hauteur jouée, passage à la note suivante dès qu'elle
  est juste, comptage des fausses notes et score.
- **Bilan** en fin de leçon : rejouer l'extrait, récapitulatif de ce qui a été appris.

### Supports visuels et sonores
- Diagrammes d'accords complets : nom en toutes lettres (« Accord de Mi mineur »), notes,
  numéros de doigts, cordes à vide et étouffées.
- Manche interactif (jusqu'à la 22e case) et lecteur de tablature synchronisé avec le son.
- **Son de guitare synthétisé** (algorithme de corde pincée Karplus-Strong), juste au centième
  de demi-ton près.

### Progression
- Niveaux Débutant → Intermédiaire → Avancé, XP et score de maîtrise par leçon.
- **Révisions espacées** : les leçons reviennent au bon moment selon votre dernier score.
- Série de jours de pratique (streak).

### Coach IA
- Chat avec un coach qui connaît votre niveau et vos leçons validées ; il peut **jouer des riffs**
  (affichés en tablature) et afficher des diagrammes d'accords.
- Le coach reçoit une **table de référence exacte** (doigtés des accords, notes en première position,
  morceaux des leçons), générée depuis les mêmes données que les diagrammes : même un petit modèle
  local donne alors des positions justes.
- Génération de **nouvelles leçons** sur mesure, au même format que les leçons intégrées.
- Bibliothèque de fiches théoriques et **scanner de tablature** (photo → exercices).

### Outils
- Accordeur (accordage standard, corde par corde), métronome.

---

## Démarrage rapide

**Prérequis** : [Node.js](https://nodejs.org/) 20 ou plus récent.

```bash
git clone https://github.com/<votre-compte>/gibson.git
cd gibson
npm install
npm run dev
```

Ouvrez ensuite <http://localhost:3000>, puis l'onglet **Réglages** pour choisir l'IA.

Le micro (validation des exercices, accordeur) nécessite un navigateur récent ; il fonctionne
sur `localhost`. Pour l'utiliser depuis un autre appareil du réseau, le navigateur exige HTTPS.

---

## Configurer l'IA

Tout se fait dans l'onglet **Réglages** de l'application : choix du fournisseur, clé API,
modèle (bouton **Lister** pour voir les modèles disponibles) et bouton **Tester la connexion**,
qui affiche la cause exacte en cas d'échec (clé refusée, modèle introuvable, service arrêté…).

| Fournisseur | Clé | Où l'obtenir | Modèle par défaut |
|---|---|---|---|
| Ollama (local) | aucune | [ollama.com/download](https://ollama.com/download) | `llama3.1` |
| Google Gemini | oui | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | `gemini-2.5-flash` |
| Anthropic Claude | oui | [console.anthropic.com](https://console.anthropic.com/settings/keys) | `claude-opus-5-5` |
| Mistral AI | oui | [console.mistral.ai](https://console.mistral.ai/api-keys) | `mistral-large-latest` |
| Hugging Face | oui | [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens) | `meta-llama/Llama-3.3-70B-Instruct` |
| Compatible OpenAI (LM Studio, OpenRouter, OpenAI…) | selon le service | — | à choisir |

**Avec Ollama**, installez-le puis téléchargez un modèle, par exemple :

```bash
ollama pull qwen3:8b
```

Les petits modèles locaux sont plus lents (la première réponse charge le modèle en mémoire)
et moins fiables hors de la table de référence (accords ou morceaux qu'elle ne contient pas)
que les grands modèles en ligne.

Les clés peuvent aussi être placées dans un fichier `.env.local` (`GEMINI_API_KEY`,
`ANTHROPIC_API_KEY`, `MISTRAL_API_KEY`, `HF_TOKEN`) : elles sont reprises au premier lancement.

### Sécurité des clés
- Les clés restent **côté serveur** : le navigateur appelle `/api/*`, jamais le fournisseur
  directement, et le serveur ne renvoie jamais une clé (seulement ses 4 derniers caractères).
- Elles sont enregistrées dans `.gibson-ai.json`, **exclu de git**.
- Les réglages ne sont lisibles et modifiables que depuis l'ordinateur qui fait tourner l'application.
- Le serveur de développement écoute sur tout le réseau local (`0.0.0.0`) : les appareils
  du réseau peuvent utiliser l'IA, donc votre quota.

---

## Production

```bash
npm run build
npm start
```

Le serveur (`server/serve.mjs`) sert l'application compilée et l'API IA sur le port `PORT`
(3000 par défaut).

---

## Scripts

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement Vite avec l'API IA |
| `npm run build` | Compilation dans `dist/` |
| `npm start` | Serveur de production (après `build`) |
| `npm run preview` | Aperçu du build via Vite |
| `npm run typecheck` | Vérification TypeScript |

---

## Architecture

```
├── App.tsx                 # Navigation, profil, progression (localStorage)
├── curriculum.ts           # Leçons intégrées : objectif, étapes, bilan
├── constants.ts            # Accords (positions, doigtés, noms), cordes
├── components/
│   ├── LessonView.tsx      # Leçon : objectif, étapes, exercice au micro, bilan
│   ├── RiffPlayer.tsx      # Tablature animée synchronisée avec le son
│   ├── ChordDiagram.tsx    # Diagramme d'accord expliqué
│   ├── Fretboard.tsx       # Manche interactif
│   ├── ChatTutor.tsx       # Coach IA
│   ├── Dashboard.tsx       # Parcours, révisions, génération de leçons
│   ├── Tools.tsx           # Accordeur, métronome, bibliothèque, scanner
│   └── Settings.tsx        # Réglages de l'IA
├── services/               # Clients de l'API /api/*
├── utils/
│   ├── audio.ts            # Synthèse Karplus-Strong, détection de hauteur, noms de notes
│   └── progress.ts         # Streak et révisions espacées
└── server/
    ├── ai-api.mjs          # Routes /api/* (coach, leçons, scanner, réglages)
    ├── ai-providers.mjs    # Gemini, Claude, Mistral, Ollama, Hugging Face, compatible OpenAI
    ├── ai-settings.mjs     # Stockage des réglages et des clés
    └── serve.mjs           # Serveur de production
```

**Stack** : React 19, TypeScript, Vite, Tailwind CSS, Web Audio API.
SDK [`@google/genai`](https://www.npmjs.com/package/@google/genai) et
[`@anthropic-ai/sdk`](https://www.npmjs.com/package/@anthropic-ai/sdk) ; les autres fournisseurs
passent par leur API HTTP.

La progression de l'élève et l'historique du coach sont stockés dans le navigateur
(`localStorage`) : aucun compte, aucune base de données.

---

## Ajouter une leçon

Les leçons intégrées sont décrites dans [`curriculum.ts`](curriculum.ts). Une leçon comprend :
- un **objectif** (`goal`) : le passage du morceau, sous forme de notes (corde, case, durée en temps,
  doigt, syllabe chantée) et son tempo ;
- un **contenu** en Markdown (un accord seul sur sa ligne, comme `[Em]`, affiche son diagramme) ;
- des **étapes** (`exercises`) de difficulté croissante, la dernière jouant l'objectif complet ;
- un **bilan** (`recap`).

Privilégiez les mélodies du domaine public, ou de très courts extraits à but pédagogique.

---

## Contribuer

Les contributions sont les bienvenues : nouvelles leçons, corrections musicales, traductions,
améliorations de la détection au micro…

1. Forkez le dépôt et créez une branche.
2. Vérifiez que `npm run typecheck` et `npm run build` passent.
3. Ouvrez une pull request en décrivant le changement.

Ne commitez jamais de clé API (`.env.local` et `.gibson-ai.json` sont ignorés par git).

---

## Mentions

- Projet indépendant, **non affilié** à Gibson Brands, Activision (Guitar Hero), Metallica,
  The White Stripes ni à aucun fournisseur d'IA cité. Les noms de marques et de morceaux
  appartiennent à leurs détenteurs.
- Les extraits musicaux sont de courts passages utilisés à des fins pédagogiques ;
  « Au clair de la lune » est du domaine public.

## Licence

[MIT](LICENSE) © 2026 Stéphane Ancelot
