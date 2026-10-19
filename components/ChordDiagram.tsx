import React, { useState } from 'react';
import { CHORD_DEFINITIONS } from '../constants';
import { GuitarSynth } from '../utils/audio';
import { Play, Volume2 } from 'lucide-react';

const ChordDiagram: React.FC<{ chordName: string }> = ({ chordName }) => {
    const name = chordName.replace(/[\[\]]/g, '');
    const frets = CHORD_DEFINITIONS[name];
    const [isPlaying, setIsPlaying] = useState(false);
    
    // Accord absent du dictionnaire : on affiche au moins son nom au lieu de le faire disparaître
    if (!frets) {
        return <span className="inline-block my-2 px-3 py-1 rounded-lg bg-slate-800 border border-slate-700 font-black text-amber-500">{name}</span>;
    }

    const handlePlay = () => {
        setIsPlaying(true);
        GuitarSynth.playChord(frets);
        // Visual feedback duration
        setTimeout(() => setIsPlaying(false), 800);
    };

    const uniqueFrets = [...new Set(frets.filter(f => f > 0))].sort((a, b) => a - b);
    const minFret = uniqueFrets.length > 0 ? uniqueFrets[0] : 0;
    const stringsWithMinFret = frets.map((f, i) => f === minFret ? i : -1).filter(i => i !== -1);

    // Barré seulement si l'index couvre de la corde jouée la plus grave jusqu'au Mi aigu
    // et qu'aucune corde n'est à vide (sinon Em, A ou D afficheraient un faux barré)
    const lowestPlayed = frets.findIndex(f => f !== -1);
    const isBarre = minFret > 0
        && stringsWithMinFret.length >= 2
        && frets[lowestPlayed] === minFret
        && frets[frets.length - 1] === minFret
        && !frets.includes(0);

    let barreElement = null;
    if (isBarre) {
        const minStringIndex = Math.min(...stringsWithMinFret);
        const maxStringIndex = Math.max(...stringsWithMinFret);
        const startVisualX = 10 + minStringIndex * 20;
        const endVisualX = 10 + maxStringIndex * 20;
        const fretY = 20 + (minFret * 20) - 10;
        barreElement = (
            <line x1={startVisualX} y1={fretY} x2={endVisualX} y2={fretY} stroke="#f59e0b" strokeWidth="16" strokeLinecap="round" opacity="0.6"/>
        );
    }

    return (
        <div className="flex flex-col items-center my-6 bg-slate-900/90 p-5 rounded-3xl border border-slate-700 w-52 mx-auto relative group transition-all hover:shadow-[0_0_30px_rgba(245,158,11,0.15)] hover:border-amber-500/30">
            {/* Action Button: Hear the chord */}
            <button 
                onClick={handlePlay}
                className={`absolute top-4 right-4 p-2.5 rounded-full transition-all active:scale-90 z-10 ${isPlaying ? 'bg-amber-500 text-slate-900 shadow-[0_0_20px_#f59e0b]' : 'bg-slate-800 text-slate-400 hover:text-amber-400'}`}
                aria-label="Écouter l'accord"
            >
                {isPlaying ? <Volume2 size={18} /> : <Play size={18} fill="currentColor" />}
            </button>

            <h4 className="text-3xl font-black text-amber-500 mb-4 tracking-tighter">{name}</h4>
            
            <svg width="120" height="140" viewBox="0 0 120 140" className="overflow-visible">
                {/* Nut */}
                <line x1="10" y1="20" x2="110" y2="20" stroke="white" strokeWidth="4" />
                
                {/* Strings */}
                {[0, 1, 2, 3, 4, 5].map(i => (
                    <line key={`s-${i}`} x1={10 + i * 20} y1="20" x2={10 + i * 20} y2="120" stroke="#475569" strokeWidth="1" />
                ))}
                
                {/* Frets */}
                {[1, 2, 3, 4, 5].map(i => (
                    <line key={`f-${i}`} x1="10" y1={20 + i * 20} x2="110" y2={20 + i * 20} stroke="#334155" strokeWidth="1" />
                ))}
                
                {barreElement}
                
                {/* Finger positions */}
                {frets.map((fret, stringIndex) => {
                    const x = 10 + stringIndex * 20;
                    if (fret === -1) return <text key={`mute-${stringIndex}`} x={x} y="12" textAnchor="middle" fill="#ef4444" fontSize="12" fontWeight="black" fontFamily="monospace">X</text>;
                    if (fret === 0) return <circle key={`open-${stringIndex}`} cx={x} cy="10" r="4" stroke="#22c55e" strokeWidth="2" fill="none" />;
                    
                    const y = 20 + (fret * 20) - 10;
                    const isBeingPlayed = isPlaying && fret !== -1;
                    return (
                        <g key={`dot-${stringIndex}`}>
                            <circle cx={x} cy={y} r={8} fill={isBeingPlayed ? "#ffffff" : "#f59e0b"} className="transition-colors duration-200" />
                            {isBeingPlayed && <circle cx={x} cy={y} r={14} fill="none" stroke="#ffffff" strokeWidth="1" className="animate-ping" />}
                        </g>
                    );
                })}
            </svg>
            
            <p className="mt-4 text-[10px] text-slate-500 font-bold uppercase tracking-widest bg-slate-800 px-3 py-1 rounded-full">Appuyez pour jouer</p>
        </div>
    );
};

export default ChordDiagram;