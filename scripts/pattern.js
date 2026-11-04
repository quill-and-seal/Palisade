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
