/**
 * Palisade — pinceau : colle un trait dessiné à main levée sur les murs dessinés dans l'image.
 *
 * Fonctionnement (suivi de contour, comme les « ciseaux intelligents ») :
 *   1. On lit l'image dans une zone autour du trait.
 *   2. Une carte de « force de mur » est calculée en chaque pixel, dans quatre directions,
 *      avec deux détecteurs :
 *        - bande : une bande dont la couleur diffère de ses deux côtés (trait dessiné, mur de
 *                  pierre entre herbe et parquet…) → on vise le milieu du mur ;
 *        - bord  : un changement de matière d'un côté à l'autre (parquet contre dalles).
 *      Chaque détecteur est noté sur la zone, et le mélange suit cette note : le pinceau
 *      s'adapte à chaque carte et à chaque trait.
 *   3. Des points d'ancrage sont posés sur les murs les plus forts près du début et de la fin
 *      du trait (et tout autour pour une boucle fermée). Entre deux ancrages, on cherche le chemin le moins coûteux (Dijkstra) :
 *      il suit les murs et tourne avec eux, avec une préférence pour ceux proches du trait.
 *   4. Les bouts du chemin qui ne longent aucun mur (trait qui déborde) sont retirés.
 *   5. Le chemin est simplifié en quelques segments, avec des angles vifs.
 *
 * Aucune dépendance : le même fichier sert dans Foundry, dans le banc d'essai et dans les tests.
 */

export const BRUSH_DEFAULTS = {
  radius: 48, // distance maximale entre le trait et le mur cherché (unités monde)
  pull: 0.3, // préférence pour les murs proches du trait
  simplify: 2.5, // tolérance de simplification (unités monde)
  minConfidence: 0.3, // en dessous, aucun mur net : le trait est gardé tel quel
  maxPixels: 600000 // au-delà, la zone est lue à résolution réduite
};

const RIDGE_WIDTHS = [1, 2, 3, 5, 8, 12, 16];
const STEP_WIDTHS = [3, 6, 10];
const MARGIN = 32; // contexte lu autour de la zone, pour voir les deux côtés d'un mur épais
const ON_WALL = 0.5; // force à partir de laquelle un ancrage est sur un mur
const TRIM = 0.35; // force sous laquelle un bout de chemin ne longe plus de mur
const WAYPOINT_SAMPLES = 12; // un ancrage tous les 12 échantillons (échantillons tous les R/3 ≈ 4R)

/* -------------------------------------------- */
/*  Polylignes                                  */
/* -------------------------------------------- */

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function polylineLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += dist(points[i - 1], points[i]);
  return total;
}

/** Points régulièrement espacés le long d'une polyligne. */
export function resample(points, spacing) {
  if (points.length < 2) return points.map((p) => [p[0], p[1]]);
  const out = [[points[0][0], points[0][1]]];
  let carry = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const len = dist(a, b);
    if (!len) continue;
    let d = spacing - carry;
    while (d <= len) {
      const t = d / len;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      d += spacing;
    }
    carry = len - (d - spacing);
  }
  const last = points[points.length - 1];
  if (dist(out[out.length - 1], last) > spacing * 0.25) out.push([last[0], last[1]]);
  return out;
}

/** Moyenne glissante, extrémités conservées. */
export function smoothPolyline(points, half = 2) {
  const n = points.length;
  return points.map((p, i) => {
    if (i === 0 || i === n - 1) return [p[0], p[1]];
    const h = Math.min(half, i, n - 1 - i);
    let x = 0;
    let y = 0;
    for (let k = -h; k <= h; k++) {
      x += points[i + k][0];
      y += points[i + k][1];
    }
    return [x / (2 * h + 1), y / (2 * h + 1)];
  });
}

/** Simplification de Ramer-Douglas-Peucker. */
export function simplify(points, tolerance) {
  if (points.length < 3) return points.map((p) => [p[0], p[1]]);
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    const a = points[s];
    const b = points[e];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    let best = -1;
    let bestD = tolerance;
    for (let i = s + 1; i < e; i++) {
      const p = points[i];
      const d = len ? Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / len : dist(p, a);
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best > 0) {
      keep[best] = 1;
      stack.push([s, best], [best, e]);
    }
  }
  return points.filter((_, i) => keep[i]).map((p) => [p[0], p[1]]);
}

/**
 * Angles vifs : deux longs segments reliés par de petits segments de transition (un coin
 * arrondi) sont prolongés jusqu'à leur intersection.
 * @param {number} shortLength  longueur en dessous de laquelle un segment est une transition
 * @param {number[][]} [guide]   chemin réellement suivi : un angle reconstruit à plus de `maxGap`
 *                               de ce chemin est refusé (une courbe n'a pas d'angle à inventer)
 * @param {number} [maxGap]
 */
export function sharpenCorners(points, shortLength, guide = null, maxGap = Infinity) {
  if (points.length < 4) return points.map((p) => [p[0], p[1]]);
  const out = [[points[0][0], points[0][1]]];
  let i = 1;
  while (i < points.length) {
    let j = i;
    while (j < points.length - 1 && dist(points[j], points[j + 1]) < shortLength) j++;
    const a0 = out[out.length - 1];
    const a1 = points[i];
    if (j > i && j < points.length - 1 && dist(a0, a1) >= shortLength) {
      const corner = intersect(a0, a1, points[j], points[j + 1]);
      const nearGuide = !guide || guide.some((g) => dist(g, corner ?? g) <= maxGap);
      if (corner && nearGuide && dist(corner, a1) < shortLength * 2 && dist(corner, points[j]) < shortLength * 2) {
        out.push(corner);
        i = j + 1;
        continue;
      }
    }
    out.push([a1[0], a1[1]]);
    i++;
  }
  return out;
}

/**
 * Crochets d'extrémité : un dernier (ou premier) segment court qui part de travers est un reste
 * du bout de trait sans mur (fin de mur dessiné, coin) ; on le retire.
 */
export function dropEndHooks(points, maxLength) {
  const pts = points.map((p) => [p[0], p[1]]);
  const turn = (a, b, c) => {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const vx = c[0] - b[0];
    const vy = c[1] - b[1];
    const cos = (ux * vx + uy * vy) / ((Math.hypot(ux, uy) * Math.hypot(vx, vy)) || 1);
    return Math.acos(Math.max(-1, Math.min(1, cos)));
  };
  const limit = (30 * Math.PI) / 180;
  while (pts.length > 2) {
    const n = pts.length;
    if (dist(pts[n - 2], pts[n - 1]) < maxLength && turn(pts[n - 3], pts[n - 2], pts[n - 1]) > limit) pts.pop();
    else break;
  }
  while (pts.length > 2) {
    if (dist(pts[0], pts[1]) < maxLength && turn(pts[2], pts[1], pts[0]) > limit) pts.shift();
    else break;
  }
  return pts;
}

/** Intersection des droites (a0 a1) et (b0 b1), si elles font un angle d'au moins 20°. */
function intersect(a0, a1, b0, b1) {
  const dax = a1[0] - a0[0];
  const day = a1[1] - a0[1];
  const dbx = b1[0] - b0[0];
  const dby = b1[1] - b0[1];
  const cross = dax * dby - day * dbx;
  const sin = Math.abs(cross) / (Math.hypot(dax, day) * Math.hypot(dbx, dby) || 1);
  if (sin < Math.sin((20 * Math.PI) / 180)) return null;
  const t = ((b0[0] - a0[0]) * dby - (b0[1] - a0[1]) * dbx) / cross;
  return [a0[0] + dax * t, a0[1] + day * t];
}

/* -------------------------------------------- */
/*  Détecteurs 1D (sur une ligne de pixels)     */
/* -------------------------------------------- */

// Sommes cumulées réutilisées d'une ligne à l'autre (r, g, b entrelacés : pre[3 * o + c])
let PRE = new Float64Array(0);

function lineSums(rgb, n) {
  if (PRE.length < 3 * (n + 1)) PRE = new Float64Array(3 * (n + 1) * 2);
  const pre = PRE;
  pre[0] = pre[1] = pre[2] = 0;
  for (let o = 0; o < n; o++) {
    const a = 3 * o;
    pre[a + 3] = pre[a] + rgb[a];
    pre[a + 4] = pre[a + 1] + rgb[a + 1];
    pre[a + 5] = pre[a + 2] + rgb[a + 2];
  }
  return pre;
}

/**
 * Bande dont la couleur diffère de ses deux côtés, à l'épaisseur la mieux adaptée.
 * Mesure : distance de la couleur du centre au segment [couleur gauche, couleur droite].
 * Un centre posé sur une frontière de matière est un mélange des deux côtés : il tombe sur le
 * segment et ne répond pas. Une vraie bande de matière, ou un trait, en est loin.
 * @param {Float32Array} rgb  ligne de n pixels (r, g, b entrelacés)
 */
function ridgeLine(rgb, n, out, widthOut, mask, darkOut) {
  const pre = lineSums(rgb, n);
  const nw = RIDGE_WIDTHS.length;
  for (let o = 0; o < n; o++) {
    out[o] = 0;
    widthOut[o] = 0;
    darkOut[o] = 0;
    if (!mask[o]) continue;
    let best = 0;
    let bestH = 0;
    let bestDark = 0;
    for (let k = 0; k < nw; k++) {
      const h = RIDGE_WIDTHS[k];
      const g = h < 2 ? 2 : h;
      if (o - h - g < 0 || o + h + g >= n) break;
      // moyennes : gauche [o-h-g, o-h-1], centre [o-h, o+h], droite [o+h+1, o+h+g]
      const la = 3 * (o - h - g);
      const ma = 3 * (o - h);
      const ra = 3 * (o + h + 1);
      const rb = 3 * (o + h + g + 1);
      const ig = 1 / g;
      const im = 1 / (2 * h + 1);
      const l0 = (pre[ma] - pre[la]) * ig, l1 = (pre[ma + 1] - pre[la + 1]) * ig, l2 = (pre[ma + 2] - pre[la + 2]) * ig;
      const m0 = (pre[ra] - pre[ma]) * im, m1 = (pre[ra + 1] - pre[ma + 1]) * im, m2 = (pre[ra + 2] - pre[ma + 2]) * im;
      const r0 = (pre[rb] - pre[ra]) * ig, r1 = (pre[rb + 1] - pre[ra + 1]) * ig, r2 = (pre[rb + 2] - pre[ra + 2]) * ig;
      const d0 = r0 - l0, d1 = r1 - l1, d2 = r2 - l2;
      const e0 = m0 - l0, e1 = m1 - l1, e2 = m2 - l2;
      const lr2 = d0 * d0 + d1 * d1 + d2 * d2;
      let t = lr2 ? (e0 * d0 + e1 * d1 + e2 * d2) / lr2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const f0 = e0 - t * d0, f1 = e1 - t * d1, f2 = e2 - t * d2;
      const v = f0 * f0 + f1 * f1 + f2 * f2;
      if (v > best) {
        best = v;
        bestH = h;
      }
      // En niveaux de gris : un trait plus sombre que ses deux côtés (contour à l'encre)
      const lumL = 0.299 * l0 + 0.587 * l1 + 0.114 * l2;
      const lumM = 0.299 * m0 + 0.587 * m1 + 0.114 * m2;
      const lumR = 0.299 * r0 + 0.587 * r1 + 0.114 * r2;
      const dark = Math.min(lumL - lumM, lumR - lumM);
      if (dark > bestDark) bestDark = dark;
    }
    out[o] = Math.sqrt(best / 3);
    widthOut[o] = 2 * bestH + 1;
    darkOut[o] = bestDark;
  }
}

/** Changement de couleur moyenne entre les deux côtés d'un point. */
function stepLine(rgb, n, out, mask) {
  const pre = lineSums(rgb, n);
  const nw = STEP_WIDTHS.length;
  for (let o = 0; o < n; o++) {
    out[o] = 0;
    if (!mask[o]) continue;
    let best = 0;
    for (let k = 0; k < nw; k++) {
      const w = STEP_WIDTHS[k];
      if (o - w < 0 || o + w >= n) break;
      // gauche [o-w, o-1], droite [o+1, o+w]
      const la = 3 * (o - w);
      const lb = 3 * o;
      const ra = 3 * (o + 1);
      const rb = 3 * (o + w + 1);
      const iw = 1 / w;
      const d0 = (pre[lb] - pre[la] - pre[rb] + pre[ra]) * iw;
      const d1 = (pre[lb + 1] - pre[la + 1] - pre[rb + 1] + pre[ra + 1]) * iw;
      const d2 = (pre[lb + 2] - pre[la + 2] - pre[rb + 2] + pre[ra + 2]) * iw;
      const v = d0 * d0 + d1 * d1 + d2 * d2;
      if (v > best) best = v;
    }
    out[o] = Math.sqrt(best / 3);
  }
}

/* -------------------------------------------- */
/*  Zone de travail                             */
/* -------------------------------------------- */

/** Lit la zone [x0, x0 + W) × [y0, y0 + H) de l'image réduite d'un facteur f, floutée 3×3. */
function readRegion(image, x0, y0, W, H, f) {
  const { width: iw, height: ih, data } = image;
  const raw = new Float32Array(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;
      for (let dy = 0; dy < f; dy++) {
        const iy = (y0 + y) * f + dy;
        if (iy < 0 || iy >= ih) continue;
        for (let dx = 0; dx < f; dx++) {
          const ix = (x0 + x) * f + dx;
          if (ix < 0 || ix >= iw) continue;
          const i = (iy * iw + ix) * 4;
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
          count++;
        }
      }
      const o = (y * W + x) * 3;
      raw[o] = count ? r / count : 0;
      raw[o + 1] = count ? g / count : 0;
      raw[o + 2] = count ? b / count : 0;
    }
  }
  // flou 3×3 : atténue le grain des textures
  const out = new Float32Array(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      for (let c = 0; c < 3; c++) {
        let s = 0;
        let k = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= H) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= W) continue;
            s += raw[(yy * W + xx) * 3 + c];
            k++;
          }
        }
        out[(y * W + x) * 3 + c] = s / k;
      }
    }
  }
  return out;
}

/**
 * Applique les détecteurs 1D le long des lignes de pixels dans quatre directions et garde,
 * pour chaque pixel, la réponse la plus forte. Une ligne horizontale de pixels détecte les
 * murs verticaux, une colonne les murs horizontaux, les diagonales les murs en biais.
 * Seuls les pixels de `mask` sont calculés (les autres servent de contexte).
 */
function wallMaps(rgb, W, H, mask) {
  const ridge = new Float32Array(W * H);
  const step = new Float32Array(W * H);
  const width = new Float32Array(W * H);
  const dark = new Float32Array(W * H);
  const maxLen = W + H;
  const buf = new Float32Array(maxLen * 3);
  const rOut = new Float32Array(maxLen);
  const sOut = new Float32Array(maxLen);
  const idx = new Int32Array(maxLen);
  const wOut = new Float32Array(maxLen);
  const mOut = new Uint8Array(maxLen);
  const dOut = new Float32Array(maxLen);

  const run = (x, y, dx, dy) => {
    let n = 0;
    let any = 0;
    while (x >= 0 && x < W && y >= 0 && y < H) {
      const i = y * W + x;
      idx[n] = i;
      mOut[n] = mask[i];
      any |= mask[i];
      buf[n * 3] = rgb[i * 3];
      buf[n * 3 + 1] = rgb[i * 3 + 1];
      buf[n * 3 + 2] = rgb[i * 3 + 2];
      n++;
      x += dx;
      y += dy;
    }
    if (n < 5 || !any) return;
    ridgeLine(buf, n, rOut, wOut, mOut, dOut);
    stepLine(buf, n, sOut, mOut);
    for (let k = 0; k < n; k++) {
      const i = idx[k];
      if (rOut[k] > ridge[i]) {
        ridge[i] = rOut[k];
        // le long d'une diagonale, un pas vaut √2 px
        width[i] = dx && dy ? wOut[k] * Math.SQRT2 : wOut[k];
      }
      if (sOut[k] > step[i]) step[i] = sOut[k];
      if (dOut[k] > dark[i]) dark[i] = dOut[k];
    }
  };

  for (let y = 0; y < H; y++) run(0, y, 1, 0);
  for (let x = 0; x < W; x++) run(x, 0, 0, 1);
  for (let x = 0; x < W; x++) run(x, 0, 1, 1);
  for (let y = 1; y < H; y++) run(0, y, 1, 1);
  for (let x = 0; x < W; x++) run(x, H - 1, 1, -1);
  for (let y = 0; y < H - 1; y++) run(0, y, 1, -1);
  return { ridge, step, width, dark };
}

/** Distance (par excès d'au plus un demi-échantillon) de chaque pixel au trait, dans un rayon R. */
function stampDistance(samples, W, H, R, out, box) {
  const R2 = R * R;
  for (const [sx, sy] of samples) {
    const xa = Math.max(0, Math.floor(sx - R));
    const xb = Math.min(W - 1, Math.ceil(sx + R));
    const ya = Math.max(0, Math.floor(sy - R));
    const yb = Math.min(H - 1, Math.ceil(sy + R));
    if (xa > xb || ya > yb) continue;
    box[0] = Math.min(box[0], xa);
    box[1] = Math.min(box[1], ya);
    box[2] = Math.max(box[2], xb);
    box[3] = Math.max(box[3], yb);
    for (let y = ya; y <= yb; y++) {
      for (let x = xa; x <= xb; x++) {
        const d2 = (x - sx) ** 2 + (y - sy) ** 2;
        if (d2 > R2) continue;
        const i = y * W + x;
        const d = Math.sqrt(d2);
        if (d < out[i]) out[i] = d;
      }
    }
  }
}

function percentile(values, q, mask) {
  const sample = [];
  const step = Math.max(1, Math.floor(values.length / 20000));
  for (let i = 0; i < values.length; i += step) if (!mask || mask[i]) sample.push(values[i]);
  if (!sample.length) return 0;
  sample.sort((a, b) => a - b);
  return sample[Math.min(sample.length - 1, Math.floor(q * sample.length))];
}

/* -------------------------------------------- */
/*  Chemin le moins coûteux                     */
/* -------------------------------------------- */

class Heap {
  constructor() {
    this.keys = [];
    this.vals = [];
  }
  get size() {
    return this.keys.length;
  }
  push(key, val) {
    const k = this.keys;
    const v = this.vals;
    let i = k.length;
    k.push(key);
    v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p];
      v[i] = v[p];
      i = p;
    }
    k[i] = key;
    v[i] = val;
  }
  pop() {
    const k = this.keys;
    const v = this.vals;
    const top = v[0];
    const lastK = k.pop();
    const lastV = v.pop();
    if (k.length) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= k.length) break;
        if (c + 1 < k.length && k[c + 1] < k[c]) c++;
        if (k[c] >= lastK) break;
        k[i] = k[c];
        v[i] = v[c];
        i = c;
      }
      k[i] = lastK;
      v[i] = lastV;
    }
    return top;
  }
}

const NEIGHBORS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]
];

/** Dijkstra de `from` à `to` sur le coût par pixel `cost` (Infinity = interdit), dans `box`. */
function cheapestPath(cost, W, from, to, box, acc, prev) {
  const [xa, ya, xb, yb] = box;
  for (let y = ya; y <= yb; y++) acc.fill(Infinity, y * W + xa, y * W + xb + 1);
  const heap = new Heap();
  acc[from] = 0;
  prev[from] = -1;
  heap.push(0, from);
  while (heap.size) {
    const i = heap.pop();
    if (i === to) break;
    const base = acc[i];
    const x = i % W;
    const y = (i - x) / W;
    for (const [dx, dy, len] of NEIGHBORS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < xa || nx > xb || ny < ya || ny > yb) continue;
      const j = ny * W + nx;
      const c = cost[j];
      if (c === Infinity) continue;
      const v = base + ((cost[i] + c) / 2) * len;
      if (v < acc[j]) {
        acc[j] = v;
        prev[j] = i;
        heap.push(v, j);
      }
    }
  }
  if (acc[to] === Infinity) return null;
  const path = [];
  for (let i = to; i !== -1; i = prev[i]) {
    path.push(i);
    if (i === from) break;
  }
  return path.reverse();
}

/* -------------------------------------------- */
/*  Point d'entrée                              */
/* -------------------------------------------- */

/**
 * Colle un trait sur les murs dessinés dans l'image.
 * @param {number[][]} stroke  points du trait, en coordonnées monde
 * @param {{width: number, height: number, data: ArrayLike<number>, originX?: number,
 *          originY?: number, scale?: number}} image
 *        pixels RGBA ; (originX, originY) est la position monde du pixel (0, 0) et `scale` le
 *        nombre de pixels d'image par unité monde
 * @param {object} [options]  voir BRUSH_DEFAULTS
 * @returns {{ok: boolean, points: number[][], confidence: number,
 *            weights: {ridge: number, dark: number, step: number}, closed: boolean, path: number[][]}}
 *   ok         : des murs nets ont été trouvés (sinon `points` est le trait simplifié, non collé)
 *   points     : sommets des murs à créer, arrondis, en coordonnées monde
 *   confidence : 0–1, force moyenne des murs suivis
 *   weights    : part de chaque détecteur (bande de couleur / trait sombre / bord de matière)
 *   path       : chemin suivi avant simplification (pour l'aperçu)
 */
export function snapStroke(stroke, image, options = {}) {
  const opt = { ...BRUSH_DEFAULTS, ...options };
  const sc = image.scale ?? 1;
  const ox = image.originX ?? 0;
  const oy = image.originY ?? 0;

  const rawLength = polylineLength(stroke);
  const closed = stroke.length > 2 && rawLength > 6 * opt.radius &&
    dist(stroke[0], stroke[stroke.length - 1]) < opt.radius * 0.75;
  const round = (pts) => pts.map((p) => [Math.round(p[0]), Math.round(p[1])]);
  const closeLoop = (pts) => {
    if (closed && pts.length > 2) pts[pts.length - 1] = [...pts[0]];
    return pts;
  };
  const fallback = (confidence = 0, weights = { ridge: 0, dark: 0, step: 0 }) => {
    const pts = closeLoop(round(simplify(smoothPolyline(resample(stroke, 4), 2), opt.simplify)));
    return { ok: false, points: pts, confidence, weights, closed, path: pts };
  };
  if (stroke.length < 2 || rawLength < 2) return fallback();

  // Zone de travail, en pixels d'image réduits d'un facteur f
  const imgPts = stroke.map((p) => [(p[0] - ox) * sc, (p[1] - oy) * sc]);
  const Rimg = opt.radius * sc;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of imgPts) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const area = (maxX - minX + 2 * (Rimg + MARGIN)) * (maxY - minY + 2 * (Rimg + MARGIN));
  const f = Math.max(1, Math.ceil(Math.sqrt(area / opt.maxPixels)));
  const R = Rimg / f;
  const x0 = Math.max(0, Math.floor(minX / f - R - MARGIN));
  const y0 = Math.max(0, Math.floor(minY / f - R - MARGIN));
  const x1 = Math.min(Math.ceil(image.width / f) - 1, Math.ceil(maxX / f + R + MARGIN));
  const y1 = Math.min(Math.ceil(image.height / f) - 1, Math.ceil(maxY / f + R + MARGIN));
  const W = x1 - x0 + 1;
  const H = y1 - y0 + 1;
  if (W < 8 || H < 8) return fallback();
  const local = imgPts.map(([x, y]) => [x / f - x0, y / f - y0]);
  const toWorld = (i) => {
    const x = i % W;
    const y = (i - x) / W;
    return [((x0 + x + 0.5) * f) / sc + ox, ((y0 + y + 0.5) * f) / sc + oy];
  };

  // Bande de recherche autour du trait
  const along = resample(local, Math.max(1, R / 3));
  const band = new Float32Array(W * H).fill(Infinity);
  stampDistance(along, W, H, R, band, [W, H, 0, 0]);
  const inBand = new Uint8Array(W * H);
  for (let i = 0; i < band.length; i++) inBand[i] = band[i] <= R ? 1 : 0;

  // Carte de force de mur, sur la bande ; puis notes des détecteurs et mélange adaptatif
  const rgb = readRegion(image, x0, y0, W, H, f);
  const { ridge, step, width, dark } = wallMaps(rgb, W, H, inBand);

  // Référence haute de chaque détecteur : quasi-maximum de la bande (un écrêtage plus bas
  // aplatirait le sommet d'un trait, et le chemin ne viserait plus son milieu).
  const ridgeTop = percentile(ridge, 0.999, inBand);
  const stepTop = percentile(step, 0.999, inBand);
  const darkTop = percentile(dark, 0.999, inBand);
  if (!ridgeTop && !stepTop && !darkTop) return fallback();
  const contrast = (top) => Math.min(1, top / 24);
  // Un trait fait aussi réagir le détecteur de bord sur ses deux flancs, avec une force
  // comparable ; sur une frontière de matière, une bande répond bien moins que le bord.
  const lineLike = (top) => smoothstep(0.3, 0.6, stepTop ? top / stepTop : 1);
  const sharp = (values, top) => (top ? 1 - percentile(values, 0.5, inBand) / top : 0);
  // Trois détecteurs en concurrence, notés sur la bande : bande de couleur, trait sombre en
  // niveaux de gris (contours à l'encre : les aplats colorés ne le gênent pas), bord de matière.
  const scores = {
    ridge: sharp(ridge, ridgeTop) * contrast(ridgeTop) * lineLike(ridgeTop),
    dark: sharp(dark, darkTop) * contrast(darkTop) * lineLike(darkTop),
    step: sharp(step, stepTop) * contrast(stepTop) * (1 - lineLike(Math.max(ridgeTop, darkTop)))
  };
  const sq = (v) => v ** 4; // le plus net l'emporte nettement
  const total = sq(scores.ridge) + sq(scores.dark) + sq(scores.step);
  if (!total) return fallback();
  const weights = { ridge: sq(scores.ridge) / total, dark: sq(scores.dark) / total, step: sq(scores.step) / total };
  const strength = new Float32Array(W * H);
  for (let i = 0; i < strength.length; i++) {
    const r = ridgeTop ? Math.min(1, ridge[i] / ridgeTop) : 0;
    const dk = darkTop ? Math.min(1, dark[i] / darkTop) : 0;
    const st = stepTop ? Math.min(1, step[i] / stepTop) : 0;
    strength[i] = weights.ridge * r + weights.dark * dk + weights.step * st;
  }

  if (opt.debug) opt.debug({ strength, ridge, step, dark, W, H, x0, y0, f, ridgeTop, stepTop, darkTop });

  // Ancrages : le meilleur point de mur près du début et de la fin (tous les ~4R pour une boucle)
  const anchorNear = ([px, py]) => {
    let best = -1;
    let bestScore = Infinity;
    const xa = Math.max(0, Math.floor(px - R));
    const xb = Math.min(W - 1, Math.ceil(px + R));
    const ya = Math.max(0, Math.floor(py - R));
    const yb = Math.min(H - 1, Math.ceil(py + R));
    for (let y = ya; y <= yb; y++) {
      for (let x = xa; x <= xb; x++) {
        const d = Math.hypot(x - px, y - py);
        if (d > R) continue;
        const i = y * W + x;
        const score = (1 - strength[i]) ** 2 + opt.pull * (d / R) ** 2;
        if (score < bestScore) {
          bestScore = score;
          best = i;
        }
      }
    }
    return best;
  };

  const waypoints = [0];
  for (let k = WAYPOINT_SAMPLES; k < along.length - WAYPOINT_SAMPLES / 2; k += WAYPOINT_SAMPLES) waypoints.push(k);
  if (along.length > 1) waypoints.push(along.length - 1);

  // Trait ouvert : seuls le début et la fin sont ancrés, le chemin choisit la route la plus
  // forte de bout en bout (un ancrage intermédiaire peut tomber sur un joint de sol et forcer un
  // détour). Boucle fermée : il faut des ancrages intermédiaires pour en faire le tour ; on garde
  // ceux posés sur un mur, et au moins les deux du tiers et des deux tiers.
  const candidates = waypoints.map((k, w) => ({ sample: k, index: anchorNear(along[k]), end: w === 0 || w === waypoints.length - 1 }));
  let anchors = candidates.filter((c) => c.index >= 0 && c.end);
  if (closed) {
    const inner = candidates.filter((c) => c.index >= 0 && !c.end);
    let kept = inner.filter((c) => strength[c.index] >= ON_WALL);
    if (kept.length < 2 && inner.length >= 2) {
      kept = [inner[Math.floor(inner.length / 3)], inner[Math.floor((2 * inner.length) / 3)]];
    }
    anchors = [anchors[0], ...kept, anchors[anchors.length - 1]].filter(Boolean);
  }
  if (closed && anchors.length > 2) anchors[anchors.length - 1].index = anchors[0].index;
  if (anchors.length < 2) return fallback();

  // Chemin d'un ancrage au suivant, dans la bande du morceau de trait correspondant
  const cost = new Float32Array(W * H);
  const pieceDist = new Float32Array(W * H);
  const acc = new Float64Array(W * H);
  const prev = new Int32Array(W * H);
  const pixels = [];
  for (let a = 0; a < anchors.length - 1; a++) {
    const A = anchors[a];
    const B = anchors[a + 1];
    if (A.index === B.index) continue;
    const piece = along.slice(Math.max(0, A.sample - 3), Math.min(along.length, B.sample + 4));
    const box = [W, H, 0, 0];
    pieceDist.fill(Infinity);
    stampDistance(piece, W, H, R, pieceDist, box);
    for (let y = box[1]; y <= box[3]; y++) {
      for (let x = box[0]; x <= box[2]; x++) {
        const i = y * W + x;
        const d = pieceDist[i];
        cost[i] = d > R ? Infinity : 0.04 + (1 - strength[i]) ** 2 + opt.pull * (d / R) ** 2;
      }
    }
    for (const i of [A.index, B.index]) if (cost[i] === Infinity) cost[i] = 1.5;
    const path = cheapestPath(cost, W, A.index, B.index, box, acc, prev);
    if (!path) return fallback();
    for (let k = pixels.length ? 1 : 0; k < path.length; k++) pixels.push(path[k]);
  }
  if (pixels.length < 2) return fallback();

  // Retire les bouts qui ne longent aucun mur
  let s = 0;
  let e = pixels.length - 1;
  if (!closed) {
    while (s < e && strength[pixels[s]] < TRIM) s++;
    while (e > s && strength[pixels[e]] < TRIM) e--;
  }
  const kept = pixels.slice(s, e + 1);
  let sum = 0;
  for (const i of kept) sum += strength[i];
  const confidence = Math.min(1, (sum / Math.max(1, kept.length)) * Math.max(contrast(ridgeTop), contrast(stepTop), contrast(darkTop)));
  if (kept.length < 2 || confidence < opt.minConfidence) return fallback(confidence, weights);

  // Un mur épais a un milieu flou où le chemin ondule : la tolérance de simplification suit
  // l'épaisseur mesurée du mur (médiane le long du chemin), en mode bande.
  const widths = kept.map((i) => width[i]).sort((a, b) => a - b);
  const thickness = (widths[widths.length >> 1] * f) / sc;
  // Bornée à deux fois la précision demandée : une ombre portée floue gonfle l'épaisseur mesurée,
  // et au-delà les détails du dessin disparaissent.
  const tolerance = Math.max(opt.simplify, Math.min(opt.simplify * 2, thickness * 0.35 * (weights.ridge + weights.dark)));
  const path = kept.map(toWorld);
  const shortLength = Math.max(10, tolerance * 4);
  const corners = sharpenCorners(simplify(smoothPolyline(path, 2), tolerance), shortLength, path, Math.max(6, tolerance * 2));
  // seconde passe sur les sommets : retire les faux angles presque alignés laissés par la première
  let points = round(simplify(corners, tolerance));
  points = points.filter((p, i) => i === 0 || p[0] !== points[i - 1][0] || p[1] !== points[i - 1][1]);
  if (!closed) points = dropEndHooks(points, Math.max(shortLength, opt.radius * 0.5));
  if (points.length < 2) return fallback(confidence, weights);
  return { ok: true, points: closeLoop(points), confidence, weights, closed, path };
}
