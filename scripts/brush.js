/**
 * Palisade — pinceau : colle un trait dessiné à main levée sur la paroi dessinée dans l'image.
 *
 * Fonctionnement :
 *   1. Le trait est rééchantillonné et lissé : c'est l'axe d'un « couloir » de ±radius px.
 *   2. L'image est lue perpendiculairement au trait en chaque point : on obtient un couloir redressé.
 *   3. Deux détecteurs y cherchent la paroi :
 *        - trait : une bande plus sombre (ou plus claire) que ses deux côtés, à plusieurs épaisseurs
 *                  → murs dessinés, on vise le milieu du trait ;
 *        - bord  : un changement de matière entre les deux côtés (couleur moyenne)
 *                  → cartes réalistes, pierre contre bois.
 *      Chaque détecteur est noté sur ce couloir précis (netteté de son pic), et le mélange suit
 *      cette note : le pinceau s'adapte à chaque carte et même à chaque trait.
 *   4. Un chemin continu traverse le couloir (programmation dynamique) : il suit la paroi la plus
 *      marquée sans sauter d'un mur à l'autre, avec une légère préférence pour le trait dessiné.
 *   5. Le chemin est simplifié en quelques segments (Ramer-Douglas-Peucker).
 *
 * Aucune dépendance : le même fichier sert dans Foundry, dans la page de test et dans les tests Node.
 */

export const BRUSH_DEFAULTS = {
  spacing: 4, // écart entre deux échantillons du trait (px)
  radius: 24, // demi-largeur du couloir de recherche (px)
  maxStep: 2, // décalage latéral maximal d'un échantillon au suivant (px)
  smoothness: 0.08, // pénalité de virage du chemin
  pull: 0.2, // préférence pour rester près du trait dessiné
  simplify: 2.5, // tolérance de simplification (px)
  minConfidence: 0.22 // en dessous, aucune paroi nette : le trait est gardé tel quel
};

const RIDGE_WIDTHS = [1, 2, 3, 5, 8, 12, 16];
const STEP_WIDTHS = [3, 6, 10];
const MARGIN = 32; // = h + g de la plus grande épaisseur cherchée (16 + 16)

/* -------------------------------------------- */
/*  Trait                                       */
/* -------------------------------------------- */

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

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
 * Angles vifs : deux longs segments reliés par de petits segments de transition (le lissage
 * arrondit les coins) sont prolongés jusqu'à leur intersection.
 * @param {number} shortLength  longueur en dessous de laquelle un segment est une transition
 */
export function sharpenCorners(points, shortLength) {
  if (points.length < 4) return points.map((p) => [p[0], p[1]]);
  const out = [[points[0][0], points[0][1]]];
  let i = 1;
  while (i < points.length) {
    // out[last] est le début du segment A = out[last] → points[i]
    let j = i;
    while (j < points.length - 1 && dist(points[j], points[j + 1]) < shortLength) j++;
    // transition : points[i] … points[j], segment B = points[j] → points[j + 1]
    const a0 = out[out.length - 1];
    const a1 = points[i];
    if (j > i && j < points.length - 1 && dist(a0, a1) >= shortLength) {
      const b0 = points[j];
      const b1 = points[j + 1];
      const corner = intersect(a0, a1, b0, b1);
      if (corner && dist(corner, a1) < shortLength * 2 && dist(corner, b0) < shortLength * 2) {
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
/*  Lecture de l'image                          */
/* -------------------------------------------- */

/**
 * Lecture bilinéaire. `image` : { width, height, data (RGBA), originX?, originY?, scale? }.
 * Les points sont en coordonnées « monde » ; (originX, originY) est la position monde du pixel (0, 0)
 * et `scale` le nombre de pixels d'image par unité monde.
 */
function makeSampler(image) {
  const { width: w, height: h, data } = image;
  const ox = image.originX ?? 0;
  const oy = image.originY ?? 0;
  const sc = image.scale ?? 1;
  return (x, y, out) => {
    let ix = (x - ox) * sc;
    let iy = (y - oy) * sc;
    ix = Math.min(Math.max(ix, 0), w - 1);
    iy = Math.min(Math.max(iy, 0), h - 1);
    const x0 = Math.floor(ix);
    const y0 = Math.floor(iy);
    const x1 = Math.min(x0 + 1, w - 1);
    const y1 = Math.min(y0 + 1, h - 1);
    const fx = ix - x0;
    const fy = iy - y0;
    const i00 = (y0 * w + x0) * 4;
    const i10 = (y0 * w + x1) * 4;
    const i01 = (y1 * w + x0) * 4;
    const i11 = (y1 * w + x1) * 4;
    for (let c = 0; c < 3; c++) {
      const top = data[i00 + c] * (1 - fx) + data[i10 + c] * fx;
      const bot = data[i01 + c] * (1 - fx) + data[i11 + c] * fx;
      out[c] = top * (1 - fy) + bot * fy;
    }
  };
}

/* -------------------------------------------- */
/*  Détecteurs                                  */
/* -------------------------------------------- */

function percentile(values, q) {
  const step = Math.max(1, Math.floor(values.length / 4000));
  const sample = [];
  for (let i = 0; i < values.length; i += step) sample.push(values[i]);
  sample.sort((a, b) => a - b);
  return sample[Math.min(sample.length - 1, Math.floor(q * sample.length))] || 0;
}

function normalize(values) {
  const top = percentile(values, 0.98) || 1;
  for (let i = 0; i < values.length; i++) values[i] = Math.min(1, values[i] / top);
}

/** Netteté d'un détecteur : écart moyen entre son pic et sa médiane, ligne par ligne. */
function sharpness(values, S, W) {
  let total = 0;
  const row = new Float32Array(W);
  for (let s = 0; s < S; s++) {
    let max = 0;
    for (let o = 0; o < W; o++) {
      row[o] = values[s * W + o];
      if (row[o] > max) max = row[o];
    }
    row.sort();
    total += max - row[W >> 1];
  }
  return total / S;
}

/**
 * Bande dont la couleur diffère de ses deux côtés (trait dessiné, mur de pierre entre herbe et
 * parquet…), à l'épaisseur la mieux adaptée. Une simple frontière de matière ne répond pas :
 * l'un des côtés y ressemble au centre.
 */
function ridgeDetector(RGB, S, W) {
  const out = new Float32Array(S * W);
  const pre = [new Float64Array(W + 1), new Float64Array(W + 1), new Float64Array(W + 1)];
  const mean = (c, a, b) => (pre[c][b + 1] - pre[c][a]) / (b - a + 1);
  const left = [0, 0, 0];
  const right = [0, 0, 0];
  const mid = [0, 0, 0];
  for (let s = 0; s < S; s++) {
    for (let c = 0; c < 3; c++) {
      for (let o = 0; o < W; o++) pre[c][o + 1] = pre[c][o] + RGB[(s * W + o) * 3 + c];
    }
    for (let o = 0; o < W; o++) {
      let best = 0;
      for (const h of RIDGE_WIDTHS) {
        const g = Math.max(2, h);
        if (o - h - g < 0 || o + h + g >= W) continue;
        // Distance de la couleur du centre au segment [gauche, droite] : un mélange des deux
        // côtés (centre posé sur une frontière) tombe sur le segment, une bande de matière non.
        let lr2 = 0;
        let dot = 0;
        for (let c = 0; c < 3; c++) {
          left[c] = mean(c, o - h - g, o - h - 1);
          right[c] = mean(c, o + h + 1, o + h + g);
          mid[c] = mean(c, o - h, o + h);
          lr2 += (right[c] - left[c]) ** 2;
          dot += (mid[c] - left[c]) * (right[c] - left[c]);
        }
        const t = lr2 ? Math.min(1, Math.max(0, dot / lr2)) : 0;
        let d2 = 0;
        for (let c = 0; c < 3; c++) d2 += (mid[c] - left[c] - t * (right[c] - left[c])) ** 2;
        const v = Math.sqrt(d2 / 3);
        if (v > best) best = v;
      }
      out[s * W + o] = best;
    }
  }
  return out;
}

/** Changement de couleur moyenne entre les deux côtés d'un point. */
function stepDetector(RGB, S, W) {
  const out = new Float32Array(S * W);
  const pre = [new Float64Array(W + 1), new Float64Array(W + 1), new Float64Array(W + 1)];
  for (let s = 0; s < S; s++) {
    for (let c = 0; c < 3; c++) {
      for (let o = 0; o < W; o++) pre[c][o + 1] = pre[c][o] + RGB[(s * W + o) * 3 + c];
    }
    for (let o = 0; o < W; o++) {
      let best = 0;
      for (const w of STEP_WIDTHS) {
        if (o - w < 0 || o + w >= W) continue;
        let d2 = 0;
        for (let c = 0; c < 3; c++) {
          const left = (pre[c][o] - pre[c][o - w]) / w;
          const right = (pre[c][o + w + 1] - pre[c][o + 1]) / w;
          d2 += (left - right) ** 2;
        }
        const v = Math.sqrt(d2 / 3);
        if (v > best) best = v;
      }
      out[s * W + o] = best;
    }
  }
  return out;
}

/** Garde les colonnes [from, from + width) de chaque ligne. */
function crop(values, S, W, from, width) {
  const out = new Float32Array(S * width);
  for (let s = 0; s < S; s++) out.set(values.subarray(s * W + from, s * W + from + width), s * width);
  return out;
}

/** Moyenne le long du trait (lignes voisines) pour atténuer le bruit des textures. */
function blurAlong(values, S, W, stride = 1, half = 1) {
  const out = new Float32Array(values.length);
  for (let s = 0; s < S; s++) {
    const a = Math.max(0, s - half);
    const b = Math.min(S - 1, s + half);
    for (let o = 0; o < W * stride; o++) {
      let sum = 0;
      for (let k = a; k <= b; k++) sum += values[k * W * stride + o];
      out[s * W * stride + o] = sum / (b - a + 1);
    }
  }
  return out;
}

/* -------------------------------------------- */
/*  Chemin                                      */
/* -------------------------------------------- */

function bestPath(cost, S, W, maxStep, smoothness) {
  const acc = new Float32Array(S * W);
  const back = new Int8Array(S * W);
  for (let o = 0; o < W; o++) acc[o] = cost[o];
  for (let s = 1; s < S; s++) {
    for (let o = 0; o < W; o++) {
      let best = Infinity;
      let arg = 0;
      for (let d = -maxStep; d <= maxStep; d++) {
        const p = o + d;
        if (p < 0 || p >= W) continue;
        const v = acc[(s - 1) * W + p] + smoothness * d * d;
        if (v < best) {
          best = v;
          arg = d;
        }
      }
      acc[s * W + o] = best + cost[s * W + o];
      back[s * W + o] = arg;
    }
  }
  let o = 0;
  for (let k = 1; k < W; k++) if (acc[(S - 1) * W + k] < acc[(S - 1) * W + o]) o = k;
  const path = new Int16Array(S);
  for (let s = S - 1; s >= 0; s--) {
    path[s] = o;
    o += back[s * W + o];
  }
  return path;
}

/* -------------------------------------------- */
/*  Point d'entrée                              */
/* -------------------------------------------- */

/**
 * Colle un trait sur la paroi dessinée dans l'image.
 * @param {number[][]} stroke  points du trait, en coordonnées monde
 * @param {object} image       { width, height, data, originX?, originY?, scale? } (voir makeSampler)
 * @param {object} [options]   voir BRUSH_DEFAULTS
 * @returns {{ok: boolean, points: number[][], confidence: number, weights: {ridge: number, step: number},
 *            closed: boolean, path: number[][]}}
 *   ok         : une paroi nette a été trouvée (sinon `points` est le trait simplifié, non collé)
 *   points     : sommets des murs à créer, arrondis
 *   confidence : 0–1, force moyenne de la paroi suivie
 *   weights    : part de chaque détecteur (trait sombre / bord de matière)
 *   path       : chemin collé avant simplification (pour l'aperçu)
 */
export function snapStroke(stroke, image, options = {}) {
  const opt = { ...BRUSH_DEFAULTS, ...options };
  const R = Math.max(4, Math.round(opt.radius));
  const W = 2 * R + 1;

  const rawLength = stroke.slice(1).reduce((sum, p, i) => sum + dist(stroke[i], p), 0);
  const closed = stroke.length > 2 && rawLength > 6 * R && dist(stroke[0], stroke[stroke.length - 1]) < R;
  const round = (pts) => pts.map((p) => [Math.round(p[0]), Math.round(p[1])]);
  const fallback = (confidence = 0, weights = { ridge: 0, step: 0 }) => {
    const pts = round(simplify(smoothPolyline(resample(stroke, opt.spacing), 2), opt.simplify));
    if (closed && pts.length > 2) pts[pts.length - 1] = [...pts[0]];
    return { ok: false, points: pts, confidence, weights, closed, path: pts };
  };

  const axis = smoothPolyline(resample(stroke, opt.spacing), 3);
  const S = axis.length;
  if (S < 3) return fallback();

  // Normales au trait
  const normals = axis.map((_, i) => {
    const a = axis[Math.max(0, i - 2)];
    const b = axis[Math.min(S - 1, i + 2)];
    const tx = b[0] - a[0];
    const ty = b[1] - a[1];
    const len = Math.hypot(tx, ty) || 1;
    return [-ty / len, tx / len];
  });

  // Couloir redressé : S lignes × WF colonnes. La bande lue déborde de MARGIN px de chaque côté
  // du couloir de recherche (W colonnes) : les détecteurs voient les deux côtés d'un mur épais
  // même quand il est au bord du couloir.
  const sample = makeSampler(image);
  const px = [0, 0, 0];
  const pxScale = 1 / (image.scale ?? 1);
  const WF = W + 2 * MARGIN;
  let RGB = new Float32Array(S * WF * 3);
  for (let s = 0; s < S; s++) {
    for (let o = 0; o < WF; o++) {
      const off = (o - R - MARGIN) * pxScale;
      sample(axis[s][0] + normals[s][0] * off, axis[s][1] + normals[s][1] * off, px);
      const i = s * WF + o;
      RGB[i * 3] = px[0];
      RGB[i * 3 + 1] = px[1];
      RGB[i * 3 + 2] = px[2];
    }
  }
  RGB = blurAlong(RGB, S, WF, 3, 1);

  // Détecteurs sur la bande entière, puis réduits au couloir et notés sur lui
  const ridge = crop(ridgeDetector(RGB, S, WF), S, WF, MARGIN, W);
  const step = crop(stepDetector(RGB, S, WF), S, WF, MARGIN, W);
  const ridgeTop = percentile(ridge, 0.98);
  const stepTop = percentile(step, 0.98);
  normalize(ridge);
  normalize(step);
  // Note = netteté du pic × contraste absolu (un détecteur qui ne voit que du bruit pèse peu).
  // Un trait dessiné fait aussi réagir le détecteur de bord, sur ses deux flancs, avec une force
  // comparable : le rapport des contrastes tranche (≈ 0,75 pour un trait, ≈ 0,2 pour une frontière
  // de matière, où un seul côté diffère du centre).
  const contrast = (top) => Math.min(1, top / 24);
  const lineLikeness = smoothstep(0.3, 0.6, stepTop ? ridgeTop / stepTop : 0);
  const sr = sharpness(ridge, S, W) * contrast(ridgeTop) * lineLikeness;
  const se = sharpness(step, S, W) * contrast(stepTop) * (1 - lineLikeness);
  const total = sr * sr + se * se;
  const weights = total ? { ridge: (sr * sr) / total, step: (se * se) / total } : { ridge: 0, step: 0 };

  const strength = new Float32Array(S * W);
  const cost = new Float32Array(S * W);
  for (let s = 0; s < S; s++) {
    for (let o = 0; o < W; o++) {
      const i = s * W + o;
      strength[i] = weights.ridge * ridge[i] + weights.step * step[i];
      cost[i] = 1 - strength[i] + opt.pull * ((o - R) / R) ** 2;
    }
  }

  const offsets = bestPath(cost, S, W, Math.max(1, Math.round(opt.maxStep)), opt.smoothness);
  let sum = 0;
  for (let s = 0; s < S; s++) sum += strength[s * W + offsets[s]];
  const confidence = Math.min(1, (sum / S) * Math.max(contrast(ridgeTop), contrast(stepTop)));
  if (!total || confidence < opt.minConfidence) return fallback(confidence, weights);

  const path = axis.map((p, s) => {
    const off = (offsets[s] - R) * pxScale;
    return [p[0] + normals[s][0] * off, p[1] + normals[s][1] * off];
  });
  const points = round(sharpenCorners(simplify(smoothPolyline(path, 1), opt.simplify), R * 0.9));
  if (closed && points.length > 2) points[points.length - 1] = [...points[0]];
  return { ok: true, points, confidence, weights, closed, path };
}
