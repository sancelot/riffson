
import React, { useState, useRef, useEffect } from 'react';
import { generateLessonContent, scanGuitarTab } from '../services/gemini';
import { UserLevel, InteractiveExercise } from '../types';
import { Search, Loader2, Mic, Play, Square, Music, Activity, Camera, Zap, ArrowUp, ArrowDown, CheckCircle, Info, Power } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import Fretboard from './Fretboard';
import ChordDiagram from './ChordDiagram';
import { autoCorrelate, getNoteFromFrequency } from '../utils/audio';

interface ToolsProps {
    userLevel: UserLevel;
}

const MIN_BPM = 40;
const MAX_BPM = 240;

const TUNER_STRINGS = [
    { note: 'E', name: 'Mi Grave', freq: 82.41, color: '#a855f7' },
    { note: 'A', name: 'La', freq: 110.00, color: '#22c55e' },
    { note: 'D', name: 'Ré', freq: 146.83, color: '#f97316' },
    { note: 'G', name: 'Sol', freq: 196.00, color: '#3b82f6' },
    { note: 'B', name: 'Si', freq: 246.94, color: '#f59e0b' },
    { note: 'e', name: 'Mi Aigu', freq: 329.63, color: '#ef4444' },
];

const Tools: React.FC<ToolsProps> = ({ userLevel }) => {
    const [activeTab, setActiveTab] = useState<'tuner' | 'metronome' | 'library' | 'scanner'>('metronome');

    return (
        <div className="h-full bg-slate-900 flex flex-col overflow-hidden">
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex justify-around">
                <button onClick={() => setActiveTab('metronome')} className={`flex flex-col items-center p-2 rounded-lg transition-all ${activeTab === 'metronome' ? 'text-amber-500 bg-slate-900' : 'text-slate-500'}`}><Activity size={24} /><span className="text-xs mt-1">Métronome</span></button>
                <button onClick={() => setActiveTab('tuner')} className={`flex flex-col items-center p-2 rounded-lg transition-all ${activeTab === 'tuner' ? 'text-amber-500 bg-slate-900' : 'text-slate-500'}`}><Mic size={24} /><span className="text-xs mt-1">Accordeur</span></button>
                <button onClick={() => setActiveTab('library')} className={`flex flex-col items-center p-2 rounded-lg transition-all ${activeTab === 'library' ? 'text-amber-500 bg-slate-900' : 'text-slate-500'}`}><Search size={24} /><span className="text-xs mt-1">Biblio</span></button>
                <button onClick={() => setActiveTab('scanner')} className={`flex flex-col items-center p-2 rounded-lg transition-all ${activeTab === 'scanner' ? 'text-amber-500 bg-slate-900' : 'text-slate-500'}`}><Camera size={24} /><span className="text-xs mt-1">Scanner</span></button>
            </div>

            <div className="flex-1 overflow-hidden relative">
                {activeTab === 'metronome' && <Metronome />}
                {activeTab === 'tuner' && <Tuner />}
                {activeTab === 'library' && <Library userLevel={userLevel} />}
                {activeTab === 'scanner' && <Scanner />}
            </div>
        </div>
    );
};

const Scanner = () => {
    const [image, setImage] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [exercises, setExercises] = useState<InteractiveExercise[]>([]);
    const [currentStep, setCurrentStep] = useState(0);
    const [scanError, setScanError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onloadend = async () => {
            const base64 = reader.result as string;
            setImage(base64);
            setExercises([]);
            setCurrentStep(0);
            setScanError(null);
            setLoading(true);
            try {
                setExercises(await scanGuitarTab(base64.split(',')[1], file.type || 'image/png'));
            } catch (err) {
                console.error(err);
                setScanError("L'analyse a échoué (connexion ou clé API Gemini). Réessayez.");
            } finally {
                setLoading(false);
            }
        };
        reader.readAsDataURL(file);
        e.target.value = ''; // permet de re-sélectionner le même fichier
    };

    const currentEx = exercises.length > 0 ? exercises[currentStep] : null;

    return (
        <div className="flex flex-col h-full p-6 animate-fadeIn overflow-y-auto">
             <h2 className="text-2xl font-bold text-white mb-2">Scanner de Tablature</h2>
             <p className="text-slate-400 text-sm mb-6">Prenez une photo d'une partition, l'IA va vous montrer comment la jouer.</p>
             {!image ? (
                 <button onClick={() => fileInputRef.current?.click()} className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-slate-700 rounded-2xl bg-slate-800/50 hover:bg-slate-800 transition-colors group">
                     <div className="bg-slate-700 p-6 rounded-full mb-4 group-hover:scale-110 transition-transform"><Camera size={40} className="text-amber-500" /></div>
                     <span className="font-bold text-slate-300">Prendre une photo</span>
                 </button>
             ) : (
                 <div className="flex flex-col h-full">
                     <div className="relative h-40 rounded-xl overflow-hidden mb-6 border border-slate-700">
                         <img src={image} alt="Tab" className="w-full h-full object-cover opacity-50" />
                         <button onClick={() => { setImage(null); setExercises([]); setCurrentStep(0); setScanError(null); }} className="absolute top-2 right-2 bg-black/50 p-2 rounded-full text-white">×</button>
                     </div>
                     {loading ? (
                         <div className="flex flex-col items-center justify-center py-12"><Loader2 size={40} className="animate-spin text-amber-500 mb-4" /><p className="text-slate-400">Analyse...</p></div>
                     ) : exercises.length > 0 && currentEx ? (
                         <div className="flex-1 flex flex-col">
                             <div className="flex justify-between items-center mb-4">
                                 <h3 className="text-xl font-bold text-white">Note {currentStep + 1}</h3>
                                 <div className="flex gap-2">
                                     <button onClick={() => setCurrentStep(Math.max(0, currentStep - 1))} className="p-2 bg-slate-700 rounded-lg">Prev</button>
                                     <button onClick={() => setCurrentStep(Math.min(exercises.length - 1, currentStep + 1))} className="p-2 bg-amber-500 text-slate-900 rounded-lg">Next</button>
                                 </div>
                             </div>
                             <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 mb-4 text-center">
                                 <div className="text-2xl font-black text-amber-500 mb-2">{currentEx.prompt}</div>
                             </div>
                             <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
                                 <Fretboard targetString={currentEx.targetString} targetFret={currentEx.targetFret} finger={currentEx.finger} isPlaying={true} maxFret={Math.max(...exercises.map(ex => ex.targetFret ?? 0))} />
                             </div>
                         </div>
                     ) : <p className="text-center text-red-400">{scanError || 'Aucune note détectée.'}</p>}
                 </div>
             )}
             <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
        </div>
    );
};

const Metronome = () => {
    const [bpm, setBpmState] = useState(100);
    const [isPlaying, setIsPlaying] = useState(false);
    const audioContextRef = useRef<AudioContext | null>(null);
    const nextNoteTimeRef = useRef<number>(0);
    const timerIDRef = useRef<number | null>(null);
    // Le scheduler tourne hors du cycle React : il lit le tempo courant via une ref
    const bpmRef = useRef(bpm);

    const setBpm = (update: (b: number) => number) => {
        setBpmState(b => {
            const next = Math.min(MAX_BPM, Math.max(MIN_BPM, update(b)));
            bpmRef.current = next;
            return next;
        });
    };

    // Arrête le métronome quand on quitte l'onglet
    useEffect(() => () => {
        if (timerIDRef.current) window.clearTimeout(timerIDRef.current);
        audioContextRef.current?.close();
        audioContextRef.current = null;
    }, []);

    const nextNote = () => { nextNoteTimeRef.current += 60.0 / bpmRef.current; };
    const playClick = (time: number) => {
        if (!audioContextRef.current) return;
        const osc = audioContextRef.current.createOscillator();
        const gain = audioContextRef.current.createGain();
        osc.frequency.value = 1000; osc.type = 'square';
        gain.gain.value = 0.1; gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
        osc.connect(gain); gain.connect(audioContextRef.current.destination);
        osc.start(time); osc.stop(time + 0.05);
    };
    const scheduler = () => {
        if (!audioContextRef.current) return;
        while (nextNoteTimeRef.current < audioContextRef.current.currentTime + 0.1) {
            playClick(nextNoteTimeRef.current);
            nextNote();
        }
        timerIDRef.current = window.setTimeout(scheduler, 25.0);
    };
    const togglePlay = () => {
        if (isPlaying) { setIsPlaying(false); if (timerIDRef.current) window.clearTimeout(timerIDRef.current); }
        else {
            if (!audioContextRef.current) audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
            audioContextRef.current.resume();
            setIsPlaying(true); nextNoteTimeRef.current = audioContextRef.current.currentTime + 0.05; scheduler();
        }
    };

    return (
        <div className="flex flex-col items-center justify-center h-full p-6 text-center animate-fadeIn">
            <h2 className="text-2xl font-bold text-white mb-8">Métronome</h2>
            <div className="mb-10 relative">
                <div className="w-48 h-48 rounded-full border-4 border-slate-700 flex items-center justify-center bg-slate-800"><span className="text-6xl font-bold font-mono text-amber-500">{bpm}</span></div>
                {isPlaying && <div className="absolute inset-0 rounded-full border-4 border-amber-500 animate-ping opacity-20"></div>}
            </div>
            <div className="flex gap-4 mb-10">
                <button onClick={() => setBpm(b => b - 5)} className="w-12 h-12 rounded-full bg-slate-800 border border-slate-600 font-bold">-5</button>
                <button onClick={() => setBpm(b => b + 5)} className="w-12 h-12 rounded-full bg-slate-800 border border-slate-600 font-bold">+5</button>
            </div>
            <button onClick={togglePlay} className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${isPlaying ? 'bg-amber-600' : 'bg-amber-500'}`}>
                {isPlaying ? <Square fill="currentColor" size={32} className="text-slate-900" /> : <Play fill="currentColor" className="ml-2 text-slate-900" size={40} />}
            </button>
        </div>
    );
};

const Tuner = () => {
    const [listening, setListening] = useState(false);
    const [displayPitch, setDisplayPitch] = useState<{ note: string; cents: number; freq: number } | null>(null);
    const [closestString, setClosestString] = useState<string | null>(null);
    
    // Logic Refs
    const audioContextRef = useRef<AudioContext | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const requestRef = useRef<number | null>(null);

    // Smoothing Refs
    const centsBufferRef = useRef<number[]>([]);
    const lastNoteRef = useRef<string | null>(null);
    const stabilityCounterRef = useRef<number>(0);
    const silenceCounterRef = useRef<number>(0);

    useEffect(() => {
        return () => stopTuner();
    }, []);

    const startTuner = async () => {
        try {
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            const ctx = new AudioContextClass();
            audioContextRef.current = ctx;

            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: { 
                    echoCancellation: false, 
                    autoGainControl: false, 
                    noiseSuppression: false 
                } 
            });

            streamRef.current = stream;
            const source = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 4096;
            analyser.smoothingTimeConstant = 0.8; // Hardware smoothing
            source.connect(analyser);
            analyserRef.current = analyser;

            setListening(true);
            
            // Reset state
            centsBufferRef.current = [];
            lastNoteRef.current = null;
            stabilityCounterRef.current = 0;
            silenceCounterRef.current = 0;

            detectPitch();
        } catch (err) {
            console.error("Microphone error", err);
            alert("Accès micro refusé ou impossible.");
        }
    };

    const stopTuner = () => {
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
        // Libère réellement le micro (sinon l'indicateur d'enregistrement reste allumé)
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        analyserRef.current = null;
        if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }
        setListening(false);
        setDisplayPitch(null);
        setClosestString(null);
    };

    const detectPitch = () => {
        if (!analyserRef.current || !audioContextRef.current) return;

        const buffer = new Float32Array(analyserRef.current.fftSize);
        analyserRef.current.getFloatTimeDomainData(buffer);
        const freq = autoCorrelate(buffer, audioContextRef.current.sampleRate);

        if (freq && freq > 50) { // Valid freq floor
            silenceCounterRef.current = 0;

            // 1. Identify Target String
            let best = TUNER_STRINGS[0];
            let minDiff = Math.abs(freq - best.freq);
            
            for(const s of TUNER_STRINGS) {
                const diff = Math.abs(freq - s.freq);
                if(diff < minDiff) {
                    minDiff = diff;
                    best = s;
                }
            }

            // 2. Calculate Raw Cents relative to that string
            const ratio = freq / best.freq;
            const rawCents = 1200 * Math.log2(ratio);

            // 3. Stabilization Logic
            
            // NOTE LOCKING: Avoid switching strings on glitch
            if (lastNoteRef.current !== best.note) {
                stabilityCounterRef.current++;
                if (stabilityCounterRef.current < 10) {
                     // Keep previous state if new note hasn't stabilized for 10 frames
                     requestRef.current = requestAnimationFrame(detectPitch);
                     return; 
                }
                // Stabilized on new note
                lastNoteRef.current = best.note;
                stabilityCounterRef.current = 0;
                centsBufferRef.current = []; // Reset buffer for new note
            } else {
                stabilityCounterRef.current = 0; // Reset counter if consistent
            }

            // ROLLING AVERAGE for Cents (Needle Smoothing)
            centsBufferRef.current.push(rawCents);
            if (centsBufferRef.current.length > 8) centsBufferRef.current.shift();
            
            const smoothedCents = centsBufferRef.current.reduce((a, b) => a + b, 0) / centsBufferRef.current.length;

            setClosestString(best.note);
            setDisplayPitch({ 
                note: best.note, 
                cents: smoothedCents, 
                freq 
            });

        } else {
            // Silence Handling
            silenceCounterRef.current++;
            if (silenceCounterRef.current > 30) { // ~0.5s of silence resets UI
                setDisplayPitch(null);
                setClosestString(null);
                centsBufferRef.current = [];
            }
        }

        requestRef.current = requestAnimationFrame(detectPitch);
    };

    // Helper to determine display state based on SMOOTHED pitch
    const isTuned = displayPitch && Math.abs(displayPitch.cents) < 5;
    const isClose = displayPitch && Math.abs(displayPitch.cents) < 15;
    const needleRotation = displayPitch ? Math.max(-45, Math.min(45, displayPitch.cents)) : 0;

    return (
        <div className="flex flex-col items-center h-full p-6 text-center animate-fadeIn relative">
            <h2 className="text-xl font-bold text-white mb-4">Accordeur Chromatique</h2>
            
            {/* Tuner Gauge */}
            <div className="relative w-64 h-32 mt-4 mb-8 overflow-hidden">
                {/* Arc Background */}
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-64 h-32 bg-slate-800 rounded-t-full border-4 border-slate-700 border-b-0"></div>
                
                {/* Tick Marks */}
                <div className="absolute bottom-0 left-1/2 w-1 h-4 bg-green-500/50 -translate-x-1/2"></div>
                <div className="absolute bottom-0 left-1/2 w-1 h-3 bg-slate-500 origin-bottom transform -rotate-12"></div>
                <div className="absolute bottom-0 left-1/2 w-1 h-3 bg-slate-500 origin-bottom transform rotate-12"></div>
                <div className="absolute bottom-0 left-1/2 w-1 h-3 bg-slate-500 origin-bottom transform -rotate-[25deg]"></div>
                <div className="absolute bottom-0 left-1/2 w-1 h-3 bg-slate-500 origin-bottom transform rotate-[25deg]"></div>

                {/* Needle */}
                <div 
                    className={`absolute bottom-0 left-1/2 w-1.5 h-28 origin-bottom rounded-full transition-transform duration-200 ease-out z-10 ${isTuned ? 'bg-green-400 shadow-[0_0_15px_#4ade80]' : isClose ? 'bg-amber-400' : 'bg-red-500'}`}
                    style={{ transform: `translateX(-50%) rotate(${needleRotation}deg)` }}
                ></div>
                
                {/* Pivot */}
                <div className="absolute bottom-[-10px] left-1/2 -translate-x-1/2 w-8 h-8 bg-slate-900 rounded-full border-4 border-slate-700 z-20"></div>
            </div>

            {/* Note Display */}
            <div className="mb-8 h-32 flex flex-col justify-center">
                 {displayPitch ? (
                    <div className="flex flex-col items-center">
                        <div className={`text-6xl font-black transition-colors duration-300 ${isTuned ? 'text-green-400' : isClose ? 'text-amber-400' : 'text-slate-200'}`}>
                            {closestString || displayPitch.note}
                        </div>
                        <div className={`text-sm font-bold uppercase mt-2 px-3 py-1 rounded-full transition-colors duration-300 ${isTuned ? 'bg-green-500/20 text-green-400' : isClose ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400'}`}>
                            {isTuned ? "ACCORDÉ" : displayPitch.cents > 5 ? "DESSERRER ▼" : displayPitch.cents < -5 ? "SERRER ▲" : "ACCORDÉ"}
                        </div>
                        <div className="text-slate-500 text-xs mt-1 font-mono">{displayPitch.freq.toFixed(1)} Hz</div>
                    </div>
                 ) : (
                    <div className="text-slate-500 text-lg font-medium animate-pulse">
                        {listening ? "Jouez une corde..." : "--"}
                    </div>
                 )}
            </div>

            {/* String Indicators */}
            <div className="flex justify-between w-full max-w-md mt-auto mb-8">
                {TUNER_STRINGS.map(s => {
                    const isActive = closestString === s.note;
                    return (
                        <div key={s.note} className={`flex flex-col items-center transition-all duration-300 ${isActive ? 'scale-110 opacity-100' : 'opacity-40 scale-95'}`}>
                            <span className={`font-bold text-lg mb-2 ${isActive ? 'text-white' : 'text-slate-500'}`}>{s.note}</span>
                            <div 
                                className={`w-2 rounded-full transition-all duration-300 ${isActive ? 'h-24 shadow-[0_0_15px_currentColor]' : 'h-16'}`} 
                                style={{backgroundColor: s.color, color: s.color}}
                            ></div>
                            {isActive && <span className="text-[10px] text-white mt-2 font-bold bg-slate-800 px-2 rounded">{s.name}</span>}
                        </div>
                    );
                })}
            </div>

            {/* Control Button */}
            {!listening ? (
                <button 
                    onClick={startTuner}
                    className="bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold py-4 px-12 rounded-full shadow-[0_0_30px_rgba(245,158,11,0.3)] transition-all transform hover:scale-105 flex items-center gap-3"
                >
                    <Power size={24} /> ACTIVER
                </button>
            ) : (
                <button 
                    onClick={stopTuner}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-3 px-8 rounded-full border border-slate-600 transition-all"
                >
                    Arrêter
                </button>
            )}
        </div>
    );
};

const Library: React.FC<{userLevel: UserLevel}> = ({ userLevel }) => {
    const [query, setQuery] = useState('');
    const [result, setResult] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleSearch = async () => {
        if (!query.trim()) return;
        setLoading(true);
        try {
            const content = await generateLessonContent(`Explique : ${query}. Donne un diagramme si pertinent.`, userLevel);
            setResult(content);
        } catch (e) { setResult("Erreur."); } finally { setLoading(false); }
    };

    return (
        <div className="flex flex-col h-full p-6">
            <h2 className="text-xl font-bold text-white mb-2">Bibliothèque IA</h2>
            <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/50 flex gap-2 mb-6">
                <Info size={16} className="flex-shrink-0 text-blue-400 mt-0.5" />
                <p className="text-slate-400 text-xs leading-relaxed">
                     <span className="text-slate-300 font-bold">Ici, l'IA génère des fiches de cours</span> (Théorie, Histoire).
                     <br/>Pour discuter, allez voir le <span className="text-amber-500 font-bold">Coach</span>.
                </p>
            </div>
            <div className="relative mb-4">
                <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()} placeholder="Rechercher (ex: Gamme Blues)..." className="w-full bg-slate-800 border border-slate-700 rounded-xl py-3 pl-10 text-white" />
                <Search className="absolute left-3 top-3.5 text-slate-500" size={18} />
            </div>
            <button onClick={handleSearch} disabled={loading} className="w-full bg-slate-700 text-white font-medium py-3 rounded-xl mb-4">
                {loading ? <Loader2 className="animate-spin mx-auto"/> : "Générer la fiche"}
            </button>
            <div className="flex-1 overflow-y-auto bg-slate-800/30 rounded-xl p-4 border border-slate-700/50">
                {result ? (
                    <div className="prose prose-invert prose-sm max-w-none">
                         <ReactMarkdown components={{
                            p: ({ children }) => {
                                if (typeof children === 'string') {
                                    const match = children.trim().match(/^\[([a-zA-Z0-9#]+)\]$/);
                                    if (match) return <ChordDiagram chordName={match[1]} />;
                                }
                                return <p className="mb-4 text-slate-300">{children}</p>;
                            },
                            h1: ({node, ...props}) => <h1 className="text-xl font-black text-white mb-2 border-b border-slate-600 pb-2" {...props} />,
                            h2: ({node, ...props}) => <h2 className="text-lg font-bold text-amber-400 mt-4 mb-2" {...props} />,
                            li: ({node, ...props}) => <li className="text-slate-300 ml-4 list-disc" {...props} />
                         }}>
                             {result}
                         </ReactMarkdown>
                    </div>
                ) : <div className="text-center text-slate-600 mt-10"><Music size={40} className="mx-auto mb-2 opacity-20" /><p>Encyclopédie vide.</p></div>}
            </div>
        </div>
    );
};

export default Tools;
