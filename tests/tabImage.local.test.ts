// Tablatures réelles, gardées en local seulement (tests/fixtures/local/, ignoré par git : les
// tablatures des éditeurs sont protégées). Chaque image est accompagnée d'un .json du même nom :
//   { "notes": [[corde, case (-1 = étouffée), durée en temps], ...] }
// Sans ce dossier, ces tests sont simplement ignorés.
import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { readTabImage } from '../utils/tabImage';
import { useNodeCanvas } from './helpers/nodeCanvas';

const DIR = path.join(__dirname, 'fixtures', 'local');
const MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

const cases = fs.existsSync(DIR)
  ? fs.readdirSync(DIR)
      .filter(f => MIME[path.extname(f).toLowerCase()] && fs.existsSync(path.join(DIR, f.replace(/\.[^.]+$/, '.json'))))
  : [];

beforeAll(useNodeCanvas);

describe.skipIf(cases.length === 0)('tablatures réelles (dossier local)', () => {
  it.each(cases)('%s', async (file) => {
    const image = fs.readFileSync(path.join(DIR, file));
    const expected: [number, number, number][] = JSON.parse(fs.readFileSync(path.join(DIR, file.replace(/\.[^.]+$/, '.json')), 'utf8')).notes;
    const read = await readTabImage(`data:${MIME[path.extname(file).toLowerCase()]};base64,${image.toString('base64')}`);
    expect(read.map(n => [n.string, n.fret, n.duration])).toEqual(expected);
  });
});
