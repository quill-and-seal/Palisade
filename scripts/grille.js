/**
 * Palisade — murs à motif lumineux (grille, herse, croisillons, grillage).
 *
 * Le mur à motif est un mur ordinaire qui porte flags.palisade.pattern (et .density) ; il bloque
 * le passage mais pas la lumière. Ses barreaux sont des murs cachés, marqués flags.palisade.barOf,
 * qui ne bloquent que la lumière (voir pattern.js). Les murs reliés qui portent le même motif
 * forment une chaîne : les barreaux sont répartis le long de la chaîne entière, pour que l'écart
 * reste régulier même sur une grille découpée en petits murs (tracé au pinceau).
 *
 * Après chaque lot de changements, les barreaux voulus pour toute la scène sont recalculés et
 * seule la différence est créée ou supprimée. Seul le client qui a fait la modification agit.
 */

import { MODULE_ID, isBar, t } from "./constants.js";
import { sceneBars, PATTERNS } from "./pattern.js";

export const PATTERN_KEYS = Object.keys(PATTERNS);
const OPTS = { [MODULE_ID]: true };

const patternOf = (doc) => doc.flags?.[MODULE_ID]?.pattern || "";
const barKey = (owner, c) => `${owner}|${c.join(",")}`;

/** Propriétés d'un barreau : bloque la lumière seulement. */
function barData(c, parentId) {
  const { NONE, NORMAL } = CONST.WALL_SENSE_TYPES;
  return { c, move: CONST.WALL_MOVEMENT_TYPES.NONE, sight: NONE, light: NORMAL, sound: NONE, flags: { [MODULE_ID]: { barOf: parentId } } };
}

/** Murs à motif d'une scène, au format de sceneBars. */
export function patternWalls(scene) {
  return scene.walls
    .filter((w) => !isBar(w) && patternOf(w))
    .map((w) => ({ id: w.id, c: [...w.c], pattern: patternOf(w), density: w.flags[MODULE_ID]?.density }));
}

/* -------------------------------------------- */
/*  Synchronisation des barreaux                */
/* -------------------------------------------- */

let running = Promise.resolve();
let timer = 0;
const dirty = new Set();

/** Barreaux à créer et à supprimer pour qu'une scène corresponde à ses murs à motif. */
async function sync(scene) {
  if (!scene?.walls) return;
  const want = new Map();
  for (const bar of sceneBars(patternWalls(scene), scene.grid?.size ?? canvas.grid?.size)) want.set(barKey(bar.owner, bar.c), bar);
  const stale = [];
  for (const w of scene.walls.filter(isBar)) {
    const k = barKey(w.flags[MODULE_ID].barOf, [...w.c]);
    if (want.has(k)) want.delete(k);
    else stale.push(w.id);
  }
  if (stale.length) await scene.deleteEmbeddedDocuments("Wall", stale, OPTS);
  if (want.size) await scene.createEmbeddedDocuments("Wall", [...want.values()].map((b) => barData(b.c, b.owner)), OPTS);
}

/**
 * Programme une synchronisation : les hooks d'un même lot (trait du pinceau, sélection déplacée,
 * collage) arrivent ensemble et ne déclenchent qu'un seul calcul. Les synchronisations se suivent.
 */
function schedule(scene) {
  if (!scene) return;
  dirty.add(scene);
  clearTimeout(timer);
  timer = setTimeout(() => {
    const scenes = [...dirty];
    dirty.clear();
    running = running
      .then(async () => {
        for (const sc of scenes) await sync(sc);
      })
      .catch((err) => console.error("Palisade |", err));
  }, 20);
}

/** Attend la fin des synchronisations en cours (tests, API). */
export const settled = () => new Promise((r) => setTimeout(r, 25)).then(() => running);

/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

const mine = (userId) => userId === game.user.id && game.user.isGM;

// Un mur à motif laisse passer la lumière : ce sont ses barreaux qui la découpent.
function onPreCreateWall(doc) {
  if (patternOf(doc) && !isBar(doc)) doc.updateSource({ light: CONST.WALL_SENSE_TYPES.NONE });
}

function onPreUpdateWall(doc, changes) {
  if (isBar(doc)) return;
  const next = foundry.utils.getProperty(changes, `flags.${MODULE_ID}.pattern`);
  if (next === undefined) return;
  if (next) changes.light = CONST.WALL_SENSE_TYPES.NONE;
  // motif retiré : le mur redevient plein
  else if (patternOf(doc)) changes.light = CONST.WALL_SENSE_TYPES.NORMAL;
}

// Tout changement d'un mur ordinaire peut toucher une chaîne à motif (tracé, motif, voisin
// ajouté ou retiré) : on resynchronise la scène si elle a des murs à motif ou des barreaux.
const touchesPatterns = (scene) => scene?.walls.some((w) => isBar(w) || patternOf(w));

function onCreateWall(doc, options, userId) {
  if (mine(userId) && !isBar(doc) && touchesPatterns(doc.parent)) schedule(doc.parent);
}

function onUpdateWall(doc, changes, options, userId) {
  if (!mine(userId) || isBar(doc)) return;
  const touched = "c" in changes || foundry.utils.hasProperty(changes, `flags.${MODULE_ID}`);
  if (touched && touchesPatterns(doc.parent)) schedule(doc.parent);
}

function onDeleteWall(doc, options, userId) {
  if (mine(userId) && !isBar(doc) && touchesPatterns(doc.parent)) schedule(doc.parent);
}

// Les barreaux sont des détails internes : invisibles et inertes dans le calque des murs.
function onRefreshWall(wall) {
  if (isBar(wall.document)) wall.visible = false;
}

/* -------------------------------------------- */
/*  Fiche du mur                                */
/* -------------------------------------------- */

function onRenderWallConfig(app, html) {
  const root = html instanceof HTMLElement ? html : html?.[0] ?? app.element;
  const doc = app.document;
  if (!root || !doc || isBar(doc) || root.querySelector(".palisade-pattern-config")) return;
  const current = patternOf(doc);
  const density = Number(doc.flags?.[MODULE_ID]?.density) || 1;
  const base = `flags.${MODULE_ID}`;
  const fs = document.createElement("fieldset");
  fs.className = "palisade-pattern-config";
  fs.innerHTML = `
    <legend><i class="fa-solid fa-grip-lines-vertical"></i> ${t("PALISADE.Pattern.Legend")}</legend>
    <div class="form-group">
      <label>${t("PALISADE.Pattern.Label")}</label>
      <select name="${base}.pattern">
        <option value="">${t("PALISADE.Pattern.None")}</option>
        ${PATTERN_KEYS.map((k) => `<option value="${k}" ${k === current ? "selected" : ""}>${t(`PALISADE.Pattern.Types.${k}`)}</option>`).join("")}
      </select>
      <p class="hint">${t("PALISADE.Pattern.Hint")}</p>
    </div>
    <div class="form-group">
      <label>${t("PALISADE.Pattern.Density")}</label>
      <input type="number" name="${base}.density" value="${density}" min="0.5" max="4" step="0.25">
      <p class="hint">${t("PALISADE.Pattern.DensityHint")}</p>
    </div>`;
  const anchor = root.querySelector("footer.form-footer, .form-footer, footer");
  if (anchor) anchor.before(fs);
  else (root.querySelector("form") ?? root).append(fs);
  app.setPosition?.({ height: "auto" });
}

export function registerGrille() {
  Hooks.on("preCreateWall", onPreCreateWall);
  Hooks.on("preUpdateWall", onPreUpdateWall);
  Hooks.on("createWall", onCreateWall);
  Hooks.on("updateWall", onUpdateWall);
  Hooks.on("deleteWall", onDeleteWall);
  Hooks.on("refreshWall", onRefreshWall);
  Hooks.on("renderWallConfig", onRenderWallConfig);
}
