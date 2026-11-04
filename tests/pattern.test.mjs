import { test } from "node:test";
import assert from "node:assert/strict";
import { patternBars, patternSize, MAX_BARS } from "../scripts/pattern.js";

test("barreaux répartis régulièrement et centrés sur le mur", () => {
  // mur de 100 px, barreaux de 6 px tous les 25 px : 4 barreaux, centrés en 12,5 / 37,5 / 62,5 / 87,5
  const bars = patternBars([0, 0, 100, 0], 25, 6);
  assert.equal(bars.length, 4);
  const centers = bars.map(([x0, , x1]) => (x0 + x1) / 2);
  for (let i = 1; i < centers.length; i++) assert.ok(Math.abs(centers[i] - centers[i - 1] - 25) <= 1);
  assert.ok(Math.abs(centers[0] - (100 - centers[3])) <= 1, `motif décentré : ${centers}`);
  for (const [, y0, , y1] of bars) assert.deepEqual([y0, y1], [0, 0]);
});

test("des jours restent ouverts entre les barreaux, et tous sont sur le mur", () => {
  const c = [10, 20, 210, 170]; // mur en biais de 250 px
  const bars = patternBars(c, 20, 8);
  const along = ([x, y]) => ((x - 10) * 200 + (y - 20) * 150) / 250;
  const across = ([x, y]) => Math.abs((x - 10) * 150 - (y - 20) * 200) / 250;
  let prevEnd = -Infinity;
  for (const [x0, y0, x1, y1] of bars) {
    const [s, e] = [along([x0, y0]), along([x1, y1])].sort((a, b) => a - b);
    assert.ok(s > prevEnd + 5, "deux barreaux se touchent : la lumière ne passerait plus");
    assert.ok(s >= -1 && e <= 251, "barreau hors du mur");
    assert.ok(across([x0, y0]) <= 1 && across([x1, y1]) <= 1, "barreau à côté du mur");
    prevEnd = e;
  }
});

test("épaisseur plus grande que l'écart : un jour est gardé quand même", () => {
  const bars = patternBars([0, 0, 100, 0], 10, 30);
  assert.ok(bars.length >= 2);
  assert.ok(bars[1][0] > bars[0][2], "barreaux soudés en un mur plein");
});

test("mur court ou paramètres nuls", () => {
  assert.equal(patternBars([0, 0, 4, 0], 25, 6).length, 1);
  assert.deepEqual(patternBars([5, 5, 5, 5], 25, 6), []);
  assert.deepEqual(patternBars([0, 0, 100, 0], 0, 6), []);
});

test("nombre de barreaux plafonné sur un très long mur", () => {
  const bars = patternBars([0, 0, 100000, 0], 5, 2);
  assert.equal(bars.length, MAX_BARS);
  assert.ok(bars[0][0] >= 0 && bars[bars.length - 1][2] <= 100000);
});

test("tailles des motifs selon la case et la densité", () => {
  assert.deepEqual(patternSize("bars", 100), { spacing: 25, thickness: 7 });
  assert.deepEqual(patternSize("bars", 100, 2), { spacing: 50, thickness: 7 });
  assert.equal(patternSize("mesh", 50).thickness, 2, "épaisseur minimale de 2 px");
  assert.equal(patternSize("inconnu", 100), null);
});
