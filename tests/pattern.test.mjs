import { test } from "node:test";
import assert from "node:assert/strict";
import { patternBars, patternSize, MAX_BARS, wallChains, chainBars, sceneBars } from "../scripts/pattern.js";

const size = patternSize;

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

const split = (n, len = 200) => Array.from({ length: n }, (_, i) => ({ id: `s${i}`, c: [(i * len) / n, 0, ((i + 1) * len) / n, 0] }));
const blockedShare = (bars, len) => bars.reduce((s, b) => s + Math.hypot(b.c[2] - b.c[0], b.c[3] - b.c[1]), 0) / len;

test("chaîne : une grille découpée en petits murs bloque autant de lumière qu'un seul mur", () => {
  const { spacing, thickness } = size("bars", 100);
  const ref = blockedShare(chainBars(wallChains(split(1))[0], spacing, thickness), 200);
  for (const n of [4, 10, 40]) {
    const chains = wallChains(split(n));
    assert.equal(chains.length, 1, `${n} murs bout à bout = une seule chaîne`);
    const share = blockedShare(chainBars(chains[0], spacing, thickness), 200);
    assert.ok(Math.abs(share - ref) <= 0.03, `${n} murs : ${Math.round(share * 100)} % bouché au lieu de ${Math.round(ref * 100)} %`);
  }
});

test("chaîne : chaque morceau de barreau reste sur son propre mur", () => {
  const walls = split(40);
  const byId = Object.fromEntries(walls.map((w) => [w.id, w]));
  const bars = chainBars(wallChains(walls)[0], 25, 7);
  for (const { owner, c } of bars) {
    const w = byId[owner].c;
    assert.ok(c[0] >= w[0] && c[2] <= w[2], `morceau ${c} hors de son mur ${w}`);
  }
});

test("chaîne : un angle garde l'écart régulier, et les murs dans le désordre sont remis en ordre", () => {
  const walls = [
    { id: "b", c: [100, 0, 100, 100] }, // donné à l'envers et avant le premier
    { id: "a", c: [0, 0, 100, 0] }
  ];
  const chains = wallChains(walls);
  assert.equal(chains.length, 1);
  assert.equal(chains[0].ids.length, 2);
  const bars = chainBars(chains[0], 25, 6);
  assert.ok(bars.some((b) => b.owner === "a") && bars.some((b) => b.owner === "b"));
  for (const { owner, c } of bars) {
    if (owner === "a") assert.ok(c[1] === 0 && c[3] === 0, `morceau de « a » hors du mur horizontal : ${c}`);
    else assert.ok(c[0] === 100 && c[2] === 100, `morceau de « b » hors du mur vertical : ${c}`);
  }
});

test("chaîne : un carrefour coupe les chaînes, une boucle fermée en fait une seule", () => {
  const tee = [
    { id: "a", c: [0, 0, 100, 0] },
    { id: "b", c: [100, 0, 200, 0] },
    { id: "c", c: [100, 0, 100, 100] }
  ];
  assert.equal(wallChains(tee).length, 3);
  const loop = [
    { id: "a", c: [0, 0, 100, 0] },
    { id: "b", c: [100, 0, 100, 100] },
    { id: "c", c: [100, 100, 0, 100] },
    { id: "d", c: [0, 100, 0, 0] }
  ];
  const chains = wallChains(loop);
  assert.equal(chains.length, 1);
  assert.equal(chains[0].ids.length, 4);
});

test("scène : motifs ou écartements différents ne se mélangent pas", () => {
  const walls = [
    { id: "a", c: [0, 0, 100, 0], pattern: "bars" },
    { id: "b", c: [100, 0, 200, 0], pattern: "lattice" },
    { id: "c", c: [200, 0, 300, 0], pattern: "bars", density: 2 }
  ];
  const bars = sceneBars(walls, 100);
  assert.equal(bars.filter((b) => b.owner === "a").length, 4, "barreaux tous les 25 px");
  assert.equal(bars.filter((b) => b.owner === "b").length, 2, "croisillons tous les 50 px");
  assert.equal(bars.filter((b) => b.owner === "c").length, 2, "barreaux ×2 tous les 50 px");
});
