// Cohérence du dictionnaire d'accords (constants.ts) : positions, doigtés et noms français.
import { describe, expect, it } from 'vitest';
import { CHORD_DEFINITIONS, CHORD_FINGERS, CHORD_NAMES_FR } from '../constants';

const chords = Object.keys(CHORD_DEFINITIONS);

describe("dictionnaire d'accords", () => {
  it.each(chords)('%s : 6 cordes, cases entre -1 (non jouée) et 12', (name) => {
    const frets = CHORD_DEFINITIONS[name];
    expect(frets).toHaveLength(6);
    for (const fret of frets) {
      expect(Number.isInteger(fret)).toBe(true);
      expect(fret).toBeGreaterThanOrEqual(-1);
      expect(fret).toBeLessThanOrEqual(12);
    }
  });

  it.each(chords)('%s a un nom en français', (name) => {
    expect(CHORD_NAMES_FR[name]).toBeTruthy();
  });

  it('pas de nom français pour un accord inconnu', () => {
    expect(Object.keys(CHORD_NAMES_FR).filter(name => !CHORD_DEFINITIONS[name])).toEqual([]);
  });

  it.each(Object.keys(CHORD_FINGERS))('%s : un doigt (1 à 4) sur chaque case appuyée, aucun ailleurs', (name) => {
    const frets = CHORD_DEFINITIONS[name];
    expect(frets).toBeDefined();
    CHORD_FINGERS[name].forEach((finger, string) => {
      if (frets[string] > 0) expect(finger).toBeGreaterThanOrEqual(1);
      else expect(finger).toBe(0);
      expect(finger).toBeLessThanOrEqual(4);
    });
  });
});
