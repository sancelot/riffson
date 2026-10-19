// Suites d'accords écrites par le coach : [ACCORDS:Titre|Tempo|Am:4;G:4;...]
import { describe, expect, it } from 'vitest';
import { parseChordsTag } from '../utils/musicTags';

describe('parseChordsTag', () => {
  it('lit le titre, le tempo et les accords avec leur durée', () => {
    expect(parseChordsTag('[ACCORDS:Andalouse|90|Am:4;G:4;F:2;E:2]')).toEqual({
      title: 'Andalouse',
      tempo: 90,
      chords: [{ name: 'Am', beats: 4 }, { name: 'G', beats: 4 }, { name: 'F', beats: 2 }, { name: 'E', beats: 2 }],
    });
  });

  it('4 temps par défaut, virgules et espaces acceptés', () => {
    expect(parseChordsTag(' [accords: Pop | 100 | C, G:2 , Am ] ')?.chords).toEqual([
      { name: 'C', beats: 4 }, { name: 'G', beats: 2 }, { name: 'Am', beats: 4 },
    ]);
  });

  it('durée invalide : 4 temps', () => {
    expect(parseChordsTag('[ACCORDS:T|80|Am:0;G:99;F:1.5]')?.chords.map(c => c.beats)).toEqual([4, 4, 4]);
  });

  it('tempo absent ou hors limites : 80', () => {
    expect(parseChordsTag('[ACCORDS:T||Am]')?.tempo).toBe(80);
    expect(parseChordsTag('[ACCORDS:T|500|Am]')?.tempo).toBe(80);
    expect(parseChordsTag('[ACCORDS:T|10|Am]')?.tempo).toBe(80);
  });

  it('accepte dièses, bémols et accords enrichis', () => {
    expect(parseChordsTag('[ACCORDS:T|80|F#m;Bb;Cmaj7;Dsus4;Gadd9]')?.chords.map(c => c.name))
      .toEqual(['F#m', 'Bb', 'Cmaj7', 'Dsus4', 'Gadd9']);
  });

  it.each([
    ['nom d’accord invalide', '[ACCORDS:T|80|Am;Hm]'],
    ['texte au lieu d’accords', '[ACCORDS:T|80|joue doucement]'],
    ['aucun accord', '[ACCORDS:T|80|;;]'],
    ['format incomplet', '[ACCORDS:Am;G]'],
    ['autre balise', '[RIFF:T|80|6:0]'],
  ])('refuse : %s', (_, tag) => {
    expect(parseChordsTag(tag)).toBeNull();
  });

  it('refuse plus de 32 accords', () => {
    expect(parseChordsTag(`[ACCORDS:T|80|${Array(33).fill('Am').join(';')}]`)).toBeNull();
    expect(parseChordsTag(`[ACCORDS:T|80|${Array(32).fill('Am').join(';')}]`)).not.toBeNull();
  });
});
