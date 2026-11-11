/**
 * Palisade — cadran des motifs lumineux, ouvert par un clic droit sur un mur.
 *
 *   Segments      : le motif (aucun, barreaux, croisillons, grillage fin).
 *   Bouton central: l'écartement (×0,5 à ×4).
 *   Appliquer     : enregistre le motif sur le mur cliqué, ou sur toute la sélection si le mur
 *                   cliqué en fait partie. Annuler ou Échap referment sans rien changer.
 *
 * Le clic droit n'est pas intercepté : glisser avec le bouton droit déplace toujours la vue.
 */

import { MODULE_ID, isBar, t } from "./constants.js";
import { createDial } from "./brush-dial.js";
import { PATTERN_KEYS } from "./grille.js";

const NONE = "none";
const ICONS = {
  none: "fa-solid fa-minus",
  bars: "fa-solid fa-grip-lines-vertical",
  lattice: "fa-solid fa-table-cells-large",
  mesh: "fa-solid fa-hashtag"
};
const CLICK_PX = 4;

const state = { open: false, targets: [], pattern: NONE, density: 1, press: null };
let dial = null;

/** Murs visés par un clic droit sur `wall` : toute la sélection s'il en fait partie, sinon lui seul. */
export function targetsFor(wall, controlled) {
  if (!wall || isBar(wall.document)) return [];
  const group = controlled.includes(wall) ? controlled : [wall];
  return group.filter((w) => !isBar(w.document)).map((w) => w.document);
}

/** Mise à jour d'un mur pour un motif choisi au cadran (NONE retire le motif). */
export function patternUpdate(doc, pattern, density) {
  return { _id: doc.id, flags: { [MODULE_ID]: { pattern: pattern === NONE ? "" : pattern, density } } };
}

function getDial() {
  if (dial) return dial;
  dial = createDial({
    id: "palisade-pattern-dial",
    types: [NONE, ...PATTERN_KEYS].map((key) => ({
      key,
      label: t(key === NONE ? "PALISADE.Pattern.None" : `PALISADE.Pattern.Types.${key}`),
      icon: ICONS[key] ?? "fa-solid fa-grip-lines-vertical"
    })),
    range: { min: 0.5, max: 4, step: 0.25, labels: [0.5, 2, 4], unit: " ×" },
    getDetail: () => state.density,
    onDetail: (v) => (state.density = v),
    getType: () => state.pattern,
    onType: (key) => (state.pattern = key),
    caption: t("PALISADE.Pattern.Density"),
    knobTitle: t("PALISADE.Pattern.KnobHint"),
    hint: t("PALISADE.Pattern.DialHint"),
    onApply: () => apply(),
    onCancel: () => close(),
    applyLabel: t("PALISADE.Brush.Apply"),
    cancelLabel: t("PALISADE.Brush.Cancel")
  });
  dial.element.style.display = "none";
  document.body.append(dial.element);
  return dial;
}

function open(targets, clientX, clientY) {
  const first = targets[0];
  state.open = true;
  state.targets = targets;
  state.pattern = first.flags?.[MODULE_ID]?.pattern || NONE;
  state.density = Number(first.flags?.[MODULE_ID]?.density) || 1;
  const d = getDial();
  d.sync();
  d.element.style.display = "";
  // bouton central sous le curseur (centre du cadran à 130 px du coin), sans sortir de l'écran
  const { offsetWidth: w, offsetHeight: h } = d.element;
  const left = Math.min(Math.max(8, clientX - 130), window.innerWidth - w - 60);
  const top = Math.min(Math.max(20, clientY - 130), window.innerHeight - h - 56);
  Object.assign(d.element.style, { left: `${left}px`, top: `${top}px`, transform: "none" });
}

function close() {
  state.open = false;
  state.targets = [];
  if (dial) dial.element.style.display = "none";
}

async function apply() {
  const scene = canvas.scene;
  const updates = state.targets.filter((doc) => scene?.walls.has(doc.id)).map((doc) => patternUpdate(doc, state.pattern, state.density));
  close();
  if (updates.length) await scene.updateEmbeddedDocuments("Wall", updates);
}

/* -------------------------------------------- */
/*  Événements                                  */
/* -------------------------------------------- */

const wallsActive = () => game.user.isGM && canvas.ready && canvas.walls?.active;

function onPointerDown(event) {
  if (event.button !== 2 || event.target !== canvas.app?.view || !wallsActive()) return;
  state.press = { x: event.clientX, y: event.clientY, wall: canvas.walls.hover ?? null };
}

function onPointerUp(event) {
  const press = state.press;
  state.press = null;
  if (event.button !== 2 || !press?.wall) return;
  // un glissé au bouton droit déplace la vue : seul un vrai clic ouvre le cadran
  if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > CLICK_PX) return;
  const targets = targetsFor(press.wall, canvas.walls.controlled ?? []);
  if (targets.length) open(targets, event.clientX, event.clientY);
}

function onKeyDown(event) {
  if (!state.open || event.target.closest?.("input, textarea, select, [contenteditable]")) return;
  if (event.key === "Enter") apply();
  else if (event.key === "Escape") close();
  else return;
  event.preventDefault();
  event.stopImmediatePropagation();
}

export function registerPatternDial() {
  window.addEventListener("pointerdown", onPointerDown, true);
  window.addEventListener("pointerup", onPointerUp, true);
  window.addEventListener("keydown", onKeyDown, true);
  // le cadran se referme quand on quitte le calque des murs ou la scène
  Hooks.on("renderSceneControls", () => state.open && !wallsActive() && close());
  Hooks.on("canvasTearDown", close);
}
