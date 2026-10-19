
import { ReactNode } from 'react';

export enum UserLevel {
  BEGINNER = 'Débutant',
  INTERMEDIATE = 'Intermédiaire',
  ADVANCED = 'Avancé',
  UNKNOWN = 'Inconnu'
}

export interface FretboardPosition {
    string: number; // 1-6
    fret: number;
}

export interface MelodyNote extends FretboardPosition {
    duration?: number; // en temps (1.0 = noire, 0.5 = croche)
}

/**
 * Interface for the steps used in the VisualCoach component animations.
 */
export interface VisualStep {
    string: number;
    fret: number;
    action: 'pluck' | 'press' | 'slide_left' | 'slide_right' | 'wrong_string' | 'correct_string';
    caption: string;
    finger?: number;
    duration?: number;
}

/**
 * Interface for a sequence of visual coaching steps.
 */
export interface VisualSequence {
    steps: VisualStep[];
    loop?: boolean;
}

export interface InteractiveExercise {
  id: string;
  prompt: string; 
  targetNote: string; 
  targetFrequency: number; 
  tolerance: number; 
  duration_sec: number; 
  targetString?: number; 
  targetFret?: number; 
  finger?: number; 
  contextExplanation?: string; 
  ghostNotes?: FretboardPosition[]; 
  sequence?: MelodyNote[]; // Nouvelle propriété pour les riffs complets
  tempo?: number; // BPM de la séquence
  songTitle?: string;
  artist?: string;
}

export interface Lesson {
  id: string;
  title: string;
  description: string;
  level: UserLevel;
  content: string; 
  completed: boolean;
  duration: string; 
  exercises?: InteractiveExercise[]; 
  lastPlayed?: number; 
  masteryScore?: number; 
  isGenerated?: boolean; 
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

export enum AppView {
  ONBOARDING = 'ONBOARDING',
  DASHBOARD = 'DASHBOARD',
  LESSON = 'LESSON',
  CHAT = 'CHAT',
  TOOLS = 'TOOLS'
}

export interface LessonReview {
  lastPlayed: number;   // timestamp de la dernière pratique
  lastScore: number;    // score de la dernière pratique (0-100)
  intervalDays: number; // délai avant la prochaine révision
}

export interface UserProfile {
  name: string;
  level: UserLevel;
  xp: number;
  streak: number;
  completedLessons: string[];
  generatedLessons: Lesson[]; 
  lessonMastery: Record<string, number>; // meilleur score obtenu (0-100)
  lessonReviews?: Record<string, LessonReview>; // planification des révisions espacées
  lastPracticeDate?: number; // dernière leçon terminée (sert au calcul du streak)
  settings?: {
      voiceEnabled: boolean;
  };
}

export type MIMMode = 'demo' | 'live' | 'practice';

export interface FeedbackType {
    type: 'success' | 'warning' | 'info' | 'correction' | 'musical';
}

export interface ToastMessage {
    id: string;
    title?: string;
    text: string;
    type: 'success' | 'warning' | 'info' | 'correction' | 'musical';
    icon?: ReactNode;
}