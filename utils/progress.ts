import { Lesson, LessonReview, UserProfile } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;
export const REVIEW_PASS_SCORE = 80;
const MAX_REVIEW_INTERVAL_DAYS = 30;

/** Numéro du jour calendaire local (indépendant de l'heure). */
const localDay = (timestamp: number): number => {
  const d = new Date(timestamp);
  return Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / DAY_MS);
};

/** Streak affichable : retombe à 0 si aucun jour de pratique hier ni aujourd'hui. */
export const currentStreak = (user: UserProfile, now: number = Date.now()): number => {
  if (!user.lastPracticeDate) return 0;
  return localDay(now) - localDay(user.lastPracticeDate) <= 1 ? user.streak : 0;
};

/** Streak après une séance de pratique terminée maintenant. */
export const streakAfterPractice = (user: UserProfile, now: number = Date.now()): number => {
  if (!user.lastPracticeDate) return 1;
  const gap = localDay(now) - localDay(user.lastPracticeDate);
  if (gap <= 0) return Math.max(user.streak, 1); // déjà pratiqué aujourd'hui
  if (gap === 1) return user.streak + 1;
  return 1;
};

/**
 * Révision espacée : un bon score double l'intervalle (1, 2, 4... jours, max 30),
 * un score insuffisant ramène la leçon au lendemain.
 */
export const scheduleReview = (previous: LessonReview | undefined, score: number, now: number = Date.now()): LessonReview => {
  const intervalDays = score >= REVIEW_PASS_SCORE
    ? Math.min(previous ? previous.intervalDays * 2 : 1, MAX_REVIEW_INTERVAL_DAYS)
    : 1;
  return { lastPlayed: now, lastScore: score, intervalDays };
};

/** Leçons validées dont la date de révision est atteinte, les plus en retard d'abord. */
export const dueReviews = (user: UserProfile, lessons: Lesson[], now: number = Date.now()): Lesson[] => {
  const reviews = user.lessonReviews || {};
  const dueAt = (id: string) => reviews[id].lastPlayed + reviews[id].intervalDays * DAY_MS;
  return lessons
    .filter(l => user.completedLessons.includes(l.id) && reviews[l.id] && now >= dueAt(l.id))
    .sort((a, b) => dueAt(a.id) - dueAt(b.id));
};
