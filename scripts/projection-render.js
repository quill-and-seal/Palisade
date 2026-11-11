/**
 * Palisade — rendu de l'ombre projetée des grilles dans Foundry.
 *
 * Pour chaque lumière dont la zone éclairée croise une grille, un maillage couvre exactement son
 * polygone d'éclairage (calculé par Foundry, murs pleins compris) et assombrit le sol en
 * multiplication, selon l'ombre de projection.js recalculée par pixel dans le shader. Le maillage
 * vit dans le groupe « primary », entre les dessins et les tokens, comme les effets d'Ember :
 * l'éclairage de Foundry s'applique ensuite par-dessus, et les tokens restent au-dessus.
 *
 * Le shader reprend à l'identique shadeAt() de projection.js (testé dans Node).
 */

import { MODULE_ID, isBar, setting } from "./constants.js";
import { grilleSegments, carrierHeight, LIGHT_DEFAULTS } from "./projection.js";

/** Segments de grille par lumière (au-delà, l'ombre ignore les plus lointains). */
export const MAX_SEGMENTS = 32;

const VERTEX = `
  precision highp float;
  attribute vec2 aVertexPosition;
  uniform mat3 projectionMatrix;
  uniform mat3 translationMatrix;
  varying vec2 vWorld;
  void main() {
    vWorld = aVertexPosition;
    gl_Position = vec4((projectionMatrix * translationMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
  }`;

const FRAGMENT = `
  precision highp float;
  varying vec2 vWorld;
  uniform vec2 uLight;       // position de la lumière
  uniform float uHeight;     // hauteur de la lumière
  uniform float uFlame;      // rayon de la flamme
  uniform vec3 uFalloff;     // rayon vif, rayon faible, force de l'ombre
  uniform int uCount;
  uniform vec4 uSegA[${MAX_SEGMENTS}];   // extrémités a.x, a.y, b.x, b.y
  uniform vec4 uSegB[${MAX_SEGMENTS}];   // décalage sur la chaîne, longueur de la chaîne, écart, part du barreau
  uniform vec4 uSegC[${MAX_SEGMENTS}];   // bas, haut, barreaux horizontaux (0/1), -

  float cum(float x, float p, float w) {
    float y = x + w * 0.5;
    return floor(y / p) * w + clamp(y - floor(y / p) * p, 0.0, w);
  }
  float barCover(float x, float p, float frac, float h) {
    float w = frac * p;
    h = max(h, 0.35);
    return (cum(x + h, p, w) - cum(x - h, p, w)) / (2.0 * h);
  }
  void main() {
    vec2 P = vWorld;
    float pass = 1.0;
    for (int i = 0; i < ${MAX_SEGMENTS}; i++) {
      if (i >= uCount) break;
      vec2 a = uSegA[i].xy, b = uSegA[i].zw;
      vec2 r = P - uLight, s = b - a;
      float den = r.x * s.y - r.y * s.x;
      if (abs(den) < 1e-6) continue;
      vec2 q = a - uLight;
      float t = (q.x * s.y - q.y * s.x) / den;
      float u = (q.x * r.y - q.y * r.x) / den;
      if (t <= 0.0 || t >= 1.0 || u < 0.0 || u > 1.0) continue;
      float h = uFlame * (1.0 - t);
      float along = uSegB[i].x + u * length(s) - uSegB[i].y * 0.5;
      float shade = barCover(along, uSegB[i].z, uSegB[i].w, h);
      float z = uHeight * (1.0 - t);
      if (z < uSegC[i].x || z > uSegC[i].y) shade = 1.0;
      else if (uSegC[i].z > 0.5) shade = 1.0 - (1.0 - shade) * (1.0 - barCover(z - uSegC[i].x, uSegB[i].z, uSegB[i].w, h));
      pass *= 1.0 - shade;
    }
    // l'ombre suit la force de cette lumière : pleine dans le rayon vif, nulle au bord du rayon faible
    float d = distance(P, uLight);
    float strength = uFalloff.z * (1.0 - smoothstep(uFalloff.x, max(uFalloff.y, uFalloff.x + 1.0), d));
    float k = 1.0 - (1.0 - pass) * strength;
    gl_FragColor = vec4(k, k, k, 1.0);
  }`;

/**
 * Maillage d'ombre pour une lumière : couvre son polygone d'éclairage, assombrit en multiplication.
 * @param {object} o
 * @param {number[]} o.points   polygone d'éclairage [x0, y0, x1, y1…]
 * @param {number} o.x
 * @param {number} o.y
 * @param {number} o.height     hauteur de la lumière (unités de scène)
 * @param {number} o.flame      rayon de la flamme (unités de scène)
 * @param {number} o.bright     rayon vif
 * @param {number} o.dim        rayon faible
 * @param {number} o.strength   force de l'ombre (0–1)
 * @param {ReturnType<typeof grilleSegments>} o.segments
 * @returns {PIXI.Mesh}
 */
export function makeShadowMesh(o) {
  const indices = PIXI.utils.earcut(o.points);
  const geometry = new PIXI.Geometry()
    .addAttribute("aVertexPosition", new Float32Array(o.points), 2)
    .addIndex(o.points.length / 2 > 65535 ? new Uint32Array(indices) : new Uint16Array(indices));
  const shader = PIXI.Shader.from(VERTEX, FRAGMENT, shadowUniforms(o));
  const mesh = new PIXI.Mesh(geometry, shader);
  mesh.blendMode = PIXI.BLEND_MODES.MULTIPLY;
  return mesh;
}

/** Uniformes du shader pour une lumière. */
export function shadowUniforms(o) {
  const segA = new Float32Array(MAX_SEGMENTS * 4);
  const segB = new Float32Array(MAX_SEGMENTS * 4);
  const segC = new Float32Array(MAX_SEGMENTS * 4);
  const segs = o.segments.slice(0, MAX_SEGMENTS);
  segs.forEach((s, i) => {
    segA.set([s.a[0], s.a[1], s.b[0], s.b[1]], i * 4);
    segB.set([s.offset, s.total, s.spacing, s.frac], i * 4);
    segC.set([s.bottom, s.top, s.cross ? 1 : 0, 0], i * 4);
  });
  return {
    uLight: new Float32Array([o.x, o.y]),
    uHeight: o.height,
    uFlame: o.flame,
    uFalloff: new Float32Array([o.bright, o.dim, o.strength]),
    uCount: segs.length,
    uSegA: segA,
    uSegB: segB,
    uSegC: segC
  };
}

/** Segments que les rayons d'une lumière peuvent traverser : ceux qui entrent dans son rayon. */
export function segmentsNear(segments, x, y, radius) {
  const near = segments.filter((s) => {
    const dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1];
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - s.a[0]) * dx + (y - s.a[1]) * dy) / len2));
    return Math.hypot(s.a[0] + t * dx - x, s.a[1] + t * dy - y) <= radius;
  });
  // shortcut: au-delà de MAX_SEGMENTS, on garde les plus proches ; passer à une texture de données si ça arrive en jeu
  if (near.length <= MAX_SEGMENTS) return near;
  const dist = (s) => Math.hypot((s.a[0] + s.b[0]) / 2 - x, (s.a[1] + s.b[1]) / 2 - y);
  return near.sort((p, q) => dist(p) - dist(q)).slice(0, MAX_SEGMENTS);
}

/* -------------------------------------------- */
/*  Gestion dans la scène                       */
/* -------------------------------------------- */

let container = null;
let lastKey = "";
let wallsVersion = 0;
let segmentsCache = null;
let tick = null;
let status = { segments: 0, lights: 0, meshes: 0, errors: [] };

/** État du rendu projeté, pour le diagnostic (game.modules.get("palisade").api.projectionStatus()). */
export const projectionStatus = () => ({ ...status, render: setting("grilleRender"), container: !!container, lastSegments: segmentsCache?.length ?? null });

/** À appeler quand les murs à motif ou les réglages changent. */
export function invalidateProjection() {
  wallsVersion++;
  segmentsCache = null;
}

const projecting = () => setting("grilleRender") === "projected";

function sceneSegments() {
  if (segmentsCache) return segmentsCache;
  const scene = canvas.scene;
  const walls = scene.walls
    .filter((w) => !isBar(w) && w.flags?.[MODULE_ID]?.pattern)
    .map((w) => {
      const f = w.flags[MODULE_ID];
      return { id: w.id, c: [...w.c], pattern: f.pattern, density: f.density, bottom: f.bottom, top: f.top };
    });
  segmentsCache = grilleSegments(walls, canvas.grid.size);
  return segmentsCache;
}

/**
 * Document d'une source de lumière (lumière posée ou token). En v14, la source n'est plus
 * toujours reliée à son objet : on la retrouve alors par son identifiant (« AmbientLight.<id> »,
 * « Token.<id> »).
 */
export function sourceDocument(source, scene) {
  const direct = source.object?.document ?? source.document;
  if (direct) return direct;
  const [kind, id] = String(source.sourceId ?? "").split(".");
  if (!id) return null;
  if (kind === "AmbientLight") return scene?.lights?.get(id) ?? null;
  if (kind === "Token") return scene?.tokens?.get(id) ?? null;
  return null;
}

/** La lumière générale de la scène n'a pas de position : elle ne projette pas d'ombre de grille. */
export const isGlobalSource = (source) =>
  /Global/.test(source.constructor?.name ?? "") || source.sourceId === "globalLight" || source.data?.radius == null;

/** Hauteur et flamme d'une source de lumière (token porteur ou lumière posée), en unités de scène. */
function lightGeometry(source) {
  const grid = canvas.grid.size;
  const doc = sourceDocument(source, canvas.scene);
  const flags = doc?.flags?.[MODULE_ID] ?? {};
  const isToken = doc?.documentName === "Token";
  const height = isToken ? carrierHeight(doc.width) : Number.isFinite(+flags.height) ? +flags.height : LIGHT_DEFAULTS.height;
  const flame = Number.isFinite(+flags.flame) ? +flags.flame : LIGHT_DEFAULTS.flame;
  return { height: height * grid, flame: flame * grid };
}

function lightSources() {
  const all = canvas.effects?.lightSources;
  if (!all) return [];
  return [...(all.values?.() ?? all)].filter(
    (s) => s.active !== false && !isGlobalSource(s) && s.shape?.points?.length >= 6 && (s.data?.radius ?? 0) > 0
  );
}

function update() {
  if (!canvas.ready || !container) return;
  if (!projecting()) {
    if (container.children.length) clearMeshes();
    lastKey = "";
    return;
  }
  const segments = sceneSegments();
  const darkness = canvas.environment?.darknessLevel ?? canvas.darknessLevel ?? 1;
  const sources = segments.length ? lightSources() : [];
  // n'est recalculé que si une lumière, un mur à motif ou l'obscurité change
  const key =
    `${wallsVersion}|${darkness.toFixed(2)}|` +
    sources.map((s, i) => `${s.sourceId ?? i}:${Math.round(s.data.x)},${Math.round(s.data.y)},${s.data.radius},${s.shape.points.length},${s.shape.points[0]},${s.shape.points[1]}`).join(";");
  if (key === lastKey) return;
  lastKey = key;
  clearMeshes();
  status = { segments: segments.length, lights: sources.length, meshes: 0, errors: [] };
  // de jour, la lumière générale noie en partie l'ombre d'une lampe
  const strength = 0.35 + 0.65 * Math.min(1, Math.max(0, darkness));
  for (const source of sources) {
    const { x, y } = source.data;
    const radius = source.data.radius;
    const near = segmentsNear(segments, x, y, radius);
    if (!near.length) continue;
    const { height, flame } = lightGeometry(source);
    try {
      container.addChild(
        makeShadowMesh({
          points: [...source.shape.points],
          x,
          y,
          height,
          flame,
          bright: source.data.bright ?? 0,
          dim: radius,
          strength,
          segments: near
        })
      );
      status.meshes++;
    } catch (err) {
      status.errors.push(String(err?.message ?? err));
      console.error("Palisade | ombre de grille", err);
    }
  }
}

function clearMeshes() {
  for (const child of container.removeChildren()) child.destroy({ children: true });
}

/** Conteneur dans le groupe « primary », entre les dessins et les tokens (même placement qu'Ember). */
function createContainer() {
  const Primary = foundry.canvas?.primary?.PrimaryCanvasContainer ?? globalThis.PrimaryCanvasContainer;
  const layers = foundry.canvas?.groups?.PrimaryCanvasGroup?.SORT_LAYERS ?? globalThis.PrimaryCanvasGroup?.SORT_LAYERS;
  if (Primary && canvas.primary) {
    try {
      const c = new Primary();
      c.elevation = 0;
      c.sortLayer = layers?.DRAWINGS !== undefined && layers?.TOKENS !== undefined ? Math.round((layers.DRAWINGS + layers.TOKENS) / 2) : 650;
      c.sort = 0;
      canvas.primary.addChild(c);
      return c;
    } catch (err) {
      console.warn("Palisade | PrimaryCanvasContainer indisponible, ombres au-dessus de la scène", err);
    }
  }
  const c = new PIXI.Container();
  (canvas.interface ?? canvas.stage).addChild(c);
  return c;
}

export function registerProjection() {
  Hooks.on("canvasReady", () => {
    container = createContainer();
    invalidateProjection();
    lastKey = "";
    tick = () => update();
    canvas.app.ticker.add(tick);
  });
  Hooks.on("canvasTearDown", () => {
    if (tick) canvas.app?.ticker?.remove(tick);
    tick = null;
    container?.destroy({ children: true });
    container = null;
  });
  for (const hook of ["createWall", "updateWall", "deleteWall", "updateAmbientLight", "updateToken"]) Hooks.on(hook, invalidateProjection);
}
