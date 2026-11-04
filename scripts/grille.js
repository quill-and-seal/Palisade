/**
 * Palisade — murs à motif lumineux (grille, herse, croisillons, grillage).
 *
 * Le mur à motif est un mur ordinaire qui porte flags.palisade.pattern (et .density) ; il bloque
 * le passage mais pas la lumière. Ses barreaux sont des murs cachés, marqués flags.palisade.barOf,
 * qui ne bloquent que la lumière (voir pattern.js). Ils sont recréés à chaque changement du mur
 * (tracé, motif, densité) et supprimés avec lui. Seul le client qui a fait la modification agit.
 */

import { MODULE_ID, isBar, t } from "./constants.js";
import { patternBars, patternSize, PATTERNS } from "./pattern.js";

export const PATTERN_KEYS = Object.keys(PATTERNS);
const OPTS = { [MODULE_ID]: true };

const patternOf = (doc) => doc.flags?.[MODULE_ID]?.pattern || "";
const barsOf = (scene, id) => scene.walls.filter((w) => w.flags?.[MODULE_ID]?.barOf === id);

/** Propriétés d'un barreau : bloque la lumière seulement. */
function barData(c, parentId) {
  const { NONE, NORMAL } = CONST.WALL_SENSE_TYPES;
  return { c, move: CONST.WALL_MOVEMENT_TYPES.NONE, sight: NONE, light: NORMAL, sound: NONE, flags: { [MODULE_ID]: { barOf: parentId } } };
}

/* -------------------------------------------- */
/*  Mise à jour des barreaux                    */
/* -------------------------------------------- */

const queues = new Map();

/** Recrée les barreaux d'un mur (à la suite des recréations déjà en cours pour ce mur). */
function rebuild(doc) {
  const run = async () => {
    const scene = doc.parent;
    if (!scene?.walls) return;
    const live = scene.walls.get(doc.id);
    const old = barsOf(scene, doc.id).map((w) => w.id);
    if (old.length) await scene.deleteEmbeddedDocuments("Wall", old, OPTS);
    if (!live) return;
    const size = patternSize(patternOf(live), scene.grid?.size ?? canvas.grid?.size, live.flags[MODULE_ID]?.density);
    if (!size) return;
    const bars = patternBars([...live.c], size.spacing, size.thickness);
    if (bars.length) await scene.createEmbeddedDocuments("Wall", bars.map((c) => barData(c, live.id)), OPTS);
  };
  const next = (queues.get(doc.id) ?? Promise.resolve()).then(run, run).catch((err) => console.error("Palisade |", err));
  queues.set(doc.id, next);
  next.finally(() => queues.get(doc.id) === next && queues.delete(doc.id));
  return next;
}

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

function onCreateWall(doc, options, userId) {
  if (mine(userId) && !isBar(doc) && patternOf(doc)) rebuild(doc);
}

function onUpdateWall(doc, changes, options, userId) {
  if (!mine(userId) || isBar(doc)) return;
  const touched = "c" in changes || foundry.utils.hasProperty(changes, `flags.${MODULE_ID}`);
  // un mur qui perd son motif garde des barreaux à supprimer : rebuild s'en charge
  if (touched && (patternOf(doc) || barsOf(doc.parent, doc.id).length)) rebuild(doc);
}

function onDeleteWall(doc, options, userId) {
  if (!mine(userId) || isBar(doc) || !doc.parent) return;
  const ids = barsOf(doc.parent, doc.id).map((w) => w.id);
  if (ids.length) doc.parent.deleteEmbeddedDocuments("Wall", ids, OPTS);
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
