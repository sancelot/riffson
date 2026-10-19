import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Lesson, InteractiveExercise, MIMMode, FretboardPosition, PluckFinger } from '../types';
import { ArrowLeft, Mic, Eye, CheckCircle, Hand, Target, RotateCcw, PlayCircle } from 'lucide-react';
import { CHORD_NAMES_FR, FINGER_NAMES, PLUCK_FINGERS, STRING_NAMES_FR } from '../constants';
import ReactMarkdown from 'react-markdown';
import { autoCorrelate, getFrequencyFromPosition, getNoteNameFr, getPositionFromFrequency, GuitarSynth } from '../utils/audio';
import Fretboard from './Fretboard';
import ChordDiagram from './ChordDiagram';
import RiffPlayer from './RiffPlayer';

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
    lyric?: string;
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
        .map(n => ({ string: n.string, fret: n.fret, duration: n.duration || 1.0, finger: n.finger, pluck: n.pluck, lyric: n.lyric, freq: getFrequencyFromPosition(n.string, n.fret) }))
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
        let frame: number | null = null;

        const playDemo = () => {
            setDemoPhase('setup');
            setActiveSequenceNote(null);
            later(() => {
                setDemoPhase('playing');
                const { noteTimes, startTime, duration } = GuitarSynth.playMelody(targets, tempo);
                const endTime = startTime + duration;
                // La note affichée suit l'horloge audio : toujours en phase avec le son,
                // même au premier lancement où l'audio démarre avec un léger retard
                let shown = -1;
                const follow = () => {
                    const now = GuitarSynth.currentTime;
                    if (now >= endTime) {
                        setActiveSequenceNote(null);
                        later(playDemo, 2500);
                        return;
                    }
                    let index = -1;
                    while (index + 1 < noteTimes.length && noteTimes[index + 1] <= now) index++;
                    if (index !== shown) {
                        shown = index;
                        setActiveSequenceNote(index >= 0 ? targets[index] : null);
                    }
                    frame = requestAnimationFrame(follow);
                };
                frame = requestAnimationFrame(follow);
            }, 1500);
        };
        playDemo();

        return () => {
            timers.forEach(clearTimeout);
            if (frame) cancelAnimationFrame(frame);
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
                                    {n.lyric && <div className="italic text-[11px] mb-0.5">« {n.lyric} »</div>}
                                    <div className="font-bold">{getNoteNameFr(n.string, n.fret)}</div>
                                    <div className="font-mono text-[10px]">corde {n.string} · {n.fret === 0 ? 'à vide' : `case ${n.fret}`}</div>
                                    {n.fret > 0 && n.finger && <div className="text-[10px]">main g. : {FINGER_NAMES[n.finger]}</div>}
                                    {n.pluck && <div className="text-[10px]">main d. : {PLUCK_FINGERS[n.pluck]}</div>}
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

type LessonStage =
  | { kind: 'intro' }
  | { kind: 'exercise', index: number }
  | { kind: 'stepDone', index: number, score: number }
  | { kind: 'recap' };

const averageScore = (scores: number[]) => scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 100;

const markdownComponents = {
    p: ({ children }: { children?: React.ReactNode }) => {
        if (typeof children === 'string' && children.trim().match(/^\[[a-zA-Z0-9#]+\]$/)) return <ChordDiagram chordName={children.trim()} />;
        return <p>{children}</p>;
    }
};

const LessonView: React.FC<LessonViewProps> = ({ lesson, onBack, onComplete }) => {
  const [stage, setStage] = useState<LessonStage>({ kind: 'intro' });
  const exercises = lesson.exercises || [];
  // Meilleur score par étape (une étape refaite remplace l'ancien score)
  const [scores, setScores] = useState<Record<number, number>>({});
  const lessonScore = averageScore(Object.values(scores));

  const handleExerciseSuccess = (index: number, score: number) => {
    setScores(prev => ({ ...prev, [index]: Math.max(prev[index] ?? 0, score) }));
    setStage(index < exercises.length - 1 ? { kind: 'stepDone', index, score } : { kind: 'recap' });
  };

  const headerRight = stage.kind === 'exercise' || stage.kind === 'stepDone'
    ? `Étape ${stage.index + 1}/${exercises.length}`
    : '';

  // Le morceau visé : écouté avant de commencer, rejoué au bilan
  const renderGoal = (heading: string) => lesson.goal && (
    <div className="not-prose my-4 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4">
      <p className="text-amber-400 font-bold flex items-center gap-2"><Target size={18} /> {heading}</p>
      <RiffPlayer title={lesson.goal.title} description={lesson.goal.description} sequence={lesson.goal.sequence} tempo={lesson.goal.tempo} />
    </div>
  );

  const renderBody = () => {
    switch (stage.kind) {
      case 'exercise': {
        const exercise = exercises[stage.index];
        return <InteractivePractice key={`${exercise.id}-${stage.index}`} exercise={exercise} onSuccess={(score) => handleExerciseSuccess(stage.index, score)} />;
      }

      case 'stepDone': {
        const next = exercises[stage.index + 1];
        return (
          <div className="h-full overflow-y-auto p-6 flex flex-col items-center justify-center text-center gap-4">
            <CheckCircle size={56} className="text-green-400" />
            <h2 className="text-2xl font-black text-white">Étape {stage.index + 1} réussie ! ({stage.score}%)</h2>
            <p className="text-slate-300 max-w-lg">Étape suivante : <span className="font-bold text-white">{next.prompt}</span></p>
            {next.contextExplanation && <p className="text-slate-400 text-sm max-w-lg">{next.contextExplanation}</p>}
            <div className="flex gap-3 mt-2">
              <button onClick={() => setStage({ kind: 'exercise', index: stage.index })} className="bg-slate-700 text-white font-bold py-3 px-6 rounded-xl flex items-center gap-2">
                <RotateCcw size={18} /> Refaire
              </button>
              <button onClick={() => setStage({ kind: 'exercise', index: stage.index + 1 })} className="bg-amber-500 text-slate-900 font-black py-3 px-6 rounded-xl">
                Continuer
              </button>
            </div>
          </div>
        );
      }

      case 'recap':
        return (
          <div className="p-6 h-full overflow-y-auto pb-32 max-w-3xl mx-auto">
            <div className="text-center mb-4">
              <div className="text-5xl mb-2">🎸</div>
              <h2 className="text-2xl font-black text-white">
                {lesson.goal ? `Vous venez de jouer ${lesson.goal.title} !` : 'Leçon terminée !'}
              </h2>
              <p className="text-slate-400">Score de la leçon : {lessonScore}%</p>
            </div>
            {renderGoal('Réécoutez ce que vous savez maintenant jouer')}
            {lesson.recap && lesson.recap.length > 0 && (
              <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4 my-4">
                <p className="text-xs font-bold uppercase tracking-widest text-amber-400 mb-2">Ce que vous avez appris</p>
                <ul className="space-y-1 text-slate-300 text-sm list-disc pl-5">
                  {lesson.recap.map((item, i) => <li key={i}>{item}</li>)}
                </ul>
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => setStage({ kind: 'exercise', index: exercises.length - 1 })} className="flex-1 bg-slate-700 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2">
                <RotateCcw size={18} /> Rejouer le morceau
              </button>
              <button onClick={() => onComplete(lesson.id, lessonScore)} className="flex-1 bg-amber-500 text-slate-900 font-black py-4 rounded-xl">
                TERMINER LA LEÇON
              </button>
            </div>
          </div>
        );

      default:
        return (
          <div className="p-6 prose prose-invert max-w-none h-full overflow-y-auto pb-32">
            {renderGoal('À la fin de cette leçon, vous saurez jouer :')}
            <ReactMarkdown components={markdownComponents}>{lesson.content}</ReactMarkdown>
            {exercises.length > 1 && (
              <div className="not-prose bg-slate-900 border border-slate-700 rounded-2xl p-4 mt-6">
                <p className="text-xs font-bold uppercase tracking-widest text-amber-400 mb-1">Votre parcours, étape par étape</p>
                <p className="text-xs text-slate-500 mb-2">Commencez par l'étape 1, ou cliquez sur celle de votre choix.</p>
                <ol className="space-y-1">
                  {exercises.map((ex, i) => (
                    <li key={ex.id || i}>
                      <button
                        onClick={() => setStage({ kind: 'exercise', index: i })}
                        className="w-full flex gap-3 items-center text-left text-sm text-slate-300 rounded-lg px-2 py-1.5 hover:bg-slate-800 hover:text-white transition-colors"
                      >
                        <span className={`shrink-0 w-6 h-6 rounded-full border text-xs font-bold flex items-center justify-center ${scores[i] !== undefined ? 'bg-green-500/20 border-green-500 text-green-300' : 'bg-slate-800 border-slate-600'}`}>{i + 1}</span>
                        <span className="flex-1">{ex.prompt}</span>
                        <PlayCircle size={16} className="shrink-0 text-amber-400" />
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {exercises.length > 0 ? (
              <button onClick={() => setStage({ kind: 'exercise', index: 0 })} className="w-full bg-amber-500 text-slate-900 font-bold py-4 rounded-xl mt-8">
                {exercises.length > 1 ? "COMMENCER L'ÉTAPE 1" : 'PASSER À LA PRATIQUE'}
              </button>
            ) : (
              <button onClick={() => onComplete(lesson.id, 100)} className="w-full bg-amber-500 text-slate-900 font-bold py-4 rounded-xl mt-8">TERMINER</button>
            )}
          </div>
        );
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-950 absolute inset-0 z-50">
        <div className="bg-slate-900 p-4 flex items-center justify-between border-b border-slate-800">
            <button onClick={onBack} className="p-2 text-slate-400 hover:text-white" aria-label="Retour"><ArrowLeft /></button>
            <h1 className="text-white font-bold">{lesson.title}</h1>
            <div className="min-w-8 text-xs text-slate-500 text-right">{headerRight}</div>
        </div>
        <div className="flex-1 overflow-hidden">
            {renderBody()}
        </div>
    </div>
  );
};

export default LessonView;
