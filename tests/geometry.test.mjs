import { test } from "node:test";
import assert from "node:assert/strict";
import {
  snapPoint,
  snapCoords,
  planJointMoves,
  planSplits,
  splitCoords,
  connectedWalls,
  isInterior
} from "../scripts/geometry.js";

const wall = (id, c, door = false) => ({ id, c, door });

test("accroche à l'extrémité la plus proche, avant le milieu d'un mur", () => {
  const walls = [wall("a", [0, 0, 100, 0]), wall("b", [105, 5, 105, 200])];
  assert.deepEqual(snapPoint([103, 2], walls, 10), [105, 5]);
});

test("accroche au milieu d'un mur quand aucune extrémité n'est proche", () => {
  const walls = [wall("a", [0, 0, 100, 0])];
  assert.deepEqual(snapPoint([50, 7], walls, 10), [50, 0]);
  assert.deepEqual(snapPoint([50, 20], walls, 10), [50, 20]);
});

test("une tolérance nulle n'accroche rien", () => {
  assert.deepEqual(snapPoint([1, 1], [wall("a", [0, 0, 10, 0])], 0), [1, 1]);
});

test("un mur ne s'accroche pas à lui-même et n'est jamais rendu nul", () => {
  const walls = [wall("a", [0, 0, 5, 0])];
  assert.deepEqual(snapCoords([0, 0, 5, 0], walls, 10, "a"), [0, 0, 5, 0]);
  // mur plus court que la distance d'accroche : seule l'extrémité la plus proche est soudée
  assert.deepEqual(snapCoords([1, 1, 2, 2], [wall("b", [0, 0, 100, 100])], 10), [0, 0, 2, 2]);
});

test("seules les extrémités demandées sont accrochées", () => {
  const walls = [wall("a", [0, 0, 100, 0])];
  assert.deepEqual(snapCoords([2, 2, 98, 3], walls, 10, null, [false, true]), [2, 2, 100, 0]);
});

test("les jointures suivent l'extrémité déplacée", () => {
  const walls = [wall("a", [0, 0, 120, 10]), wall("b", [100, 0, 100, 100]), wall("c", [200, 0, 300, 0])];
  const updates = planJointMoves([{ id: "a", from: [0, 0, 100, 0], to: [0, 0, 120, 10] }], walls);
  assert.deepEqual(updates, [{ _id: "b", c: [120, 10, 100, 100] }]);
});

test("les murs déplacés ensemble ne sont pas retouchés", () => {
  const walls = [wall("a", [10, 0, 110, 0]), wall("b", [110, 0, 110, 100])];
  const moves = [
    { id: "a", from: [0, 0, 100, 0], to: [10, 0, 110, 0] },
    { id: "b", from: [100, 0, 100, 100], to: [110, 0, 110, 100] }
  ];
  assert.deepEqual(planJointMoves(moves, walls), []);
});

test("une jointure qui rendrait un mur nul est ignorée", () => {
  const walls = [wall("a", [0, 0, 50, 0]), wall("b", [100, 0, 50, 0])];
  assert.deepEqual(planJointMoves([{ id: "a", from: [0, 0, 100, 0], to: [0, 0, 50, 0] }], walls), []);
});

test("coupe un segment dans l'ordre du tracé, en ignorant les doublons et les extrémités", () => {
  assert.deepEqual(splitCoords([0, 0, 100, 0], [[70, 0], [30, 0], [30, 0], [0, 0]]), [
    [0, 0, 30, 0],
    [30, 0, 70, 0],
    [70, 0, 100, 0]
  ]);
});

test("une extrémité au milieu d'un mur le coupe en T", () => {
  const walls = [wall("long", [0, 0, 100, 0]), wall("new", [50, 0, 50, 80])];
  const { updates, creates } = planSplits(["new"], walls);
  assert.deepEqual(updates, [{ _id: "long", c: [0, 0, 50, 0] }]);
  assert.deepEqual(creates, [{ sourceId: "long", c: [50, 0, 100, 0] }]);
});

test("un nouveau mur qui passe sur l'extrémité d'un autre est coupé", () => {
  const walls = [wall("stub", [50, 0, 50, 80]), wall("new", [0, 0, 100, 0])];
  const { updates, creates } = planSplits(["new"], walls);
  assert.deepEqual(updates, [{ _id: "new", c: [0, 0, 50, 0] }]);
  assert.deepEqual(creates, [{ sourceId: "new", c: [50, 0, 100, 0] }]);
});

test("les portes ne sont pas coupées par défaut", () => {
  const walls = [wall("door", [0, 0, 100, 0], true), wall("new", [50, 0, 50, 80])];
  assert.deepEqual(planSplits(["new"], walls), { updates: [], creates: [] });
  assert.equal(planSplits(["new"], walls, { skipDoors: false }).creates.length, 1);
});

test("un point arrondi à moins d'un pixel du mur compte comme posé dessus", () => {
  assert.equal(isInterior([33, 1], [0, 0], [100, 3]), true);
  assert.equal(isInterior([33, 5], [0, 0], [100, 3]), false);
});

test("trouve tous les murs reliés", () => {
  const walls = [
    wall("a", [0, 0, 100, 0]),
    wall("b", [100, 0, 100, 100]),
    wall("c", [100, 100, 0, 100]),
    wall("far", [500, 500, 600, 500])
  ];
  assert.deepEqual([...connectedWalls("a", walls)].sort(), ["a", "b", "c"]);
});

test("pinceau : zone d'image lue autour du trait, avec origine et échelle", async () => {
  const { imageRegion } = await import("../scripts/brush-tool.js");
  // image de 2000 px affichée sur 1000 unités monde, à partir de (100, 50)
  const place = { x: 100, y: 50, width: 1000, height: 500, naturalWidth: 2000, naturalHeight: 1000 };
  const r = imageRegion([[300, 200], [400, 250]], 20, place);
  // trait en pixels d'image : x 400–600, y 300–400 ; marge 20 × 2 + 40 = 80
  assert.deepEqual([r.sx, r.sy, r.sw, r.sh], [320, 220, 360, 260]);
  assert.deepEqual([r.originX, r.originY, r.scale], [260, 160, 2]);
  // bornée à l'image
  const edge = imageRegion([[100, 50], [120, 60]], 20, place);
  assert.deepEqual([edge.sx, edge.sy], [0, 0]);
});

test("pinceau : un trait qui repasse sur des murs existants s'y soude sans les doubler", async () => {
  const { weldChain } = await import("../scripts/geometry.js");
  const walls = [wall("a", [0, 0, 100, 0])];
  // trait qui longe le mur existant (à 2 px) puis continue vers le bas
  const out = weldChain([[3, 2], [98, 1], [102, 3], [100, 80]], walls, 6);
  assert.deepEqual(out, [[100, 0, 100, 80]]);
});

test("pinceau : deux points d'une même chaîne au même endroit n'en font qu'un", async () => {
  const { weldChain } = await import("../scripts/geometry.js");
  // boucle presque fermée : le dernier point tombe à 3 px du premier
  const out = weldChain([[0, 0], [100, 0], [100, 100], [2, 3]], [], 6);
  assert.deepEqual(out, [[0, 0, 100, 0], [100, 0, 100, 100], [100, 100, 0, 0]]);
});

test("pinceau : un segment qui revient sur un segment du même trait n'est pas doublé", async () => {
  const { weldChain } = await import("../scripts/geometry.js");
  const out = weldChain([[0, 0], [100, 0], [50, 1]], [], 6);
  assert.deepEqual(out, [[0, 0, 100, 0]]);
});

test("pinceau : propriétés des types de mur (traversable = les personnages passent)", async () => {
  globalThis.CONST = { WALL_SENSE_TYPES: { NONE: 0, LIMITED: 10, NORMAL: 20 }, WALL_MOVEMENT_TYPES: { NONE: 0, NORMAL: 20 } };
  const { wallTypeData } = await import("../scripts/brush-tool.js");
  assert.deepEqual(wallTypeData("normal"), {});
  assert.deepEqual(wallTypeData("ethereal"), { move: 0, sound: 0 });
  assert.deepEqual(wallTypeData("invisible"), { sight: 0, light: 0, sound: 0 });
  assert.deepEqual(wallTypeData("terrain"), { sight: 10, light: 10, sound: 10 });
});

test("accroche d'un mur plus court que la distance d'accroche : il reste soudé par une extrémité", () => {
  // les deux extrémités du petit mur visent le même point existant (100, 0)
  const walls = [wall("a", [0, 0, 100, 0])];
  const out = snapCoords([102, 3, 106, 8], walls, 12);
  assert.equal(isDegenerateLocal(out), false);
  assert.ok((out[0] === 100 && out[1] === 0) || (out[2] === 100 && out[3] === 0), `aucune extrémité soudée : ${out}`);
  // c'est l'extrémité la plus proche qui est soudée
  assert.deepEqual(out, [100, 0, 106, 8]);
});

function isDegenerateLocal(c) {
  return c[0] === c[2] && c[1] === c[3];
}
