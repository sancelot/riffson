// Lecture des images de tablature, dans le navigateur.
//
// Les modèles d'IA reconnaissent bien les chiffres mais placent mal les notes sur les 6 lignes rapprochées
// d'une portée (mesuré : qwen3-vl lit 15 cases sur 16, mais 0 corde juste). Pour une tablature imprimée,
// on lit donc l'image nous-mêmes : position des lignes, chiffres posés dessus (reconnus par comparaison
// avec des polices), barres de mesure et espacement pour le rythme. Si l'image ne s'y prête pas (photo de
// travers, manuscrit…), splitTabStaves() prépare les portées pour une lecture par l'IA.

import type { MelodyNote } from '../types';

export interface TabStaffImage {
    data: string;      // base64 sans préfixe data:
    mimeType: 'image/png';
}

interface Line { y: number; top: number; bottom: number }

const LINE_DARK_RATIO = 0.45;   // part de pixels sombres d'une ligne de portée
const DARK_LUMINANCE = 150;     // en dessous : pixel considéré comme encre
const LINES_PER_TAB_STAFF = 6;
const ANALYSIS_LINE_GAP_PX = 24; // écart entre lignes visé pour l'analyse (petites images agrandies)
const MAX_ANALYSIS_ZOOM = 4;
const MAX_WORK_WIDTH = 4000;
const MAX_STAVES = 4;            // ~16 mesures
const BEATS_PER_MEASURE = 4;     // 4/4, le cas de loin le plus courant
const DURATIONS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];

// --- Image et lignes ---------------------------------------------------------------------------

const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image illisible'));
    img.src = src;
});

interface Gray { lum: Uint8Array; width: number; height: number; canvas: HTMLCanvasElement }

const toGray = (img: HTMLImageElement, zoom: number): Gray => {
    const width = Math.round(img.width * zoom);
    const height = Math.round(img.height * zoom);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, width, height);
    const rgba = ctx.getImageData(0, 0, width, height).data;
    const lum = new Uint8Array(width * height);
    for (let i = 0; i < lum.length; i++) lum[i] = rgba[i * 4] * 0.3 + rgba[i * 4 + 1] * 0.59 + rgba[i * 4 + 2] * 0.11;
    return { lum, width, height, canvas };
};

/** Lignes horizontales longues (centre et épaisseur). */
const findHorizontalLines = ({ lum, width, height }: Gray): Line[] => {
    const lines: Line[] = [];
    let runStart = -1;
    for (let y = 0; y <= height; y++) {
        let dark = 0;
        if (y < height) for (let x = 0; x < width; x += 2) if (lum[y * width + x] < DARK_LUMINANCE) dark++;
        const isLine = y < height && dark / (width / 2) > LINE_DARK_RATIO;
        if (isLine && runStart < 0) runStart = y;
        if (!isLine && runStart >= 0) {
            lines.push({ y: (runStart + y - 1) / 2, top: runStart, bottom: y - 1 });
            runStart = -1;
        }
    }
    return lines;
};

/** Regroupe les lignes en portées de 6 lignes régulièrement espacées. */
const groupTabStaves = (lines: Line[]): Line[][] => {
    const staves: Line[][] = [];
    let i = 0;
    while (i + LINES_PER_TAB_STAFF <= lines.length) {
        const group = lines.slice(i, i + LINES_PER_TAB_STAFF);
        const gaps = group.slice(1).map((l, k) => l.y - group[k].y);
        const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
        if (gaps.every(g => Math.abs(g - mean) < mean * 0.25)) {
            staves.push(group);
            i += LINES_PER_TAB_STAFF;
        } else {
            i++;
        }
    }
    return staves.slice(0, MAX_STAVES);
};

const staffGap = (staff: Line[]) => (staff[LINES_PER_TAB_STAFF - 1].y - staff[0].y) / (LINES_PER_TAB_STAFF - 1);

/** Charge l'image et l'agrandit si besoin pour que les lignes soient assez espacées pour l'analyse. */
const analyse = async (dataUrl: string) => {
    const img = await loadImage(dataUrl);
    const first = toGray(img, Math.min(1, MAX_WORK_WIDTH / img.width));
    const firstStaves = groupTabStaves(findHorizontalLines(first));
    if (firstStaves.length === 0) return { gray: first, staves: firstStaves };
    const zoom = Math.min(MAX_ANALYSIS_ZOOM, MAX_WORK_WIDTH / img.width, Math.max(1, ANALYSIS_LINE_GAP_PX / staffGap(firstStaves[0])));
    if (zoom <= 1.05) return { gray: first, staves: firstStaves };
    const gray = toGray(img, zoom);
    return { gray, staves: groupTabStaves(findHorizontalLines(gray)) };
};

// --- Reconnaissance des chiffres -----------------------------------------------------------------

const GRID = 16;
const TEMPLATE_FONTS = ['Arial', 'Helvetica', 'Verdana', 'Tahoma', 'Times New Roman', 'Georgia', 'Courier New'];

/** Met un glyphe (masque binaire) à l'échelle d'une grille carrée, hauteur pleine, proportions gardées. */
const normalize = (mask: (x: number, y: number) => boolean, w: number, h: number): Float32Array => {
    const out = new Float32Array(GRID * GRID);
    const scale = GRID / h;
    const scaledW = Math.max(1, Math.min(GRID, Math.round(w * scale)));
    const offset = Math.floor((GRID - scaledW) / 2);
    for (let gy = 0; gy < GRID; gy++) {
        for (let gx = 0; gx < scaledW; gx++) {
            const x0 = Math.floor(gx / scale), x1 = Math.max(x0 + 1, Math.floor((gx + 1) / scale));
            const y0 = Math.floor(gy / scale), y1 = Math.max(y0 + 1, Math.floor((gy + 1) / scale));
            let on = 0, total = 0;
            for (let y = y0; y < y1 && y < h; y++) for (let x = x0; x < x1 && x < w; x++) { total++; if (mask(x, y)) on++; }
            out[gy * GRID + gx + offset] = total ? on / total : 0;
        }
    }
    return out;
};

/** Adoucit une grille (flou 3×3) : la comparaison tolère alors un léger décalage ou un trait plus épais. */
const blur = (grid: Float32Array): Float32Array => {
    const out = new Float32Array(grid.length);
    for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
        let sum = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && nx < GRID && ny >= 0 && ny < GRID) { sum += grid[ny * GRID + nx]; n++; }
        }
        out[y * GRID + x] = sum / n;
    }
    return out;
};

/** Corrélation normalisée entre deux grilles (1 = identiques). */
const correlation = (a: Float32Array, b: Float32Array): number => {
    let ma = 0, mb = 0;
    for (let i = 0; i < a.length; i++) { ma += a[i]; mb += b[i]; }
    ma /= a.length; mb /= b.length;
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < a.length; i++) {
        num += (a[i] - ma) * (b[i] - mb);
        da += (a[i] - ma) ** 2;
        db += (b[i] - mb) ** 2;
    }
    return da && db ? num / Math.sqrt(da * db) : 0;
};

interface Template { digit: number; grid: Float32Array; aspect: number }
const templateCache = new Map<number, Template[]>();

/**
 * Modèles des chiffres 0 à 9 (plusieurs polices, normal et gras), dessinés à la même hauteur que le
 * chiffre à reconnaître : épaisseur des traits et flou comparables à ceux de l'image.
 */
const digitTemplates = (glyphHeight: number): Template[] => {
    const size = Math.max(8, Math.min(64, Math.round(glyphHeight)));
    const cached = templateCache.get(size);
    if (cached) return cached;
    const templates: Template[] = [];
    const canvasSize = size * 3;
    const c = document.createElement('canvas');
    c.width = canvasSize;
    c.height = canvasSize;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    for (const font of TEMPLATE_FONTS) {
        for (const weight of ['normal', 'bold']) {
            for (let digit = 0; digit <= 9; digit++) {
                ctx.fillStyle = '#fff';
                ctx.fillRect(0, 0, canvasSize, canvasSize);
                ctx.fillStyle = '#000';
                ctx.font = `${weight} ${Math.round(size / 0.72)}px "${font}"`; // les chiffres font ~72 % du corps
                ctx.textBaseline = 'middle';
                ctx.fillText(String(digit), size * 0.5, canvasSize / 2);
                const px = ctx.getImageData(0, 0, canvasSize, canvasSize).data;
                const ink = (x: number, y: number) => px[(y * canvasSize + x) * 4] < DARK_LUMINANCE;
                let minX = canvasSize, maxX = -1, minY = canvasSize, maxY = -1;
                for (let y = 0; y < canvasSize; y++) for (let x = 0; x < canvasSize; x++) if (ink(x, y)) {
                    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
                }
                if (maxX < 0) continue;
                const w = maxX - minX + 1, h = maxY - minY + 1;
                templates.push({ digit, grid: blur(normalize((x, y) => ink(minX + x, minY + y), w, h)), aspect: w / h });
            }
        }
    }
    templateCache.set(size, templates);
    return templates;
};

/** Centre horizontal de l'encre sur un groupe de rangées de la grille. */
const rowsCenter = (grid: Float32Array, fromRow: number, toRow: number): number => {
    let sum = 0, weight = 0;
    for (let y = fromRow; y < toRow; y++) for (let x = 0; x < GRID; x++) { sum += x * grid[y * GRID + x]; weight += grid[y * GRID + x]; }
    return weight ? sum / weight : GRID / 2;
};

const TIE_MARGIN = 0.06;

// Chiffres à boucle fermée (le 4 dépend de la police : il est permis dans les deux cas)
const DIGITS_WITH_LOOP = [0, 4, 6, 8, 9];
const DIGITS_WITHOUT_LOOP = [1, 2, 3, 4, 5, 7];

/** Nombre de « trous » (zones blanches entièrement entourées d'encre) d'un glyphe. */
const countLoops = (ink: (x: number, y: number) => boolean, w: number, h: number): number => {
    // Grille bordée d'une marge blanche : tout le blanc relié au bord est l'extérieur
    const W = w + 2, H = h + 2;
    const filled = new Uint8Array(W * H);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (ink(x, y)) filled[(y + 1) * W + x + 1] = 1;
    const visit = (start: number) => {
        let size = 0;
        const stack = [start];
        filled[start] = 2;
        while (stack.length) {
            const p = stack.pop()!;
            size++;
            const x = p % W, y = (p - x) / W;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nx = x + dx, ny = y + dy;
                if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
                const q = ny * W + nx;
                if (filled[q] === 0) { filled[q] = 2; stack.push(q); }
            }
        }
        return size;
    };
    visit(0);
    let loops = 0;
    for (let p = 0; p < filled.length; p++) if (filled[p] === 0 && visit(p) >= 3) loops++;
    return loops;
};

const classifyDigit = (grid: Float32Array, aspect: number, glyphHeight: number, loops: number): number => {
    const soft = blur(grid);
    const allowed = loops > 0 ? DIGITS_WITH_LOOP : DIGITS_WITHOUT_LOOP;
    const perDigit = new Map<number, number>();
    for (const t of digitTemplates(glyphHeight)) {
        if (!allowed.includes(t.digit)) continue;
        // Forme (corrélation) d'abord ; les proportions départagent 1 / 7 / 4…
        const score = correlation(soft, t.grid) - Math.abs(Math.log(aspect / t.aspect)) * 0.3;
        perDigit.set(t.digit, Math.max(perDigit.get(t.digit) ?? -Infinity, score));
    }
    const ranked = [...perDigit.entries()].sort((a, b) => b[1] - a[1]);
    let best = { digit: ranked[0][0], score: ranked[0][1] };
    // Petits chiffres flous : 1 et 7 se ressemblent. La hampe du 7 penche vers la gauche
    // (son bas est à gauche de sa barre du haut), celle du 1 est droite.
    const [first, second] = ranked;
    if (second && first[1] - second[1] < TIE_MARGIN && [first[0], second[0]].sort().join() === '1,7') {
        const slant = (rowsCenter(grid, Math.round(GRID * 0.7), GRID) - rowsCenter(grid, 0, Math.round(GRID * 0.25))) / GRID;
        best = { digit: slant < 0 ? 7 : 1, score: first[1] };
    }
    return best.digit;
};

// --- Lecture d'une portée -------------------------------------------------------------------------

interface Glyph { x0: number; x1: number; y0: number; y1: number; string: number; digit: number }
interface TabNote { x: number; string: number; fret: number }

const readStaff = ({ lum, width }: Gray, staff: Line[]): { notes: TabNote[]; bars: number[]; gap: number } => {
    const gap = staffGap(staff);
    const top = Math.max(0, Math.floor(staff[0].y - gap * 0.6));
    const bottom = Math.ceil(staff[LINES_PER_TAB_STAFF - 1].y + gap * 0.6);
    const h = bottom - top;
    const ink = new Uint8Array(width * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < width; x++) ink[y * width + x] = lum[(y + top) * width + x] < DARK_LUMINANCE ? 1 : 0;
    const at = (x: number, y: number) => (x >= 0 && x < width && y >= 0 && y < h ? ink[y * width + x] : 0);

    // Barres de mesure : colonnes encrées sur toute la hauteur de la portée
    const lineTop = Math.round(staff[0].y - top), lineBottom = Math.round(staff[LINES_PER_TAB_STAFF - 1].y - top);
    const bars: number[] = [];
    const columnDark = (x: number) => { let dark = 0; for (let y = lineTop; y <= lineBottom; y++) dark += at(x, y); return dark / (lineBottom - lineTop + 1); };
    const barColumns: number[] = [];
    for (let x = 0; x < width; x++) {
        if (columnDark(x) >= 0.9) {
            if (bars.length && x - bars[bars.length - 1] <= 2) bars[bars.length - 1] = x; else bars.push(x);
            barColumns.push(x);
        }
    }
    // Effacement des barres, bords compris (plus clairs) : leurs restes ressembleraient à des « 1 »
    for (const x of barColumns) {
        for (let dx = -3; dx <= 3; dx++) {
            const cx = x + dx;
            if (cx < 0 || cx >= width || (dx !== 0 && columnDark(cx) < 0.5)) continue;
            for (let y = 0; y < h; y++) ink[y * width + cx] = 0;
        }
    }

    // Effacement des lignes de portée, sauf là où un chiffre les traverse (encre juste au-dessus et au-dessous)
    for (const line of staff) {
        const t = line.top - top - 1, b = line.bottom - top + 1;
        for (let x = 0; x < width; x++) {
            if (at(x, t) && at(x, b)) continue;
            for (let y = t + 1; y < b; y++) if (y >= 0 && y < h) ink[y * width + x] = 0;
        }
    }

    // Composantes connexes = chiffres candidats
    const seen = new Uint8Array(width * h);
    const glyphs: Glyph[] = [];
    for (let start = 0; start < ink.length; start++) {
        if (!ink[start] || seen[start]) continue;
        const stack = [start];
        seen[start] = 1;
        let x0 = width, x1 = 0, y0 = h, y1 = 0, count = 0;
        while (stack.length) {
            const p = stack.pop()!;
            const x = p % width, y = (p - x) / width;
            count++;
            x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
                const nx = x + dx, ny = y + dy;
                if (nx < 0 || nx >= width || ny < 0 || ny >= h) continue;
                const q = ny * width + nx;
                if (ink[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
            }
        }
        const gh = y1 - y0 + 1, gw = x1 - x0 + 1;
        // Un chiffre de tablature : à peu près la hauteur d'un interligne, centré sur une ligne
        // (un trait vertical très fin est une hampe ou un reste de barre, pas un chiffre)
        if (gh < gap * 0.45 || gh > gap * 1.15 || gw > gap * 1.1 || gw < gh * 0.2 || count < 6) continue;
        // Collé à une barre de mesure : reste de double barre ou point de reprise, jamais un chiffre
        if (bars.some(b => b > x0 - gap * 0.5 && b < x1 + gap * 0.5)) continue;
        const cy = (y0 + y1) / 2 + top;
        const nearest = staff.reduce((best, line, k) => Math.abs(line.y - cy) < Math.abs(staff[best].y - cy) ? k : best, 0);
        if (Math.abs(staff[nearest].y - cy) > gap * 0.4) continue; // signe de mesure (4/4), texte…
        const grid = normalize((x, y) => at(x0 + x, y0 + y) === 1, gw, gh);
        const loops = countLoops((x, y) => at(x0 + x, y0 + y) === 1, gw, gh);
        glyphs.push({ x0, x1, y0, y1, string: nearest + 1, digit: classifyDigit(grid, gw / gh, gh, loops) });
    }

    // Chiffres voisins sur la même corde = un nombre (10, 12…)
    glyphs.sort((a, b) => a.string - b.string || a.x0 - b.x0);
    const notes: TabNote[] = [];
    for (let i = 0; i < glyphs.length; i++) {
        let fret = String(glyphs[i].digit);
        let x1 = glyphs[i].x1;
        while (i + 1 < glyphs.length && glyphs[i + 1].string === glyphs[i].string && glyphs[i + 1].x0 - x1 < gap * 0.35) {
            i++;
            fret += glyphs[i].digit;
            x1 = glyphs[i].x1;
        }
        const value = Number(fret);
        if (value <= 24) notes.push({ x: (glyphs[i].x0 + x1) / 2, string: glyphs[i].string, fret: value });
    }
    return { notes, bars, gap };
};

/** Notes d'une portée -> séquence jouable : notes alignées = jouées ensemble, durée d'après l'espacement. */
const staffToSequence = ({ notes, bars, gap }: ReturnType<typeof readStaff>): MelodyNote[] => {
    const events: { x: number; notes: TabNote[] }[] = [];
    for (const note of [...notes].sort((a, b) => a.x - b.x)) {
        const last = events[events.length - 1];
        if (last && note.x - last.x < gap * 0.5) last.notes.push(note); else events.push({ x: note.x, notes: [note] });
    }
    // Répartition des temps dans chaque mesure, proportionnelle à l'espace entre les notes
    const measureOf = (x: number) => bars.findIndex((b, k) => k + 1 < bars.length && x > b && x < bars[k + 1]);
    const durations = events.map(() => 1);
    const byMeasure = new Map<number, number[]>();
    events.forEach((e, i) => {
        const m = measureOf(e.x);
        if (m >= 0) byMeasure.set(m, [...(byMeasure.get(m) || []), i]);
    });
    for (const indexes of byMeasure.values()) {
        const xs = indexes.map(i => events[i].x);
        const spaces = xs.slice(1).map((x, k) => x - xs[k]);
        const typical = spaces.length ? spaces.reduce((a, b) => a + b, 0) / spaces.length : 1;
        const all = [...spaces, typical]; // la dernière note dure comme une note « moyenne »
        const total = all.reduce((a, b) => a + b, 0);
        indexes.forEach((i, k) => {
            const beats = (all[k] / total) * BEATS_PER_MEASURE;
            durations[i] = DURATIONS.reduce((best, d) => Math.abs(d - beats) < Math.abs(best - beats) ? d : best, 1);
        });
    }
    return events.flatMap((e, i) => {
        const chord = e.notes.filter((n, k, all) => all.findIndex(m => m.string === n.string) === k).sort((a, b) => b.string - a.string);
        return chord.map((n, k) => ({ string: n.string, fret: n.fret, duration: k === chord.length - 1 ? durations[i] : 0 }));
    });
};

/**
 * Lit directement une tablature imprimée. Renvoie une séquence vide si aucune portée n'est reconnue
 * ou si l'image ne contient pas de chiffres lisibles : on passe alors à la lecture par l'IA.
 */
export async function readTabImage(dataUrl: string): Promise<MelodyNote[]> {
    const { gray, staves } = await analyse(dataUrl);
    return staves.flatMap(staff => staffToSequence(readStaff(gray, staff)));
}

// --- Préparation pour la lecture par l'IA (repli) -------------------------------------------------

const TARGET_LINE_GAP_PX = 44;
const LABEL_MARGIN_PX = 70;

/** Découpe chaque portée, l'agrandit et numérote ses lignes (1 = Mi aigu en haut … 6 = Mi grave). */
export async function splitTabStaves(dataUrl: string): Promise<TabStaffImage[]> {
    const { gray, staves } = await analyse(dataUrl);
    const { canvas, width, height } = gray;
    return staves.map(lines => {
        const gap = staffGap(lines);
        // Un peu de marge au-dessus, davantage dessous pour garder les hampes du rythme
        const top = Math.max(0, Math.floor(lines[0].y - gap * 1.5));
        const bottom = Math.min(height, Math.ceil(lines[LINES_PER_TAB_STAFF - 1].y + gap * 3));
        const zoom = Math.min(MAX_ANALYSIS_ZOOM, Math.max(1, TARGET_LINE_GAP_PX / gap));

        const out = document.createElement('canvas');
        out.width = Math.round(width * zoom) + LABEL_MARGIN_PX;
        out.height = Math.round((bottom - top) * zoom);
        const o = out.getContext('2d')!;
        o.fillStyle = '#fff';
        o.fillRect(0, 0, out.width, out.height);
        o.imageSmoothingQuality = 'high';
        o.drawImage(canvas, 0, top, width, bottom - top, LABEL_MARGIN_PX, 0, width * zoom, (bottom - top) * zoom);

        o.fillStyle = '#dc2626';
        o.font = `bold ${Math.round(TARGET_LINE_GAP_PX * 0.7)}px sans-serif`;
        o.textAlign = 'center';
        o.textBaseline = 'middle';
        lines.forEach((line, k) => o.fillText(String(k + 1), LABEL_MARGIN_PX / 2, (line.y - top) * zoom));

        return { data: out.toDataURL('image/png').split(',')[1], mimeType: 'image/png' as const };
    });
}
