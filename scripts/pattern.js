/**
 * Palisade — motifs lumineux (géométrie pure, testée avec node --test).
 *
 * Un mur à motif (grille, herse, croisillons…) laisse passer la lumière entre ses barreaux.
 * Foundry ne connaît que des murs qui bloquent la lumière en entier ou pas du tout : on pose donc
 * le long du mur une rangée de petits segments qui ne bloquent que la lumière, un par barreau.
 * La lumière passe dans les jours entre eux et dessine des ombres en bandes de l'autre côté.
 */

/** Motifs, en fraction de la taille d'une case : écart entre barreaux (d'axe en axe) et épaisseur. */
export const PATTERNS = {
  bars: { spacing: 0.25, thickness: 0.07 }, // barreaux, herse
  lattice: { spacing: 0.5, thickness: 0.14 }, // croisillons, fenêtre à meneaux
  mesh: { spacing: 0.1, thickness: 0.035 } // grillage fin
};

/** Nombre maximal de barreaux par mur : au-delà, l'éclairage de Foundry ralentit. */
export const MAX_BARS = 200;

/**
 * Barreaux d'un mur : segments répartis régulièrement et centrés sur la longueur du mur.
 * @param {number[]} c          coordonnées du mur [x0, y0, x1, y1]
 * @param {number} spacing      écart d'axe en axe entre deux barreaux (unités de scène)
 * @param {number} thickness    épaisseur d'un barreau, mesurée le long du mur
 * @returns {number[][]} coordonnées entières de chaque barreau
 */
export function patternBars(c, spacing, thickness) {
  const [x0, y0, x1, y1] = c;
  const len = Math.hypot(x1 - x0, y1 - y0);
  if (!(len > 0) || !(spacing > 0) || !(thickness > 0)) return [];
  const t = Math.min(thickness, spacing * 0.9, len); // un jour reste toujours ouvert entre deux barreaux
  let n = Math.floor((len - t) / spacing) + 1;
  if (n > MAX_BARS) {
    // shortcut: mur très long ou motif très fin, l'écart est élargi ; à revoir si on veut un motif exact sur un rempart entier
    spacing = (len - t) / (MAX_BARS - 1);
    n = MAX_BARS;
  }
  const ux = (x1 - x0) / len;
  const uy = (y1 - y0) / len;
  const first = (len - (n - 1) * spacing) / 2; // centre du premier barreau : motif centré
  const bars = [];
  for (let k = 0; k < n; k++) {
    const m = first + k * spacing;
    const a = [Math.round(x0 + ux * (m - t / 2)), Math.round(y0 + uy * (m - t / 2))];
    const b = [Math.round(x0 + ux * (m + t / 2)), Math.round(y0 + uy * (m + t / 2))];
    if (a[0] !== b[0] || a[1] !== b[1]) bars.push([a[0], a[1], b[0], b[1]]);
  }
  return bars;
}

/**
 * Écart et épaisseur d'un motif, en unités de scène.
 * @param {string} pattern     clé de PATTERNS
 * @param {number} gridSize    taille d'une case (unités de scène)
 * @param {number} [density]   multiplicateur de l'écart (1 = motif d'origine, 2 = barreaux deux fois plus espacés)
 * @returns {{spacing: number, thickness: number} | null}
 */
export function patternSize(pattern, gridSize, density = 1) {
  const p = PATTERNS[pattern];
  if (!p || !(gridSize > 0)) return null;
  const d = density > 0 ? density : 1;
  const round = (v) => Math.round(v * 10) / 10;
  return { spacing: round(p.spacing * gridSize * d), thickness: Math.max(2, round(p.thickness * gridSize)) };
}

/* -------------------------------------------- */
/*  Chaînes de murs                             */
/* -------------------------------------------- */

const key = (x, y) => `${x},${y}`;

/**
 * Regroupe des murs reliés bout à bout en chaînes (polylignes). Une chaîne s'arrête à une
 * extrémité libre ou à un carrefour (point partagé par plus de deux murs) ; une boucle fermée
 * forme une chaîne dont le dernier point est le premier.
 * @param {{id: string, c: number[]}[]} walls
 * @returns {{points: number[][], ids: string[]}[]}  ids[i] : mur entre points[i] et points[i + 1]
 */
export function wallChains(walls) {
  const at = new Map();
  for (const w of walls) {
    for (const k of [key(w.c[0], w.c[1]), key(w.c[2], w.c[3])]) {
      if (!at.has(k)) at.set(k, []);
      at.get(k).push(w);
    }
  }
  const degree = (k) => at.get(k).length;
  const used = new Set();

  const walk = (startKey, first) => {
    const points = [startKey.split(",").map(Number)];
    const ids = [];
    let w = first;
    let k = startKey;
    while (w && !used.has(w.id)) {
      used.add(w.id);
      ids.push(w.id);
      const other = key(w.c[0], w.c[1]) === k ? key(w.c[2], w.c[3]) : key(w.c[0], w.c[1]);
      points.push(other.split(",").map(Number));
      k = other;
      if (degree(k) !== 2) break;
      w = at.get(k).find((x) => !used.has(x.id));
    }
    return { points, ids };
  };

  const chains = [];
  // d'abord depuis les extrémités libres et les carrefours…
  for (const [k, list] of at) {
    if (degree(k) === 2) continue;
    for (const w of list) if (!used.has(w.id)) chains.push(walk(k, w));
  }
  // …puis ce qui reste : des boucles fermées
  for (const w of walls) if (!used.has(w.id)) chains.push(walk(key(w.c[0], w.c[1]), w));
  return chains;
}

/**
 * Barreaux répartis le long d'une chaîne entière, comme sur un seul mur : l'écart reste régulier
 * quel que soit le découpage. Un barreau à cheval sur deux murs est coupé en deux morceaux, un par
 * mur, pour que chaque morceau reste sur son mur.
 * @param {{points: number[][], ids: string[]}} chain
 * @returns {{owner: string, c: number[]}[]}
 */
export function chainBars(chain, spacing, thickness) {
  const { points, ids } = chain;
  const lengths = ids.map((_, i) => Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]));
  const total = lengths.reduce((a, b) => a + b, 0);
  // les barreaux d'une chaîne droite de même longueur : on les calcule sur un mur fictif rectiligne
  const flat = patternBars([0, 0, total, 0], spacing, thickness);
  const out = [];
  for (const [s0, , s1] of flat) {
    let offset = 0;
    for (let i = 0; i < ids.length; i++) {
      const a = Math.max(s0, offset);
      const b = Math.min(s1, offset + lengths[i]);
      if (b > a && lengths[i] > 0) {
        const [p, q] = [points[i], points[i + 1]];
        const lerp = (d) => [Math.round(p[0] + ((q[0] - p[0]) * (d - offset)) / lengths[i]), Math.round(p[1] + ((q[1] - p[1]) * (d - offset)) / lengths[i])];
        const [x0, y0] = lerp(a);
        const [x1, y1] = lerp(b);
        if (x0 !== x1 || y0 !== y1) out.push({ owner: ids[i], c: [x0, y0, x1, y1] });
      }
      offset += lengths[i];
    }
  }
  return out;
}

/**
 * Tous les barreaux voulus pour une scène : les murs à motif sont regroupés par motif et
 * écartement identiques, puis en chaînes reliées.
 * @param {{id: string, c: number[], pattern: string, density?: number}[]} walls  murs à motif
 * @param {number} gridSize
 * @returns {{owner: string, c: number[]}[]}
 */
export function sceneBars(walls, gridSize) {
  const groups = new Map();
  for (const w of walls) {
    const k = `${w.pattern}|${Number(w.density) || 1}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(w);
  }
  const out = [];
  for (const group of groups.values()) {
    const size = patternSize(group[0].pattern, gridSize, Number(group[0].density) || 1);
    if (!size) continue;
    for (const chain of wallChains(group)) out.push(...chainBars(chain, size.spacing, size.thickness));
  }
  return out;
}
