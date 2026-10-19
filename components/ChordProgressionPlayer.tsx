import React, { useEffect, useRef, useState } from 'react';
import { Info, Music, Play, Square } from 'lucide-react';
import { CHORD_DEFINITIONS, CHORD_NAMES_FR } from '../constants';
import { GuitarSynth } from '../utils/audio';
import { ChordShape } from './ChordDiagram';

export interface ProgressionChord {
    name: string;
    beats: number; // durée de l'accord en temps (un coup de grattage par temps)
}

interface ChordProgressionPlayerProps {
    title: string;
    tempo?: number;
    chords: ProgressionChord[];
}

const SILENT_CHORD = [-1, -1, -1, -1, -1, -1];

/**
 * Suite d'accords : un diagramme par accord, et une démo qui gratte chaque accord à chaque temps
 * (toutes les cordes ensemble), avec l'accord et le temps en cours mis en évidence.
 */
const ChordProgressionPlayer: React.FC<ChordProgressionPlayerProps> = ({ title, tempo = 80, chords }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [current, setCurrent] = useState<{ chord: number, beat: number } | null>(null);
    const frameRef = useRef<number | null>(null);

    const stop = () => {
        if (frameRef.current) cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
        GuitarSynth.stopAll();
        setIsPlaying(false);
        setCurrent(null);
    };

    useEffect(() => () => {
        if (frameRef.current) cancelAnimationFrame(frameRef.current);
        GuitarSynth.stopAll();
    }, []);

    const handlePlay = () => {
        if (isPlaying) return stop();
        setIsPlaying(true);
        const beatDuration = 60 / tempo;
        // Les accords inconnus restent silencieux mais gardent leur place dans le rythme
        const { chordTimes, startTime, duration } = GuitarSynth.playProgression(
            chords.map(c => ({ frets: CHORD_DEFINITIONS[c.name] || SILENT_CHORD, beats: c.beats })),
            tempo,
        );
        // L'affichage suit l'horloge audio : toujours en phase avec ce qu'on entend.
        // On ne redessine qu'au changement d'accord ou de temps (pas à chaque image).
        let shown = '';
        const follow = () => {
            const now = GuitarSynth.currentTime;
            if (now >= startTime + duration) return stop();
            let chord = -1;
            while (chord + 1 < chordTimes.length && chordTimes[chord + 1] <= now) chord++;
            const beat = chord >= 0 ? Math.floor((now - chordTimes[chord]) / beatDuration) : -1;
            if (`${chord}:${beat}` !== shown) {
                shown = `${chord}:${beat}`;
                setCurrent(chord >= 0 ? { chord, beat } : null);
            }
            frameRef.current = requestAnimationFrame(follow);
        };
        frameRef.current = requestAnimationFrame(follow);
    };

    const totalBeats = chords.reduce((sum, c) => sum + c.beats, 0);

    return (
        <div className="not-prose my-6 bg-slate-950 border border-slate-800 rounded-3xl p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-4 gap-3">
                <div className="flex items-center gap-3">
                    <div className="bg-amber-500/20 p-2.5 rounded-2xl text-amber-500"><Music size={22} /></div>
                    <div>
                        <h4 className="text-white font-black text-lg">{title || "Suite d'accords"}</h4>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                            {tempo} BPM • {chords.length} accords • {totalBeats} temps
                        </p>
                    </div>
                </div>
                <button
                    onClick={handlePlay}
                    aria-label={isPlaying ? 'Arrêter' : 'Écouter la suite d’accords'}
                    className={`p-4 rounded-2xl transition-all active:scale-95 ${isPlaying ? 'bg-amber-500 text-slate-900' : 'bg-slate-800 text-amber-500 hover:bg-slate-700'}`}
                >
                    {isPlaying ? <Square size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
                </button>
            </div>

            <div className="flex gap-3 overflow-x-auto pb-2">
                {chords.map((chord, i) => {
                    const active = current?.chord === i;
                    const known = Boolean(CHORD_DEFINITIONS[chord.name]);
                    return (
                        <button
                            key={i}
                            onClick={() => known && !isPlaying && GuitarSynth.playChord(CHORD_DEFINITIONS[chord.name])}
                            title={known ? `Écouter ${chord.name}` : undefined}
                            className={`shrink-0 rounded-2xl border p-3 flex flex-col items-center transition-all ${active ? 'border-amber-500 bg-amber-500/10 scale-105' : 'border-slate-800 bg-slate-900/60 hover:border-slate-600'}`}
                        >
                            <span className={`text-2xl font-black ${active ? 'text-amber-400' : 'text-white'}`}>{chord.name}</span>
                            <span className="text-[11px] text-slate-400 mb-1">{CHORD_NAMES_FR[chord.name] || 'diagramme indisponible'}</span>
                            {known && <ChordShape name={chord.name} width={110} highlighted={active} />}
                            {/* Un point par temps : un coup de grattage chacun */}
                            <div className="flex gap-1 mt-2">
                                {Array.from({ length: chord.beats }, (_, b) => (
                                    <span key={b} className={`w-4 h-4 rounded-full text-[9px] font-black flex items-center justify-center ${active && current!.beat === b ? 'bg-amber-500 text-slate-900' : active && current!.beat > b ? 'bg-amber-500/40 text-slate-900' : 'bg-slate-800 text-slate-500'}`}>
                                        {b + 1}
                                    </span>
                                ))}
                            </div>
                        </button>
                    );
                })}
            </div>

            <div className="mt-4 flex items-start gap-2 bg-blue-500/10 p-3 rounded-xl border border-blue-500/20">
                <Info size={14} className="text-blue-400 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-200 leading-snug">
                    Un <strong>accord</strong>, c'est plusieurs cordes jouées <strong>ensemble</strong>. Main gauche : posez les doigts comme sur le
                    diagramme et gardez la forme. Main droite : grattez toutes les cordes d'un coup, du haut (corde grave) vers le bas,
                    <strong> une fois par temps</strong> (les pastilles 1-2-3-4), puis passez à l'accord suivant. Touchez un diagramme pour l'entendre seul.
                </p>
            </div>
        </div>
    );
};

export default ChordProgressionPlayer;
