/**
 * Palisade — géométrie pure des murs (aucune dépendance à Foundry, testée avec node --test).
 *
 * Un mur est décrit par { id, c: [x0, y0, x1, y1], door: boolean }.
 * Un point est un tableau [x, y]. Les coordonnées des murs Foundry sont entières.
 */

/** Distance maximale (px) pour considérer qu'un point est posé sur un mur. */
export const ON_WALL_EPS = 1;

export const samePoint = (p, q) => p[0] === q[0] && p[1] === q[1];
export const pointKey = (p) => `${p[0]},${p[1]}`;
export const endpoints = (c) => [[c[0], c[1]], [c[2], c[3]]];
export const toCoords = (a, b) => [a[0], a[1], b[0], b[1]];
export const isDegenerate = (c) => c[0] === c[2] && c[1] === c[3];

export function dist2(p, q) {
  const dx = p[0] - q[0];
  const dy = p[1] - q[1];
  return dx * dx + dy * dy;
}

/**
 * Projette p sur le segment [a, b].
 * @returns {{t: number, point: number[], d2: number}} t non borné, point borné au segment.
 */
export function project(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (!len2) return { t: 0, point: [a[0], a[1]], d2: dist2(p, a) };
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  const tc = Math.max(0, Math.min(1, t));
  const point = [a[0] + tc * dx, a[1] + tc * dy];
  return { t, point, d2: dist2(p, point) };
}

/** Vrai si p est posé à l'intérieur du segment [a, b] (extrémités exclues). */
export function isInterior(p, a, b) {
  if (samePoint(p, a) || samePoint(p, b)) return false;
  const pr = project(p, a, b);
  return pr.t > 0 && pr.t < 1 && pr.d2 <= ON_WALL_EPS * ON_WALL_EPS;
}

/**
 * Accroche un point aux murs voisins : d'abord à l'extrémité la plus proche,
 * sinon au point le plus proche à l'intérieur d'un mur (jonction en T).
 * @returns {number[]} le point accroché, ou p inchangé.
 */
export function snapPoint(p, walls, tolerance, excludeId = null) {
  if (!(tolerance > 0)) return p;
  const tol2 = tolerance * tolerance;

  let best = null;
  let bestD = tol2;
  for (const w of walls) {
    if (w.id === excludeId) continue;
    for (const e of endpoints(w.c)) {
      const d = dist2(p, e);
      if (d <= bestD) {
        best = e;
        bestD = d;
      }
    }
  }
  if (best) return [best[0], best[1]];

  bestD = tol2;
  for (const w of walls) {
    if (w.id === excludeId) continue;
    const [a, b] = endpoints(w.c);
    const pr = project(p, a, b);
    if (pr.t > 0 && pr.t < 1 && pr.d2 <= bestD) {
      best = [Math.round(pr.point[0]), Math.round(pr.point[1])];
      bestD = pr.d2;
    }
  }
  return best ?? p;
}

/**
 * Accroche les extrémités d'un mur. `which` dit quelles extrémités traiter.
 * Si l'accroche rendrait le mur nul (deux extrémités au même point), le mur est rendu tel quel.
 */
export function snapCoords(c, walls, tolerance, excludeId = null, which = [true, true]) {
  const [a, b] = endpoints(c);
  const na = which[0] ? snapPoint(a, walls, tolerance, excludeId) : a;
  const nb = which[1] ? snapPoint(b, walls, tolerance, excludeId) : b;
  const out = toCoords(na, nb);
  if (!isDegenerate(out)) return out;
  // Les deux extrémités visent le même point (mur plus court que la distance d'accroche) :
  // on accroche seulement celle qui bouge le moins, l'autre reste en place.
  const keepA = toCoords(a, nb);
  const keepB = toCoords(na, b);
  const candidates = [keepB, keepA].filter((x) => !isDegenerate(x) && !(samePoint(endpoints(x)[0], a) && samePoint(endpoints(x)[1], b)));
  if (!candidates.length) return [...c];
  const moved = (x) => dist2(endpoints(x)[0], a) + dist2(endpoints(x)[1], b);
  return candidates.sort((x, y) => moved(x) - moved(y))[0];
}

/**
 * Jointures : quand des murs bougent, les murs qui partageaient une extrémité
 * avec eux suivent cette extrémité.
 * @param {{id: string, from: number[], to: number[]}[]} moves  anciennes et nouvelles coordonnées
 * @param {{id: string, c: number[]}[]} walls  état actuel de la scène
 * @returns {{_id: string, c: number[]}[]} mises à jour à appliquer
 */
export function planJointMoves(moves, walls) {
  const moved = new Set(moves.map((m) => m.id));
  const target = new Map();
  for (const m of moves) {
    const from = endpoints(m.from);
    const to = endpoints(m.to);
    for (let i = 0; i < 2; i++) {
      if (!samePoint(from[i], to[i])) target.set(pointKey(from[i]), to[i]);
    }
  }
  if (!target.size) return [];

  const updates = [];
  for (const w of walls) {
    if (moved.has(w.id)) continue;
    let changed = false;
    const ends = endpoints(w.c).map((e) => {
      const t = target.get(pointKey(e));
      if (!t) return e;
      changed = true;
      return t;
    });
    if (!changed) continue;
    const c = toCoords(ends[0], ends[1]);
    if (!isDegenerate(c)) updates.push({ _id: w.id, c });
  }
  return updates;
}

/**
 * Coupe un segment aux points donnés (ceux qui sont à l'intérieur), dans l'ordre du tracé.
 * @returns {number[][]} les morceaux, au moins un.
 */
export function splitCoords(c, points) {
  const [a, b] = endpoints(c);
  const seen = new Set();
  const cuts = [];
  for (const p of points) {
    const k = pointKey(p);
    if (seen.has(k) || !isInterior(p, a, b)) continue;
    seen.add(k);
    cuts.push({ p, t: project(p, a, b).t });
  }
  if (!cuts.length) return [[...c]];
  cuts.sort((x, y) => x.t - y.t);
  const chain = [a, ...cuts.map((x) => x.p), b];
  const pieces = [];
  for (let i = 0; i < chain.length - 1; i++) {
    const piece = toCoords(chain[i], chain[i + 1]);
    if (!isDegenerate(piece)) pieces.push(piece);
  }
  return pieces;
}

/**
 * Jonctions en T : coupe les murs dont l'intérieur touche une extrémité d'un mur candidat,
 * et les murs candidats dont l'intérieur touche une extrémité d'un autre mur.
 * @param {Iterable<string>} candidateIds  murs créés ou déplacés
 * @param {{id: string, c: number[], door?: boolean}[]} walls
 * @param {{skipDoors?: boolean}} options  ne jamais couper les portes
 * @returns {{updates: {_id: string, c: number[]}[], creates: {sourceId: string, c: number[]}[]}}
 */
export function planSplits(candidateIds, walls, { skipDoors = true } = {}) {
  const byId = new Map(walls.map((w) => [w.id, w]));
  const cuts = new Map();
  const addCut = (w, p) => {
    if (skipDoors && w.door) return;
    if (!cuts.has(w.id)) cuts.set(w.id, []);
    cuts.get(w.id).push(p);
  };

  for (const id of new Set(candidateIds)) {
    const w = byId.get(id);
    if (!w) continue;
    const [a, b] = endpoints(w.c);
    for (const o of walls) {
      if (o.id === w.id) continue;
      const [oa, ob] = endpoints(o.c);
      for (const p of [a, b]) if (isInterior(p, oa, ob)) addCut(o, p);
      for (const q of [oa, ob]) if (isInterior(q, a, b)) addCut(w, q);
    }
  }

  const updates = [];
  const creates = [];
  for (const [id, points] of cuts) {
    const pieces = splitCoords(byId.get(id).c, points);
    if (pieces.length < 2) continue;
    updates.push({ _id: id, c: pieces[0] });
    for (const c of pieces.slice(1)) creates.push({ sourceId: id, c });
  }
  return { updates, creates };
}

/**
 * Tous les murs reliés à un mur de départ par des extrémités partagées (le mur compris).
 * @returns {Set<string>}
 */
export function connectedWalls(startId, walls) {
  const byPoint = new Map();
  for (const w of walls) {
    for (const e of endpoints(w.c)) {
      const k = pointKey(e);
      if (!byPoint.has(k)) byPoint.set(k, []);
      byPoint.get(k).push(w);
    }
  }
  const byId = new Map(walls.map((w) => [w.id, w]));
  const found = new Set();
  const stack = [startId];
  while (stack.length) {
    const id = stack.pop();
    if (found.has(id) || !byId.has(id)) continue;
    found.add(id);
    for (const e of endpoints(byId.get(id).c)) {
      for (const n of byPoint.get(pointKey(e))) if (!found.has(n.id)) stack.push(n.id);
    }
  }
  return found;
}

/** Distance d'un point au segment [a, b]. */
function distToSegment(p, a, b) {
  return Math.sqrt(project(p, a, b).d2);
}

/**
 * Soude une chaîne de points (trait du pinceau) aux murs existants et à elle-même, avant création :
 *   - chaque point proche d'un point existant, d'un mur existant ou d'un point plus ancien de la
 *     chaîne s'y colle (deux points au même endroit n'en font plus qu'un) ;
 *   - un segment qui repasse sur un mur existant, ou sur un segment déjà gardé de la chaîne,
 *     n'est pas recréé (pas de murs superposés).
 * @param {number[][]} points  sommets de la chaîne, dans l'ordre
 * @param {{id: string, c: number[]}[]} walls  murs existants de la scène
 * @param {number} tolerance   distance de soudure (unités monde)
 * @returns {number[][]} coordonnées [x0, y0, x1, y1] des murs à créer
 */
export function weldChain(points, walls, tolerance) {
  const welded = [];
  for (const p of points) {
    // les points déjà soudés de la chaîne comptent comme des extrémités existantes
    const anchors = walls.concat(welded.slice(0, -1).map((q, i) => ({ id: `chain${i}`, c: [q[0], q[1], q[0], q[1]] })));
    const q = snapPoint([Math.round(p[0]), Math.round(p[1])], anchors, tolerance);
    if (!welded.length || !samePoint(q, welded[welded.length - 1])) welded.push(q);
  }

  const kept = [];
  const covered = (c) => {
    const [a, b] = endpoints(c);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(2, Math.ceil(len / Math.max(1, tolerance / 2)));
    for (let k = 0; k <= n; k++) {
      const s = [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n];
      const near = (w) => {
        const [wa, wb] = endpoints(w);
        return distToSegment(s, wa, wb) <= tolerance;
      };
      if (!walls.some((w) => near(w.c)) && !kept.some(near)) return false;
    }
    return true;
  };
  for (let i = 0; i < welded.length - 1; i++) {
    const c = toCoords(welded[i], welded[i + 1]);
    if (!isDegenerate(c) && !covered(c)) kept.push(c);
  }
  return kept;
}
