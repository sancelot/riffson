// Génère des images de tablature de test, dont on connaît exactement le contenu.
// (Les tablatures réelles des éditeurs sont protégées : on ne les met pas dans le dépôt.)
import { createCanvas } from '@napi-rs/canvas';
import type { MelodyNote } from '../../types';

export interface TabNote {
  string: number;          // 1 = Mi aigu (ligne du haut) … 6 = Mi grave
  fret: number | 'x';      // 'x' = note étouffée
}

/** Un moment joué : une ou plusieurs notes ensemble, et sa durée en temps. */
export interface TabEvent {
  notes: TabNote[];
  beats: number;
  slideIn?: boolean;       // trait de glissé « / » dessiné devant la note
}

export interface DrawOptions {
  gap?: number;                 // écart entre les lignes, en pixels
  lineColor?: string;
  lineWidth?: number;
  digitColor?: string;
  font?: string;
  bold?: boolean;
  whiteout?: boolean;           // fond blanc derrière les chiffres (Guitar Pro, LilyPond)
  notationAbove?: boolean;      // portée de notes (5 lignes) au-dessus de la tablature
  repeatStart?: boolean;        // double barre de reprise avec ses points au début
  tabClef?: boolean;            // lettres « TAB » au début de la portée
  mutedLabel?: string;          // signe des notes étouffées (« x » ou « X »)
  format?: 'png' | 'jpeg';
  jpegQuality?: number;
}

const BEATS_PER_MEASURE = 4;

/** Dessine une portée de tablature contenant `events` (mesures de 4 temps) et renvoie une data URL. */
export function drawTab(events: TabEvent[], options: DrawOptions = {}): string {
  const {
    gap = 24, lineColor = '#000', lineWidth = Math.max(1, Math.round(gap / 16)), digitColor = '#000',
    font = 'Arial', bold = false, whiteout = true, notationAbove = false, repeatStart = false, tabClef = false,
    format = 'png', jpegQuality = 0.85, mutedLabel = 'x',
  } = options;

  const beatWidth = gap * 3;
  // Comme sur une partition gravée : un peu d'espace au début de chaque mesure, et autant avant la barre
  const measureWidth = BEATS_PER_MEASURE * beatWidth + gap;
  const totalBeats = events.reduce((sum, e) => sum + e.beats, 0);
  const measures = Math.ceil(totalBeats / BEATS_PER_MEASURE);
  const left = gap * 4;
  const staffTop = notationAbove ? gap * 9 : gap * 3;
  const width = left + measures * measureWidth + gap * 2;
  const height = staffTop + gap * 5 + gap * 3;

  const canvas = createCanvas(width, height);
  const g = canvas.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, width, height);
  const lineY = (string: number) => staffTop + (string - 1) * gap;
  const right = left + measures * measureWidth;
  const noteX = (beat: number) => left + Math.floor(beat / BEATS_PER_MEASURE) * measureWidth + gap + (beat % BEATS_PER_MEASURE) * beatWidth;

  // Portée de notes au-dessus : 5 lignes un peu plus serrées et une ligature (barre épaisse)
  if (notationAbove) {
    g.strokeStyle = lineColor;
    g.lineWidth = lineWidth;
    const top = gap * 2;
    const noteGap = gap * 0.8;
    for (let i = 0; i < 5; i++) {
      g.beginPath(); g.moveTo(left - gap, top + i * noteGap); g.lineTo(right, top + i * noteGap); g.stroke();
    }
    g.fillStyle = '#000';
    g.fillRect(left + beatWidth, top + 5 * noteGap, beatWidth * 2, gap * 0.35);
  }

  // Lignes de la tablature
  g.strokeStyle = lineColor;
  g.lineWidth = lineWidth;
  for (let s = 1; s <= 6; s++) {
    g.beginPath(); g.moveTo(left - gap, lineY(s)); g.lineTo(right, lineY(s)); g.stroke();
  }
  // Barres de mesure
  for (let m = 0; m <= measures; m++) {
    const x = left + m * measureWidth - (m === 0 ? gap : 0);
    g.beginPath(); g.moveTo(x, lineY(1)); g.lineTo(x, lineY(6)); g.stroke();
  }
  if (repeatStart) {
    g.fillStyle = lineColor;
    g.fillRect(left - gap, lineY(1), gap * 0.3, gap * 5);
    g.beginPath(); g.moveTo(left - gap * 0.5, lineY(1)); g.lineTo(left - gap * 0.5, lineY(6)); g.stroke();
    for (const y of [lineY(2) + gap / 2, lineY(4) + gap / 2]) {
      g.beginPath(); g.arc(left - gap * 0.2, y, gap * 0.12, 0, Math.PI * 2); g.fill();
    }
  }
  if (tabClef) {
    g.fillStyle = digitColor;
    g.font = `bold ${Math.round(gap * 1.3)}px ${font}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    ['T', 'A', 'B'].forEach((letter, i) => g.fillText(letter, left - gap * 0.4, lineY(2) + i * gap * 1.4));
  }

  // Notes : un chiffre (ou un x) centré sur la ligne de sa corde
  g.font = `${bold ? 'bold ' : ''}${Math.round(gap * 0.95)}px ${font}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let beat = 0;
  for (const event of events) {
    const x = noteX(beat);
    for (const note of event.notes) {
      const label = note.fret === 'x' ? mutedLabel : String(note.fret);
      const y = lineY(note.string);
      const w = g.measureText(label).width;
      if (whiteout) {
        g.fillStyle = '#fff';
        g.fillRect(x - w / 2 - gap * 0.12, y - gap * 0.45, w + gap * 0.24, gap * 0.9);
      }
      g.fillStyle = digitColor;
      g.fillText(label, x, y + gap * 0.05);
      if (event.slideIn) {
        g.strokeStyle = digitColor;
        g.beginPath(); g.moveTo(x - w / 2 - gap * 1.1, y + gap * 0.3); g.lineTo(x - w / 2 - gap * 0.3, y - gap * 0.3); g.stroke();
        g.strokeStyle = lineColor;
      }
    }
    beat += event.beats;
  }

  if (format === 'jpeg') {
    return `data:image/jpeg;base64,${canvas.toBuffer('image/jpeg', Math.round(jpegQuality * 100)).toString('base64')}`;
  }
  return canvas.toDataURL('image/png');
}

/** Séquence attendue de la lecture (même convention que l'app : durée 0 = jouée avec la suivante). */
export function expectedSequence(events: TabEvent[]): MelodyNote[] {
  return events.flatMap(event => {
    const notes = [...event.notes].sort((a, b) => b.string - a.string);
    return notes.map((n, i) => ({
      string: n.string,
      fret: n.fret === 'x' ? -1 : n.fret,
      duration: i === notes.length - 1 ? event.beats : 0,
    }));
  });
}

/** Raccourci : une suite de notes isolées de même durée. */
export const melody = (notes: [number, number | 'x'][], beats = 1): TabEvent[] =>
  notes.map(([string, fret]) => ({ notes: [{ string, fret }], beats }));
