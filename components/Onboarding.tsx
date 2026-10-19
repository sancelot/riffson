import React from 'react';
import { UserLevel } from '../types';
import { Guitar, Music, Zap, Star } from 'lucide-react';

interface OnboardingProps {
  onComplete: (name: string, level: UserLevel) => void;
}

const Onboarding: React.FC<OnboardingProps> = ({ onComplete }) => {
  const [step, setStep] = React.useState(1);
  const [name, setName] = React.useState('');
  const [selectedLevel, setSelectedLevel] = React.useState<UserLevel>(UserLevel.BEGINNER);

  const handleLevelSelect = (level: UserLevel) => {
    setSelectedLevel(level);
    onComplete(name || 'Guitariste', level);
  };

  if (step === 1) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center animate-fadeIn">
        <div className="bg-amber-500 p-4 rounded-full mb-6 shadow-lg shadow-amber-500/20">
          <Guitar size={48} className="text-slate-900" />
        </div>
        <h1 className="text-3xl font-bold mb-2 text-white">Bienvenue sur GuitarHero AI</h1>
        <p className="text-slate-400 mb-8">Votre coach personnel de guitare, propulsé par l'intelligence artificielle.</p>
        
        <div className="w-full max-w-md">
          <label className="block text-left text-sm font-medium text-slate-300 mb-2">Comment vous appelez-vous ?</label>
          <input
            type="text"
            className="w-full bg-slate-800 border border-slate-700 rounded-lg p-4 text-white placeholder-slate-500 focus:ring-2 focus:ring-amber-500 focus:outline-none transition-all"
            placeholder="Votre prénom..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && name.trim() && setStep(2)}
          />
          <button
            onClick={() => name.trim() && setStep(2)}
            disabled={!name.trim()}
            className="w-full mt-4 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-slate-900 font-bold py-4 rounded-lg transition-colors"
          >
            Commencer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full p-6 animate-fadeIn">
      <h2 className="text-2xl font-bold mb-6 text-center">Quel est votre niveau actuel ?</h2>
      
      <div className="flex-1 space-y-4 flex flex-col justify-center max-w-md mx-auto w-full">
        <button
          onClick={() => handleLevelSelect(UserLevel.BEGINNER)}
          className="group relative bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-amber-500/50 p-6 rounded-xl text-left transition-all"
        >
          <div className="flex items-start">
            <div className="bg-green-500/20 p-3 rounded-lg mr-4 text-green-400">
              <Music size={24} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white group-hover:text-amber-400">Débutant</h3>
              <p className="text-sm text-slate-400 mt-1">Je n'ai jamais touché une guitare ou je connais à peine quelques accords.</p>
            </div>
          </div>
        </button>

        <button
          onClick={() => handleLevelSelect(UserLevel.INTERMEDIATE)}
          className="group relative bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-amber-500/50 p-6 rounded-xl text-left transition-all"
        >
          <div className="flex items-start">
            <div className="bg-blue-500/20 p-3 rounded-lg mr-4 text-blue-400">
              <Zap size={24} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white group-hover:text-amber-400">Intermédiaire</h3>
              <p className="text-sm text-slate-400 mt-1">Je connais mes accords de base, les barrés et je commence à improviser.</p>
            </div>
          </div>
        </button>

        <button
          onClick={() => handleLevelSelect(UserLevel.ADVANCED)}
          className="group relative bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-amber-500/50 p-6 rounded-xl text-left transition-all"
        >
          <div className="flex items-start">
            <div className="bg-purple-500/20 p-3 rounded-lg mr-4 text-purple-400">
              <Star size={24} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white group-hover:text-amber-400">Avancé</h3>
              <p className="text-sm text-slate-400 mt-1">Je maîtrise la théorie, les modes et je cherche à perfectionner ma technique.</p>
            </div>
          </div>
        </button>
      </div>
    </div>
  );
};

export default Onboarding;