/**
 * Palisade — projection de l'ombre des grilles (calcul pur, testé avec node --test).
 *
 * Vue de dessus, une grille est un segment. Une lampe à la hauteur lh éclaire le point P du sol :
 * le rayon lampe → P traverse la grille à la fraction t de son trajet (t = 1 au pied de la grille),
 * donc à la hauteur z = lh·(1 − t). Le point est à l'ombre s'il tombe derrière un barreau
 * vertical (position le long de la grille) ou horizontal (hauteur z), ou si le rayon passe sous
 * le bas ou au-dessus du haut de la grille (mur plein). La flamme a une taille : vue depuis P,
 * elle couvre sur la grille une tache de rayon flame·(1 − t), sur laquelle on moyenne les
 * barreaux (pénombre exacte : net au pied de la grille, flou au loin).
 *
 * shadeAt() est la référence JavaScript du shader de projection-render.js : les deux doivent
 * rester identiques.
 */

import { PATTERNS } from "./pattern.js";
import { wallChains } from "./pattern.js";

/** Barreaux horizontaux par motif : la herse n'en a pas, croisillons et grillage oui. */
export const CROSS_BARS = { bars: false, lattice: true, mesh: true };

/** Hauteur d'une grille par défaut, en cases : du sol à 3 cases (herse, barreaux de cellule). */
export const GRILLE_DEFAULTS = { bottom: 0, top: 3 };

/** Lumière par défaut : hauteur d'une lampe posée et taille de flamme (torche), en cases. */
export const LIGHT_DEFAULTS = { height: 1.5, flame: 0.06 };

/**
 * Hauteur d'une lumière portée par un token : à hauteur de main (80 % de la taille de la
 * créature), la taille étant déduite de la largeur du token en cases.
 */
export function carrierHeight(tokenWidth) {
  const w = Number(tokenWidth) || 1;
  const size = w < 1 ? 0.75 : w < 2 ? 1.2 : w < 3 ? 2.5 : w < 4 ? 4 : 5.5;
  return Math.round(size * 0.8 * 100) / 100;
}

/**
 * Segments de grille prêts pour le shader, en unités de scène. Les murs reliés au même motif
 * forment une chaîne ; `offset` et `total` situent chaque segment sur sa chaîne pour que les
 * barreaux restent réguliers d'un morceau à l'autre.
 * @param {{id: string, c: number[], pattern: string, density?: number, bottom?: number, top?: number}[]} walls
 * @param {number} gridSize
 * @returns {{a: number[], b: number[], offset: number, total: number, spacing: number,
 *            frac: number, bottom: number, top: number, cross: boolean}[]}
 */
export function grilleSegments(walls, gridSize) {
  const groups = new Map();
  for (const w of walls) {
    const k = `${w.pattern}|${Number(w.density) || 1}|${w.bottom ?? ""}|${w.top ?? ""}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(w);
  }
  const out = [];
  for (const group of groups.values()) {
    const first = group[0];
    const p = PATTERNS[first.pattern];
    if (!p) continue;
    const spacing = p.spacing * gridSize * (Number(first.density) || 1);
    const frac = Math.min(0.9, (p.thickness * gridSize) / spacing);
    const bottom = (Number.isFinite(+first.bottom) ? +first.bottom : GRILLE_DEFAULTS.bottom) * gridSize;
    const top = (Number.isFinite(+first.top) ? +first.top : GRILLE_DEFAULTS.top) * gridSize;
    for (const { points, ids } of wallChains(group)) {
      const lengths = ids.map((_, i) => Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]));
      const total = lengths.reduce((s, l) => s + l, 0);
      let offset = 0;
      for (let i = 0; i < ids.length; i++) {
        out.push({ a: points[i], b: points[i + 1], offset, total, spacing, frac, bottom, top: Math.max(top, bottom + 1), cross: !!CROSS_BARS[first.pattern] });
        offset += lengths[i];
      }
    }
  }
  return out;
}

/* -------------------------------------------- */
/*  Ombre en un point (référence du shader)     */
/* -------------------------------------------- */

/** Segment [a, b] contre [c, d] : { t sur ab, u sur cd } si ils se croisent, sinon null. */
export function crossing(a, b, c, d) {
  const rx = b[0] - a[0], ry = b[1] - a[1];
  const sx = d[0] - c[0], sy = d[1] - c[1];
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-6) return null;
  const qx = c[0] - a[0], qy = c[1] - a[1];
  const t = (qx * sy - qy * sx) / den;
  const u = (qx * ry - qy * rx) / den;
  return t > 0 && t < 1 && u >= 0 && u <= 1 ? { t, u } : null;
}

/** Longueur couverte par des barreaux de largeur w (centrés sur les multiples de p) sur ]−∞, x]. */
function cum(x, p, w) {
  const y = x + w * 0.5;
  return Math.floor(y / p) * w + Math.min(Math.max(y - Math.floor(y / p) * p, 0), w);
}

/** Part de [x − h, x + h] couverte par les barreaux (h minimal : anticrénelage). */
export function barCover(x, period, frac, h) {
  const w = frac * period;
  h = Math.max(h, 0.35);
  return (cum(x + h, period, w) - cum(x - h, period, w)) / (2 * h);
}

/**
 * Ombre portée par les grilles en un point du sol, de 0 (plein jour) à 1 (ombre complète).
 * @param {number[]} P       point du sol
 * @param {{x: number, y: number, height: number, flame: number}} light  hauteur et flamme en unités de scène
 * @param {ReturnType<typeof grilleSegments>} segs
 */
export function shadeAt(P, light, segs) {
  const L = [light.x, light.y];
  let pass = 1;
  for (const s of segs) {
    const hit = crossing(L, P, s.a, s.b);
    if (!hit) continue;
    const len = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
    const h = light.flame * (1 - hit.t);
    // position le long de la chaîne, mesurée depuis son milieu : barreaux centrés
    const along = s.offset + hit.u * len - s.total * 0.5;
    let shade = barCover(along, s.spacing, s.frac, h);
    const z = light.height * (1 - hit.t);
    if (z < s.bottom || z > s.top) shade = 1;
    else if (s.cross) shade = 1 - (1 - shade) * (1 - barCover(z - s.bottom, s.spacing, s.frac, h));
    pass *= 1 - shade;
  }
  return 1 - pass;
}
