
import React, { useState, useEffect } from 'react';
import { UserLevel, UserProfile, Lesson } from '../types';
import { INITIAL_LESSONS } from '../constants';
import { aiErrorText, generatePracticeRoutine, generateNextLesson } from '../services/ai';
import { PlayCircle, CheckCircle, Clock, Trophy, Sparkles, Loader2, Lock, Flame, Brain, Star, Plus, Zap } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { currentStreak, dueReviews } from '../utils/progress';

interface DashboardProps {
  user: UserProfile;
  onSelectLesson: (lesson: Lesson) => void;
  onAddLesson: (lesson: Lesson) => void;
}

const LEVEL_ORDER = [UserLevel.BEGINNER, UserLevel.INTERMEDIATE, UserLevel.ADVANCED];

const Dashboard: React.FC<DashboardProps> = ({ user, onSelectLesson, onAddLesson }) => {
  const [viewLevel, setViewLevel] = useState<UserLevel>(user.level);
  const [dailyRoutine, setDailyRoutine] = useState<string | null>(null);
  const [loadingRoutine, setLoadingRoutine] = useState(false);
  const [isGeneratingLesson, setIsGeneratingLesson] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  
  useEffect(() => {
    setViewLevel(user.level);
  }, [user.level]);

  const currentLevelIndex = LEVEL_ORDER.indexOf(user.level);
  
  // Combine Standard Lessons + AI Generated Lessons
  const standardLessons = INITIAL_LESSONS[viewLevel] || [];
  const generatedLessons = (user.generatedLessons || []).filter(l => l.level === viewLevel);
  const allLessons = [...standardLessons, ...generatedLessons];

  const completedCount = allLessons.filter(l => user.completedLessons.includes(l.id)).length;
  const totalLessons = allLessons.length;
  const progress = totalLessons > 0 ? (completedCount / totalLessons) * 100 : 0;

  const handleGenerateRoutine = async () => {
      setLoadingRoutine(true);
      setAiError(null);
      try {
          setDailyRoutine(await generatePracticeRoutine(user.level));
      } catch (e) {
          console.error(e);
          setAiError(`Impossible de générer la routine : ${aiErrorText(e)}`);
      } finally {
          setLoadingRoutine(false);
      }
  };

  const handleGenerateNextLesson = async () => {
    setIsGeneratingLesson(true);
    setAiError(null);
    try {
        const titles = allLessons.map(l => l.title);
        const newLesson = await generateNextLesson(viewLevel, titles);
        if (newLesson) onAddLesson(newLesson);
        else setAiError("La leçon générée était invalide. Réessayez.");
    } catch (e) {
        console.error(e);
        setAiError(`Impossible de générer la leçon : ${aiErrorText(e)}`);
    } finally {
        setIsGeneratingLesson(false);
    }
  };

  // On peut générer une leçon si le parcours est vide (niveaux sans leçons de base) ou si la dernière est validée
  const lastLessonDone = allLessons.length === 0 || user.completedLessons.includes(allLessons[allLessons.length - 1].id);

  // Révisions espacées : toutes les leçons validées, quel que soit le niveau affiché
  const reviewQueue = dueReviews(user, [...Object.values(INITIAL_LESSONS).flat(), ...(user.generatedLessons || [])]);
  const streak = currentStreak(user);

  return (
    <div className="h-full overflow-y-auto pb-24 bg-slate-900">
      {/* Hero Stats Section */}
      <div className="relative bg-gradient-to-b from-slate-950 to-slate-900 border-b border-slate-800 p-6 pt-10">
        <div className="flex justify-between items-start mb-8">
          <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center text-slate-900 font-bold text-2xl shadow-lg shadow-amber-500/20 transform hover:scale-105 transition-transform">
                  {user.name.charAt(0).toUpperCase()}
              </div>
              <div>
                  <h1 className="text-2xl font-bold text-white tracking-tight">{user.name}</h1>
                  <p className="text-sm text-slate-400 font-medium flex items-center gap-1">
                      {user.level} 
                      <span className="w-1 h-1 bg-slate-500 rounded-full mx-1"></span>
                      <Trophy size={12} className="text-amber-500" /> {user.xp} XP
                  </p>
              </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-1 bg-slate-800/80 backdrop-blur px-3 py-1.5 rounded-full border border-slate-700 shadow-sm">
                <Flame size={16} className="text-orange-500 fill-orange-500 animate-pulse" />
                <span className="text-sm font-bold text-white">{streak} {streak > 1 ? 'jours' : 'jour'}</span>
            </div>
          </div>
        </div>

        {/* Smart Review Banner (SRS) */}
        {reviewQueue.length > 0 && (
            <div className="mb-6 bg-indigo-900/30 border border-indigo-500/30 rounded-xl p-4 flex items-center justify-between animate-fadeIn">
                <div className="flex items-center gap-3">
                    <div className="bg-indigo-500/20 p-2 rounded-lg text-indigo-400">
                        <Brain size={20} />
                    </div>
                    <div>
                        <h4 className="text-white font-bold text-sm">Entraînement Mémoire</h4>
                        <p className="text-indigo-200 text-xs">
                            {reviewQueue.length > 1 ? `${reviewQueue.length} leçons à réviser` : '1 leçon à réviser'} pour ancrer vos acquis : {reviewQueue[0].title}
                        </p>
                    </div>
                </div>
                <button onClick={() => onSelectLesson(reviewQueue[0])} className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors">
                    Réviser
                </button>
            </div>
        )}

        {/* Progress Card */}
        <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700 relative overflow-hidden shadow-xl">
             <div className="flex justify-between items-center mb-3 z-10 relative">
                <span className="text-slate-300 text-sm font-bold uppercase tracking-wide">Progression {viewLevel}</span>
                <span className="text-amber-400 font-black text-xl">{Math.round(progress)}%</span>
             </div>
             <div className="w-full bg-slate-950/50 rounded-full h-4 mb-4 z-10 relative overflow-hidden">
                <div 
                    className="bg-gradient-to-r from-amber-500 to-orange-500 h-full rounded-full transition-all duration-1000 ease-out shadow-[0_0_15px_rgba(245,158,11,0.5)]" 
                    style={{ width: `${progress}%` }}
                >
                    <div className="w-full h-full bg-[url('https://www.transparenttextures.com/patterns/diagmonds-light.png')] opacity-30"></div>
                </div>
             </div>
             <div className="flex justify-between items-center z-10 relative text-xs font-medium text-slate-500">
                 <span>{completedCount} / {totalLessons} leçons validées</span>
             </div>

             {/* Background Decoration */}
             <Trophy size={160} className="absolute -right-6 -bottom-8 text-white/[0.03] rotate-12 pointer-events-none" />
        </div>
      </div>

      <div className="p-6 space-y-8">
        {/* Level Selector */}
        <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
             {LEVEL_ORDER.map((lvl, idx) => {
                 const isLocked = idx > currentLevelIndex;
                 const isActive = lvl === viewLevel;
                 return (
                     <button 
                        key={lvl}
                        disabled={isLocked}
                        onClick={() => setViewLevel(lvl)}
                        className={`
                            whitespace-nowrap px-5 py-2.5 rounded-full text-sm font-bold transition-all border shadow-sm
                            ${isActive 
                                ? 'bg-amber-500 text-slate-900 border-amber-500 shadow-amber-500/20 scale-105' 
                                : isLocked 
                                    ? 'bg-slate-900 text-slate-600 border-slate-800 cursor-not-allowed' 
                                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-500 hover:bg-slate-750'}
                        `}
                     >
                         {isLocked && <Lock size={12} className="inline mr-2 opacity-50" />}
                         {lvl}
                     </button>
                 );
             })}
        </div>

        {/* Lessons List Map */}
        <div>
            <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                <div className="w-1.5 h-6 bg-amber-500 rounded-full shadow-[0_0_10px_#f59e0b]"></div>
                Parcours d'apprentissage
            </h2>
            
            <div className="space-y-6 relative pl-4">
                {/* Connecting Line (Map style) */}
                <div className="absolute left-[34px] top-6 bottom-12 w-1 bg-slate-800 rounded-full z-0"></div>

                {allLessons.map((lesson, index) => {
                    const isCompleted = user.completedLessons.includes(lesson.id);
                    const mastery = user.lessonMastery?.[lesson.id] || 0;
                    const isLocked = index > 0 && !user.completedLessons.includes(allLessons[index - 1].id) && !isCompleted;

                    return (
                    <div key={lesson.id} className="relative z-10 group animate-slideUp" style={{ animationDelay: `${index * 50}ms` }}>
                        <button
                            onClick={() => !isLocked && onSelectLesson(lesson)}
                            disabled={isLocked}
                            className={`
                                w-full flex items-center text-left transition-all duration-300
                                ${isLocked ? 'opacity-60 grayscale' : 'opacity-100 hover:translate-x-2'}
                            `}
                        >
                            {/* Icon Node */}
                            <div className={`
                                w-14 h-14 rounded-full flex items-center justify-center mr-5 flex-shrink-0 border-4 shadow-xl transition-all relative
                                ${isCompleted 
                                    ? 'bg-slate-900 border-green-500 text-green-500' 
                                    : isLocked 
                                        ? 'bg-slate-800 border-slate-700 text-slate-600' 
                                        : 'bg-gradient-to-br from-amber-400 to-orange-500 border-slate-900 text-slate-900 scale-110 shadow-amber-500/30'}
                            `}>
                                {lesson.isGenerated && (
                                    <div className="absolute -top-1 -right-1 bg-purple-500 text-white p-0.5 rounded-full z-20 border-2 border-slate-900">
                                        <Sparkles size={10} fill="currentColor" />
                                    </div>
                                )}
                                
                                {isCompleted ? (
                                    mastery >= 100 ? <Star size={24} fill="currentColor" /> : <CheckCircle size={24} strokeWidth={3} />
                                ) : isLocked ? (
                                    <Lock size={20} /> 
                                ) : (
                                    <PlayCircle size={28} strokeWidth={2.5} className="animate-pulse" />
                                )}
                            </div>
                            
                            {/* Card Content */}
                            <div className={`
                                flex-1 bg-slate-800 p-5 rounded-2xl border transition-all relative overflow-hidden
                                ${isCompleted 
                                    ? 'border-green-500/30 bg-green-500/5' 
                                    : isLocked 
                                        ? 'border-slate-800' 
                                        : lesson.isGenerated 
                                            ? 'border-purple-500/40 hover:border-purple-500 hover:shadow-lg hover:shadow-purple-500/10'
                                            : 'border-slate-700 hover:border-amber-500/50 hover:shadow-lg hover:shadow-amber-500/5'}
                            `}>
                                <div className="flex justify-between items-start mb-1">
                                    <h3 className={`font-bold text-lg ${isCompleted ? 'text-green-400' : 'text-white'}`}>
                                        {lesson.title}
                                    </h3>
                                    {lesson.exercises && lesson.exercises.length > 0 && (
                                        <div className="bg-purple-500/20 text-purple-300 p-1.5 rounded-lg">
                                            <Zap size={14} fill="currentColor" />
                                        </div>
                                    )}
                                </div>
                                
                                <p className="text-xs text-slate-400 mb-3 line-clamp-2 leading-relaxed">{lesson.description}</p>
                                
                                <div className="flex items-center text-xs font-medium text-slate-500">
                                    <Clock size={12} className="mr-1" />
                                    {lesson.duration}
                                </div>

                                {isCompleted && (
                                    <div className="absolute bottom-0 left-0 h-1 bg-green-500/30 w-full">
                                        <div className="h-full bg-green-500" style={{ width: `${mastery}%` }}></div>
                                    </div>
                                )}
                            </div>
                        </button>
                    </div>
                    );
                })}

                {/* Infinite Generation Button */}
                <div className="relative z-10 pt-4">
                    <button
                        onClick={handleGenerateNextLesson}
                        disabled={isGeneratingLesson || !lastLessonDone}
                        className={`
                            w-full group relative overflow-hidden rounded-2xl p-1
                            ${isGeneratingLesson 
                                ? 'cursor-wait opacity-80' 
                                : !lastLessonDone
                                    ? 'opacity-50 cursor-not-allowed grayscale'
                                    : 'hover:scale-[1.02] transition-transform cursor-pointer'
                            }
                        `}
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-purple-600 to-blue-600 animate-gradient-xy"></div>
                        <div className="relative bg-slate-900 rounded-xl p-6 flex flex-col items-center justify-center border border-slate-700/50">
                            {isGeneratingLesson ? (
                                <div className="flex flex-col items-center">
                                    <Loader2 size={32} className="animate-spin text-purple-400 mb-2" />
                                    <p className="text-purple-300 font-bold animate-pulse">L'IA prépare votre prochain défi...</p>
                                </div>
                            ) : (
                                <>
                                    <div className="bg-purple-500/20 p-3 rounded-full mb-3 group-hover:bg-purple-500/30 transition-colors">
                                        <Plus size={32} className="text-purple-400" />
                                    </div>
                                    <h3 className="text-xl font-bold text-white mb-1">Continuer l'aventure</h3>
                                    <p className="text-slate-400 text-sm text-center">Générer une nouvelle leçon sur mesure pour évoluer</p>
                                    {!lastLessonDone && (
                                        <p className="text-red-400 text-xs mt-2 font-bold bg-red-900/20 px-2 py-1 rounded">Terminez la dernière leçon d'abord !</p>
                                    )}
                                </>
                            )}
                        </div>
                    </button>
                    {aiError && <p className="text-red-400 text-sm mt-3 text-center">{aiError}</p>}
                </div>
            </div>
        </div>

        {/* AI Daily Routine */}
        <div className="bg-gradient-to-r from-slate-800 to-indigo-900/30 rounded-2xl p-6 border border-indigo-500/20 mt-8 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                <Sparkles size={100} className="text-indigo-400" />
            </div>
            
            <div className="flex justify-between items-center mb-4 relative z-10">
                <h3 className="font-bold text-white flex items-center gap-2 text-lg">
                    <Sparkles size={20} className="text-indigo-400" />
                    Défi Quotidien IA
                </h3>
                {!dailyRoutine && !loadingRoutine && (
                    <button onClick={handleGenerateRoutine} className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-full font-bold transition-colors shadow-lg shadow-indigo-900/50">
                        Générer ma routine
                    </button>
                )}
            </div>
            
            {loadingRoutine ? (
                <div className="flex justify-center py-6"><Loader2 className="animate-spin text-indigo-400 w-8 h-8" /></div>
            ) : dailyRoutine ? (
                <div className="prose prose-invert prose-sm max-h-60 overflow-y-auto bg-slate-900/50 p-4 rounded-xl border border-indigo-500/30">
                    <ReactMarkdown>{dailyRoutine}</ReactMarkdown>
                </div>
            ) : (
                <p className="text-sm text-slate-400 relative z-10">Générez une routine sur mesure pour booster votre XP et consolider vos points faibles.</p>
            )}
        </div>

      </div>
    </div>
  );
};

export default Dashboard;
