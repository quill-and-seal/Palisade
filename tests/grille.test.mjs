import { test } from "node:test";
import assert from "node:assert/strict";

/* Foundry minimal : une scène dont les murs déclenchent les hooks comme le serveur. */
const hooks = {};
globalThis.Hooks = { on: (n, f) => (hooks[n] ??= []).push(f) };
const call = (n, ...args) => (hooks[n] ?? []).forEach((f) => f(...args));
globalThis.CONST = { WALL_SENSE_TYPES: { NONE: 0, LIMITED: 10, NORMAL: 20 }, WALL_MOVEMENT_TYPES: { NONE: 0, NORMAL: 20 } };
const path = (o, k) => k.split(".").reduce((x, p) => (x == null ? undefined : x[p]), o);
globalThis.foundry = { utils: { getProperty: path, hasProperty: (o, k) => path(o, k) !== undefined } };
globalThis.game = { user: { id: "gm", isGM: true }, i18n: { localize: (k) => k, format: (k) => k } };
globalThis.canvas = { grid: { size: 100 } };

let nextId = 1;
const merge = (a, b) => {
  for (const [k, v] of Object.entries(b)) a[k] = v && typeof v === "object" && !Array.isArray(v) ? merge(a[k] ?? {}, v) : v;
  return a;
};
const scene = {
  grid: { size: 100 },
  walls: new Map(),
  async createEmbeddedDocuments(type, data, options = {}) {
    const docs = data.map((d) => {
      const doc = merge({ id: `w${nextId++}`, parent: scene, move: 20, sight: 20, light: 20, sound: 20, flags: {} }, structuredClone(d));
      doc.updateSource = (u) => merge(doc, u);
      call("preCreateWall", doc, d, options, "gm");
      return doc;
    });
    for (const doc of docs) scene.walls.set(doc.id, doc);
    for (const doc of docs) call("createWall", doc, options, "gm");
    return docs;
  },
  async updateEmbeddedDocuments(type, updates, options = {}) {
    for (const { _id, ...changes } of updates) {
      const doc = scene.walls.get(_id);
      call("preUpdateWall", doc, changes, options, "gm");
      merge(doc, changes);
      call("updateWall", doc, changes, options, "gm");
    }
  },
  async deleteEmbeddedDocuments(type, ids, options = {}) {
    const docs = ids.map((id) => scene.walls.get(id)).filter(Boolean);
    for (const doc of docs) scene.walls.delete(doc.id);
    for (const doc of docs) call("deleteWall", doc, options, "gm");
  }
};
scene.walls.filter = (f) => [...scene.walls.values()].filter(f);
scene.walls.some = (f) => [...scene.walls.values()].some(f);

const { registerGrille, settled } = await import("../scripts/grille.js");
registerGrille();

const settle = settled;
const bars = (id) => scene.walls.filter((w) => w.flags.palisade?.barOf === id);

test("un mur à motif laisse passer la lumière et reçoit des barreaux qui ne bloquent qu'elle", async () => {
  const [wall] = await scene.createEmbeddedDocuments("Wall", [{ c: [0, 0, 200, 0], flags: { palisade: { pattern: "bars" } } }]);
  await settle();
  assert.equal(wall.light, 0, "le mur à motif ne doit plus bloquer la lumière");
  assert.equal(wall.move, 20, "le mur à motif bloque toujours le passage");
  const b = bars(wall.id);
  assert.equal(b.length, 8, "barreaux tous les 25 px sur 200 px");
  for (const bar of b) assert.deepEqual([bar.move, bar.sight, bar.light, bar.sound], [0, 0, 20, 0]);
});

test("déplacer le mur recrée ses barreaux au nouvel endroit", async () => {
  const [wall] = await scene.createEmbeddedDocuments("Wall", [{ c: [0, 500, 100, 500], flags: { palisade: { pattern: "bars" } } }]);
  await settle();
  await scene.updateEmbeddedDocuments("Wall", [{ _id: wall.id, c: [0, 600, 0, 800] }]);
  await settle();
  const b = bars(wall.id);
  assert.equal(b.length, 8);
  for (const bar of b) assert.ok(bar.c[0] === 0 && bar.c[2] === 0 && bar.c[1] >= 600 && bar.c[3] <= 800, `barreau hors du mur : ${bar.c}`);
});

test("changer le motif ou l'écartement remplace les barreaux", async () => {
  const [wall] = await scene.createEmbeddedDocuments("Wall", [{ c: [0, 900, 200, 900], flags: { palisade: { pattern: "bars" } } }]);
  await settle();
  await scene.updateEmbeddedDocuments("Wall", [{ _id: wall.id, flags: { palisade: { pattern: "lattice" } } }]);
  await settle();
  assert.equal(bars(wall.id).length, 4, "croisillons tous les 50 px");
  await scene.updateEmbeddedDocuments("Wall", [{ _id: wall.id, flags: { palisade: { density: 2 } } }]);
  await settle();
  assert.equal(bars(wall.id).length, 2, "écartement doublé");
});

test("retirer le motif rend le mur plein et supprime ses barreaux", async () => {
  const [wall] = await scene.createEmbeddedDocuments("Wall", [{ c: [0, 1000, 200, 1000], flags: { palisade: { pattern: "mesh" } } }]);
  await settle();
  assert.ok(bars(wall.id).length > 10);
  await scene.updateEmbeddedDocuments("Wall", [{ _id: wall.id, flags: { palisade: { pattern: "" } } }]);
  await settle();
  assert.equal(wall.light, 20, "le mur redevient plein");
  assert.equal(bars(wall.id).length, 0);
});

test("supprimer le mur supprime ses barreaux, un mur ordinaire n'en a pas", async () => {
  const [wall, plain] = await scene.createEmbeddedDocuments("Wall", [
    { c: [0, 1100, 200, 1100], flags: { palisade: { pattern: "bars" } } },
    { c: [0, 1200, 200, 1200] }
  ]);
  await settle();
  assert.equal(bars(plain.id).length, 0);
  await scene.deleteEmbeddedDocuments("Wall", [wall.id]);
  await settle();
  assert.equal(bars(wall.id).length, 0);
});

test("cadran : clic droit sur un mur sélectionné → toute la sélection, sinon le mur seul, jamais les barreaux", async () => {
  const { targetsFor } = await import("../scripts/pattern-dial.js");
  const w = (id, flags = {}) => ({ document: { id, flags } });
  const a = w("a"), b = w("b"), bar = w("x", { palisade: { barOf: "a" } }), c = w("c");
  assert.deepEqual(targetsFor(a, [a, b, bar], scene).map((d) => d.id), ["a", "b"]);
  assert.deepEqual(targetsFor(c, [a, b], scene).map((d) => d.id), ["c"]);
  assert.deepEqual(targetsFor(bar, [bar], scene), []);
});

test("cadran : Appliquer pose le motif et l'écartement, « Aucun » le retire", async () => {
  const { patternUpdate } = await import("../scripts/pattern-dial.js");
  const [wall] = await scene.createEmbeddedDocuments("Wall", [{ c: [0, 1300, 200, 1300] }]);
  await scene.updateEmbeddedDocuments("Wall", [patternUpdate(wall, "lattice", 2)]);
  await settle();
  assert.equal(wall.light, 0);
  assert.equal(bars(wall.id).length, 2, "croisillons à écartement ×2 : tous les 100 px");
  await scene.updateEmbeddedDocuments("Wall", [patternUpdate(wall, "none", 1)]);
  await settle();
  assert.equal(wall.light, 20);
  assert.equal(bars(wall.id).length, 0);
});

test("grille découpée en 40 petits murs (pinceau) : même lumière qu'un seul mur, en un seul calcul", async () => {
  const pieces = Array.from({ length: 40 }, (_, i) => ({ c: [i * 5, 1500, (i + 1) * 5, 1500], flags: { palisade: { pattern: "bars" } } }));
  const walls = await scene.createEmbeddedDocuments("Wall", pieces);
  await settle();
  const ids = new Set(walls.map((w) => w.id));
  const all = scene.walls.filter((w) => ids.has(w.flags.palisade?.barOf));
  const blocked = all.reduce((s, w) => s + Math.hypot(w.c[2] - w.c[0], w.c[3] - w.c[1]), 0);
  assert.ok(Math.abs(blocked / 200 - 0.28) <= 0.04, `${Math.round((blocked / 200) * 100)} % bouché au lieu de 28 %`);
});

test("clic droit sur un morceau de grille : toute la chaîne est visée, un mur ordinaire reste seul", async () => {
  const { targetsFor } = await import("../scripts/pattern-dial.js");
  const pieces = Array.from({ length: 5 }, (_, i) => ({ c: [i * 40, 1600, (i + 1) * 40, 1600], flags: { palisade: { pattern: "lattice" } } }));
  const walls = await scene.createEmbeddedDocuments("Wall", [...pieces, { c: [200, 1600, 200, 1700] }]);
  await settle();
  const plain = walls[5];
  const got = targetsFor({ document: walls[2] }, [], scene).map((d) => d.id).sort();
  assert.deepEqual(got, walls.slice(0, 5).map((w) => w.id).sort());
  assert.deepEqual(targetsFor({ document: plain }, [], scene).map((d) => d.id), [plain.id]);
});

test("retirer le motif d'un morceau au milieu : la chaîne se coupe en deux et le morceau perd ses barreaux", async () => {
  const pieces = Array.from({ length: 3 }, (_, i) => ({ c: [i * 100, 1800, (i + 1) * 100, 1800], flags: { palisade: { pattern: "bars" } } }));
  const walls = await scene.createEmbeddedDocuments("Wall", pieces);
  await settle();
  await scene.updateEmbeddedDocuments("Wall", [{ _id: walls[1].id, flags: { palisade: { pattern: "" } } }]);
  await settle();
  assert.equal(bars(walls[1].id).length, 0);
  assert.equal(bars(walls[0].id).length, 4);
  assert.equal(bars(walls[2].id).length, 4);
});
