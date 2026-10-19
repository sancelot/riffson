
import React, { useState, useEffect, useRef } from 'react';
import { GuitarSynth } from '../utils/audio';
import { Play, Music, Volume2, Info } from 'lucide-react';
import { MelodyNote } from '../types';

interface RiffPlayerProps {
    title: string;
    sequence: MelodyNote[];
    tempo?: number;
    description?: string;
}

const RiffPlayer: React.FC<RiffPlayerProps> = ({ title, sequence, tempo = 100, description }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [playheadX, setPlayheadX] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const frameRef = useRef<number | null>(null);

    // Arrête l'animation et le son si le message disparaît pendant la lecture
    useEffect(() => () => {
        if (frameRef.current) cancelAnimationFrame(frameRef.current);
        GuitarSynth.stopAll();
    }, []);

    // Tablature : corde 1 (Mi aigu) en haut ... corde 6 (Mi grave) en bas
    const stringNames = ['1 Mi', '2 Si', '3 Sol', '4 Ré', '5 La', '6 Mi'];
    const hasLyrics = sequence.some(n => n.lyric);
    const beatWidth = 80; // Largeur d'un temps (noire)
    const totalDurationRatio = sequence.reduce((acc, note) => acc + (note.duration || 1.0), 0);
    const totalWidth = totalDurationRatio * beatWidth;

    const handlePlay = () => {
        if (isPlaying) return;
        setIsPlaying(true);
        setPlayheadX(0);
        
        const totalDurationMs = GuitarSynth.playMelody(sequence, tempo) * 1000;
        const startTime = Date.now();

        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = elapsed / totalDurationMs;
            
            if (progress < 1) {
                setPlayheadX(progress * totalWidth);
                frameRef.current = requestAnimationFrame(animate);
            } else {
                setPlayheadX(0);
                setIsPlaying(false);
            }
        };
        frameRef.current = requestAnimationFrame(animate);
    };

    return (
        <div className="my-6 bg-slate-950 border border-slate-800 rounded-3xl p-6 shadow-2xl relative overflow-hidden group">
            <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3">
                    <div className="bg-amber-500/20 p-2.5 rounded-2xl text-amber-500">
                        <Music size={22} />
                    </div>
                    <div>
                        <h4 className="text-white font-black uppercase tracking-tighter text-lg">{title || "Riff Pro"}</h4>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{tempo} BPM • {sequence.length} NOTES</p>
                        {description && <p className="text-sm text-slate-300 mt-1">{description}</p>}
                    </div>
                </div>
                <button 
                    onClick={handlePlay}
                    className={`p-4 rounded-2xl transition-all active:scale-95 ${isPlaying ? 'bg-amber-500 text-slate-900 shadow-[0_0_30px_#f59e0b]' : 'bg-slate-800 text-amber-500 hover:bg-slate-700'}`}
                >
                    {isPlaying ? <Volume2 size={24} className="animate-pulse" /> : <Play size={24} fill="currentColor" />}
                </button>
            </div>

            {/* Tablature à 6 lignes */}
            <div 
                ref={containerRef}
                className="relative bg-slate-900/50 rounded-2xl p-4 border border-slate-800/50 overflow-x-auto no-scrollbar"
            >
                <div 
                    className="relative" 
                    style={{ width: `${totalWidth + 100}px`, height: hasLyrics ? '175px' : '140px' }}
                >
                    {/* Les 6 lignes de la guitare */}
                    {stringNames.map((name, i) => (
                        <div key={i} className="absolute w-full flex items-center" style={{ top: `${i * 24 + 10}px` }}>
                            <span className="w-10 text-[10px] font-mono font-bold text-slate-500 shrink-0">{name}</span>
                            <div className="flex-1 h-[1px] bg-slate-800"></div>
                        </div>
                    ))}

                    {/* Les Notes */}
                    {(() => {
                        let currentX = 56;
                        return sequence.map((note, idx) => {
                            const x = currentX;
                            const y = (note.string - 1) * 24 + 10;
                            const duration = note.duration || 1.0;
                            currentX += duration * beatWidth;
                            
                            if (note.fret === -1) return null; // Silence

                            return (
                                <div 
                                    key={idx} 
                                    className="absolute transform -translate-x-1/2 -translate-y-1/2 flex items-center justify-center transition-all duration-300"
                                    style={{ 
                                        left: `${x}px`, 
                                        top: `${y}px`,
                                        width: '24px', 
                                        height: '24px'
                                    }}
                                >
                                    {note.lyric && (
                                        <span className={`absolute text-xs whitespace-nowrap ${isPlaying && playheadX + 56 >= x && playheadX + 56 < x + duration * beatWidth ? 'text-amber-400 font-bold' : 'text-slate-400'}`} style={{ top: `${160 - y}px` }}>{note.lyric}</span>
                                    )}
                                    <div className={`w-6 h-6 rounded-md flex items-center justify-center border font-black text-xs ${isPlaying && playheadX + 56 >= x && playheadX + 56 < x + duration * beatWidth ? 'bg-amber-500 border-white text-slate-900 scale-125 z-20 shadow-[0_0_15px_#f59e0b]' : 'bg-slate-950 border-slate-700 text-slate-300'}`}>
                                        {note.fret}
                                    </div>
                                </div>
                            );
                        });
                    })()}

                    {/* Playhead (La barre rouge de défilement) */}
                    {isPlaying && (
                        <div 
                            className="absolute top-0 bottom-0 w-[2px] bg-red-500 z-10 shadow-[0_0_10px_#ef4444]"
                            style={{ left: `${playheadX + 56}px` }}
                        >
                            <div className="w-2 h-2 bg-red-500 rounded-full -ml-[3px] -mt-1"></div>
                        </div>
                    )}
                </div>
            </div>
            
            <div className="mt-4 flex items-center gap-2 bg-blue-500/10 p-3 rounded-xl border border-blue-500/20">
                <Info size={14} className="text-blue-400 shrink-0" />
                <p className="text-[10px] text-blue-300 leading-tight uppercase font-bold tracking-tight">
                    Suivez la barre rouge. Chaque ligne est une corde (1 = Mi aigu en haut, 6 = Mi grave en bas) ; le chiffre est la case à presser, 0 = corde à vide.
                </p>
            </div>
        </div>
    );
};

export default RiffPlayer;
