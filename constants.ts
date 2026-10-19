
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

export const INITIAL_LESSONS: Record<UserLevel, Lesson[]> = {
  [UserLevel.BEGINNER]: [
    {
      id: 'b2',
      title: 'L\'Arpège Metallica',
      description: 'Apprenez l\'intro légendaire de "Nothing Else Matters".',
      level: UserLevel.BEGINNER,
      content: `## L'Intro de Metallica
L'intro se joue sur les cordes à vide. C'est un arpège descendant puis ascendant.

[Em]

Écoutez Gibson jouer la séquence complète avant d'essayer !`,
      completed: false,
      duration: '10 min',
      exercises: [
        {
          id: 'ex_metallica_full',
          prompt: "Jouez la séquence : Mi Grave, Sol, Si, Mi Aigu.",
          contextExplanation: "C'est l'arpège de base. Laisse chaque corde résonner.",
          targetNote: "E",
          targetFrequency: 329.63,
          tolerance: 4,
          duration_sec: 2.0,
          targetString: 1,
          targetFret: 0,
          sequence: [
              { string: 6, fret: 0, duration: 1.0 },
              { string: 3, fret: 0, duration: 1.0 },
              { string: 2, fret: 0, duration: 1.0 },
              { string: 1, fret: 0, duration: 1.0 }
          ],
          tempo: 100,
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
        content: `## Le Riff en Case 7
Tout se passe sur la corde 5 ou 6. Ici, on va utiliser la corde 6.
Écoutez bien le rythme : Ta--Ta-Ta-Ta-Ta---Ta-Ta`,
        completed: false,
        duration: '10 min',
        exercises: [
            {
                id: 'ex_7nation_full',
                prompt: "Reproduisez le riff complet en case 7, 10, 7, 5, 3, 2.",
                targetNote: "B",
                targetFrequency: 123.47,
                tolerance: 4,
                duration_sec: 1.5,
                targetString: 6,
                targetFret: 7,
                sequence: [
                    { string: 6, fret: 7, duration: 0.75 },
                    { string: 6, fret: 7, duration: 0.25 },
                    { string: 6, fret: 10, duration: 0.5 },
                    { string: 6, fret: 7, duration: 0.5 },
                    { string: 6, fret: 5, duration: 0.5 },
                    { string: 6, fret: 3, duration: 1.0 },
                    { string: 6, fret: 2, duration: 1.0 }
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
