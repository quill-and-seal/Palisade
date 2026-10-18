/**
 * Palisade — outil pinceau dans les outils des murs.
 *
 * On dessine à main levée près des murs du fond de scène ; au relâchement, le trait est collé
 * aux murs dessinés (voir brush.js) et affiché en aperçu. Entrée ou un clic crée les murs,
 * Échap annule. Les murs créés passent ensuite par la liaison automatique (linker.js).
 *
 * Seul le clic gauche sur le canevas est intercepté quand l'outil est actif : le clic droit
 * (déplacer la vue) et la molette (zoom) restent à Foundry.
 */

import { MODULE_ID, setting, t } from "./constants.js";
import { snapStroke } from "./brush.js";
import { weldChain } from "./geometry.js";

export const BRUSH_TOOL = "palisade-brush";
const CONTEXT_PX = 40; // pixels d'image lus en plus du rayon : contexte des détecteurs (MARGIN de brush.js)
const CLICK_PX = 4;
const WELD_PX = 8; // distance de soudure à l'écran

/** Types de mur que le pinceau peut créer : propriétés du mur, sur le modèle des outils de Foundry. */
export const WALL_TYPES = ["normal", "ethereal", "invisible", "terrain"];
export function wallTypeData(type) {
  const { NONE, LIMITED } = CONST.WALL_SENSE_TYPES;
  switch (type) {
    // traversable : cache la vue et la lumière, mais les personnages passent
    case "ethereal":
      return { move: CONST.WALL_MOVEMENT_TYPES.NONE, sound: NONE };
    // bloque le passage, mais pas la vue, la lumière ni le son
    case "invisible":
      return { sight: NONE, light: NONE, sound: NONE };
    case "terrain":
      return { sight: LIMITED, light: LIMITED, sound: LIMITED };
    default:
      return {};
  }
}

/**
 * Zone de l'image à lire pour un trait.
 * @param {number[][]} points   trait, en coordonnées monde
 * @param {number} radius        rayon de recherche, en unités monde
 * @param {{x: number, y: number, width: number, height: number, naturalWidth: number,
 *          naturalHeight: number}} place  rectangle monde où l'image est affichée, et sa taille
 * @returns {{sx: number, sy: number, sw: number, sh: number, originX: number, originY: number,
 *            scale: number} | null}  rectangle en pixels d'image, et son placement monde
 */
export function imageRegion(points, radius, place) {
  const scale = place.naturalWidth / place.width;
  const pad = radius * scale + CONTEXT_PX;
  const xs = points.map((p) => (p[0] - place.x) * scale);
  const ys = points.map((p) => (p[1] - place.y) * scale);
  const sx = Math.max(0, Math.floor(Math.min(...xs) - pad));
  const sy = Math.max(0, Math.floor(Math.min(...ys) - pad));
  const ex = Math.min(place.naturalWidth, Math.ceil(Math.max(...xs) + pad));
  const ey = Math.min(place.naturalHeight, Math.ceil(Math.max(...ys) + pad));
  if (ex - sx < 8 || ey - sy < 8) return null;
  return { sx, sy, sw: ex - sx, sh: ey - sy, originX: place.x + sx / scale, originY: place.y + sy / scale, scale };
}

/* -------------------------------------------- */
/*  Image du fond de scène                      */
/* -------------------------------------------- */

let cached = { src: null, image: null };

async function backgroundImage(scene) {
  const src = scene.background?.src;
  if (!src) return null;
  if (cached.src === src) return cached.image;
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.src = src;
  await image.decode();
  cached = { src, image };
  return image;
}

/** Pixels du fond de scène autour du trait, au format attendu par snapStroke. */
async function readBackground(points, radius) {
  const scene = canvas.scene;
  const image = await backgroundImage(scene);
  if (!image) throw new Error(t("PALISADE.Brush.NoBackground"));
  const d = canvas.dimensions;
  // shortcut: fond de scène seulement (pas les tuiles), à étendre si les cartes sont posées en tuiles
  const place = {
    x: d.sceneX + (scene.background.offsetX ?? 0),
    y: d.sceneY + (scene.background.offsetY ?? 0),
    width: d.sceneWidth,
    height: d.sceneHeight,
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight
  };
  const r = imageRegion(points, radius, place);
  if (!r) return null;
  const c = document.createElement("canvas");
  c.width = r.sw;
  c.height = r.sh;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, r.sx, r.sy, r.sw, r.sh, 0, 0, r.sw, r.sh);
  // getImageData échoue si l'image vient d'un autre domaine sans CORS
  const { data } = ctx.getImageData(0, 0, r.sw, r.sh);
  return { width: r.sw, height: r.sh, data, originX: r.originX, originY: r.originY, scale: r.scale };
}

/* -------------------------------------------- */
/*  Outil                                       */
/* -------------------------------------------- */

const state = { drawing: null, stroke: null, result: null, graphics: null, busy: false };

// même lecture de l'outil actif qu'Ember (v13+ : objet tool ; avant : nom)
const activeTool = () => ui.controls?.tool?.name ?? ui.controls?.activeTool ?? null;
const isActive = () => game.user.isGM && canvas.ready && activeTool() === BRUSH_TOOL;
const toWorld = (event) => {
  const p = canvas.canvasCoordinatesFromClient({ x: event.clientX, y: event.clientY });
  return [p.x, p.y];
};

function graphics() {
  if (!state.graphics || state.graphics.destroyed) {
    state.graphics = new PIXI.Graphics();
    state.graphics.eventMode = "none";
    (canvas.interface ?? canvas.stage).addChild(state.graphics);
  }
  return state.graphics;
}

function line(g, points, width, color, alpha = 1) {
  if (!points || points.length < 2) return;
  g.lineStyle(width / canvas.stage.scale.x, color, alpha);
  g.moveTo(points[0][0], points[0][1]);
  for (const p of points.slice(1)) g.lineTo(p[0], p[1]);
}

function draw() {
  const g = graphics();
  g.clear();
  const raw = state.drawing ?? state.stroke;
  line(g, raw, 2, 0x9a9a9a, 0.9);
  const res = state.result;
  if (!res) return;
  const color = res.ok ? 0xffb347 : 0xff8a6b;
  line(g, res.points, 7, 0x000000, 0.5);
  line(g, res.points, 3.5, color);
  const r = 4.5 / canvas.stage.scale.x;
  for (const p of res.points) {
    g.lineStyle(1.5 / canvas.stage.scale.x, 0x000000, 0.8).beginFill(color).drawCircle(p[0], p[1], r).endFill();
  }
}

function clear() {
  state.drawing = state.stroke = state.result = null;
  state.graphics?.clear();
}

async function snap({ quiet = false } = {}) {
  // distances réglées en pixels à l'écran : le pinceau garde la même finesse à tout zoom
  const radius = setting("brushRadius") / canvas.stage.scale.x;
  const simplify = setting("brushDetail") / canvas.stage.scale.x;
  state.busy = true;
  try {
    const image = await readBackground(state.stroke, radius);
    if (!image) return clear();
    state.result = snapStroke(state.stroke, image, { radius, simplify });
    if (!state.result.ok && !quiet) ui.notifications.warn(t("PALISADE.Brush.NoWall"));
    draw();
  } catch (err) {
    console.error("Palisade |", err);
    ui.notifications.error(t("PALISADE.Brush.ReadError", { message: err.message }));
    clear();
  } finally {
    state.busy = false;
  }
}

async function accept() {
  const pts = state.result?.points;
  clear();
  if (!pts || pts.length < 2) return;
  // soudure aux murs existants et au trait lui-même : pas de points doublés ni de murs superposés
  const walls = canvas.scene.walls.map((w) => ({ id: w.id, c: [...w.c] }));
  const segments = weldChain(pts, walls, WELD_PX / canvas.stage.scale.x);
  const type = wallTypeData(setting("brushWallType"));
  if (segments.length) await canvas.scene.createEmbeddedDocuments("Wall", segments.map((c) => ({ c, ...type })));
}

/* -------------------------------------------- */
/*  Panneau dans la vue                         */
/* -------------------------------------------- */

let panel = null;
let resnapTimer = 0;

/** Petit panneau affiché avec l'outil : la précision se règle sans quitter la carte. */
function syncPanel() {
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "palisade-brush-panel";
    panel.style.cssText =
      "position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:100;align-items:center;" +
      "gap:10px;padding:6px 12px;border-radius:6px;background:rgba(15,15,20,.85);color:#eee;" +
      "border:1px solid rgba(255,255,255,.2);font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,.5)";
    panel.innerHTML =
      `<i class="fa-solid fa-paintbrush"></i><label for="palisade-brush-detail">${t("PALISADE.Brush.Precision")}</label>` +
      `<input id="palisade-brush-detail" type="range" min="1" max="10" step="0.5" style="width:140px">` +
      `<output for="palisade-brush-detail" style="min-width:3.5em;text-align:right"></output>` +
      `<label for="palisade-brush-type">${t("PALISADE.Brush.Type")}</label>` +
      `<select id="palisade-brush-type">${WALL_TYPES.map((k) => `<option value="${k}">${t(`PALISADE.WallTypes.${k}`)}</option>`).join("")}</select>`;
    const input = panel.querySelector("input");
    const output = panel.querySelector("output");
    input.addEventListener("input", () => {
      output.value = `${input.value} px`;
      clearTimeout(resnapTimer);
      resnapTimer = setTimeout(async () => {
        await game.settings.set(MODULE_ID, "brushDetail", Number(input.value));
        // l'aperçu en attente suit le nouveau réglage
        if (state.stroke && state.result && !state.busy) snap({ quiet: true });
      }, 150);
    });
    const select = panel.querySelector("select");
    select.addEventListener("change", () => game.settings.set(MODULE_ID, "brushWallType", select.value));
    document.body.append(panel);
  }
  // en style direct : l'attribut hidden ne l'emporte pas sur un display posé en ligne
  const visible = isActive();
  panel.style.display = visible ? "flex" : "none";
  if (visible) {
    const input = panel.querySelector("input");
    input.value = setting("brushDetail");
    panel.querySelector("output").value = `${input.value} px`;
    panel.querySelector("select").value = setting("brushWallType");
  }
}

/* -------------------------------------------- */
/*  Événements                                  */
/* -------------------------------------------- */

function onPointerDown(event) {
  if (event.button !== 0 || event.target !== canvas.app?.view || !isActive()) return;
  // empêche Foundry de commencer un mur natif ou une sélection
  event.stopImmediatePropagation();
  event.preventDefault();
  if (state.busy) return;
  state.drawing = [toWorld(event)];
  state.start = [event.clientX, event.clientY];
  state.moved = false;
}

function onPointerMove(event) {
  if (!state.drawing) return;
  event.stopImmediatePropagation();
  if (!state.moved && Math.hypot(event.clientX - state.start[0], event.clientY - state.start[1]) < CLICK_PX) return;
  if (!state.moved) {
    // un nouveau trait remplace l'aperçu non validé
    state.moved = true;
    state.result = null;
  }
  const p = toWorld(event);
  const last = state.drawing[state.drawing.length - 1];
  if (Math.hypot(p[0] - last[0], p[1] - last[1]) * canvas.stage.scale.x >= 2) state.drawing.push(p);
  draw();
}

function onPointerUp(event) {
  if (!state.drawing) return;
  event.stopImmediatePropagation();
  const stroke = state.drawing;
  state.drawing = null;
  if (!state.moved) {
    // simple clic : valide l'aperçu en attente
    if (state.result) accept();
    return;
  }
  if (stroke.length < 2) return clear();
  state.stroke = stroke;
  snap();
}

function onKeyDown(event) {
  if (!state.result || !isActive() || event.target.closest?.("input, textarea, [contenteditable]")) return;
  if (event.key === "Enter") accept();
  else if (event.key === "Escape") clear();
  else return;
  // Échap ferme aussi des fenêtres dans Foundry : on s'arrête à l'aperçu
  event.preventDefault();
  event.stopImmediatePropagation();
}

export function registerBrushTool() {
  // en capture sur window : passe avant les écouteurs du canevas (PIXI) et de Foundry
  window.addEventListener("pointerdown", onPointerDown, true);
  window.addEventListener("pointermove", onPointerMove, true);
  window.addEventListener("pointerup", onPointerUp, true);
  window.addEventListener("keydown", onKeyDown, true);
  // aperçu abandonné quand on change d'outil ou de scène
  Hooks.on("renderSceneControls", () => {
    if (!isActive()) clear();
    syncPanel();
  });
  Hooks.on("canvasTearDown", () => {
    clear();
    state.graphics = null;
    if (panel) panel.style.display = "none";
  });
}

export function brushToolButton() {
  return {
    name: BRUSH_TOOL,
    title: "PALISADE.Controls.Brush",
    icon: "fa-solid fa-paintbrush",
    order: 101
  };
}

