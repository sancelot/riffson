
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

class GuitarSynthEngine {
    private ctx: AudioContext | null = null;
    // Sources programmées, pour pouvoir couper une démo en cours (stopAll)
    private activeSources = new Set<AudioScheduledSourceNode>();

    private init() {
        if (!this.ctx) {
            const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
            this.ctx = new AudioContextClass();
        }
        if (this.ctx!.state === 'suspended') this.ctx!.resume();
    }

    playNote(freq: number, duration: number = 0.8, volume: number = 0.5, startTime: number = 0) {
        this.init();
        const t = (startTime === 0) ? this.ctx!.currentTime : startTime;
        
        // 1. Oscillateur principal (Le corps de la note)
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        const filter = this.ctx!.createBiquadFilter();

        osc.type = 'triangle'; // Son plus doux qu'une sawtooth, plus proche d'une corde
        osc.frequency.setValueAtTime(freq, t);

        // 2. Transitoire d'attaque (Le "Pluck" du médiator)
        const noise = this.ctx!.createBufferSource();
        const noiseBuffer = this.ctx!.createBuffer(1, this.ctx!.sampleRate * 0.05, this.ctx!.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < output.length; i++) output[i] = Math.random() * 2 - 1;
        noise.buffer = noiseBuffer;
        
        const noiseFilter = this.ctx!.createBiquadFilter();
        noiseFilter.type = 'highpass';
        noiseFilter.frequency.setValueAtTime(2000, t);
        
        const noiseGain = this.ctx!.createGain();
        noiseGain.gain.setValueAtTime(0.3 * volume, t);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, t + 0.03);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(5000, t);
        filter.frequency.exponentialRampToValueAtTime(800, t + duration);

        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(volume, t + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx!.destination);

        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(this.ctx!.destination);

        osc.start(t);
        osc.stop(t + duration + 0.1);
        noise.start(t);
        for (const src of [osc, noise]) {
            this.activeSources.add(src);
            src.onended = () => this.activeSources.delete(src);
        }
    }

    /** Coupe immédiatement toutes les notes jouées ou programmées. */
    stopAll() {
        this.activeSources.forEach(src => { try { src.stop(); } catch { /* déjà arrêtée */ } });
        this.activeSources.clear();
    }

    playChord(frets: number[], volume: number = 0.3) {
        this.init();
        const tuning = [82.41, 110.00, 146.83, 196.00, 246.94, 329.63]; 
        frets.forEach((fret, i) => {
            if (fret === -1) return;
            const freq = tuning[i] * Math.pow(2, fret / 12);
            setTimeout(() => this.playNote(freq, 2.0, volume), i * 35);
        });
    }

    /** Joue la séquence et renvoie sa durée totale en secondes. */
    playMelody(sequence: {string: number, fret: number, duration?: number}[], tempo: number = 100): number {
        this.init();
        if (!Number.isFinite(tempo) || tempo <= 0) tempo = 100;
        const tuning = [329.63, 246.94, 196.00, 146.83, 110.00, 82.41]; // e, B, G, D, A, E
        const beatDuration = 60 / tempo;
        let currentTime = this.ctx!.currentTime + 0.05;

        sequence.forEach((note) => {
            // duration est exprimé en ratio de temps (1.0 = une noire)
            const noteLength = (note.duration || 1.0) * beatDuration;
            const baseFreq = tuning[note.string - 1];
            if (baseFreq && note.fret !== -1) {
                const freq = baseFreq * Math.pow(2, note.fret / 12);
                this.playNote(freq, noteLength * 1.5, 0.6, currentTime);
            }
            currentTime += noteLength;
        });
        return sequence.reduce((acc, n) => acc + (n.duration || 1.0), 0) * beatDuration;
    }
}

export const GuitarSynth = new GuitarSynthEngine();
