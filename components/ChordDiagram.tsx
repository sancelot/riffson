import React, { useState } from 'react';
import { CHORD_DEFINITIONS, CHORD_FINGERS, CHORD_NAMES_FR, FINGER_NAMES, STRING_NAMES_FR } from '../constants';
import { GuitarSynth, getChordNotesFr } from '../utils/audio';
import { Play, Volume2 } from 'lucide-react';

// Diagramme vertical, vu de face : corde la plus grave à gauche, sillet en haut
const STRING_LABELS = ['Mi', 'La', 'Ré', 'Sol', 'Si', 'Mi'];
const STRING_X = (i: number) => 30 + i * 24;
const FRET_Y = (fret: number) => 30 + fret * 26;
const SHOWN_FRETS = 5;

/** Grille de l'accord seule (sans explications), réutilisée par le lecteur de suites d'accords. */
export const ChordShape: React.FC<{ name: string; highlighted?: boolean; width?: number }> = ({ name, highlighted = false, width = 170 }) => {
    const frets = CHORD_DEFINITIONS[name];
    if (!frets) return null;
    const fingers = CHORD_FINGERS[name] || frets.map(() => 0);

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

    return (
        <svg width={width} height={width * 200 / 170} viewBox="0 0 170 200" className="shrink-0">
            {/* Sillet */}
            <line x1={STRING_X(0)} y1={FRET_Y(0)} x2={STRING_X(5)} y2={FRET_Y(0)} stroke="white" strokeWidth="5" />
            {/* Numéros de case */}
            {Array.from({ length: SHOWN_FRETS }, (_, f) => f + 1).map(f => (
                <text key={`n-${f}`} x={10} y={FRET_Y(f) - 9} fill="#64748b" fontSize="10" fontFamily="monospace" textAnchor="middle">{f}</text>
            ))}
            {/* Cordes */}
            {STRING_LABELS.map((label, i) => (
                <g key={`s-${i}`}>
                    <line x1={STRING_X(i)} y1={FRET_Y(0)} x2={STRING_X(i)} y2={FRET_Y(SHOWN_FRETS)} stroke="#64748b" strokeWidth={2.2 - i * 0.3} />
                    <text x={STRING_X(i)} y={FRET_Y(SHOWN_FRETS) + 16} fill="#94a3b8" fontSize="10" fontWeight="bold" textAnchor="middle">{label}</text>
                </g>
            ))}
            {/* Frettes */}
            {Array.from({ length: SHOWN_FRETS }, (_, f) => f + 1).map(f => (
                <line key={`f-${f}`} x1={STRING_X(0)} y1={FRET_Y(f)} x2={STRING_X(5)} y2={FRET_Y(f)} stroke="#334155" strokeWidth="1.5" />
            ))}

            {isBarre && (
                <line
                    x1={STRING_X(Math.min(...stringsWithMinFret))} y1={FRET_Y(minFret) - 13}
                    x2={STRING_X(Math.max(...stringsWithMinFret))} y2={FRET_Y(minFret) - 13}
                    stroke="#f59e0b" strokeWidth="18" strokeLinecap="round" opacity="0.5"
                />
            )}

            {frets.map((fret, i) => {
                const x = STRING_X(i);
                if (fret === -1) return <text key={`m-${i}`} x={x} y={FRET_Y(0) - 10} textAnchor="middle" fill="#ef4444" fontSize="14" fontWeight="900">✕</text>;
                if (fret === 0) return <circle key={`o-${i}`} cx={x} cy={FRET_Y(0) - 14} r="6" stroke="#22c55e" strokeWidth="2.5" fill="none" />;
                const y = FRET_Y(fret) - 13;
                return (
                    <g key={`d-${i}`}>
                        <circle cx={x} cy={y} r={10} fill={highlighted ? '#ffffff' : '#f59e0b'} className="transition-colors duration-200" />
                        {fingers[i] > 0 && <text x={x} y={y + 4.5} textAnchor="middle" fill="#0f172a" fontSize="13" fontWeight="900">{fingers[i]}</text>}
                    </g>
                );
            })}
        </svg>
    );
};

const ChordDiagram: React.FC<{ chordName: string }> = ({ chordName }) => {
    const name = chordName.replace(/[\[\]]/g, '');
    const frets = CHORD_DEFINITIONS[name];
    const [isPlaying, setIsPlaying] = useState(false);

    // Accord absent du dictionnaire : on affiche au moins son nom au lieu de le faire disparaître
    if (!frets) {
        return <span className="inline-block my-2 px-3 py-1 rounded-lg bg-slate-800 border border-slate-700 font-black text-amber-500">{name}</span>;
    }

    const fingers = CHORD_FINGERS[name] || frets.map(() => 0);
    const frenchName = CHORD_NAMES_FR[name];
    const notes = getChordNotesFr(frets);

    const handlePlay = () => {
        setIsPlaying(true);
        GuitarSynth.playChord(frets);
        // Visual feedback duration
        setTimeout(() => setIsPlaying(false), 800);
    };

    const lowestPlayed = frets.findIndex(f => f !== -1);

    // Consignes écrites pour la main gauche, doigt par doigt
    const fingerSteps = frets
        .map((fret, i) => ({ fret, finger: fingers[i], string: 6 - i }))
        .filter(s => s.fret > 0);
    const openStrings = frets.map((f, i) => f === 0 ? STRING_NAMES_FR[6 - i] : null).filter(Boolean);
    const mutedStrings = frets.map((f, i) => f === -1 ? STRING_NAMES_FR[6 - i] : null).filter(Boolean);

    return (
        <div className="not-prose my-6 bg-slate-900/90 p-5 rounded-3xl border border-slate-700 max-w-md mx-auto relative">
            <button
                onClick={handlePlay}
                className={`absolute top-4 right-4 p-2.5 rounded-full transition-all active:scale-90 z-10 ${isPlaying ? 'bg-amber-500 text-slate-900 shadow-[0_0_20px_#f59e0b]' : 'bg-slate-800 text-slate-400 hover:text-amber-400'}`}
                aria-label="Écouter l'accord"
            >
                {isPlaying ? <Volume2 size={18} /> : <Play size={18} fill="currentColor" />}
            </button>

            <div className="text-center mb-4">
                <h4 className="text-3xl font-black text-amber-500 tracking-tight">{name}</h4>
                {frenchName && <p className="text-white font-bold">Accord de {frenchName}</p>}
                <p className="text-slate-400 text-sm">Notes : {notes.join(' · ')}</p>
            </div>

            <div className="flex flex-col sm:flex-row gap-5 items-center">
                <ChordShape name={name} highlighted={isPlaying} />

                <div className="text-sm text-slate-300 space-y-2 w-full">
                    <p className="text-xs font-bold uppercase tracking-widest text-amber-400">Main gauche</p>
                    {fingerSteps.length > 0 ? (
                        <ul className="space-y-1">
                            {fingerSteps.map(s => (
                                <li key={s.string}>
                                    <span className="inline-flex w-5 h-5 rounded-full bg-amber-500 text-slate-900 text-xs font-black items-center justify-center mr-1">{s.finger || '•'}</span>
                                    {s.finger ? `${FINGER_NAMES[s.finger][0].toUpperCase()}${FINGER_NAMES[s.finger].slice(1)}` : 'Un doigt'} : corde de {STRING_NAMES_FR[s.string]}, case {s.fret}
                                </li>
                            ))}
                        </ul>
                    ) : <p>Aucune case à presser.</p>}
                    {openStrings.length > 0 && <p><span className="text-green-400 font-bold">○ À vide</span> (jouées sans appuyer) : {openStrings.join(', ')}</p>}
                    {mutedStrings.length > 0 && <p><span className="text-red-400 font-bold">✕ Ne pas jouer</span> : {mutedStrings.join(', ')}</p>}
                    <p className="text-xs font-bold uppercase tracking-widest text-amber-400 pt-1">Main droite</p>
                    <p>Grattez du haut vers le bas, de la corde de {STRING_NAMES_FR[6 - lowestPlayed]} jusqu'au Mi aigu.</p>
                </div>
            </div>

            <p className="mt-4 text-[11px] text-slate-500 leading-snug">
                Lecture : le manche est vu de face, sillet en haut, corde la plus grave (Mi) à gauche.
                Chiffres = doigts : 1 index, 2 majeur, 3 annulaire, 4 auriculaire.
            </p>
        </div>
    );
};

export default ChordDiagram;
