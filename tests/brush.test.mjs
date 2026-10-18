import { test } from "node:test";
import assert from "node:assert/strict";
import { snapStroke, simplify, resample } from "../scripts/brush.js";

/* Générateur pseudo-aléatoire déterministe */
function rng(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

function makeImage(w, h, paint) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = paint(x, y);
      const i = (y * w + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return { width: w, height: h, data };
}

/** Trait tremblant le long d'une polyligne, décalé de `offset` px. */
function wobbly(points, offset, seed = 7, amp = 3) {
  const rand = rng(seed);
  return resample(points, 6).map(([x, y]) => [x + (rand() - 0.5) * amp, y + offset + (rand() - 0.5) * amp]);
}

const maxDistanceToLine = (pts, axis, value) => Math.max(...pts.map((p) => Math.abs(p[axis] - value)));

test("mur dessiné : le trait se colle au milieu du trait sombre", () => {
  const rand = rng(1);
  const img = makeImage(320, 200, (x, y) => {
    const n = (rand() - 0.5) * 20;
    if (y >= 97 && y <= 103 && x >= 20 && x <= 300) return [40 + n, 35 + n, 30 + n];
    return [228 + n, 214 + n, 180 + n];
  });
  const res = snapStroke(wobbly([[40, 100], [280, 100]], 13), img);
  assert.equal(res.ok, true);
  assert.ok(res.weights.ridge > 0.5, `détecteur trait attendu, obtenu ${JSON.stringify(res.weights)}`);
  assert.ok(maxDistanceToLine(res.points, 1, 100) <= 1.5, JSON.stringify(res.points));
  assert.equal(res.points.length, 2, "une ligne droite donne un seul mur");
});

test("carte réaliste : le trait se colle à la frontière pierre / bois", () => {
  const rand = rng(2);
  const img = makeImage(320, 240, (x, y) => {
    const n = (rand() - 0.5) * 60;
    if (y < 120) {
      const plank = (Math.floor(x / 37) % 2) * 18; // planches de bois
      return [150 + plank + n, 100 + plank + n * 0.7, 60 + n * 0.5];
    }
    return [125 + n, 125 + n, 132 + n]; // pierre grise
  });
  const res = snapStroke(wobbly([[30, 120], [290, 120]], -12, 3), img);
  assert.equal(res.ok, true);
  assert.ok(res.weights.step > 0.5, `détecteur bord attendu, obtenu ${JSON.stringify(res.weights)}`);
  assert.ok(maxDistanceToLine(res.points, 1, 120) <= 2.5, JSON.stringify(res.points));
});

test("angle : deux murs, coin au bon endroit", () => {
  const img = makeImage(300, 300, (x, y) => {
    const onH = y >= 57 && y <= 63 && x >= 57 && x <= 240;
    const onV = x >= 57 && x <= 63 && y >= 57 && y <= 240;
    return onH || onV ? [30, 30, 30] : [235, 225, 200];
  });
  const res = snapStroke(wobbly([[230, 70], [70, 70], [70, 230]], 0, 5, 4).map(([x, y]) => [x + 6, y + 4]), img);
  assert.equal(res.ok, true);
  assert.ok(res.points.length >= 3 && res.points.length <= 4, JSON.stringify(res.points));
  const corner = res.points.reduce((best, p) => (Math.hypot(p[0] - 60, p[1] - 60) < Math.hypot(best[0] - 60, best[1] - 60) ? p : best));
  assert.ok(Math.hypot(corner[0] - 60, corner[1] - 60) <= 6, `coin trouvé en ${corner}`);
});

test("zone sans paroi : le trait est gardé tel quel et signalé", () => {
  const rand = rng(4);
  const img = makeImage(200, 200, () => {
    const n = (rand() - 0.5) * 6;
    return [200 + n, 200 + n, 200 + n];
  });
  const res = snapStroke([[20, 100], [180, 102]], img);
  assert.equal(res.ok, false);
  assert.equal(res.points.length, 2);
});

test("coordonnées monde : origine et échelle de l'image respectées", () => {
  // Image deux fois plus petite que la scène, posée en (1000, 500)
  const img = makeImage(160, 100, (x, y) => (y >= 48 && y <= 52 ? [20, 20, 20] : [230, 230, 230]));
  Object.assign(img, { originX: 1000, originY: 500, scale: 0.5 });
  const res = snapStroke([[1040, 610], [1280, 612]], img, { radius: 30 });
  assert.equal(res.ok, true);
  assert.ok(maxDistanceToLine(res.points, 1, 600) <= 2.5, JSON.stringify(res.points));
});

test("un trait refermé sur lui-même donne une boucle fermée", () => {
  const img = makeImage(300, 300, (x, y) => {
    const ring = (x >= 47 && x <= 53 && y >= 50 && y <= 250) || (x >= 247 && x <= 253 && y >= 50 && y <= 250) ||
      (y >= 47 && y <= 53 && x >= 50 && x <= 250) || (y >= 247 && y <= 253 && x >= 50 && x <= 250);
    return ring ? [25, 25, 25] : [235, 228, 205];
  });
  const res = snapStroke(wobbly([[60, 60], [240, 60], [240, 240], [60, 240], [60, 62]], 0, 9), img);
  assert.equal(res.closed, true);
  assert.deepEqual(res.points[0], res.points[res.points.length - 1]);
});

test("tour ronde : les segments restent sur le cercle, sans angles inventés", () => {
  const img = makeImage(300, 300, (x, y) => (Math.abs(Math.hypot(x - 150, y - 150) - 90) <= 3 ? [30, 30, 30] : [235, 228, 205]));
  const arc = [];
  for (let a = 0; a <= Math.PI; a += 0.1) arc.push([150 + 102 * Math.cos(a), 150 + 102 * Math.sin(a)]);
  const res = snapStroke(arc, img);
  assert.equal(res.ok, true);
  assert.ok(res.points.length >= 5, `arc trop grossier : ${res.points.length} points`);
  for (const p of res.points) assert.ok(Math.abs(Math.hypot(p[0] - 150, p[1] - 150) - 90) <= 3, `point hors du cercle : ${p}`);
});

test("mur épais texturé entre deux sols : le trait vise le milieu du mur", () => {
  const rand = rng(11);
  const img = makeImage(320, 240, (x, y) => {
    const n = (rand() - 0.5) * 50;
    if (y >= 108 && y <= 132) return [70 + n, 66 + n, 62 + n]; // mur de pierre de 25 px
    if (y < 108) return [160 + n, 112 + n * 0.7, 70 + n * 0.5]; // bois
    return [150 + n, 150 + n * 0.9, 120 + n * 0.8]; // dalles claires
  });
  const res = snapStroke(wobbly([[30, 120], [290, 120]], 16, 13), img, { radius: 32 });
  assert.equal(res.ok, true);
  assert.ok(maxDistanceToLine(res.points, 1, 120) <= 3, JSON.stringify(res));
});

test("mur de pierre entre herbe et parquet, même luminosité que l'herbe : le trait vise le milieu", () => {
  const rand = rng(17);
  const img = makeImage(320, 240, (x, y) => {
    const n = (rand() - 0.5) * 40;
    if (y >= 108 && y <= 132) return [98 + n, 96 + n, 92 + n]; // pierre grise
    if (y < 108) return [70 + n * 0.6, 116 + n, 52 + n * 0.5]; // herbe, aussi lumineuse que la pierre
    return [150 + n, 101 + n * 0.8, 58 + n * 0.5]; // parquet
  });
  const res = snapStroke(wobbly([[30, 120], [290, 120]], 18, 19), img, { radius: 32 });
  assert.equal(res.ok, true);
  assert.ok(maxDistanceToLine(res.points, 1, 120) <= 3, JSON.stringify(res.points));
  assert.equal(res.points.length, 2);
});

test("simplification : une ligne presque droite devient un segment", () => {
  assert.deepEqual(simplify([[0, 0], [10, 1], [20, -1], [30, 0]], 2), [[0, 0], [30, 0]]);
});
