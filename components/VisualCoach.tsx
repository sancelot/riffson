
import React, { useState, useEffect, useRef } from 'react';
import { VisualSequence } from '../types';
import { ArrowLeft, ArrowRight } from 'lucide-react';

interface VisualCoachProps {
    sequence: VisualSequence;
    isPlaying?: boolean;
}

const VisualCoach: React.FC<VisualCoachProps> = ({ sequence, isPlaying = true }) => {
    const [stepIndex, setStepIndex] = useState(0);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!isPlaying || sequence.steps.length === 0) return;
        const playStep = (index: number) => {
            setStepIndex(index);
            const currentStep = sequence.steps[index];
            if (!currentStep) return;
            const duration = currentStep.duration || 1500;
            timeoutRef.current = setTimeout(() => {
                let nextIndex = index + 1;
                if (nextIndex >= sequence.steps.length) {
                    if (sequence.loop) nextIndex = 0;
                    else return;
                }
                playStep(nextIndex);
            }, duration);
        };
        playStep(0);
        return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
    }, [sequence, isPlaying]);

    const currentStep = sequence.steps[stepIndex];
    if (!currentStep) return null;

    const neckWidth = 320; // Increased to fit labels
    const neckHeight = 120;
    const stringSpacing = 20;
    const fretWidth = 60;
    const topMargin = 10;
    const leftLabelOffset = 25; // Space for string names
    
    // Calculate visible fret range
    const centerFret = Math.max(1, currentStep.fret);
    const startFret = Math.max(0, centerFret - 1);
    
    const getStringY = (visualIndex: number) => topMargin + visualIndex * stringSpacing;
    const getFretX = (fretNum: number) => fretNum === 0 ? leftLabelOffset + 15 : leftLabelOffset + 35 + (fretNum - startFret) * fretWidth;

    // String Names (Top to Bottom = High E to Low E)
    const STRING_NAMES = ['e', 'B', 'G', 'D', 'A', 'E'];

    const renderStrings = () => {
        // Render 0 (High E) to 5 (Low E)
        return [0, 1, 2, 3, 4, 5].map(visualIndex => {
            const y = getStringY(visualIndex);
            const logicalString = visualIndex + 1; // 1 (High E) to 6 (Low E)
            
            // Blueprint Style
            let strokeColor = 'rgba(255, 255, 255, 0.3)';
            let strokeWidth = 1;
            let className = "transition-all duration-300";

            if (logicalString === currentStep.string) {
                if (currentStep.action === 'wrong_string') {
                    strokeColor = '#ef4444'; // Red for error
                    strokeWidth = 3;
                    className += " animate-pulse";
                } else if (currentStep.action === 'correct_string') {
                    strokeColor = '#4ade80'; // Green for correction
                    strokeWidth = 3;
                    className += " animate-pulse";
                } else {
                    // Active string in Blueprint is Bright White
                    strokeColor = '#ffffff'; 
                    strokeWidth = 2.5;
                    className += " drop-shadow-[0_0_5px_rgba(255,255,255,0.8)]";
                }
            }

            return (
                <g key={`s-${visualIndex}`}>
                    {/* String Label */}
                    <text 
                        x={10} 
                        y={y + 4} 
                        fill={logicalString === currentStep.string ? "#93c5fd" : "rgba(255,255,255,0.4)"} 
                        fontSize="10" 
                        fontWeight="bold" 
                        fontFamily="monospace"
                        textAnchor="middle"
                    >
                        {STRING_NAMES[visualIndex]}
                    </text>

                    {/* Grid line background */}
                    <line x1={leftLabelOffset} y1={y} x2={neckWidth} y2={y} stroke={strokeColor} strokeWidth={strokeWidth} className={className} />
                    
                    {/* Pluck effect */}
                    {logicalString === currentStep.string && currentStep.action === 'pluck' && (
                        <circle cx={neckWidth - 30} cy={y} r={6} fill="white" className="animate-ping opacity-75" />
                    )}
                </g>
            );
        });
    };

    const renderFrets = () => {
        const frets = [];
        for(let i=0; i<4; i++) {
            const fNum = startFret + i;
            const x = leftLabelOffset + 35 + i * fretWidth;
            if (fNum === 0) {
                 // Nut
                 frets.push(<rect key="nut" x={leftLabelOffset + 15} y={0} width={6} height={neckHeight} fill="rgba(255,255,255,0.2)" />);
                 // 0 Label
                 frets.push(<text key="nut-label" x={leftLabelOffset + 18} y={neckHeight - 5} fill="rgba(255,255,255,0.5)" fontSize="9" textAnchor="middle" fontFamily="monospace">0</text>);
            } else {
                 // Fret line
                 frets.push(
                    <g key={`f-${fNum}`}>
                        <line x1={x} y1={0} x2={x} y2={neckHeight} stroke="rgba(255,255,255,0.2)" strokeWidth={2} />
                        <text x={x - fretWidth/2} y={neckHeight - 5} fill="rgba(255,255,255,0.5)" fontSize="10" textAnchor="middle" fontFamily="monospace">{fNum}</text>
                    </g>
                 );
            }
        }
        return frets;
    };

    const renderFinger = () => {
        if ((currentStep.action === 'wrong_string' || currentStep.action === 'correct_string') && currentStep.fret < 0) return null;

        const visualIndex = currentStep.string - 1; 
        const y = getStringY(visualIndex);
        let x = currentStep.fret === 0 ? leftLabelOffset + 10 : getFretX(currentStep.fret) - (fretWidth / 2);

        return (
            <g className="transition-all duration-500 ease-in-out" style={{ transform: `translate(${x}px, ${y}px)` }}>
                {/* Finger Circle (Blueprint Style: Hollow or solid white) */}
                <circle r={10} fill="#3b82f6" stroke="white" strokeWidth={2} />
                
                {/* Finger Number */}
                {currentStep.finger && (
                    <text dy={4} textAnchor="middle" fill="white" fontSize="12" fontWeight="bold" fontFamily="sans-serif">
                        {currentStep.finger}
                    </text>
                )}
                
                {/* Press Action Ring */}
                {currentStep.action === 'press' && (
                    <circle r={16} fill="none" stroke="white" strokeWidth={2} className="animate-ping" opacity={0.5} />
                )}
            </g>
        );
    };

    const renderArrow = () => {
        const visualIndex = currentStep.string - 1;
        const y = getStringY(visualIndex);
        const x = getFretX(currentStep.fret) - (fretWidth / 2);

        if (currentStep.action === 'slide_left') {
             return <g transform={`translate(${x - 30}, ${y})`}><ArrowLeft className="text-white animate-bounce-horizontal drop-shadow-md" size={24} /></g>;
        }
        if (currentStep.action === 'slide_right') {
             return <g transform={`translate(${x + 10}, ${y})`}><ArrowRight className="text-white animate-bounce-horizontal drop-shadow-md" size={24} /></g>;
        }
        return null;
    };

    return (
        <div className="bg-slate-900 rounded-xl overflow-hidden border-2 border-blue-500/50 w-full shadow-2xl min-h-[160px] flex flex-col relative group">
            {/* Blueprint Grid Background */}
            <div className="absolute inset-0 opacity-10 pointer-events-none" 
                 style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
            </div>
            
            <div className="relative flex-1 w-full p-2">
                 <svg width="100%" height="100%" viewBox={`0 0 ${neckWidth} ${neckHeight}`} preserveAspectRatio="xMidYMid meet" className="overflow-visible">
                     {renderFrets()}
                     {renderStrings()}
                     {renderFinger()}
                     {renderArrow()}
                 </svg>
            </div>
            
            <div className="bg-blue-900/90 p-2 flex items-center justify-between border-t border-blue-500/30 backdrop-blur-sm z-10">
                <div className="flex gap-1.5 pl-2">
                    {sequence.steps.map((_, i) => (
                        <div key={i} className={`w-1.5 h-1.5 rounded-full transition-colors ${i === stepIndex ? 'bg-white shadow-[0_0_5px_white]' : 'bg-blue-700'}`} />
                    ))}
                </div>
                <p className="text-blue-100 font-mono text-xs font-bold uppercase tracking-wider text-right animate-pulse transition-all pr-2">
                    {currentStep.caption}
                </p>
            </div>
        </div>
    );
};

export default VisualCoach;
