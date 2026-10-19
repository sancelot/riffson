import { UserLevel, Lesson, InteractiveExercise, MelodyNote, PluckFinger } from './types';
import { getFrequencyFromPosition, getNoteNameFr } from './utils/audio';

/*
 * Parcours débutant. Chaque leçon vise un morceau que l'élève connaît déjà :
 * on l'écoute d'abord (goal), on le découpe en étapes courtes, puis la dernière étape
 * le fait jouer en entier, au tempo, pour qu'il puisse dire « c'est bien ce morceau ».
 */

const note = (string: number, fret: number, duration: number, extra: Partial<MelodyNote> = {}): MelodyNote =>
  ({ string, fret, duration, ...extra });

const repeat = (notes: MelodyNote[], times: number): MelodyNote[] =>
  Array.from({ length: times }, () => notes).flat();

/** Exercice dont la première note sert de cible par défaut (avant le début de la démo). */
const step = (
  id: string,
  prompt: string,
  contextExplanation: string,
  leftHand: string,
  rightHand: string,
  sequence: MelodyNote[],
  tempo: number,
  extra: Partial<InteractiveExercise> = {}
): InteractiveExercise => ({
  id,
  prompt,
  contextExplanation,
  leftHand,
  rightHand,
  sequence,
  tempo,
  targetString: sequence[0].string,
  targetFret: sequence[0].fret,
  targetNote: getNoteNameFr(sequence[0].string, sequence[0].fret),
  targetFrequency: getFrequencyFromPosition(sequence[0].string, sequence[0].fret),
  tolerance: 4,
  duration_sec: 1,
  ...extra,
});

// ---------------------------------------------------------------------------
// Au clair de la lune : domaine public, connu de tous, trois notes seulement
// ---------------------------------------------------------------------------
const pluck: PluckFinger = 'i';
const DO = (duration: number, lyric?: string) => note(2, 1, duration, { finger: 1, pluck, lyric });
const RE = (duration: number, lyric?: string) => note(2, 3, duration, { finger: 3, pluck, lyric });
const MI = (duration: number, lyric?: string) => note(1, 0, duration, { pluck, lyric });

const AU_CLAIR_1 = [DO(1, 'Au'), DO(1, 'clair'), DO(1, 'de'), RE(1, 'la'), MI(2, 'lu'), RE(2, 'ne,')];
const AU_CLAIR_2 = [DO(1, 'mon'), MI(1, 'a'), RE(1, 'mi'), RE(1, 'Pier'), DO(4, 'rot')];
const AU_CLAIR_3 = [DO(1, 'Prê'), DO(1, 'te'), DO(1, 'moi'), RE(1, 'ta'), MI(2, 'plu'), RE(2, 'me')];
const AU_CLAIR_4 = [DO(1, 'pour'), MI(1, 'é'), RE(1, 'crire'), RE(1, 'un'), DO(4, 'mot')];
const AU_CLAIR_COUPLET = [...AU_CLAIR_1, ...AU_CLAIR_2, ...AU_CLAIR_3, ...AU_CLAIR_4];

const AU_CLAIR_LEFT = "Do : index (1) sur la corde 2 (Si), case 1. Ré : annulaire (3), même corde, case 3. Mi : corde 1 (Mi aigu) à vide, la main gauche ne presse rien.";
const AU_CLAIR_RIGHT = "L'index de la main droite (ou un médiator) pince vers le bas : corde 2 pour Do et Ré, corde 1 pour Mi.";

const auClairDeLaLune: Lesson = {
  id: 'b1',
  title: 'Au clair de la lune',
  description: 'Votre première mélodie : trois notes suffisent pour jouer une chanson que tout le monde connaît.',
  level: UserLevel.BEGINNER,
  duration: '10 min',
  completed: false,
  goal: {
    title: '« Au clair de la lune »',
    description: 'Le premier couplet, avec les paroles sous les notes.',
    sequence: AU_CLAIR_COUPLET,
    tempo: 100,
  },
  content: `## Votre première chanson

Écoutez l'extrait ci-dessus : c'est **« Au clair de la lune »**. Chantez-le dans votre tête, vous le connaissez déjà.
Bonne nouvelle : il n'utilise que **trois notes**, **Do, Ré et Mi**, toutes au même endroit du manche.

### Où sont ces notes ?
- **Do** : corde 2 (Si), **case 1**, avec l'**index** (doigt 1).
- **Ré** : corde 2 (Si), **case 3**, avec l'**annulaire** (doigt 3).
- **Mi** : corde 1 (Mi aigu, la plus fine), **à vide** : on la pince sans rien presser.

### Bien presser une case
Posez le bout du doigt **juste avant la frette métallique** (côté caisse), pas au milieu de la case.
Appuyez assez fort pour que la note sonne clairement, sans « frisement ».

### Les mains
- **Main gauche** : le pouce derrière le manche, les doigts arrondis comme une pince.
- **Main droite** : l'index (ou un médiator) pince la corde vers le bas, au-dessus de la rosace.

### Le parcours
On apprend d'abord les trois notes, puis la phrase « Au clair de la lune », puis « mon ami Pierrot »,
et pour finir le couplet entier : vous jouerez alors exactement l'extrait que vous venez d'écouter.`,
  exercises: [
    step('b1_notes', 'Les trois notes : Do, Ré, Mi',
      "Prenez votre temps : chaque note doit sonner clairement avant de passer à la suivante.",
      AU_CLAIR_LEFT, AU_CLAIR_RIGHT, [DO(2), RE(2), MI(2)], 60),
    step('b1_phrase1', '« Au clair de la lune »',
      "Trois fois Do : pincez la corde à nouveau pour chaque syllabe. Chantez en jouant, ça aide !",
      AU_CLAIR_LEFT, AU_CLAIR_RIGHT, AU_CLAIR_1, 70),
    step('b1_phrase2', '« mon ami Pierrot »',
      "On alterne Do, Mi et Ré : l'index lâche la corde 2 pour laisser la main droite pincer la corde 1.",
      AU_CLAIR_LEFT, AU_CLAIR_RIGHT, AU_CLAIR_2, 70),
    step('b1_couplet', 'Le premier couplet en entier',
      "« Au clair de la lune, mon ami Pierrot, prête-moi ta plume pour écrire un mot » : la même phrase deux fois.",
      AU_CLAIR_LEFT, AU_CLAIR_RIGHT, AU_CLAIR_COUPLET, 90),
  ],
  recap: [
    "Lire une position : une corde, une case et un doigt de la main gauche.",
    "Presser une case juste avant la frette pour une note claire.",
    "Trouver Do, Ré et Mi sur les deux cordes les plus aiguës.",
    "Rejouer plusieurs fois la même note en pinçant à nouveau la corde.",
  ],
};

// ---------------------------------------------------------------------------
// Nothing Else Matters : l'arpège d'ouverture du morceau, en croches
// ---------------------------------------------------------------------------
const NEM_MEASURE = [
  note(6, 0, 0.5, { pluck: 'p' }),
  note(3, 0, 0.5, { pluck: 'i' }),
  note(2, 0, 0.5, { pluck: 'm' }),
  note(1, 0, 0.5, { pluck: 'a' }),
  note(2, 0, 0.5, { pluck: 'm' }),
  note(3, 0, 0.5, { pluck: 'i' }),
];
const NEM_LEFT = "Rien à presser : toutes les cordes sont jouées à vide. Tenez simplement le manche.";
const NEM_RIGHT = "Un doigt par corde : pouce sur la 6, index sur la 3, majeur sur la 2, annulaire sur la 1. Pincez vers le haut et laissez résonner.";

const nothingElseMatters: Lesson = {
  id: 'b2',
  title: 'L\'Arpège Metallica',
  description: 'Jouez l\'ouverture de "Nothing Else Matters", note pour note, au tempo du morceau.',
  level: UserLevel.BEGINNER,
  duration: '15 min',
  completed: false,
  goal: {
    title: 'l\'intro de « Nothing Else Matters »',
    description: 'Les premières mesures du morceau de Metallica : un arpège sur les cordes à vide qui tourne en boucle.',
    sequence: repeat(NEM_MEASURE, 4),
    tempo: 69,
  },
  content: `## L'ouverture de « Nothing Else Matters »

Écoutez l'extrait ci-dessus : ce sont les **premières secondes du morceau de Metallica**.
Six notes qui tournent en boucle, toutes sur des **cordes à vide** : la main gauche n'a rien à presser.

### Le motif
Mi grave (corde 6) → Sol (3) → Si (2) → Mi aigu (1) → Si (2) → Sol (3), puis on recommence.
Les six notes ont la même durée : comptez « **1-2-3-4-5-6** » de façon régulière, sans accent.

### Pourquoi ça sonne « Metallica » ?
Ces cordes donnent les notes **Mi, Sol et Si** : les notes de l'**accord de Mi mineur (Em)**,
joué **note par note** au lieu d'être gratté. C'est ce qui donne cette couleur mélancolique.

[Em]

Pour gratter l'accord complet, la main gauche presse deux cordes (La et Ré, case 2), comme sur le schéma.
**Ici, elle ne presse rien** : les cordes jouées sont toutes à vide et sonnent déjà en Mi mineur.

### Les mains
- **Main droite** : un doigt par corde, c'est la clé de l'arpège. **Pouce** sur la corde 6, **index** sur la 3,
  **majeur** sur la 2, **annulaire** sur la 1. Les doigts restent au-dessus de « leur » corde.
- Laissez **résonner** : ne touchez pas les cordes déjà jouées.

### Le parcours
On monte d'abord les quatre cordes lentement, puis on fait l'aller-retour, on enchaîne deux mesures,
et pour finir on joue l'intro **au tempo du morceau** : c'est exactement l'extrait écouté.
La suite de l'intro ajoute une mélodie sur les cordes aiguës : ce sera l'objet d'une prochaine leçon.`,
  exercises: [
    step('b2_montee', 'Monter : Mi grave, Sol, Si, Mi aigu',
      "Lentement, un doigt par corde : pouce, index, majeur, annulaire.",
      NEM_LEFT, NEM_RIGHT, NEM_MEASURE.slice(0, 4).map(n => ({ ...n, duration: 1 })), 60),
    step('b2_mesure', "L'aller-retour : le motif de six notes",
      "Montez puis redescendez (Si, Sol). Gardez les six notes bien régulières.",
      NEM_LEFT, NEM_RIGHT, NEM_MEASURE, 45),
    step('b2_deux_mesures', 'Enchaîner deux fois le motif',
      "Sans pause entre les deux : le pouce retombe sur le Mi grave juste après le Sol.",
      NEM_LEFT, NEM_RIGHT, repeat(NEM_MEASURE, 2), 55),
    step('b2_tempo', "L'intro au tempo du morceau",
      "Quatre fois le motif, à la vitesse de Metallica. Si ça va trop vite, refaites l'étape précédente.",
      NEM_LEFT, NEM_RIGHT, repeat(NEM_MEASURE, 4), 69),
  ],
  recap: [
    "Un arpège, c'est un accord joué note par note.",
    "Le motif Mi-Sol-Si-Mi-Si-Sol forme l'accord de Mi mineur (Em).",
    "Main droite « un doigt par corde » : pouce, index, majeur, annulaire.",
    "Garder des notes régulières et les laisser résonner.",
  ],
};

// ---------------------------------------------------------------------------
// Seven Nation Army : le riff (et le « oh oh oh » des stades)
// ---------------------------------------------------------------------------
const SNA = (fret: number, duration: number, finger: number) =>
  note(5, fret, duration, { finger, pluck: 'pick', lyric: 'oh' });
const SNA_RIFF = [SNA(7, 1.5, 1), SNA(7, 0.5, 1), SNA(10, 0.75, 4), SNA(7, 0.75, 1), SNA(5, 0.5, 1), SNA(3, 2, 1), SNA(2, 2, 1)];
const SNA_LEFT = "Tout se passe sur la corde 5 (La). Index (1) pour les cases 7, 5, 3 et 2, en glissant le long de la corde ; auriculaire (4) pour la case 10 (ou l'annulaire si c'est plus facile).";
const SNA_RIGHT = "Médiator (ou pouce), toujours vers le bas, uniquement sur la corde 5. Les autres cordes ne doivent pas sonner.";

const sevenNationArmy: Lesson = {
  id: 'b3',
  title: 'Seven Nation Army',
  description: 'Le riff des White Stripes, celui que les stades chantent « oh, oh-oh-oh-oh-oh-oh ».',
  level: UserLevel.BEGINNER,
  duration: '15 min',
  completed: false,
  goal: {
    title: 'le riff de « Seven Nation Army »',
    description: 'Le riff des White Stripes, deux fois, au tempo du morceau.',
    sequence: repeat(SNA_RIFF, 2),
    tempo: 120,
  },
  content: `## Le riff de « Seven Nation Army »

Écoutez l'extrait ci-dessus : c'est le riff des **White Stripes**, celui que les supporters chantent
dans les stades : « **oh, oh-oh-oh-oh-oh-oh** ». Chaque « oh » est une note.

### Une seule corde
Tout se joue sur la **corde 5 (La)**, une note à la fois, ce n'est pas un accord.
Les cases : **7 – 7 – 10 – 7 – 5 – 3 – 2**, qui donnent les notes Mi, Mi, Sol, Mi, Ré, Do, Si.

### Le rythme fait tout
« **Ooooh**-oh, **oh**, **oh**, oh, **Ooooh**, **Ooooh** » : une note longue puis une courte,
trois notes qui avancent, et deux notes très longues pour finir. Fredonnez-le avant de jouer.

### Les mains
- **Main gauche** : l'**index** presse la case 7, juste avant la frette. Pour la case 10, l'**auriculaire** (ou l'annulaire) ;
  pour descendre 5, 3, 2, l'index **glisse** le long de la corde.
- **Main droite** : un **médiator** (ou le pouce) attaque la corde 5, toujours **vers le bas**.

### Le parcours
D'abord les deux premières notes (long-court), puis la montée 7-7-10-7, puis la descente 5-3-2,
et enfin le riff complet deux fois au tempo : celui que tout le stade reconnaît.`,
  exercises: [
    step('b3_debut', 'Les deux premières notes : long-court',
      "« Ooooh-oh » : la première note dure trois fois plus longtemps que la seconde.",
      SNA_LEFT, SNA_RIGHT, repeat([SNA(7, 1.5, 1), SNA(7, 0.5, 1)], 2), 100),
    step('b3_montee', 'La première moitié : 7 - 7 - 10 - 7',
      "L'index reste sur la case 7, l'auriculaire va chercher la case 10 puis se relève.",
      SNA_LEFT, SNA_RIGHT, SNA_RIFF.slice(0, 4), 100),
    step('b3_descente', 'La descente : 5 - 3 - 2',
      "L'index glisse vers la tête de la guitare. Les deux dernières notes sont longues.",
      SNA_LEFT, SNA_RIGHT, SNA_RIFF.slice(4), 100),
    step('b3_riff', 'Le riff complet, deux fois, au tempo',
      "Enchaînez tout, comme dans le morceau. Vous pouvez chanter « oh » en même temps !",
      SNA_LEFT, SNA_RIGHT, repeat(SNA_RIFF, 2), 120),
  ],
  recap: [
    "Jouer une mélodie sur une seule corde en déplaçant la main gauche.",
    "Utiliser l'index et l'auriculaire pour couvrir 4 cases sans bouger la main.",
    "Le rythme rend un riff reconnaissable autant que les notes.",
    "Attaquer au médiator, toujours vers le bas.",
  ],
};

export const INITIAL_LESSONS: Record<UserLevel, Lesson[]> = {
  [UserLevel.BEGINNER]: [auClairDeLaLune, nothingElseMatters, sevenNationArmy],
  [UserLevel.INTERMEDIATE]: [],
  [UserLevel.ADVANCED]: [],
  [UserLevel.UNKNOWN]: []
};
