

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

// Le parcours de leçons est dans curriculum.ts
export { INITIAL_LESSONS } from './curriculum';
