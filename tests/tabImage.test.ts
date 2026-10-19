// Lecture des tablatures imprimées (utils/tabImage.ts) sur des images générées dont on connaît le contenu.
import { beforeAll, describe, expect, it } from 'vitest';
import { readTabImage } from '../utils/tabImage';
import { useNodeCanvas } from './helpers/nodeCanvas';
import { drawTab, expectedSequence, melody, TabEvent } from './helpers/drawTab';
import { createCanvas } from '@napi-rs/canvas';

beforeAll(useNodeCanvas);

const simplify = (seq: { string: number, fret: number, duration?: number }[]) =>
  seq.map(n => `${n.string}:${n.fret}/${n.duration}`);

const expectRead = async (events: TabEvent[], options: Parameters<typeof drawTab>[1] = {}) => {
  const read = await readTabImage(drawTab(events, options));
  expect(simplify(read)).toEqual(simplify(expectedSequence(events)));
};

// Intro d'arpège sur deux cordes, 2 mesures de noires
const ARPEGGIO = melody([[4, 7], [5, 7], [4, 9], [5, 7], [4, 4], [5, 4], [4, 4], [5, 4]]);
// Tous les chiffres, deux fois chacun, pour vérifier la reconnaissance de chaque forme
const ALL_DIGITS = melody([[1, 0], [2, 1], [3, 2], [4, 3], [5, 4], [6, 5], [1, 6], [2, 7], [3, 8], [4, 9], [5, 0], [6, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [1, 8], [2, 9]]);

describe('lecture directe des tablatures', () => {
  it('chiffres sur fond blanc, lignes noires', async () => {
    await expectRead(ARPEGGIO);
  });

  it('reconnaît chacun des chiffres 0 à 9', async () => {
    await expectRead(ALL_DIGITS);
  });

  it.each(['Arial', 'Verdana', 'Times New Roman'])('police %s', async (font) => {
    await expectRead(ALL_DIGITS, { font });
  });

  it('lignes et barres fines et grises (anticrénelage)', async () => {
    await expectRead(ALL_DIGITS, { lineColor: '#a0a0a0', lineWidth: 1 });
  });

  it('chiffres traversés par la ligne (sans fond blanc)', async () => {
    await expectRead(ALL_DIGITS, { whiteout: false, lineColor: '#888', lineWidth: 1 });
  });

  it('nombres à deux chiffres', async () => {
    await expectRead(melody([[5, 10], [4, 12], [3, 11], [2, 15], [6, 17], [1, 19], [5, 22], [4, 10]]));
  });

  it('notes empilées jouées ensemble (accord)', async () => {
    const chords: TabEvent[] = [
      { notes: [{ string: 4, fret: 9 }, { string: 3, fret: 10 }, { string: 2, fret: 10 }], beats: 2 },
      { notes: [{ string: 5, fret: 0 }, { string: 4, fret: 2 }, { string: 3, fret: 2 }, { string: 2, fret: 1 }], beats: 2 },
      { notes: [{ string: 6, fret: 3 }, { string: 5, fret: 2 }, { string: 1, fret: 3 }], beats: 4 },
    ];
    await expectRead(chords);
  });

  it("rythme déduit de l'espacement (croches puis noires)", async () => {
    await expectRead([...melody([[6, 0], [6, 2], [6, 2], [6, 2], [6, 0], [6, 3], [6, 3], [6, 2]], 0.5), ...melody([[5, 2], [6, 0], [5, 3], [6, 0]], 1)]);
  });

  it('ignore la portée de notes dessinée au-dessus', async () => {
    await expectRead(ARPEGGIO, { notationAbove: true });
  });

  it('ignore la double barre de reprise et ses points', async () => {
    await expectRead(ARPEGGIO, { repeatStart: true });
  });

  it('ignore les lettres TAB en début de portée', async () => {
    await expectRead(ARPEGGIO, { tabClef: true });
  });

  it('petite image (lignes espacées de 8 px)', async () => {
    await expectRead(ALL_DIGITS, { gap: 8, lineColor: '#999' });
  });

  it('très petite image (lignes espacées de 6 px, chiffres de 4 px)', async () => {
    await expectRead([...ALL_DIGITS, ...melody([[4, 10], [6, 'x'], [5, 12], [3, 7]])], { gap: 6, lineColor: '#bbb', mutedLabel: 'X' });
  });

  it('image JPEG compressée', async () => {
    await expectRead(ALL_DIGITS, { format: 'jpeg', jpegQuality: 0.6 });
  });

  it('notes étouffées (x) : gardent leur place dans le rythme, sans son', async () => {
    await expectRead(melody([[6, 1], [6, 'x'], [6, 'x'], [5, 8], [4, 9], [6, 'x'], [5, 7], [6, 0]]));
  });

  it('ignore le trait de glissé devant une note', async () => {
    await expectRead([...melody([[6, 1], [5, 3]]), { notes: [{ string: 5, fret: 8 }], beats: 1, slideIn: true }, ...melody([[4, 9]])]);
  });

  it("image sans tablature : aucune note (on ne devine rien)", async () => {
    const canvas = createCanvas(500, 300);
    const g = canvas.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, 500, 300);
    g.fillStyle = '#000'; g.font = '40px Arial'; g.fillText('Bonjour 123', 60, 160);
    expect(await readTabImage(canvas.toDataURL('image/png'))).toEqual([]);
  });
});
