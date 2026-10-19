
export function autoCorrelate(buffer: Float32Array, sampleRate: number): number {
  let SIZE = buffer.length;
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buffer[i] * buffer[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.01) return -1;

  let r1 = 0, r2 = SIZE - 1, thres = 0.2;
  for (let i = 0; i < SIZE / 2; i++) if (Math.abs(buffer[i]) < thres) { r1 = i; break; }
  for (let i = 1; i < SIZE / 2; i++) if (Math.abs(buffer[SIZE - i]) < thres) { r2 = SIZE - i; break; }
  buffer = buffer.slice(r1, r2);
  SIZE = buffer.length;

  let c = new Float32Array(SIZE);
  for (let i = 0; i < SIZE; i++)
    for (let j = 0; j < SIZE - i; j++)
      c[i] = c[i] + buffer[j] * buffer[j + i];

  let d = 0; while (c[d] > c[d + 1]) d++;
  let maxval = -1, maxpos = -1;
  for (let i = d; i < SIZE; i++) if (c[i] > maxval) { maxval = c[i]; maxpos = i; }
  let T0 = maxpos;
  let x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1];
  let a = (x1 + x3 - 2 * x2) / 2;
  let b = (x3 - x1) / 2;
  if (a) T0 = T0 - b / (2 * a);
  return sampleRate / T0;
}

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export function getNoteFromFrequency(frequency: number): string {
  const noteNum = 12 * (Math.log(frequency / 440) / Math.log(2));
  return NOTE_NAMES[(Math.round(noteNum) + 69) % 12];
}

const GUITAR_TUNING = [329.63, 246.94, 196.00, 146.83, 110.00, 82.41]; 

/** Fréquence d'une position (corde 1 = Mi aigu ... 6 = Mi grave), accordage standard. */
export function getFrequencyFromPosition(string: number, fret: number): number {
  const baseFreq = GUITAR_TUNING[string - 1];
  if (!baseFreq || fret < 0) return -1;
  return baseFreq * Math.pow(2, fret / 12);
}

/**
 * Une même hauteur existe sur plusieurs cordes : si `preferredString` peut la produire,
 * on la garde (évite d'afficher le doigt sur une autre corde que celle demandée).
 */
export function getPositionFromFrequency(frequency: number, preferredString?: number): { string: number, fret: number } {
  if (preferredString && GUITAR_TUNING[preferredString - 1]) {
    const fret = Math.round(12 * Math.log2(frequency / GUITAR_TUNING[preferredString - 1]));
    if (fret >= 0 && fret <= 22) return { string: preferredString, fret };
  }
  let bestMatch = { string: 6, fret: 0, diff: Infinity };
  for (let s = 0; s < 6; s++) {
    const baseFreq = GUITAR_TUNING[s];
    const fret = Math.round(12 * Math.log2(frequency / baseFreq));
    if (fret >= 0 && fret <= 22) {
      const fretFreq = baseFreq * Math.pow(2, fret / 12);
      const diff = Math.abs(frequency - fretFreq);
      if (diff < bestMatch.diff) bestMatch = { string: s + 1, fret, diff };
    }
  }
  return { string: bestMatch.string, fret: bestMatch.fret };
}

/**
 * Corde pincée par synthèse Karplus-Strong : un court bruit (l'attaque du doigt ou du médiator)
 * circule dans une ligne à retard de la longueur d'une période et s'amortit à chaque passage,
 * comme une vraie corde. Le son obtenu est bien plus proche d'une guitare qu'un oscillateur.
 */
const RING_SECONDS = 3.5;      // longueur maximale d'une note qui résonne
const PICK_POSITION = 0.13;    // point d'attaque sur la corde (proche du chevalet = plus brillant)
const MAX_CACHED_NOTES = 48;

const renderPluckedString = (ctx: BaseAudioContext, freq: number): AudioBuffer => {
    const sr = ctx.sampleRate;
    const length = Math.ceil(RING_SECONDS * sr);
    const buffer = ctx.createBuffer(1, length, sr);
    const out = buffer.getChannelData(0);

    // Longueur de boucle = une période. Le filtre moyenneur ajoute 0,5 échantillon de retard ;
    // la partie fractionnaire restante passe par un filtre passe-tout (sinon les notes aiguës sonnent faux).
    const loopDelay = sr / freq - 0.5;
    const N = Math.max(2, Math.floor(loopDelay - 0.1));
    const frac = loopDelay - N; // dans [0.1, 1.1[ : plage stable du passe-tout
    const allpassCoef = (1 - frac) / (1 + frac);

    // Excitation : bruit adouci (doigt plutôt que lame) puis filtre en peigne du point d'attaque
    const noise = new Float32Array(N);
    for (let i = 0; i < N; i++) noise[i] = Math.random() * 2 - 1;
    for (let pass = 0; pass < 2; pass++) {
        for (let i = 1; i < N; i++) noise[i] = 0.5 * (noise[i] + noise[i - 1]);
    }
    const pickOffset = Math.max(1, Math.round(PICK_POSITION * N));
    for (let i = 0; i < N; i++) out[i] = noise[i] - noise[(i - pickOffset + N) % N];

    // Les cordes graves résonnent plus longtemps que les aiguës (temps de décroissance à -60 dB)
    const t60 = Math.min(6, Math.max(2.5, 6 - 0.8 * Math.log2(freq / 82.41)));
    const loss = Math.pow(10, -3 / (t60 * freq));
    let apIn = 0, apOut = 0;
    for (let n = N; n < length; n++) {
        const averaged = loss * 0.5 * (out[n - N] + out[n - N - 1 >= 0 ? n - N - 1 : n - N]);
        apOut = allpassCoef * averaged + apIn - allpassCoef * apOut;
        apIn = averaged;
        out[n] = apOut;
    }

    let peak = 0;
    for (let n = 0; n < length; n++) peak = Math.max(peak, Math.abs(out[n]));
    if (peak > 0) for (let n = 0; n < length; n++) out[n] /= peak;
    return buffer;
};

interface PlayingNote {
    source: AudioBufferSourceNode;
    gain: GainNode;
}

class GuitarSynthEngine {
    private ctx: AudioContext | null = null;
    private output: AudioNode | null = null;
    private cache = new Map<string, AudioBuffer>();
    // Sources programmées, pour pouvoir couper une démo en cours (stopAll)
    private activeSources = new Set<AudioScheduledSourceNode>();

    private init(): AudioContext {
        if (!this.ctx) {
            const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
            const ctx: AudioContext = new AudioContextClass();
            // "Caisse" simplifiée : coupe l'infra-grave, renforce le corps du son, adoucit l'aigu
            const highpass = ctx.createBiquadFilter();
            highpass.type = 'highpass';
            highpass.frequency.value = 60;
            const body = ctx.createBiquadFilter();
            body.type = 'peaking';
            body.frequency.value = 200;
            body.Q.value = 1;
            body.gain.value = 4;
            const lowpass = ctx.createBiquadFilter();
            lowpass.type = 'lowpass';
            lowpass.frequency.value = 5000;
            highpass.connect(body).connect(lowpass).connect(ctx.destination);
            this.ctx = ctx;
            this.output = highpass;
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return this.ctx;
    }

    private bufferFor(ctx: AudioContext, freq: number): AudioBuffer {
        const key = freq.toFixed(2);
        let buffer = this.cache.get(key);
        if (!buffer) {
            buffer = renderPluckedString(ctx, freq);
            if (this.cache.size >= MAX_CACHED_NOTES) this.cache.delete(this.cache.keys().next().value!);
            this.cache.set(key, buffer);
        }
        return buffer;
    }

    /** Joue une note pincée ; `duration` = temps de résonance avant étouffement. */
    playNote(freq: number, duration: number = RING_SECONDS, volume: number = 0.5, startTime: number = 0): PlayingNote {
        const ctx = this.init();
        const t = startTime === 0 ? ctx.currentTime : startTime;
        const ring = Math.min(duration, RING_SECONDS);

        const source = ctx.createBufferSource();
        source.buffer = this.bufferFor(ctx, freq);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(volume, t);
        gain.gain.setTargetAtTime(0, t + ring - 0.08, 0.02); // étouffement sans clic
        source.connect(gain).connect(this.output!);
        source.start(t);
        source.stop(t + ring + 0.1);

        this.activeSources.add(source);
        source.onended = () => this.activeSources.delete(source);
        return { source, gain };
    }

    /** Coupe immédiatement toutes les notes jouées ou programmées. */
    stopAll() {
        this.activeSources.forEach(src => { try { src.stop(); } catch { /* déjà arrêtée */ } });
        this.activeSources.clear();
    }

    /** Arrête tout et libère l'AudioContext (rechargement à chaud du module). */
    dispose() {
        this.stopAll();
        this.ctx?.close();
        this.ctx = null;
        this.output = null;
        this.cache.clear();
    }

    /** Gratte un accord (frets de la corde grave à l'aiguë), comme un coup de pouce vers le bas. */
    playChord(frets: number[], volume: number = 0.3) {
        const ctx = this.init();
        const tuning = [82.41, 110.00, 146.83, 196.00, 246.94, 329.63];
        let t = ctx.currentTime + 0.02;
        frets.forEach((fret, i) => {
            if (fret === -1) return;
            this.playNote(tuning[i] * Math.pow(2, fret / 12), RING_SECONDS, volume, t);
            t += 0.03;
        });
    }

    /** Joue la séquence et renvoie sa durée totale en secondes. */
    playMelody(sequence: {string: number, fret: number, duration?: number}[], tempo: number = 100): number {
        const ctx = this.init();
        if (!Number.isFinite(tempo) || tempo <= 0) tempo = 100;
        const beatDuration = 60 / tempo;
        let currentTime = ctx.currentTime + 0.05;
        // Une corde ne joue qu'une note à la fois : la rejouer étouffe la note précédente,
        // alors que les autres cordes continuent de résonner (arpèges)
        const ringingByString = new Map<number, PlayingNote>();

        sequence.forEach((note) => {
            // duration est exprimé en ratio de temps (1.0 = une noire)
            const noteLength = (note.duration || 1.0) * beatDuration;
            const freq = getFrequencyFromPosition(note.string, note.fret);
            if (freq > 0) {
                const previous = ringingByString.get(note.string);
                if (previous) {
                    previous.gain.gain.cancelScheduledValues(currentTime);
                    previous.gain.gain.setTargetAtTime(0, currentTime, 0.01);
                }
                ringingByString.set(note.string, this.playNote(freq, RING_SECONDS, 0.6, currentTime));
            }
            currentTime += noteLength;
        });
        return sequence.reduce((acc, n) => acc + (n.duration || 1.0), 0) * beatDuration;
    }
}

export const GuitarSynth = new GuitarSynthEngine();

// En développement, Vite recharge ce module à chaud : l'ancien moteur et son AudioContext
// continueraient de jouer les notes déjà programmées, hors de portée du nouveau stopAll().
// Le nouveau moteur arrête donc l'éventuel précédent (enregistré sur globalThis).
const SYNTH_KEY = '__gibsonGuitarSynth';
(globalThis as any)[SYNTH_KEY]?.dispose();
(globalThis as any)[SYNTH_KEY] = GuitarSynth;

const NOTE_NAMES_FR = ['Do', 'Do#', 'Ré', 'Ré#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];
const OPEN_STRING_MIDI_LOW_TO_HIGH = [40, 45, 50, 55, 59, 64]; // Mi grave ... Mi aigu

/** Nom français de la note jouée sur une corde (1 = Mi aigu ... 6 = Mi grave) à une case donnée. */
export function getNoteNameFr(string: number, fret: number): string {
  return NOTE_NAMES_FR[(OPEN_STRING_MIDI_LOW_TO_HIGH[6 - string] + fret) % 12];
}

/**
 * Notes distinctes d'un accord (frets de la corde grave à l'aiguë), rangées à partir de la basse
 * (fondamentale, tierce, quinte... pour les accords en position fondamentale).
 */
export function getChordNotesFr(frets: number[]): string[] {
  const pitchClasses: number[] = [];
  frets.forEach((fret, i) => {
    if (fret < 0) return;
    const pc = (OPEN_STRING_MIDI_LOW_TO_HIGH[i] + fret) % 12;
    if (!pitchClasses.includes(pc)) pitchClasses.push(pc);
  });
  if (pitchClasses.length === 0) return [];
  const root = pitchClasses[0];
  return pitchClasses
    .sort((a, b) => ((a - root + 12) % 12) - ((b - root + 12) % 12))
    .map(pc => NOTE_NAMES_FR[pc]);
}
