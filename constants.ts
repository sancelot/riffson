
import { UserLevel, Lesson } from './types';

// Les instructions du coach IA sont côté serveur : server/gemini-api.mjs

export const CHORD_DEFINITIONS: Record<string, number[]> = {
  'Em': [0, 2, 2, 0, 0, 0],
  'E': [0, 2, 2, 1, 0, 0],
  'A': [-1, 0, 2, 2, 2, 0],
  'Am': [-1, 0, 2, 2, 1, 0],
  'D': [-1, -1, 0, 2, 3, 2],
  'Dm': [-1, -1, 0, 2, 3, 1],
  'C': [-1, 3, 2, 0, 1, 0],
  'G': [3, 2, 0, 0, 0, 3],
  'Bm': [-1, 2, 4, 4, 3, 2],
  'F': [1, 3, 3, 2, 1, 1]
};

// Doigté main gauche (même ordre de cordes) : 1 index, 2 majeur, 3 annulaire, 4 auriculaire, 0 = aucun
export const CHORD_FINGERS: Record<string, number[]> = {
  'Em': [0, 2, 3, 0, 0, 0],
  'E': [0, 2, 3, 1, 0, 0],
  'A': [0, 0, 1, 2, 3, 0],
  'Am': [0, 0, 2, 3, 1, 0],
  'D': [0, 0, 0, 1, 3, 2],
  'Dm': [0, 0, 0, 2, 3, 1],
  'C': [0, 3, 2, 0, 1, 0],
  'G': [2, 1, 0, 0, 0, 3],
  'Bm': [0, 1, 3, 4, 2, 1],
  'F': [1, 3, 4, 2, 1, 1]
};

export const CHORD_NAMES_FR: Record<string, string> = {
  'Em': 'Mi mineur',
  'E': 'Mi majeur',
  'A': 'La majeur',
  'Am': 'La mineur',
  'D': 'Ré majeur',
  'Dm': 'Ré mineur',
  'C': 'Do majeur',
  'G': 'Sol majeur',
  'Bm': 'Si mineur',
  'F': 'Fa majeur'
};

export const FINGER_NAMES = ['', 'index', 'majeur', 'annulaire', 'auriculaire'];

// Cordes numérotées comme en tablature : 1 = Mi aigu (la plus fine) ... 6 = Mi grave (la plus épaisse)
export const STRING_NAMES_FR: Record<number, string> = {
  1: 'Mi aigu', 2: 'Si', 3: 'Sol', 4: 'Ré', 5: 'La', 6: 'Mi grave'
};

// Doigts de la main droite (notation classique p-i-m-a)
export const PLUCK_FINGERS: Record<string, string> = {
  p: 'pouce', i: 'index', m: 'majeur', a: 'annulaire', pick: 'médiator'
};

export const INITIAL_LESSONS: Record<UserLevel, Lesson[]> = {
  [UserLevel.BEGINNER]: [
    {
      id: 'b2',
      title: 'L\'Arpège Metallica',
      description: 'Apprenez l\'intro légendaire de "Nothing Else Matters".',
      level: UserLevel.BEGINNER,
      content: `## L'intro de « Nothing Else Matters »

### Ce que vous allez jouer
Un **arpège** : au lieu de gratter toutes les cordes d'un coup, on les pince **une par une**.
Ici, quatre cordes **à vide** (sans rien presser) : Mi grave (corde 6) → Sol (3) → Si (2) → Mi aigu (1), puis on redescend : Si (2) → Sol (3).

### Le lien avec l'accord de Mi mineur
Ces cordes donnent les notes **Mi, Sol et Si** : ce sont exactement les notes de l'**accord de Mi mineur (Em)**.
Jouer cet arpège, c'est jouer l'accord de Mi mineur **note par note**.

[Em]

Pour gratter l'accord complet, la main gauche presse deux cordes (La et Ré, case 2), comme sur le schéma.
**Dans cet exercice, elle ne presse rien** : les cordes jouées sont toutes à vide et sonnent déjà en Mi mineur.

### Vos mains
- **Main gauche** : elle tient simplement le manche, sans appuyer sur les cordes.
- **Main droite** : doigts au-dessus de la rosace (le trou de la guitare). Le **pouce** pince la corde 6, l'**index** la corde 3, le **majeur** la corde 2, l'**annulaire** la corde 1.
- Laissez chaque corde **résonner** : ne touchez pas les cordes déjà jouées.

### Comment se passe l'exercice
1. Écoutez la démo et suivez sur le manche la corde qui s'allume.
2. Cliquez sur **Je suis prêt** et jouez note par note : l'app vous écoute et passe à la note suivante dès qu'elle l'entend.`,
      completed: false,
      duration: '10 min',
      exercises: [
        {
          id: 'ex_metallica_full',
          prompt: "Jouez l'arpège : Mi grave, Sol, Si, Mi aigu, Si, Sol.",
          contextExplanation: "Les notes de l'accord de Mi mineur, une par une. Laissez chaque corde résonner.",
          leftHand: "Rien à presser : toutes les cordes sont jouées à vide. Tenez simplement le manche.",
          rightHand: "Pouce sur la corde 6, index sur la 3, majeur sur la 2, annulaire sur la 1. Pincez une corde à la fois, vers le haut.",
          targetNote: "E",
          targetFrequency: 82.41,
          tolerance: 4,
          duration_sec: 2.0,
          targetString: 6,
          targetFret: 0,
          sequence: [
              { string: 6, fret: 0, duration: 1.0, pluck: 'p' },
              { string: 3, fret: 0, duration: 1.0, pluck: 'i' },
              { string: 2, fret: 0, duration: 1.0, pluck: 'm' },
              { string: 1, fret: 0, duration: 1.0, pluck: 'a' },
              { string: 2, fret: 0, duration: 1.0, pluck: 'm' },
              { string: 3, fret: 0, duration: 1.0, pluck: 'i' }
          ],
          tempo: 90,
          songTitle: "Nothing Else Matters",
          artist: "Metallica"
        }
      ]
    },
    {
        id: 'b3',
        title: 'Seven Nation Army',
        description: 'Le riff le plus célèbre du monde sur une seule corde.',
        level: UserLevel.BEGINNER,
        content: `## Le riff de « Seven Nation Army »

### Ce que vous allez jouer
Une **mélodie sur une seule corde** : la corde 5 (La). Ce n'est pas un accord : on joue **une note à la fois**.
Les cases : **7 – 7 – 10 – 7 – 5 – 3 – 2**, qui donnent les notes Mi, Mi, Sol, Mi, Ré, Do, Si.

### Vos mains
- **Main gauche** : l'**index** presse la case indiquée, juste avant la frette métallique (côté caisse), puis glisse d'une case à l'autre le long de la corde. Appuyez franchement pour que la note ne « frise » pas.
- **Main droite** : un **médiator** (ou le pouce) attaque la corde 5, toujours **vers le bas**. Les autres cordes ne doivent pas sonner.

### Le rythme
Une note longue suivie d'une note courte, trois notes régulières, puis deux notes longues :
« Taaa-ta · Ta · Ta · Ta · Taaaa · Taaaa ». Écoutez la démo plusieurs fois avant de jouer.`,
        completed: false,
        duration: '10 min',
        exercises: [
            {
                id: 'ex_7nation_full',
                prompt: "Jouez le riff sur la corde 5 : cases 7, 7, 10, 7, 5, 3, 2.",
                contextExplanation: "Une seule corde, un seul doigt qui se déplace. Le rythme compte autant que les notes.",
                leftHand: "L'index presse chaque case et glisse le long de la corde 5 (La).",
                rightHand: "Médiator ou pouce, toujours vers le bas, uniquement sur la corde 5.",
                targetNote: "E",
                targetFrequency: 164.81,
                tolerance: 4,
                duration_sec: 1.5,
                targetString: 5,
                targetFret: 7,
                finger: 1,
                sequence: [
                    { string: 5, fret: 7, duration: 0.75, finger: 1, pluck: 'pick' },
                    { string: 5, fret: 7, duration: 0.25, finger: 1, pluck: 'pick' },
                    { string: 5, fret: 10, duration: 0.5, finger: 1, pluck: 'pick' },
                    { string: 5, fret: 7, duration: 0.5, finger: 1, pluck: 'pick' },
                    { string: 5, fret: 5, duration: 0.5, finger: 1, pluck: 'pick' },
                    { string: 5, fret: 3, duration: 1.0, finger: 1, pluck: 'pick' },
                    { string: 5, fret: 2, duration: 1.0, finger: 1, pluck: 'pick' }
                ],
                tempo: 120,
                songTitle: "Seven Nation Army",
                artist: "The White Stripes"
            }
        ]
    }
  ],
  [UserLevel.INTERMEDIATE]: [],
  [UserLevel.ADVANCED]: [],
  [UserLevel.UNKNOWN]: []
};
