// Client des fonctions IA : tous les appels passent par le proxy serveur /api/*
// (server/gemini-api.mjs), qui détient la clé Gemini.
import { CHORD_DEFINITIONS, INITIAL_LESSONS } from '../constants';
import { UserLevel, UserProfile, Lesson, InteractiveExercise, ChatMessage } from '../types';
import { getFrequencyFromPosition } from '../utils/audio';

const callApi = async <T>(route: string, body: unknown): Promise<T> => {
  const response = await fetch(`/api/${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Erreur API ${response.status}`);
  return data as T;
};

/** Résumé du profil de l'élève, ajouté aux instructions du coach. */
const describeStudent = (user: UserProfile): string => {
  const allLessons = [...Object.values(INITIAL_LESSONS).flat(), ...(user.generatedLessons || [])];
  const titleOf = (id: string) => allLessons.find(l => l.id === id)?.title || id;
  const done = user.completedLessons.map(id => `${titleOf(id)} (${user.lessonMastery?.[id] ?? 0}%)`);
  const todo = allLessons
    .filter(l => l.level === user.level && !user.completedLessons.includes(l.id))
    .map(l => l.title);
  return `PROFIL DE L'ÉLÈVE :
- Prénom : ${user.name}
- Niveau : ${user.level} (${user.xp} XP)
- Leçons validées (meilleur score) : ${done.length ? done.join(', ') : "aucune pour l'instant"}
- Leçons restantes à son niveau : ${todo.length ? todo.join(', ') : 'aucune'}
Adapte tes explications à ce niveau, appelle l'élève par son prénom et propose des étapes concrètes pour progresser à partir de ce qu'il a déjà validé (insiste sur les leçons à score faible).
ACCORDS AFFICHABLES EN DIAGRAMME : ${Object.keys(CHORD_DEFINITIONS).join(', ')}. Pour les autres accords, décris le doigté en texte.`;
};

/**
 * Envoie un message au coach. `history` contient les échanges précédents réussis
 * (le serveur ne garde aucun état de conversation).
 */
export const sendMessageToAI = async (user: UserProfile, history: ChatMessage[], message: string): Promise<string> => {
  const { text } = await callApi<{ text: string }>('chat', {
    studentContext: describeStudent(user),
    history: history.map(m => ({ role: m.role, text: m.text })),
    message,
  });
  return text;
};

/**
 * Fixe l'id et recalcule la fréquence depuis corde/case quand elles sont valides
 * (la fréquence renvoyée par l'IA est souvent incohérente avec la position).
 */
const normalizeExercise = (ex: InteractiveExercise, id: string): InteractiveExercise => {
  const freq = ex.targetString ? getFrequencyFromPosition(ex.targetString, ex.targetFret ?? 0) : -1;
  return {
    ...ex,
    id,
    targetFrequency: freq > 0 ? freq : ex.targetFrequency,
    tolerance: ex.tolerance ?? 5,
    duration_sec: ex.duration_sec ?? 1.5,
  };
};

/** Generates a personalized practice routine based on the user's level. */
export const generatePracticeRoutine = async (userLevel: UserLevel): Promise<string> => {
  const { text } = await callApi<{ text: string }>('routine', { level: userLevel });
  return text || "Impossible de générer la routine pour le moment.";
};

/** Generates a structured lesson following the user's progress. */
export const generateNextLesson = async (userLevel: UserLevel, existingTitles: string[]): Promise<Lesson | null> => {
  const { lesson } = await callApi<{ lesson: any }>('lesson', { level: userLevel, existingTitles });
  if (!lesson || typeof lesson.title !== 'string' || typeof lesson.content !== 'string') return null;
  // Identifiant local unique : celui de l'IA ("lesson_1"...) peut entrer en collision avec une leçon existante
  const id = `gen_${Date.now()}`;
  return {
    ...lesson,
    id,
    exercises: (lesson.exercises || []).map((ex: InteractiveExercise, i: number) => normalizeExercise(ex, `${id}_ex${i}`)),
    level: userLevel,
    completed: false,
    isGenerated: true,
    lastPlayed: Date.now(),
    masteryScore: 0
  };
};

/** Generates educational library content for a specific query. */
export const generateLessonContent = async (query: string, userLevel: UserLevel): Promise<string> => {
  const { text } = await callApi<{ text: string }>('library', { query, level: userLevel });
  return text || "Désolé, je ne parviens pas à générer cette fiche.";
};

/** Analyzes a guitar tab image and extracts playable notes into interactive exercises. */
export const scanGuitarTab = async (base64Image: string, mimeType: string = 'image/png'): Promise<InteractiveExercise[]> => {
  const { exercises } = await callApi<{ exercises: any[] }>('scan', { image: base64Image, mimeType });
  return (Array.isArray(exercises) ? exercises : []).map((item, index) => normalizeExercise({
    ...item,
    tolerance: 5,
    duration_sec: 1.5
  }, `scanned_note_${Date.now()}_${index}`));
};
