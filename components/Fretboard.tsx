
import React from 'react';
import { CHORD_DEFINITIONS, CHORD_FINGERS } from '../constants';

interface FretboardProps {
    targetString?: number;
    targetFret?: number;
    finger?: number;
    detectedPosition?: { string: number, fret: number } | null;
    activeSequenceNote?: { string: number, fret: number, finger?: number } | null; // Note actuelle de la mélodie
    isPlaying?: boolean;
    isSuccess?: boolean;
    demoPhase?: 'idle' | 'setup' | 'playing';
    maxFret?: number; // case la plus haute à afficher (12 minimum, 22 maximum)
    chord?: string;   // accord tenu par la main gauche, affiché en transparence
    extraPositions?: { string: number, fret: number }[]; // autres notes jouées en même temps que la cible
}

// Vue "tablature" : corde 1 (Mi aigu, la plus fine) en haut, corde 6 (Mi grave) en bas
const STRING_CONFIG = [
    { num: 1, name: 'Mi', color: '#ef4444' },
    { num: 2, name: 'Si', color: '#f59e0b' },
    { num: 3, name: 'Sol', color: '#3b82f6' },
    { num: 4, name: 'Ré', color: '#f97316' },
    { num: 5, name: 'La', color: '#22c55e' },
    { num: 6, name: 'Mi', color: '#a855f7' },
];

const SINGLE_DOTS = [3, 5, 7, 9, 15, 17, 19, 21];
const DOUBLE_DOTS = [12];

const Fretboard: React.FC<FretboardProps> = ({
    targetString,
    targetFret = 0,
    finger,
    detectedPosition,
    activeSequenceNote,
    isPlaying = false,
    isSuccess = false,
    demoPhase = 'idle',
    maxFret = 12,
    chord,
    extraPositions = []
}) => {
    const neckWidth = 1000;
    const stringSpacing = 30;
    const topMargin = 30;
    const totalFrets = Math.min(22, Math.max(12, maxFret));
    const fretStep = neckWidth / totalFrets;
    const midY = topMargin + 2.5 * stringSpacing;

    const stringY = (string: number) => topMargin + (string - 1) * stringSpacing;
    // Centre de la case ; une corde à vide est marquée juste avant le sillet
    const fretX = (fret: number) => fret === 0 ? -16 : (fret * fretStep) - (fretStep / 2);
    const isVisible = (fret: number) => fret >= 0 && fret <= totalFrets;

    const activeNote = (demoPhase === 'playing' && activeSequenceNote)
        ? activeSequenceNote
        : { string: targetString, fret: targetFret, finger };

    const renderStrings = () => {
        return STRING_CONFIG.map((conf, i) => {
            const yPos = stringY(conf.num);
            const isActive = activeNote.string === conf.num;
            const shouldVibrate = (isPlaying && targetString === conf.num) || (demoPhase === 'playing' && activeSequenceNote?.string === conf.num);
            const thickness = 1 + i * 0.8;

            return (
                <g key={`string-${i}`}>
                    <text x={-72} y={yPos + 5} fill={isActive ? '#ffffff' : '#94a3b8'} fontSize="14" fontWeight="bold">{conf.num}</text>
                    <text x={-56} y={yPos + 5} fill={isActive ? '#ffffff' : '#94a3b8'} fontSize="13">{conf.name}</text>
                    {/* Corde à jouer : halo sur toute sa longueur (utile pour les cordes à vide) */}
                    {isActive && <line x1={0} y1={yPos} x2={neckWidth} y2={yPos} stroke={conf.color} strokeWidth={thickness + 10} opacity={0.25} />}
                    <line x1={0} y1={yPos} x2={neckWidth} y2={yPos} stroke="#1e293b" strokeWidth={thickness + 2} />
                    <line x1={0} y1={yPos} x2={neckWidth} y2={yPos} stroke={conf.color} strokeWidth={thickness} className={shouldVibrate ? 'animate-vibrate' : ''} />
                </g>
            );
        });
    };

    const renderInlays = () => (
        <>
            {SINGLE_DOTS.filter(f => f <= totalFrets).map(f => (
                <circle key={`dot-${f}`} cx={fretX(f)} cy={midY} r={7} fill="#e2e8f0" opacity={0.25} />
            ))}
            {DOUBLE_DOTS.filter(f => f <= totalFrets).map(f => (
                <g key={`ddot-${f}`}>
                    <circle cx={fretX(f)} cy={topMargin + 1.5 * stringSpacing} r={7} fill="#e2e8f0" opacity={0.25} />
                    <circle cx={fretX(f)} cy={topMargin + 3.5 * stringSpacing} r={7} fill="#e2e8f0" opacity={0.25} />
                </g>
            ))}
            {Array.from({ length: totalFrets }, (_, i) => i + 1).map(f => (
                <text key={`num-${f}`} x={fretX(f)} y={216} textAnchor="middle" fill="#64748b" fontSize="12" fontFamily="monospace">{f}</text>
            ))}
        </>
    );

    // Accord tenu par la main gauche : doigts en transparence avec leur numéro
    const renderChordShape = () => {
        const frets = chord ? CHORD_DEFINITIONS[chord] : undefined;
        if (!frets) return null;
        const fingers = CHORD_FINGERS[chord!] || [];
        return frets.map((fret, i) => {
            const string = 6 - i; // les accords sont notés de la corde grave à l'aiguë
            if (fret <= 0 || !isVisible(fret)) return null;
            return (
                <g key={`chord-${i}`} opacity={0.55}>
                    <circle cx={fretX(fret)} cy={stringY(string)} r={13} fill="#0f172a" stroke="#f59e0b" strokeWidth={2} strokeDasharray="4 3" />
                    {fingers[i] > 0 && <text x={fretX(fret)} y={stringY(string) + 5} textAnchor="middle" fill="#f59e0b" fontSize="13" fontWeight="900">{fingers[i]}</text>}
                </g>
            );
        });
    };

    // Notes jouées en même temps que la cible (tablature scannée) : même marqueur, sans numéro de doigt
    const renderExtraPositions = () => extraPositions
        .filter(n => n.string >= 1 && n.string <= 6 && isVisible(n.fret))
        .map((n, i) => (
            <g key={`extra-${i}`}>
                <circle cx={fretX(n.fret)} cy={stringY(n.string)} r={n.fret === 0 ? 12 : 18} fill={STRING_CONFIG[n.string - 1].color} stroke="white" strokeWidth={3} />
                {n.fret === 0 && <text x={fretX(0)} y={stringY(n.string) + 5} textAnchor="middle" fill="white" fontSize="12" fontWeight="900">0</text>}
            </g>
        ));

    const renderTargetIndicator = () => {
        if (!activeNote.string || !isVisible(activeNote.fret)) return null;

        const y = stringY(activeNote.string);
        const x = fretX(activeNote.fret);
        const color = isSuccess ? '#22c55e' : STRING_CONFIG[activeNote.string - 1]?.color || '#fff';
        const isOpen = activeNote.fret === 0;

        return (
            <g className="transition-all duration-200">
                <circle cx={x} cy={y} r={isOpen ? 12 : 18} fill={color} stroke="white" strokeWidth={3} className={demoPhase === 'playing' ? 'animate-pulse' : ''} />
                <text x={x} y={y + 5} textAnchor="middle" fill="white" fontSize={isOpen ? 12 : 14} fontWeight="900">
                    {isOpen ? '0' : activeNote.finger || ''}
                </text>
            </g>
        );
    };

    return (
        <div className="w-full bg-slate-900 rounded-xl border border-slate-700 p-4 shadow-2xl overflow-hidden">
            <svg viewBox="-80 0 1090 225" className="w-full h-auto">
                <rect x={0} y={10} width={neckWidth} height={190} fill="#2a1d18" rx={4} />
                {renderInlays()}
                {/* Frets (0 = sillet) */}
                {Array.from({ length: totalFrets + 1 }).map((_, i) => (
                    <line key={i} x1={i * fretStep} y1={15} x2={i * fretStep} y2={195} stroke="#94a3b8" strokeWidth={i === 0 ? 8 : 3} />
                ))}
                {renderStrings()}
                {renderChordShape()}
                {renderExtraPositions()}
                {renderTargetIndicator()}
                {detectedPosition && !isPlaying && isVisible(detectedPosition.fret) && (
                    <circle cx={fretX(detectedPosition.fret)} cy={stringY(detectedPosition.string)} r={12} fill="#ef4444" opacity={0.6} />
                )}
            </svg>
            <p className="text-[11px] text-slate-500 mt-2 leading-snug">
                Vue comme une tablature : corde 1 en haut = Mi aigu (la plus fine), corde 6 en bas = Mi grave (la plus épaisse).
                Chiffre dans le rond = doigt de la main gauche (1 index … 4 auriculaire), 0 = corde à vide.
            </p>
        </div>
    );
};

export default Fretboard;
