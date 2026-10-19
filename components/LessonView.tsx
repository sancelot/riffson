import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Lesson, InteractiveExercise, MIMMode, FretboardPosition, PluckFinger } from '../types';
import { ArrowLeft, Mic, Eye, CheckCircle, Hand } from 'lucide-react';
import { CHORD_NAMES_FR, FINGER_NAMES, PLUCK_FINGERS, STRING_NAMES_FR } from '../constants';
import ReactMarkdown from 'react-markdown';
import { autoCorrelate, getFrequencyFromPosition, getNoteNameFr, getPositionFromFrequency, GuitarSynth } from '../utils/audio';
import Fretboard from './Fretboard';
import ChordDiagram from './ChordDiagram';

interface LessonViewProps {
  lesson: Lesson;
  onBack: () => void;
  onComplete: (lessonId: string, score: number) => void;
}

interface TargetNote extends FretboardPosition {
    freq: number;
    duration: number; // en temps
    finger?: number;
    pluck?: PluckFinger;
}

/** Consigne complète d'une note : quelle corde, quelle case, avec quels doigts. */
const describeNote = (n: TargetNote): string => {
    const where = `corde ${n.string} (${STRING_NAMES_FR[n.string]})`;
    const left = n.fret === 0
        ? 'à vide, la main gauche ne presse rien'
        : `case ${n.fret}${n.finger ? `, ${FINGER_NAMES[n.finger]} gauche` : ''}`;
    const right = n.pluck ? ` · main droite : ${PLUCK_FINGERS[n.pluck]}` : '';
    return `${where}, ${left}${right}`;
};

const MATCH_CENTS = 50;
const SEQUENCE_HOLD_SEC = 0.12; // durée minimale de détection d'une note de séquence

const WRONG_NOTE_SEC = 0.15; // durée d'une hauteur erronée stable avant de la compter comme fausse note
const POINTS_PER_MISTAKE = 10;
const MIN_SCORE = 40;

const scoreFromMistakes = (mistakes: number) => Math.max(MIN_SCORE, 100 - mistakes * POINTS_PER_MISTAKE);

const INITIAL_DETECTION = {
    index: 0, hold: 0, lastTime: 0,
    needsAttack: false, peakRms: 0, minRms: 0, dipped: false,
    mistakes: 0, wrongTime: 0, wrongPitch: 1,
};

const isSamePitch =(a: number, b: number) => Math.abs(1200 * Math.log2(a / b)) < MATCH_CENTS;

/** Notes à jouer : la séquence si elle existe, sinon la note cible unique. */
const buildTargets = (exercise: InteractiveExercise): TargetNote[] => {
    const sequence = (exercise.sequence || [])
        .filter(n => n.fret >= 0)
        .map(n => ({ string: n.string, fret: n.fret, duration: n.duration || 1.0, finger: n.finger, pluck: n.pluck, freq: getFrequencyFromPosition(n.string, n.fret) }))
        .filter(n => n.freq > 0);
    if (sequence.length > 0) return sequence;
    const posFreq = exercise.targetString ? getFrequencyFromPosition(exercise.targetString, exercise.targetFret ?? 0) : -1;
    return [{
        string: exercise.targetString || 0,
        fret: exercise.targetFret ?? 0,
        duration: 1.0,
        finger: exercise.finger,
        // La position (corde/case) fait foi : la fréquence fournie par l'IA peut être incohérente
        freq: posFreq > 0 ? posFreq : exercise.targetFrequency,
    }];
};

const InteractivePractice: React.FC<{ exercise: InteractiveExercise, onSuccess: (score: number) => void }> = ({ exercise, onSuccess }) => {
    const targets = useMemo(() => buildTargets(exercise), [exercise]);
    const isSequence = targets.length > 1;
    const tempo = exercise.tempo || 100;
    const holdSec = isSequence ? SEQUENCE_HOLD_SEC : Math.min(Math.max(exercise.duration_sec || 1, 0.3), 2);

    const [mimMode, setMimMode] = useState<MIMMode>('demo');
    const [demoPhase, setDemoPhase] = useState<'idle' | 'setup' | 'playing'>('idle');
    const [activeSequenceNote, setActiveSequenceNote] = useState<FretboardPosition | null>(null);
    const [noteIndex, setNoteIndex] = useState(0);
    const [progress, setProgress] = useState(0);
    const [feedback, setFeedback] = useState<{ isMatch: boolean, position: FretboardPosition | null }>({ isMatch: false, position: null });
    const [status, setStatus] = useState<'idle' | 'listening' | 'success'>('idle');
    const [micError, setMicError] = useState<string | null>(null);
    const [mistakes, setMistakes] = useState(0);

    const audioContextRef = useRef<AudioContext | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const requestRef = useRef<number | null>(null);
    const successTimerRef = useRef<number | null>(null);
    const onSuccessRef = useRef(onSuccess);
    onSuccessRef.current = onSuccess;

    // État de la détection (refs : lu dans la boucle requestAnimationFrame)
    const detRef = useRef({ ...INITIAL_DETECTION });

    // DÉMO : joue la séquence au bon tempo et anime le manche, en boucle
    useEffect(() => {
        if (mimMode !== 'demo') return;
        const timers: number[] = [];
        const later = (fn: () => void, ms: number) => { timers.push(window.setTimeout(fn, ms)); };

        const playDemo = () => {
            setDemoPhase('setup');
            setActiveSequenceNote(null);
            later(() => {
                setDemoPhase('playing');
                const beatMs = 60000 / tempo;
                const totalSec = GuitarSynth.playMelody(targets, tempo);
                let t = 50; // playMelody démarre avec 50 ms d'avance
                targets.forEach(note => {
                    later(() => setActiveSequenceNote(note), t);
                    t += note.duration * beatMs;
                });
                later(() => setActiveSequenceNote(null), totalSec * 1000 + 50);
                later(playDemo, totalSec * 1000 + 2500);
            }, 1500);
        };
        playDemo();

        return () => {
            timers.forEach(clearTimeout);
            GuitarSynth.stopAll();
        };
    }, [mimMode, targets, tempo]);

    const stopListening = () => {
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
        requestRef.current = null;
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        audioContextRef.current?.close();
        audioContextRef.current = null;
        analyserRef.current = null;
    };

    // Libère micro, boucle et minuteries quand on quitte l'exercice
    useEffect(() => () => {
        stopListening();
        if (successTimerRef.current) clearTimeout(successTimerRef.current);
    }, []);

    const detectPitch = (time: number) => {
        const analyser = analyserRef.current;
        const ctx = audioContextRef.current;
        if (!analyser || !ctx) return;
        const det = detRef.current;
        const dt = Math.min((time - det.lastTime) / 1000, 0.1);
        det.lastTime = time;

        const buffer = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(buffer);
        let rms = 0;
        for (let i = 0; i < buffer.length; i++) rms += buffer[i] * buffer[i];
        rms = Math.sqrt(rms / buffer.length);
        const freq = autoCorrelate(buffer, ctx.sampleRate);

        const target = targets[det.index];
        const isMatch = freq > 50 && isSamePitch(freq, target.freq);

        // Deux notes identiques consécutives : il faut une nouvelle attaque (re-pincer la corde)
        if (det.needsAttack) {
            if (!isMatch) {
                det.needsAttack = false;
            } else {
                det.minRms = Math.min(det.minRms, rms);
                if (rms < det.peakRms * 0.6) det.dipped = true;
                if (det.dipped && rms > det.minRms * 1.4) det.needsAttack = false;
            }
        }

        if (freq > 50) {
            setFeedback({ isMatch, position: getPositionFromFrequency(freq, target.string || undefined) });
        }

        if (isMatch) det.wrongTime = 0;
        if (isMatch && !det.needsAttack) {
            det.hold += dt;
            if (det.hold >= holdSec) {
                det.index += 1;
                det.hold = 0;
                if (det.index >= targets.length) {
                    setProgress(100);
                    handleSuccess();
                    return;
                }
                setNoteIndex(det.index);
                if (isSamePitch(targets[det.index].freq, target.freq)) {
                    det.needsAttack = true;
                    det.peakRms = rms;
                    det.minRms = rms;
                    det.dipped = false;
                }
            }
        } else if (!isMatch) {
            det.hold = Math.max(0, det.hold - dt * 0.5);
            // Fausse note : hauteur stable différente de la cible, comptée une fois par note jouée
            // (une note de l'exercice qui résonne encore n'est pas une fausse note)
            const isExerciseNote = targets.some(t => isSamePitch(freq, t.freq));
            if (freq > 50 && !isExerciseNote && !isSamePitch(freq, det.wrongPitch)) {
                det.wrongTime += dt;
                if (det.wrongTime >= WRONG_NOTE_SEC) {
                    det.mistakes += 1;
                    det.wrongPitch = freq;
                    det.wrongTime = 0;
                    setMistakes(det.mistakes);
                }
            } else if (freq <= 50) {
                det.wrongTime = 0;
                det.wrongPitch = 1;
            }
        }

        setProgress(((det.index + Math.min(det.hold / holdSec, 1)) / targets.length) * 100);
        requestRef.current = requestAnimationFrame(detectPitch);
    };

    const startListening = async () => {
        setMicError(null);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            streamRef.current = stream;
            audioContextRef.current = ctx;
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 2048;
            ctx.createMediaStreamSource(stream).connect(analyser);
            analyserRef.current = analyser;

            detRef.current = { ...INITIAL_DETECTION, lastTime: performance.now() };
            setNoteIndex(0);
            setMistakes(0);
            setProgress(0);
            setFeedback({ isMatch: false, position: null });
            setMimMode('practice');
            setStatus('listening');
            requestRef.current = requestAnimationFrame(detectPitch);
        } catch (e) {
            console.error(e);
            stopListening();
            setMicError("Impossible d'accéder au microphone. Vérifiez l'autorisation dans le navigateur.");
        }
    };

    const backToDemo = () => {
        stopListening();
        setStatus('idle');
        setFeedback({ isMatch: false, position: null });
        setMimMode('demo');
    };

    const handleSuccess = () => {
        stopListening();
        setStatus('success');
        successTimerRef.current = window.setTimeout(() => onSuccessRef.current(scoreFromMistakes(detRef.current.mistakes)), 1500);
    };

    const currentTarget = targets[noteIndex] || targets[targets.length - 1];
    // Note mise en avant : celle jouée par la démo, ou celle attendue en pratique
    const demoIndex = activeSequenceNote ? targets.indexOf(activeSequenceNote as TargetNote) : -1;
    const shownIndex = mimMode === 'demo' ? demoIndex : noteIndex;
    const shownNote = mimMode === 'demo' ? (demoIndex >= 0 ? targets[demoIndex] : targets[0]) : currentTarget;
    const hasHandGuide = exercise.leftHand || exercise.rightHand || exercise.chord;

    return (
        <div className="flex flex-col h-full bg-slate-950">
            <div className="p-4 bg-slate-900 shrink-0">
                <h2 className="text-white font-bold">{exercise.songTitle ? `${exercise.songTitle} - ` : ''}{exercise.prompt}</h2>
                {exercise.contextExplanation && <p className="text-slate-400 text-sm mt-1">{exercise.contextExplanation}</p>}
            </div>
            {/* Le contenu défile s'il dépasse, au lieu d'être écrasé (centré seulement s'il tient) */}
            <div className="flex-1 overflow-y-auto p-4">
              <div className="min-h-full flex flex-col items-center justify-center">
                {hasHandGuide && (
                    <div className="w-full grid sm:grid-cols-2 gap-3 mb-4">
                        <div className="bg-slate-900 border border-slate-700 rounded-xl p-3">
                            <p className="text-xs font-bold uppercase tracking-widest text-amber-400 flex items-center gap-1 mb-1"><Hand size={14} className="-scale-x-100" /> Main gauche (sur le manche)</p>
                            <p className="text-sm text-slate-300">{exercise.leftHand || (exercise.chord ? `Gardez la forme de l'accord ${exercise.chord}${CHORD_NAMES_FR[exercise.chord] ? ` (${CHORD_NAMES_FR[exercise.chord]})` : ''}, en pointillés sur le manche.` : '')}</p>
                        </div>
                        <div className="bg-slate-900 border border-slate-700 rounded-xl p-3">
                            <p className="text-xs font-bold uppercase tracking-widest text-amber-400 flex items-center gap-1 mb-1"><Hand size={14} /> Main droite (au-dessus de la rosace)</p>
                            <p className="text-sm text-slate-300">{exercise.rightHand || 'Pincez la corde indiquée.'}</p>
                        </div>
                    </div>
                )}
                <Fretboard
                    targetString={shownNote.string}
                    targetFret={shownNote.fret}
                    finger={shownNote.finger}
                    chord={exercise.chord}
                    demoPhase={demoPhase}
                    maxFret={Math.max(...targets.map(t => t.fret))}
                    activeSequenceNote={mimMode === 'demo' ? activeSequenceNote : null}
                    isPlaying={feedback.isMatch}
                    detectedPosition={mimMode === 'practice' ? feedback.position : null}
                    isSuccess={status === 'success'}
                />

                {isSequence && (
                    <div className="mt-6 flex flex-wrap gap-2 justify-center">
                        {targets.map((n, i) => {
                            const done = status === 'success' || (mimMode === 'practice' && i < noteIndex);
                            const current = status !== 'success' && i === shownIndex;
                            return (
                                <div key={i} title={describeNote(n)} className={`px-2 py-1 rounded-md text-xs border text-center ${done ? 'bg-green-500/20 border-green-500 text-green-300' : current ? 'bg-amber-500 border-white text-slate-900 font-black' : 'bg-slate-900 border-slate-700 text-slate-400'}`}>
                                    <div className="font-bold">{getNoteNameFr(n.string, n.fret)}</div>
                                    <div className="font-mono text-[10px]">corde {n.string} · {n.fret === 0 ? 'à vide' : `case ${n.fret}`}</div>
                                    {n.pluck && <div className="text-[10px]">{PLUCK_FINGERS[n.pluck]}</div>}
                                </div>
                            );
                        })}
                    </div>
                )}

                <div className="mt-6 text-center">
                    {status === 'success' ? (
                        <div className="text-green-400 font-black uppercase tracking-widest flex items-center gap-2"><CheckCircle /> Bravo ! Score {scoreFromMistakes(mistakes)}%</div>
                    ) : mimMode === 'demo' ? (
                        <div>
                            <div className="animate-pulse text-amber-500 font-bold uppercase tracking-widest">
                                {demoPhase === 'playing' ? 'Écoutez et regardez...' : 'Regardez le manche...'}
                            </div>
                            {demoPhase === 'playing' && demoIndex >= 0 && (
                                <p className="text-slate-300 text-sm mt-2">{getNoteNameFr(shownNote.string, shownNote.fret)} : {describeNote(shownNote)}</p>
                            )}
                        </div>
                    ) : (
                        <div>
                            <div className="text-white font-bold">
                                {isSequence ? `Note ${noteIndex + 1} / ${targets.length} : ${getNoteNameFr(currentTarget.string, currentTarget.fret)}` : 'À vous de jouer !'}
                            </div>
                            <p className="text-slate-300 text-sm mt-1">{describeNote(currentTarget)}</p>
                        </div>
                    )}
                    {mimMode === 'practice' && status !== 'success' && mistakes > 0 && (
                        <p className="text-amber-400 text-xs mt-2">{mistakes} fausse{mistakes > 1 ? 's' : ''} note{mistakes > 1 ? 's' : ''}</p>
                    )}
                    {micError && <p className="text-red-400 text-sm mt-3">{micError}</p>}
                </div>
              </div>
            </div>
            <div className="h-4 bg-slate-800 w-full shrink-0">
                <div className="h-full bg-green-500 transition-all duration-100" style={{ width: `${progress}%` }} />
            </div>
            <div className="p-6 bg-slate-900 flex justify-center shrink-0">
                {status === 'success' ? null : mimMode === 'demo' ? (
                    <button onClick={startListening} className="bg-amber-500 text-slate-900 font-black py-4 px-12 rounded-2xl flex items-center gap-2">
                        <Mic size={24} /> JE SUIS PRÊT
                    </button>
                ) : (
                    <button onClick={backToDemo} className="bg-slate-700 text-white font-bold py-4 px-12 rounded-2xl flex items-center gap-2">
                        <Eye size={24} /> REVOIR LA DÉMO
                    </button>
                )}
            </div>
        </div>
    );
};

const LessonView: React.FC<LessonViewProps> = ({ lesson, onBack, onComplete }) => {
  // -1 = théorie de la leçon, puis index de l'exercice
  const [step, setStep] = useState(-1);
  const exercises = lesson.exercises || [];
  const exercise = step >= 0 ? exercises[step] : undefined;
  const [scores, setScores] = useState<number[]>([]);

  // Score de la leçon = moyenne des exercices (sert à la maîtrise et aux révisions)
  const handleExerciseSuccess = (score: number) => {
    const allScores = [...scores, score];
    setScores(allScores);
    if (step < exercises.length - 1) setStep(step + 1);
    else onComplete(lesson.id, Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length));
  };

  return (
    <div className="h-full flex flex-col bg-slate-950 absolute inset-0 z-50">
        <div className="bg-slate-900 p-4 flex items-center justify-between border-b border-slate-800">
            <button onClick={onBack} className="p-2 text-slate-400 hover:text-white" aria-label="Retour"><ArrowLeft /></button>
            <h1 className="text-white font-bold">{lesson.title}</h1>
            <div className="w-8 text-xs text-slate-500 text-right">{exercise ? `${step + 1}/${exercises.length}` : ''}</div>
        </div>
        <div className="flex-1 overflow-hidden">
            {exercise ? (
                <InteractivePractice key={exercise.id || step} exercise={exercise} onSuccess={handleExerciseSuccess} />
            ) : (
                <div className="p-6 prose prose-invert max-w-none h-full overflow-y-auto pb-32">
                    <ReactMarkdown components={{
                        p: ({children}) => {
                            if (typeof children === 'string' && children.trim().match(/^\[[a-zA-Z0-9#]+\]$/)) return <ChordDiagram chordName={children.trim()} />;
                            return <p>{children}</p>;
                        }
                    }}>{lesson.content}</ReactMarkdown>
                    {exercises.length > 0 ? (
                        <button onClick={() => setStep(0)} className="w-full bg-amber-500 text-slate-900 font-bold py-4 rounded-xl mt-8">
                            PASSER À LA PRATIQUE ({exercises.length} exercice{exercises.length > 1 ? 's' : ''})
                        </button>
                    ) : (
                        <button onClick={() => onComplete(lesson.id, 100)} className="w-full bg-amber-500 text-slate-900 font-bold py-4 rounded-xl mt-8">TERMINER</button>
                    )}
                </div>
            )}
        </div>
    </div>
  );
};

export default LessonView;
