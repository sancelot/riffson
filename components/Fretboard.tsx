
import React from 'react';
import { FretboardPosition } from '../types';

interface FretboardProps {
    targetString?: number;
    targetFret?: number;
    finger?: number;
    detectedPosition?: { string: number, fret: number } | null;
    activeSequenceNote?: { string: number, fret: number } | null; // Note actuelle de la mélodie
    isPlaying?: boolean;
    isSuccess?: boolean;
    demoPhase?: 'idle' | 'setup' | 'playing';
    maxFret?: number; // case la plus haute à afficher (12 minimum, 22 maximum)
}

const STRING_CONFIG = [
    { num: 1, name: 'e', color: '#ef4444' },
    { num: 2, name: 'B', color: '#f59e0b' },
    { num: 3, name: 'G', color: '#3b82f6' },
    { num: 4, name: 'D', color: '#f97316' },
    { num: 5, name: 'A', color: '#22c55e' },
    { num: 6, name: 'E', color: '#a855f7' },
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
    maxFret = 12
}) => {
    const neckWidth = 1000;
    const stringSpacing = 30;
    const topMargin = 30;
    const totalFrets = Math.min(22, Math.max(12, maxFret));
    const fretStep = neckWidth / totalFrets;
    const midY = topMargin + 2.5 * stringSpacing;

    // Centre de la case (case 0 = corde à vide, à gauche du sillet)
    const fretX = (fret: number) => fret === 0 ? -20 : (fret * fretStep) - (fretStep / 2);
    const isVisible = (fret: number) => fret >= 0 && fret <= totalFrets;

    const renderStrings = () => {
        return STRING_CONFIG.map((conf, i) => {
            const yPos = topMargin + i * stringSpacing;
            const isTarget = targetString === conf.num;
            const isSequenceActive = activeSequenceNote?.string === conf.num;
            const shouldVibrate = (isPlaying && isTarget) || (demoPhase === 'playing' && isSequenceActive);
            const thickness = 1 + i * 0.8;

            return (
                <g key={`string-${i}`}>
                    <text x={-45} y={yPos + 4} fill="#94a3b8" fontSize="13" fontWeight="bold" fontFamily="monospace">{conf.name}</text>
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

    const renderTargetIndicator = () => {
        // En mode démo "playing", on affiche la note de la séquence
        const activeNote = (demoPhase === 'playing' && activeSequenceNote) ? activeSequenceNote : { string: targetString, fret: targetFret };
        if (!activeNote.string || !isVisible(activeNote.fret)) return null;

        const stringIndex = activeNote.string - 1;
        const y = topMargin + stringIndex * stringSpacing;
        const x = fretX(activeNote.fret);
        const color = isSuccess ? '#22c55e' : STRING_CONFIG[stringIndex]?.color || '#fff';

        return (
            <g className="transition-all duration-200">
                <circle cx={x} cy={y} r={18} fill={color} stroke="white" strokeWidth={3} className={demoPhase === 'playing' ? 'animate-pulse' : ''} />
                {finger && activeNote.fret !== 0 && demoPhase !== 'playing' && (
                    <text x={x} y={y + 5} textAnchor="middle" fill="white" fontSize="14" fontWeight="900">{finger}</text>
                )}
            </g>
        );
    };

    return (
        <div className="w-full bg-slate-900 rounded-xl border border-slate-700 p-4 shadow-2xl overflow-hidden">
            <svg viewBox="-55 0 1065 225" className="w-full h-auto">
                <rect x={0} y={10} width={neckWidth} height={190} fill="#2a1d18" rx={4} />
                {renderInlays()}
                {/* Frets (0 = sillet) */}
                {Array.from({ length: totalFrets + 1 }).map((_, i) => (
                    <line key={i} x1={i * fretStep} y1={15} x2={i * fretStep} y2={195} stroke="#94a3b8" strokeWidth={i === 0 ? 8 : 3} />
                ))}
                {renderStrings()}
                {renderTargetIndicator()}
                {detectedPosition && !isPlaying && isVisible(detectedPosition.fret) && (
                    <circle cx={fretX(detectedPosition.fret)} cy={topMargin + (detectedPosition.string - 1) * stringSpacing} r={12} fill="#ef4444" opacity={0.6} />
                )}
            </svg>
        </div>
    );
};

export default Fretboard;
