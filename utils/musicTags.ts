import type { ProgressionChord } from '../components/ChordProgressionPlayer';

const CHORD_NAME = /^[A-G][#b]?(?:m|maj7|m7|7|sus2|sus4|dim|aug|add9)?$/;
const MAX_CHORDS = 32;
const DEFAULT_BEATS = 4;

/**
 * Suite d'accords écrite par le coach : [ACCORDS:Titre|Tempo|Am:4;G:4;F:4;E:4]
 * (accord:nombre de temps ; le nombre de temps est facultatif, 4 par défaut).
 */
export const parseChordsTag = (tag: string): { title: string, tempo: number, chords: ProgressionChord[] } | null => {
    const match = tag.trim().match(/^\[ACCORDS:([^|\]]*)\|([^|\]]*)\|([^\]]+)\]$/i);
    if (!match) return null;
    const [, title, tempoStr, chordsStr] = match;
    const chords = chordsStr.split(/[;,]/).map(s => s.trim()).filter(Boolean).map(item => {
        const [name, beatsStr] = item.split(':').map(s => s.trim());
        const beats = Number(beatsStr);
        return { name, beats: Number.isInteger(beats) && beats >= 1 && beats <= 16 ? beats : DEFAULT_BEATS };
    });
    if (chords.length === 0 || chords.length > MAX_CHORDS || !chords.every(c => CHORD_NAME.test(c.name))) return null;
    const tempo = Number(tempoStr);
    return { title: title.trim(), tempo: tempo >= 30 && tempo <= 240 ? tempo : 80, chords };
};
