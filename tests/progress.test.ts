// Série de jours de pratique (streak) et révisions espacées (utils/progress.ts).
import { describe, expect, it } from 'vitest';
import { currentStreak, dueReviews, scheduleReview, streakAfterPractice } from '../utils/progress';
import { UserLevel, type Lesson, type UserProfile } from '../types';

const DAY = 24 * 60 * 60 * 1000;
// Dates locales (le calcul se fait en jours calendaires locaux)
const at = (day: number, hour: number) => new Date(2026, 9, day, hour).getTime();

const user = (patch: Partial<UserProfile> = {}): UserProfile => ({
  name: 'Test', level: UserLevel.BEGINNER, xp: 0, streak: 0,
  completedLessons: [], generatedLessons: [], lessonMastery: {}, ...patch,
});

describe('streak', () => {
  it('aucune pratique : 0, première séance : 1', () => {
    expect(currentStreak(user())).toBe(0);
    expect(streakAfterPractice(user(), at(10, 9))).toBe(1);
  });

  it('pratique hier : la série continue', () => {
    const u = user({ streak: 3, lastPracticeDate: at(9, 23) });
    expect(currentStreak(u, at(10, 0))).toBe(3);
    expect(streakAfterPractice(u, at(10, 0))).toBe(4);
  });

  it("déjà pratiqué aujourd'hui : la série ne bouge pas", () => {
    const u = user({ streak: 3, lastPracticeDate: at(10, 8) });
    expect(streakAfterPractice(u, at(10, 21))).toBe(3);
  });

  it('un jour sauté : la série retombe', () => {
    const u = user({ streak: 5, lastPracticeDate: at(8, 20) });
    expect(currentStreak(u, at(10, 9))).toBe(0);
    expect(streakAfterPractice(u, at(10, 9))).toBe(1);
  });
});

describe('révisions espacées', () => {
  it("un bon score double l'intervalle, jusqu'à 30 jours", () => {
    let review = scheduleReview(undefined, 90, 0);
    const intervals = [review.intervalDays];
    for (let i = 0; i < 6; i++) {
      review = scheduleReview(review, 85, 0);
      intervals.push(review.intervalDays);
    }
    expect(intervals).toEqual([1, 2, 4, 8, 16, 30, 30]);
  });

  it('un score insuffisant ramène la leçon au lendemain', () => {
    expect(scheduleReview({ lastPlayed: 0, lastScore: 90, intervalDays: 16 }, 50, 123)).toEqual({ lastPlayed: 123, lastScore: 50, intervalDays: 1 });
  });

  it('leçons à revoir : validées, échues, les plus en retard en premier', () => {
    const lessons = ['a', 'b', 'c', 'd'].map(id => ({ id }) as Lesson);
    const now = 100 * DAY;
    const u = user({
      completedLessons: ['a', 'b', 'c'],
      lessonReviews: {
        a: { lastPlayed: now - 2 * DAY, lastScore: 90, intervalDays: 1 },  // en retard d'1 jour
        b: { lastPlayed: now - 10 * DAY, lastScore: 90, intervalDays: 4 }, // en retard de 6 jours
        c: { lastPlayed: now - DAY, lastScore: 90, intervalDays: 2 },      // pas encore
        d: { lastPlayed: 0, lastScore: 90, intervalDays: 1 },              // pas validée
      },
    });
    expect(dueReviews(u, lessons, now).map(l => l.id)).toEqual(['b', 'a']);
  });
});
