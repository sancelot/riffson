
import React, { useState, useEffect } from 'react';
import { UserLevel, UserProfile, AppView, Lesson } from './types';
import { INITIAL_LESSONS } from './constants';
import Onboarding from './components/Onboarding';
import Dashboard from './components/Dashboard';
import LessonView from './components/LessonView';
import ChatTutor from './components/ChatTutor';
import Tools from './components/Tools';
import Settings from './components/Settings';
import { Home, MessageSquare, BookOpen, Settings as SettingsIcon } from 'lucide-react';
import { scheduleReview, streakAfterPractice } from './utils/progress';
import { GuitarSynth } from './utils/audio';
import { CHAT_STORAGE_KEY } from './components/ChatTutor';

const MIN_LESSONS_TO_LEVEL_UP = 2;

const App = () => {
  const [view, setView] = useState<AppView>(AppView.ONBOARDING);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);
  const [showLevelUpModal, setShowLevelUpModal] = useState<boolean>(false);

  // Filet de sécurité : aucun son (démo, riff, accord) ne survit à un changement de page
  useEffect(() => {
    GuitarSynth.stopAll();
  }, [view, activeLesson]);

  // Load user from local storage on mount
  useEffect(() => {
    try {
      const savedUser = localStorage.getItem('guitar_hero_user');
      if (savedUser) {
        const parsed = JSON.parse(savedUser);
        // Complète les champs manquants des profils enregistrés par d'anciennes versions
        setUser({
          xp: 0,
          streak: 0,
          completedLessons: [],
          generatedLessons: [],
          lessonMastery: {},
          lessonReviews: {},
          ...parsed,
        });
        setView(AppView.DASHBOARD);
      }
    } catch (e) {
      console.error('Profil local illisible, retour à l’onboarding', e);
    }
  }, []);

  const handleOnboardingComplete = (name: string, level: UserLevel) => {
    const newUser: UserProfile = {
      name,
      level,
      xp: 0,
      streak: 0,
      completedLessons: [],
      generatedLessons: [],
      lessonMastery: {},
      lessonReviews: {}
    };
    // Nouveau profil : on ne garde pas la conversation du profil précédent
    localStorage.removeItem(CHAT_STORAGE_KEY);
    setUser(newUser);
    localStorage.setItem('guitar_hero_user', JSON.stringify(newUser));
    setView(AppView.DASHBOARD);
  };

  const handleLessonSelect = (lesson: Lesson) => {
    setActiveLesson(lesson);
    setView(AppView.LESSON);
  };

  const handleLessonAdd = (newLesson: Lesson) => {
    if (!user) return;
    const updatedUser = {
        ...user,
        generatedLessons: [...(user.generatedLessons || []), newLesson]
    };
    setUser(updatedUser);
    localStorage.setItem('guitar_hero_user', JSON.stringify(updatedUser));
  };

  const handleLessonComplete = (lessonId: string, score: number = 100) => {
    if (!user) return;
    const now = Date.now();

    // Update mastery score logic (average or max)
    const currentMastery = user.lessonMastery?.[lessonId] || 0;
    const newMastery = Math.max(currentMastery, score);
    const masteryBonusXP = score > currentMastery ? (score - currentMastery) : 0;

    const firstCompletion = !user.completedLessons.includes(lessonId);
    const newCompletedLessons = firstCompletion ? [...user.completedLessons, lessonId] : user.completedLessons;

    let newLevel = user.level;
    let leveledUp = false;

    // Progression : toutes les leçons du niveau (parcours standard + leçons générées) sont validées
    const currentLevelLessons = [
        ...(INITIAL_LESSONS[user.level] || []),
        ...(user.generatedLessons || []).filter(l => l.level === user.level),
    ];
    const allCurrentCompleted = currentLevelLessons.length >= MIN_LESSONS_TO_LEVEL_UP &&
        currentLevelLessons.every(l => newCompletedLessons.includes(l.id));

    if (allCurrentCompleted) {
        if (user.level === UserLevel.BEGINNER) {
            newLevel = UserLevel.INTERMEDIATE;
            leveledUp = true;
        } else if (user.level === UserLevel.INTERMEDIATE) {
            newLevel = UserLevel.ADVANCED;
            leveledUp = true;
        }
    }

    const updatedUser: UserProfile = {
        ...user,
        // Les 50 XP de base ne sont gagnés qu'à la première validation (pas de farm en rejouant)
        xp: user.xp + (firstCompletion ? 50 : 0) + masteryBonusXP + (leveledUp ? 500 : 0),
        level: newLevel,
        completedLessons: newCompletedLessons,
        lessonMastery: {
            ...user.lessonMastery,
            [lessonId]: newMastery
        },
        lessonReviews: {
            ...user.lessonReviews,
            [lessonId]: scheduleReview(user.lessonReviews?.[lessonId], score, now)
        },
        streak: streakAfterPractice(user, now),
        lastPracticeDate: now
    };
    
    setUser(updatedUser);
    localStorage.setItem('guitar_hero_user', JSON.stringify(updatedUser));
    setActiveLesson(null);
    setView(AppView.DASHBOARD);

    if (leveledUp) {
        setShowLevelUpModal(true);
        setTimeout(() => setShowLevelUpModal(false), 4000); // Hide after 4s
    }
  };

  // Nav Component
  const BottomNav = () => (
    <div className="fixed bottom-0 left-0 w-full bg-slate-950/90 backdrop-blur-lg border-t border-slate-800 p-2 pb-6 px-6 flex justify-between items-center z-50">
        <button 
            onClick={() => setView(AppView.DASHBOARD)}
            className={`flex flex-col items-center p-2 rounded-xl transition-all ${view === AppView.DASHBOARD ? 'text-amber-500 scale-110' : 'text-slate-500 hover:text-slate-300'}`}
        >
            <Home size={24} strokeWidth={view === AppView.DASHBOARD ? 2.5 : 2} />
            <span className="text-[10px] mt-1 font-medium">Accueil</span>
        </button>
        
        <button 
            onClick={() => setView(AppView.TOOLS)}
            className={`flex flex-col items-center p-2 rounded-xl transition-all ${view === AppView.TOOLS ? 'text-amber-500 scale-110' : 'text-slate-500 hover:text-slate-300'}`}
        >
            <BookOpen size={24} strokeWidth={view === AppView.TOOLS ? 2.5 : 2} />
            <span className="text-[10px] mt-1 font-medium">Outils</span>
        </button>

        <button 
            onClick={() => setView(AppView.CHAT)}
            className={`flex flex-col items-center p-2 rounded-xl transition-all ${view === AppView.CHAT ? 'text-amber-500 scale-110' : 'text-slate-500 hover:text-slate-300'}`}
        >
            <div className="relative">
                <MessageSquare size={24} strokeWidth={view === AppView.CHAT ? 2.5 : 2} />
                {view !== AppView.CHAT && <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-slate-950"></span>}
            </div>
            <span className="text-[10px] mt-1 font-medium">Coach</span>
        </button>

        <button
            onClick={() => setView(AppView.SETTINGS)}
            className={`flex flex-col items-center p-2 rounded-xl transition-all ${view === AppView.SETTINGS ? 'text-amber-500 scale-110' : 'text-slate-500 hover:text-slate-300'}`}
        >
            <SettingsIcon size={24} strokeWidth={view === AppView.SETTINGS ? 2.5 : 2} />
            <span className="text-[10px] mt-1 font-medium">Réglages</span>
        </button>
    </div>
  );

  // Main Render
  if (!user || view === AppView.ONBOARDING) {
    return (
        <div className="h-full w-full bg-slate-950 text-slate-100">
            <Onboarding onComplete={handleOnboardingComplete} />
        </div>
    );
  }

  return (
    <div className="h-full w-full bg-slate-950 text-slate-100 flex flex-col relative">
      {/* Level Up Overlay */}
      {showLevelUpModal && (
          <div className="absolute inset-0 z-[100] flex items-center justify-center bg-slate-950/95 animate-fadeIn backdrop-blur-sm">
              <div className="text-center p-8 bg-slate-800 rounded-3xl border-2 border-amber-500 shadow-[0_0_50px_rgba(245,158,11,0.5)] transform animate-bounce-subtle max-w-sm w-full mx-4">
                  <div className="text-7xl mb-6 animate-pulse">🚀</div>
                  <h2 className="text-3xl font-black text-white mb-2 uppercase italic">Level Up !</h2>
                  <p className="text-amber-400 text-xl font-bold mb-6">Bienvenue au rang {user.level}</p>
                  <div className="bg-slate-900 p-4 rounded-xl border border-slate-700">
                      <p className="text-slate-400 text-xs uppercase font-bold tracking-widest mb-1">Récompense</p>
                      <p className="text-green-400 font-mono text-xl">+500 XP</p>
                  </div>
              </div>
          </div>
      )}

      <div className="flex-1 overflow-hidden relative">
        {view === AppView.DASHBOARD && (
            <Dashboard 
                user={user} 
                onSelectLesson={handleLessonSelect} 
                onAddLesson={handleLessonAdd}
            />
        )}
        
        {view === AppView.LESSON && activeLesson && (
            <LessonView 
                lesson={activeLesson} 
                onBack={() => setView(AppView.DASHBOARD)} 
                onComplete={handleLessonComplete}
            />
        )}

        {view === AppView.CHAT && (
            <div className="h-full pb-20"> {/* Padding bottom for nav */}
                <ChatTutor user={user} />
            </div>
        )}

        {view === AppView.TOOLS && (
             <div className="h-full pb-20">
                <Tools userLevel={user.level} />
            </div>
        )}

        {view === AppView.SETTINGS && (
            <div className="h-full pb-20">
                <Settings />
            </div>
        )}
      </div>

      {view !== AppView.LESSON && <BottomNav />}
    </div>
  );
};

export default App;
