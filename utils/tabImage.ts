// Lecture des images de tablature, dans le navigateur.
//
// Les modèles d'IA reconnaissent bien les chiffres mais placent mal les notes sur les 6 lignes rapprochées
// d'une portée (mesuré : qwen3-vl lit 15 cases sur 16, mais 0 corde juste). Pour une tablature imprimée,
// on lit donc l'image nous-mêmes : position des lignes, chiffres posés dessus (reconnus par comparaison
// avec des polices), barres de mesure et espacement pour le rythme. Si l'image ne s'y prête pas (photo de
// travers, manuscrit…), splitTabStaves() prépare les portées pour une lecture par l'IA.

import type { MelodyNote, ScanReading } from '../types';

export interface TabStaffImage {
    data: string;      // base64 sans préfixe data:
    mimeType: 'image/png';
}

interface Line { y: number; top: number; bottom: number }

const LINE_DARK_RATIO = 0.45;   // part de pixels sombres d'une ligne de portée
const DARK_LUMINANCE = 150;     // encre des modèles de chiffres (dessinés nets)
const LINE_CONTRAST = 25;       // lignes et barres : tout ce qui est nettement plus foncé que le papier
const INK_LEVEL = 0.7;        // seuil de l'encre, entre l'encre (0) et le papier (1)
                                 // (souvent fines et grises à cause de l'anticrénelage)
const LINES_PER_TAB_STAFF = 6;
const ANALYSIS_LINE_GAP_PX = 24; // écart entre lignes visé pour l'analyse (petites images agrandies)
const MAX_ANALYSIS_ZOOM = 4;
const MAX_WORK_WIDTH = 4000;
const MAX_STAVES = 4;            // ~16 mesures
const BEATS_PER_MEASURE = 4;     // 4/4, le cas de loin le plus courant
const DURATIONS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];

// --- Image et lignes ---------------------------------------------------------------------------

// Accès au dessin (canvas) et au chargement d'images : ceux du navigateur par défaut, remplacés
// dans les tests par une implémentation Node (@napi-rs/canvas, même API).
type Drawable = { width: number; height: number };
type Canvas = Drawable & { getContext(type: '2d', options?: { willReadFrequently?: boolean }): any; toDataURL(type?: string): string };

export interface CanvasPlatform {
    createCanvas(width: number, height: number): Canvas;
    loadImage(src: string): Promise<Drawable>;
}

const browserPlatform: CanvasPlatform = {
    createCanvas: (width, height) => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        return canvas;
    },
    loadImage: (src) => new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Image illisible'));
        img.src = src;
    }),
};

let platform: CanvasPlatform = browserPlatform;

/** Pour les tests : remplace le canvas du navigateur. */
export const setCanvasPlatform = (p: CanvasPlatform) => { platform = p; };

const loadImage = (src: string) => platform.loadImage(src);

interface Gray { lum: Uint8Array; darkest: Uint8Array; width: number; height: number; zoom: number; canvas: Canvas; lineThreshold: number; inkThreshold: number; holeThreshold: number; ink: number; paper: number; source?: Gray }

const toGray = (img: Drawable, zoom: number, original?: Gray): Gray => {
    const width = Math.round(img.width * zoom);
    const height = Math.round(img.height * zoom);
    const canvas = platform.createCanvas(width, height);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, width, height);
    const rgba = ctx.getImageData(0, 0, width, height).data;
    const lum = new Uint8Array(width * height);
    // (et la composante la plus sombre : sur un texte minuscule lissé par sous-pixels (ClearType),
    // un trait fin n'existe que sous forme de pixels colorés pâles)
    const darkest = new Uint8Array(width * height);
    for (let i = 0; i < lum.length; i++) {
        lum[i] = rgba[i * 4] * 0.3 + rgba[i * 4 + 1] * 0.59 + rgba[i * 4 + 2] * 0.11;
        darkest[i] = Math.min(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
    }
    // Couleur du papier : la plupart des pixels (on prend un centile clair, robuste au texte et aux lignes).
    // Sur une image agrandie, le flou étale les lignes : on garde la couleur mesurée sur l'originale.
    const histogram = new Uint32Array(256);
    for (let i = 0; i < lum.length; i += 7) histogram[lum[i]]++;
    let seen = 0, paper = 255;
    const sampled = Math.ceil(lum.length / 7);
    for (let v = 0; v < 256; v++) { seen += histogram[v]; if (seen >= sampled * 0.2) { paper = v; break; } }
    if (original) paper = original.paper;
    // Encre la plus foncée (en ignorant les quelques pixels les plus noirs) : sur une petite image agrandie,
    // les chiffres deviennent gris. Le seuil « encre » est assez clair pour garder les traits fins
    // (déliés des polices à empattements) ; il est resserré par portée si les lignes sont grises.
    let dark = 0, ink = 0;
    for (let v = 0; v < 256; v++) { dark += histogram[v]; if (dark >= sampled * 0.002) { ink = v; break; } }
    const inkThreshold = Math.min(paper - 30, Math.max(100, Math.round(ink + (paper - ink) * INK_LEVEL)));
    // Trous des boucles (0, 6, 8, 9) : sur un petit chiffre agrandi ils restent grisés, on les cherche
    // avec un seuil plus strict que celui de l'encre
    const holeThreshold = Math.min(inkThreshold, Math.round(ink + (paper - ink) * 0.3));
    return { lum, darkest, width, height, zoom, canvas, lineThreshold: Math.max(100, paper - LINE_CONTRAST), inkThreshold, holeThreshold, ink, paper };
};

/** Lignes horizontales longues (centre et épaisseur). */
const findHorizontalLines = ({ lum, width, height, lineThreshold }: Gray): Line[] => {
    const lines: Line[] = [];
    let runStart = -1;
    for (let y = 0; y <= height; y++) {
        let dark = 0;
        if (y < height) for (let x = 0; x < width; x += 2) if (lum[y * width + x] < lineThreshold) dark++;
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
    // Toutes les portées de tablature d'une page ont le même interligne : un groupe différent est
    // en fait une portée de notes (5 lignes + une ligne de ligature, par exemple)
    const gaps = staves.map(staffGap).sort((a, b) => a - b);
    const median = gaps[Math.floor(gaps.length / 2)];
    return staves.filter(s => Math.abs(staffGap(s) - median) < median * 0.2).slice(0, MAX_STAVES);
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
    // (l'image d'origine reste disponible : les chiffres minuscules s'y lisent mieux qu'agrandis)
    const gray = { ...toGray(img, zoom, first), source: first };
    return { gray, staves: groupTabStaves(findHorizontalLines(gray)) };
};

// --- Reconnaissance des chiffres -----------------------------------------------------------------

const GRID = 16;
/** Signes lus en plus des chiffres : x = note étouffée (jouée sans son). Trait de glissé : voir isSlideMark. */
const MUTED = -1, SLIDE = -2;
const TEMPLATE_SIGNS: [string, number][] = [...'0123456789'].map(c => [c, Number(c)] as [string, number])
    .concat([['x', MUTED], ['X', MUTED]]);
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
    const c = platform.createCanvas(canvasSize, canvasSize);
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    for (const font of TEMPLATE_FONTS) {
        for (const weight of ['normal', 'bold']) {
            for (const [sign, digit] of TEMPLATE_SIGNS) {
                ctx.fillStyle = '#fff';
                ctx.fillRect(0, 0, canvasSize, canvasSize);
                ctx.fillStyle = '#000';
                ctx.font = `${weight} ${Math.round(size / 0.72)}px "${font}"`; // les chiffres font ~72 % du corps
                ctx.textBaseline = 'middle';
                ctx.fillText(sign, size * 0.5, canvasSize / 2);
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

/** Largeur (part de la grille) occupée par l'encre sur un groupe de rangées. */
const rowsExtent = (grid: Float32Array, fromRow: number, toRow: number): number => {
    let first = GRID, last = -1;
    for (let y = fromRow; y < toRow; y++) for (let x = 0; x < GRID; x++) if (grid[y * GRID + x] >= 0.5) { first = Math.min(first, x); last = Math.max(last, x); }
    return last < 0 ? 0 : (last - first + 1) / GRID;
};

const TIE_MARGIN = 0.06;
// Écart de score avec la lecture concurrente au-delà duquel un chiffre est sûr (normal / minuscule).
// Réglé sur des milliers de chiffres générés (polices, tailles, JPEG) : sous la moitié de cet écart
// (confiance < 0,5), on trouve ~86 % des erreurs de lecture, et ~5 % (minuscules : ~19 %) des bonnes.
const SURE_MARGIN = 0.12;
const TINY_SURE_MARGIN = 0.06;
// Un rival exclu par les boucles (un 6 pour un 8 à deux boucles) compte, mais un peu moins
const LOOP_RIVAL_PENALTY = 0.04;
/** Confiance sous laquelle une note est signalée comme douteuse. */
export const DOUBTFUL_CONFIDENCE = 0.5;
export const isDoubtful = (note: MelodyNote): boolean => !!note.scan && note.scan.confidence < DOUBTFUL_CONFIDENCE;
const TINY_GAP_PX = 10;
const TINY_DIGIT_PX = 10; // hauteur (dans l'image d'origine) en dessous de laquelle un trou peut disparaître

/** Boucles (zones blanches entièrement entourées d'encre) d'un glyphe : nombre, position et taille. */
interface Loops { count: number; centerY: number; height: number } // centre et hauteur relatifs à la hauteur du glyphe

const findLoops = (ink: (x: number, y: number) => boolean, w: number, h: number): Loops => {
    // Grille bordée d'une marge blanche : tout le blanc relié au bord est l'extérieur
    const W = w + 2, H = h + 2;
    const filled = new Uint8Array(W * H);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (ink(x, y)) filled[(y + 1) * W + x + 1] = 1;
    const visit = (start: number) => {
        let size = 0, minY = H, maxY = 0;
        const stack = [start];
        filled[start] = 2;
        while (stack.length) {
            const p = stack.pop()!;
            size++;
            const x = p % W, y = (p - x) / W;
            minY = Math.min(minY, y); maxY = Math.max(maxY, y);
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nx = x + dx, ny = y + dy;
                if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
                const q = ny * W + nx;
                if (filled[q] === 0) { filled[q] = 2; stack.push(q); }
            }
        }
        return { size, minY: minY - 1, maxY: maxY - 1 };
    };
    visit(0);
    const loops: { minY: number, maxY: number }[] = [];
    for (let p = 0; p < filled.length; p++) {
        if (filled[p] !== 0) continue;
        const hole = visit(p);
        if (hole.size >= 3) loops.push(hole);
    }
    if (loops.length !== 1) return { count: loops.length, centerY: 0.5, height: 0 };
    return { count: 1, centerY: (loops[0].minY + loops[0].maxY + 1) / 2 / h, height: (loops[0].maxY - loops[0].minY + 1) / h };
};

/**
 * Chiffres compatibles avec les boucles observées : 8 en a deux ; le 6 a une boucle en bas, le 0 une
 * grande boucle, le 9 et le 4 (fermé) une petite boucle en haut ou au milieu ; les autres n'en ont pas.
 * Sur un chiffre minuscule (quelques pixels dans l'image d'origine), le petit trou du haut du 8 peut être bouché.
 */
const digitsForLoops = ({ count, centerY, height }: Loops, tiny: boolean): number[] => {
    if (count >= 2) return [8];
    if (count === 0) return [1, 2, 3, 4, 5, 7, MUTED];
    if (centerY > 0.58) return tiny ? [6, 8] : [6]; // (boucle du haut du 8, la plus petite, bouchée)
    if (height > 0.45 && centerY >= 0.42) return [0];
    return [4, 9];
};

/**
 * Trait de glissé (/ ou ) : un simple trait oblique. Chaque rangée n'a qu'un court tronçon d'encre,
 * qui se déplace régulièrement d'un bord à l'autre (un x a deux tronçons écartés en haut et en bas).
 */
const isSlideMark = (ink: (x: number, y: number) => boolean, w: number, h: number): boolean => {
    const centers: number[] = [];
    let extents = 0;
    for (let y = 0; y < h; y++) {
        let first = -1, last = -1;
        for (let x = 0; x < w; x++) if (ink(x, y)) { if (first < 0) first = x; last = x; }
        if (first < 0) continue;
        centers.push((first + last) / 2);
        extents += last - first + 1;
    }
    if (centers.length < h * 0.8 || extents / centers.length > w * 0.45) return false;
    const drift = centers[centers.length - 1] - centers[0];
    if (Math.abs(drift) < w * 0.5) return false;
    // Toujours dans le même sens (à un pixel près)
    return centers.every((c, i) => i === 0 || (c - centers[i - 1]) * Math.sign(drift) >= -1);
};

/** Lecture d'un signe : le meilleur candidat, et le meilleur des autres (pour juger de l'ambiguïté). */
interface Reading { digit: number; score: number; runnerUp?: { digit: number; score: number } }

const reading = (ranked: [number, number][], digit: number): Reading => {
    const best = ranked.find(r => r[0] === digit)!;
    const other = ranked.find(r => r[0] !== digit);
    return { digit, score: best[1], runnerUp: other && { digit: other[0], score: other[1] } };
};

const classifyDigit = (grid: Float32Array, aspect: number, glyphHeight: number, allowed: number[]): Reading => {
    const soft = blur(grid);
    const perDigit = new Map<number, number>();
    for (const t of digitTemplates(glyphHeight)) {
        // Forme (corrélation) d'abord ; les proportions départagent 1 / 7 / 4…
        const score = correlation(soft, t.grid) - Math.abs(Math.log(aspect / t.aspect)) * 0.3;
        perDigit.set(t.digit, Math.max(perDigit.get(t.digit) ?? -Infinity, score));
    }
    // Tous les signes sont notés : seuls ceux qu'autorisent les boucles peuvent gagner, mais un autre
    // qui ressemble autant rend la lecture douteuse
    let all = [...perDigit.entries()].map(([d, sc]): [number, number] => [d, allowed.includes(d) ? sc : sc - LOOP_RIVAL_PENALTY]).sort((a, b) => b[1] - a[1]);
    let ranked = all.filter(r => allowed.includes(r[0]));
    // Le 2 se termine par une barre horizontale : sans elle (bas étroit), c'est un 7 ou un 1
    if (ranked[0][0] === 2 && ranked.length > 1 && rowsExtent(grid, GRID - 2, GRID) < 0.5) {
        ranked = ranked.slice(1);
        all = all.filter(r => r[0] !== 2);
    }
    let digit = ranked[0][0];
    // Petits chiffres flous : 1 et 7 se ressemblent. La hampe du 7 penche vers la gauche
    // (son bas est à gauche de sa barre du haut), celle du 1 est droite.
    const [first, second] = ranked;
    if (second && first[1] - second[1] < TIE_MARGIN && [first[0], second[0]].sort().join() === '1,7') {
        const slant = (rowsCenter(grid, Math.round(GRID * 0.7), GRID) - rowsCenter(grid, 0, Math.round(GRID * 0.25))) / GRID;
        digit = slant < 0 ? 7 : 1;
    }
    return reading(all, digit);
};

// --- Chiffres minuscules ------------------------------------------------------------------------

/**
 * Un chiffre de quelques pixels de haut, une fois agrandi, n'est plus qu'une tache : on le compare
 * en niveaux de gris, à sa taille d'origine, aux signes dessinés à cette même taille par le navigateur
 * (avec le même anticrénelage), à plusieurs décalages sous le pixel.
 */
interface Patch { w: number; h: number; dark: Float32Array }
interface TinyTemplate extends Patch { digit: number }
const tinyCache = new Map<number, TinyTemplate[]>();

/** Rogne une carte d'encre (0 = papier, 1 = encre) à l'encre visible. */
const cropPatch = (dark: (x: number, y: number) => number, w: number, h: number): Patch | null => {
    let minX = w, maxX = -1, minY = h, maxY = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (dark(x, y) > 0.25) {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    if (maxX < 0) return null;
    const pw = maxX - minX + 1, ph = maxY - minY + 1;
    const out = new Float32Array(pw * ph);
    for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) out[y * pw + x] = dark(minX + x, minY + y);
    return { w: pw, h: ph, dark: out };
};

const tinyTemplates = (height: number): TinyTemplate[] => {
    const cached = tinyCache.get(height);
    if (cached) return cached;
    const templates: TinyTemplate[] = [];
    const size = height * 4 + 8;
    const c = platform.createCanvas(size, size);
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    for (const font of TEMPLATE_FONTS) for (const weight of ['normal', 'bold']) {
        // (un chiffre fait ~72 % du corps de la police, un x minuscule ~52 %)
        for (let px = Math.floor((height - 1) / 0.72); px <= Math.ceil((height + 1) / 0.52); px++) {
            for (const [sign, digit] of TEMPLATE_SIGNS) for (const dx of [0, 1 / 3, 2 / 3]) for (const dy of [0, 1 / 3, 2 / 3]) {
                ctx.fillStyle = '#fff';
                ctx.fillRect(0, 0, size, size);
                ctx.fillStyle = '#000';
                ctx.font = `${weight} ${px}px "${font}"`;
                ctx.textBaseline = 'middle';
                ctx.fillText(sign, 4 + dx, size / 2 + dy);
                const data = ctx.getImageData(0, 0, size, size).data;
                const patch = cropPatch((x, y) => 1 - data[(y * size + x) * 4 + 1] / 255, size, size);
                if (patch && Math.abs(patch.h - height) <= 1) templates.push({ ...patch, digit });
            }
        }
    }
    tinyCache.set(height, templates);
    return templates;
};

/** Ressemblance de deux cartes d'encre, au meilleur recalage (±1 pixel). */
const patchSimilarity = (a: Patch, b: Patch): number => {
    const W = Math.max(a.w, b.w) + 2, H = Math.max(a.h, b.h) + 2;
    let best = -1;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const ax = x - 1, ay = y - 1, bx = x - 1 - ox, by = y - 1 - oy;
            const va = ax >= 0 && ax < a.w && ay >= 0 && ay < a.h ? a.dark[ay * a.w + ax] : 0;
            const vb = bx >= 0 && bx < b.w && by >= 0 && by < b.h ? b.dark[by * b.w + bx] : 0;
            sa += va; sb += vb; saa += va * va; sbb += vb * vb; sab += va * vb;
        }
        const n = W * H;
        const cov = sab - sa * sb / n, da = saa - sa * sa / n, db = sbb - sb * sb / n;
        if (da > 0 && db > 0) best = Math.max(best, cov / Math.sqrt(da * db));
    }
    return best;
};

const classifyTiny = (patch: Patch): Reading => {
    const perDigit = new Map<number, number>();
    for (const t of tinyTemplates(patch.h)) {
        perDigit.set(t.digit, Math.max(perDigit.get(t.digit) ?? -Infinity, patchSimilarity(patch, t)));
    }
    const ranked = [...perDigit.entries()].sort((a, b) => b[1] - a[1]);
    return ranked.length ? reading(ranked, ranked[0][0]) : { digit: MUTED, score: 0 };
};

// --- Confiance ----------------------------------------------------------------------------------

/** Sûreté de la lecture d'un signe (0 … 1), d'après son écart avec la lecture concurrente. */
const signConfidence = (read: Reading, tiny: boolean): number => {
    const margin = read.runnerUp ? read.score - read.runnerUp.score : 1;
    return Math.max(0, Math.min(1, margin / (tiny ? TINY_SURE_MARGIN : SURE_MARGIN)));
};

/**
 * Sûreté d'une note (un ou plusieurs chiffres) : celle de son chiffre le moins sûr. L'autre lecture
 * possible remplace ce chiffre par son concurrent (« 18 ou 10 ? »).
 */
const groupConfidence = (group: Glyph[], tiny: boolean): { confidence: number; alternative?: number } => {
    const confidences = group.map(g => signConfidence(g.read, tiny));
    const weakest = confidences.indexOf(Math.min(...confidences));
    const rival = group[weakest].read.runnerUp?.digit;
    let alternative: number | undefined;
    if (rival === MUTED) alternative = group.length === 1 ? MUTED : undefined;
    else if (rival !== undefined) {
        const value = group.length === 1 ? rival : Number(group.map((g, k) => (k === weakest ? rival : g.digit)).join(''));
        alternative = value <= 24 ? value : undefined;
    }
    return { confidence: confidences[weakest], alternative };
};

// --- Lecture d'une portée -------------------------------------------------------------------------

interface Glyph { x0: number; x1: number; y0: number; y1: number; string: number; digit: number; read: Reading }
interface TabNote { x: number; string: number; fret: number; scan: ScanReading }

const readStaff = (gray: Gray, staff: Line[]): { notes: TabNote[]; bars: number[]; gap: number } => {
    const { lum, width } = gray;
    const gap = staffGap(staff);
    const top = Math.max(0, Math.floor(staff[0].y - gap * 0.6));
    const bottom = Math.ceil(staff[LINES_PER_TAB_STAFF - 1].y + gap * 0.6);
    const h = bottom - top;
    // Lignes grises plus claires que les chiffres : le seuil de l'encre passe juste sous leur teinte,
    // pour qu'un chiffre traversé par une ligne (sans fond blanc) s'en distingue
    const lineShades: number[] = [];
    for (const line of staff) for (let x = 0; x < width; x += 3) {
        let darkest = 255;
        for (let y = line.top; y <= line.bottom; y++) darkest = Math.min(darkest, lum[y * width + x]);
        if (darkest < gray.lineThreshold) lineShades.push(darkest);
    }
    lineShades.sort((a, b) => a - b);
    const lineShade = lineShades.length ? lineShades[Math.floor(lineShades.length / 2)] : 0;
    const range = gray.paper - gray.ink;
    const inkThreshold = lineShade > gray.ink + range * 0.3 && lineShade < gray.inkThreshold + 10
        ? Math.min(gray.inkThreshold, Math.max(Math.round(gray.ink + range / 2), lineShade - 8))
        : gray.inkThreshold;
    // Portée minuscule (image d'origine) : les chiffres se lisent dans l'image d'origine, voir classifyTiny
    const source = gray.source;
    const tinyStaff = !!source && gap / gray.zoom * source.zoom < TINY_GAP_PX;
    const nativePatch = (x0: number, y0: number, gw: number, gh: number, pixel: (x: number, y: number) => boolean): Patch | null => {
        const s = source!, k = s.zoom / gray.zoom;
        const nx0 = Math.floor(x0 * k), ny0 = Math.floor((y0 + top) * k);
        const nx1 = Math.ceil((x0 + gw) * k), ny1 = Math.ceil((y0 + top + gh) * k);
        const range = s.paper - s.ink;
        // Seulement là où le chiffre a de l'encre (ni ligne de portée, ni voisin)
        return cropPatch((x, y) => {
            const sx = nx0 + x, sy = ny0 + y;
            const ax = Math.floor((sx + 0.5) / k) - x0, ay = Math.floor((sy + 0.5) / k) - y0 - top;
            if (ax < 0 || ay < 0 || ax >= gw || ay >= gh || !pixel(ax, ay)) return 0;
            return Math.max(0, Math.min(1, (s.paper - s.lum[sy * s.width + sx]) / range));
        }, nx1 - nx0, ny1 - ny0);
    };
    const ink = new Uint8Array(width * h);
    const inkLum = tinyStaff ? gray.darkest : lum;
    for (let y = 0; y < h; y++) for (let x = 0; x < width; x++) ink[y * width + x] = inkLum[(y + top) * width + x] < inkThreshold ? 1 : 0;
    const at = (x: number, y: number) => (x >= 0 && x < width && y >= 0 && y < h ? ink[y * width + x] : 0);

    // Barres de mesure : colonnes encrées sur toute la hauteur de la portée
    const lineTop = Math.round(staff[0].y - top), lineBottom = Math.round(staff[LINES_PER_TAB_STAFF - 1].y - top);
    const bars: number[] = [];
    // (seuil des lignes : les barres sont souvent aussi fines et grises que les lignes de portée)
    const columnDark = (x: number) => {
        let dark = 0;
        for (let y = lineTop; y <= lineBottom; y++) if (lum[(y + top) * width + x] < gray.lineThreshold) dark++;
        return dark / (lineBottom - lineTop + 1);
    };
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

    // Copie intacte (avant effacement des lignes) : sert à reconnaître les chiffres coupés par une ligne
    const intact = ink.slice();
    const intactAt = (x: number, y: number) => (x >= 0 && x < width && y >= 0 && y < h ? intact[y * width + x] : 0);

    // Effacement des lignes de portée, sauf là où un trait vertical de chiffre les traverse.
    // Un trait oblique (le 2, le 7…) peut être coupé : les morceaux sont recollés plus bas.
    const lineBands = staff.map(line => ({ t: line.top - top - 1, b: line.bottom - top + 1 }));
    // Seuls les longs tracés horizontaux sont de la ligne : un trait de chiffre posé sur la ligne
    // (haut de la boucle du 6, taille du 8) est court et doit rester, sinon la boucle s'ouvre.
    const minLineRun = gap * 1.2;
    const lineRun = new Uint8Array(width);
    for (const { t, b } of lineBands) {
        lineRun.fill(0);
        for (let y = t + 1; y < b; y++) {
            if (y < 0 || y >= h) continue;
            let start = -1;
            for (let x = 0; x <= width; x++) {
                const on = x < width && ink[y * width + x] === 1;
                if (on && start < 0) start = x;
                if (!on && start >= 0) {
                    if (x - start >= minLineRun) for (let k = start; k < x; k++) lineRun[k] = 1;
                    start = -1;
                }
            }
        }
        for (let x = 0; x < width; x++) {
            if (!lineRun[x] || (at(x, t) && at(x, b))) continue;
            for (let y = t + 1; y < b; y++) if (y >= 0 && y < h) ink[y * width + x] = 0;
        }
    }

    // Composantes connexes
    interface Part { x0: number; x1: number; y0: number; y1: number; count: number; rejoined?: boolean }
    const seen = new Uint8Array(width * h);
    const parts: Part[] = [];
    for (let start = 0; start < ink.length; start++) {
        if (!ink[start] || seen[start]) continue;
        const stack = [start];
        seen[start] = 1;
        const part = { x0: width, x1: 0, y0: h, y1: 0, count: 0 };
        while (stack.length) {
            const p = stack.pop()!;
            const x = p % width, y = (p - x) / width;
            part.count++;
            part.x0 = Math.min(part.x0, x); part.x1 = Math.max(part.x1, x); part.y0 = Math.min(part.y0, y); part.y1 = Math.max(part.y1, y);
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
                const nx = x + dx, ny = y + dy;
                if (nx < 0 || nx >= width || ny < 0 || ny >= h) continue;
                const q = ny * width + nx;
                if (ink[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
            }
        }
        parts.push(part);
    }

    // Recollage des morceaux d'un même chiffre coupé net par une ligne : l'un finit juste au-dessus
    // de la ligne, l'autre commence juste en dessous, et ils se superposent horizontalement
    let merged = true;
    while (merged) {
        merged = false;
        for (let i = 0; i < parts.length && !merged; i++) {
            for (let j = 0; j < parts.length && !merged; j++) {
                const a = parts[i], b = parts[j];
                if (i === j) continue;
                const overlap = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
                if (overlap < -2) continue;
                const cut = lineBands.some(band => Math.abs(a.y1 - band.t) <= 1 && Math.abs(b.y0 - band.b) <= 1);
                if (!cut) continue;
                parts[i] = { x0: Math.min(a.x0, b.x0), x1: Math.max(a.x1, b.x1), y0: a.y0, y1: b.y1, count: a.count + b.count, rejoined: true };
                parts.splice(j, 1);
                merged = true;
            }
        }
    }

    // Portée minuscule : les chiffres d'un nombre (10, 12…) se touchent par leurs bords flous.
    // Un glyphe trop large est coupé à sa colonne la plus creuse, si elle l'est nettement.
    if (tinyStaff) {
        for (let i = parts.length - 1; i >= 0; i--) {
            const part = parts[i];
            const gw = part.x1 - part.x0 + 1, gh = part.y1 - part.y0 + 1;
            if (gw <= gh || gw > gap * 2.5 || gh < gap * 0.45) continue;
            const column = (x: number) => { let n = 0; for (let y = part.y0; y <= part.y1; y++) n += at(x, y); return n; };
            const counts = Array.from({ length: gw }, (_, k) => column(part.x0 + k));
            let cut = -1;
            for (let k = Math.round(gw * 0.3); k <= Math.round(gw * 0.7); k++) if (cut < 0 || counts[k] < counts[cut]) cut = k;
            if (counts[cut] > Math.max(...counts) * 0.25) continue;
            const left = { ...part, x1: part.x0 + cut - 1, count: Math.round(part.count * cut / gw) };
            const right = { ...part, x0: part.x0 + cut + 1, count: part.count - left.count };
            parts.splice(i, 1, left, right);
        }
    }

    const glyphs: Glyph[] = [];
    for (const { x0, x1, y0, y1, count, rejoined } of parts) {
        const gh = y1 - y0 + 1, gw = x1 - x0 + 1;
        // Un chiffre de tablature : à peu près la hauteur d'un interligne, centré sur une ligne
        // (un trait vertical très fin est une hampe ou un reste de barre, pas un chiffre)
        if (gh < gap * 0.45 || gh > gap * 1.15 || gw > gap * 1.1 || gw < gh * 0.2 || count < 6) continue;
        // Collé à une barre de mesure : reste de double barre ou point de reprise, jamais un chiffre
        if (bars.some(b => b > x0 - gap * 0.5 && b < x1 + gap * 0.5)) continue;
        const cy = (y0 + y1) / 2 + top;
        const nearest = staff.reduce((best, line, k) => Math.abs(line.y - cy) < Math.abs(staff[best].y - cy) ? k : best, 0);
        if (Math.abs(staff[nearest].y - cy) > gap * 0.4) continue; // signe de mesure (4/4), texte…
        // Chiffre recollé : on le lit dans la copie intacte (sinon il lui manque la rangée de la ligne)
        const pixel = (x: number, y: number) => (rejoined ? intactAt(x0 + x, y0 + y) : at(x0 + x, y0 + y)) === 1;
        // Boucles. Sur un chiffre minuscule agrandi, tout est flou : on les cherche d'abord avec le seuil
        // strict (un trou grisé compte comme un trou, la queue d'un 9 qui frôle sa boucle ne la ferme pas),
        // puis avec le seuil normal s'il n'en voit aucune (traits pâles).
        const tiny = gh / gray.zoom < TINY_DIGIT_PX;
        const solid = (x: number, y: number) => pixel(x, y) && lum[(y0 + y + top) * width + x0 + x] < gray.holeThreshold;
        const strictLoops = tiny ? findLoops(solid, gw, gh) : { count: 0, centerY: 0.5, height: 0 };
        const loops = strictLoops.count > 0 ? strictLoops : findLoops(pixel, gw, gh);
        if (isSlideMark(pixel, gw, gh)) continue;
        const read = tinyStaff ? classifyTiny(nativePatch(x0, y0, gw, gh, pixel) ?? { w: 1, h: 1, dark: new Float32Array(1) })
            : classifyDigit(normalize(pixel, gw, gh), gw / gh, gh, digitsForLoops(loops, tiny));
        glyphs.push({ x0, x1, y0, y1, string: nearest + 1, digit: read.digit, read });
    }

    // Chiffres voisins sur la même corde = un nombre (10, 12…)
    glyphs.sort((a, b) => a.string - b.string || a.x0 - b.x0);
    const notes: TabNote[] = [];
    for (let i = 0; i < glyphs.length; i++) {
        const group = [glyphs[i]];
        if (glyphs[i].digit !== MUTED) {
            while (i + 1 < glyphs.length && glyphs[i + 1].string === glyphs[i].string && glyphs[i + 1].digit >= 0 && glyphs[i + 1].x0 - glyphs[i].x1 < gap * 0.35) {
                group.push(glyphs[++i]);
            }
        }
        const fret = group[0].digit === MUTED ? MUTED : Number(group.map(g => g.digit).join(''));
        if (fret > 24) continue;
        const x0 = group[0].x0, x1 = group[group.length - 1].x1;
        const y0 = Math.min(...group.map(g => g.y0)), y1 = Math.max(...group.map(g => g.y1));
        notes.push({
            x: (x0 + x1) / 2, string: group[0].string, fret,
            scan: {
                ...groupConfidence(group, tinyStaff),
                box: { x: x0 / gray.zoom, y: (y0 + top) / gray.zoom, w: (x1 - x0 + 1) / gray.zoom, h: (y1 - y0 + 1) / gray.zoom },
            },
        });
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
        return chord.map((n, k) => ({ string: n.string, fret: n.fret, duration: k === chord.length - 1 ? durations[i] : 0, scan: n.scan }));
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

        const out = platform.createCanvas(Math.round(width * zoom) + LABEL_MARGIN_PX, Math.round((bottom - top) * zoom));
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
