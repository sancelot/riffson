
import React, { useState, useEffect, useRef } from 'react';
import { GuitarSynth } from '../utils/audio';
import { Play, Music, Volume2, Info } from 'lucide-react';
import { MelodyNote } from '../types';
import { isDoubtful } from '../utils/tabImage';

interface RiffPlayerProps {
    title: string;
    sequence: MelodyNote[];
    tempo?: number;
    description?: string;
}

const NOTES_OFFSET = 56; // largeur des noms de cordes, avant la première note
const TAB_PADDING = 16;  // marge intérieure (p-4) du conteneur qui défile

const RiffPlayer: React.FC<RiffPlayerProps> =({ title, sequence, tempo = 100, description }) => {
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
    const totalDurationRatio = sequence.reduce((acc, note) => acc + (note.duration ?? 1.0), 0);
    const totalWidth = totalDurationRatio * beatWidth;

    // Fait défiler la tablature pour garder le curseur dans la zone visible
    const followPlayhead = (x: number) => {
        const container = containerRef.current;
        if (!container) return;
        const position = TAB_PADDING + NOTES_OFFSET + x;
        if (position > container.scrollLeft + container.clientWidth * 0.65) {
            container.scrollLeft = position - container.clientWidth * 0.35;
        }
    };

    const handlePlay = () => {
        if (isPlaying) return;
        setIsPlaying(true);
        setPlayheadX(0);
        if (containerRef.current) containerRef.current.scrollLeft = 0;

        // Le curseur suit l'horloge audio, pas l'horloge de la page : au premier clic, le son
        // démarre avec un léger retard (création du contexte audio) et le curseur l'attend.
        const { startTime, duration } = GuitarSynth.playMelody(sequence, tempo);

        const animate = () => {
            const progress = Math.max(0, (GuitarSynth.currentTime - startTime) / duration);
            if (progress < 1) {
                const x = progress * totalWidth;
                setPlayheadX(x);
                followPlayhead(x);
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
                className="relative bg-slate-900/50 rounded-2xl p-4 border border-slate-800/50 overflow-x-auto"
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
                        let currentX = NOTES_OFFSET;
                        return sequence.map((note, idx) => {
                            const x = currentX;
                            const y = (note.string - 1) * 24 + 10;
                            const step = note.duration ?? 1.0;
                            currentX += step * beatWidth;
                            // Une note de durée 0 sonne avec la suivante (notes empilées) : elle reste
                            // en surbrillance aussi longtemps que l'ensemble
                            let j = idx;
                            while (j < sequence.length - 1 && (sequence[j].duration ?? 1.0) === 0) j++;
                            const duration = sequence[j].duration ?? 1.0;
                            
                            // Silence ; mais une note étouffée lue sur une tablature (X) reste affichée
                            if (note.fret === -1 && !note.scan) return null;
                            const doubtful = isDoubtful(note);

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
                                        <span className={`absolute text-xs whitespace-nowrap ${isPlaying && playheadX + NOTES_OFFSET >= x && playheadX + NOTES_OFFSET < x + duration * beatWidth ? 'text-amber-400 font-bold' : 'text-slate-400'}`} style={{ top: `${160 - y}px` }}>{note.lyric}</span>
                                    )}
                                    <div
                                        title={doubtful ? `Lecture incertaine${note.scan!.alternative !== undefined ? ` : ${note.fret === -1 ? 'X' : note.fret} ou ${note.scan!.alternative === -1 ? 'X' : note.scan!.alternative} ?` : ''}` : undefined}
                                        className={`w-6 h-6 rounded-md flex items-center justify-center border font-black text-xs ${isPlaying && playheadX + NOTES_OFFSET >= x && playheadX + NOTES_OFFSET < x + duration * beatWidth ? 'bg-amber-500 border-white text-slate-900 scale-125 z-20 shadow-[0_0_15px_#f59e0b]' : doubtful ? 'bg-slate-950 border-dashed border-amber-500 text-amber-300' : 'bg-slate-950 border-slate-700 text-slate-300'}`}>
                                        {note.fret === -1 ? 'x' : note.fret}
                                        {doubtful && <span className="absolute -top-2 -right-1 text-[10px] text-amber-400 font-black">?</span>}
                                    </div>
                                </div>
                            );
                        });
                    })()}

                    {/* Playhead (La barre rouge de défilement) */}
                    {isPlaying && (
                        <div 
                            className="absolute top-0 bottom-0 w-[2px] bg-red-500 z-10 shadow-[0_0_10px_#ef4444]"
                            style={{ left: `${playheadX + NOTES_OFFSET}px` }}
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
