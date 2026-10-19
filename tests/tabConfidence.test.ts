// Confiance du scanner : les notes nettes sont sûres, les erreurs de lecture sont signalées.
import { beforeAll, describe, expect, it } from 'vitest';
import { isDoubtful, readTabImage } from '../utils/tabImage';
import { useNodeCanvas } from './helpers/nodeCanvas';
import { drawTab, expectedSequence, melody } from './helpers/drawTab';

beforeAll(useNodeCanvas);

const ALL_DIGITS = melody([[1, 0], [2, 1], [3, 2], [4, 3], [5, 4], [6, 5], [1, 6], [2, 7], [3, 8], [4, 9], [5, 0], [6, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [1, 8], [2, 9]]);

describe('confiance de la lecture', () => {
  it('image nette : aucune note douteuse', async () => {
    const read = await readTabImage(drawTab(ALL_DIGITS));
    expect(read).toHaveLength(20);
    expect(read.filter(isDoubtful)).toEqual([]);
    for (const note of read) expect(note.scan!.confidence).toBeGreaterThan(0.5);
  });

  it("chaque note indique où la vérifier sur l'image", async () => {
    const gap = 24;
    const read = await readTabImage(drawTab(ALL_DIGITS, { gap }));
    const staffTop = gap * 3; // voir drawTab
    read.forEach((note, i) => {
      const { x, y, w, h } = note.scan!.box;
      // Centré sur la ligne de sa corde, à la taille d'un chiffre
      expect(Math.abs(y + h / 2 - (staffTop + (note.string - 1) * gap))).toBeLessThan(gap * 0.25);
      expect(h).toBeGreaterThan(gap * 0.4);
      expect(h).toBeLessThan(gap);
      expect(w).toBeGreaterThan(0);
      if (i > 0) expect(x).toBeGreaterThan(read[i - 1].scan!.box.x);
    });
  });

  it('image difficile : la plupart des erreurs sont signalées, peu de bonnes notes le sont', async () => {
    let errors = 0, flaggedErrors = 0, correct = 0, flaggedCorrect = 0, alternatives = 0;
    for (const font of ['Arial', 'Georgia', 'Courier New', 'Tahoma', 'Trebuchet MS']) {
      for (const gap of [5, 6, 9]) {
        const events = [...ALL_DIGITS, ...melody([[3, 'x'], [4, 12], [5, 10], [6, 3]])];
        const read = await readTabImage(drawTab(events, { gap, font, lineColor: '#999', mutedLabel: 'X', format: 'jpeg', jpegQuality: 0.3 }));
        const expected = expectedSequence(events);
        if (read.length !== expected.length) continue; // notes perdues : hors du champ de la confiance par note
        read.forEach((n, i) => {
          // Une note douteuse propose une autre lecture, différente de la première
          if (isDoubtful(n) && n.scan!.alternative !== undefined) { alternatives++; expect(n.scan!.alternative).not.toBe(n.fret); }
          if (n.fret === expected[i].fret) { correct++; if (isDoubtful(n)) flaggedCorrect++; }
          else { errors++; if (isDoubtful(n)) flaggedErrors++; }
        });
      }
    }
    expect(errors).toBeGreaterThan(0); // sinon le test ne mesure rien
    expect(flaggedErrors / errors).toBeGreaterThanOrEqual(0.75);
    expect(flaggedCorrect / correct).toBeLessThanOrEqual(0.3);
    expect(alternatives).toBeGreaterThan(0);
  });
});
