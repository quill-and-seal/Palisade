import { test } from "node:test";
import assert from "node:assert/strict";
import { grilleSegments, shadeAt, barCover, carrierHeight, crossing } from "../scripts/projection.js";

const G = 100; // taille de case
// grille verticale x = 600, de y = 200 à 500 ; lampe à gauche en (300, 350)
const wall = (extra = {}) => ({ id: "g", c: [600, 200, 600, 500], pattern: "lattice", ...extra });
const lamp = (height = 1.5, flame = 0) => ({ x: 300, y: 350, height: height * G, flame: flame * G });

test("hors de la grille ou devant elle : pas d'ombre", () => {
  const segs = grilleSegments([wall()], G);
  assert.equal(shadeAt([500, 350], lamp(), segs), 0, "devant la grille");
  assert.equal(shadeAt([800, 900], lamp(), segs), 0, "rayon qui passe à côté de la grille");
});

test("barreaux verticaux : alternance ombre / lumière le long de la grille, période = écart", () => {
  // herse (pas de barreaux horizontaux), lampe très haute pour rester dans la grille
  const segs = grilleSegments([wall({ pattern: "bars" })], G);
  const s = segs[0].spacing;
  const samples = [];
  for (let y = 300; y <= 400; y += 0.5) samples.push(shadeAt([601, y], lamp(2.5), segs));
  assert.ok(samples.some((v) => v > 0.95) && samples.some((v) => v < 0.05), "il faut des zones nettes d'ombre et de lumière");
  // juste derrière la grille, la part d'ombre moyenne vaut la part des barreaux
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  assert.ok(Math.abs(mean - segs[0].frac) < 0.06, `part d'ombre ${mean.toFixed(2)} au lieu de ${segs[0].frac.toFixed(2)}`);
  assert.equal(s, 25);
});

test("barreaux horizontaux : bandes parallèles à la grille, à la distance prévue par les hauteurs", () => {
  const segs = grilleSegments([wall()], G); // croisillons : écart 50, barreau à z = 0, 50, 100…
  // un rayon qui traverse la grille entre deux barreaux verticaux (au milieu d'un jour)
  const s = segs[0];
  const yGap = 350 + s.spacing / 2; // milieu de la chaîne = axe d'un barreau, +½ écart = jour
  const light = lamp(1.5);
  // z = 150·(1 − t) avec t = 300 / dP ; barreau horizontal en z = 50 ⇒ t = 2/3 ⇒ dP = 450
  const atBar = shadeAt([300 + 450, 350 + (yGap - 350) * 1.5], light, segs);
  const between = shadeAt([300 + 360, 350 + (yGap - 350) * 1.2], light, segs); // z = 25 : entre deux barreaux
  assert.ok(atBar > 0.9, `bande attendue à 450 px de la lampe, ombre ${atBar}`);
  assert.ok(between < 0.1, `jour attendu à 360 px, ombre ${between}`);
});

test("rayon sous le bas d'une fenêtre ou au-dessus de son haut : mur plein", () => {
  const segs = grilleSegments([wall({ bottom: 0.8, top: 1.2 })], G);
  // z = 150·(1 − 300/dP) : dP = 400 ⇒ z = 37,5 < 80 (sous la fenêtre) ; dP = 2000 ⇒ z ≈ 127 > 120
  assert.equal(shadeAt([700, 350], lamp(), segs), 1);
  assert.equal(shadeAt([2300, 350], lamp(), segs), 1);
});

test("pénombre : nette au pied de la grille, de plus en plus floue en s'éloignant", () => {
  const segs = grilleSegments([wall({ pattern: "bars" })], G);
  const contrast = (x) => {
    let lo = 1, hi = 0;
    for (let i = 0; i <= 100; i++) {
      const y = 350 + ((x - 300) / 300) * (i * 0.5 - 25); // même faisceau de rayons, élargi avec la distance
      const v = shadeAt([x, y], lamp(2.5, 0.3), segs);
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    return hi - lo;
  };
  const near = contrast(605);
  const far = contrast(1200);
  assert.ok(near > 0.9, `contraste au pied de la grille ${near.toFixed(2)}`);
  assert.ok(far < near - 0.3, `contraste au loin ${far.toFixed(2)} (pas assez flou)`);
});

test("grille découpée en morceaux : même ombre qu'une grille d'un seul tenant", () => {
  const whole = grilleSegments([wall({ pattern: "bars" })], G);
  const pieces = grilleSegments(
    [0, 1, 2, 3, 4, 5].map((i) => ({ id: `p${i}`, c: [600, 200 + i * 50, 600, 250 + i * 50], pattern: "bars" })),
    G
  );
  assert.equal(pieces.length, 6);
  for (let y = 210; y < 490; y += 3.7) {
    const P = [900, 350 + (y - 350) * 2];
    assert.ok(Math.abs(shadeAt(P, lamp(2.5), whole) - shadeAt(P, lamp(2.5), pieces)) < 1e-6, `écart en y = ${y}`);
  }
});

test("moyenne exacte des barreaux et hauteur de main d'un porteur", () => {
  assert.ok(Math.abs(barCover(0, 10, 0.3, 100) - 0.3) < 0.02, "flou total : la part des barreaux");
  assert.ok(Math.abs(barCover(0, 10, 0.3, 0) - 1) < 1e-9, "axe d'un barreau, net");
  assert.equal(barCover(5, 10, 0.3, 0), 0, "milieu d'un jour, net");
  assert.equal(carrierHeight(1), 0.96);
  assert.equal(carrierHeight(2), 2);
  assert.ok(carrierHeight(0.5) < carrierHeight(1) && carrierHeight(4) > carrierHeight(3));
  assert.equal(crossing([0, 0], [10, 0], [5, -1], [5, 1]).t, 0.5);
});

test("source de lumière v14 sans objet : retrouvée par son identifiant, lumière générale écartée", async () => {
  globalThis.game = { settings: { get: () => "projected" } };
  const { sourceDocument, isGlobalSource } = await import("../scripts/projection-render.js");
  const light = { id: "L1", documentName: "AmbientLight" };
  const token = { id: "T1", documentName: "Token" };
  const scene = { lights: new Map([["L1", light]]), tokens: new Map([["T1", token]]) };
  class PointLightSource {}
  class GlobalLightSource {}
  const src = Object.assign(new PointLightSource(), { sourceId: "AmbientLight.L1", data: { radius: 450 } });
  assert.equal(sourceDocument(src, scene), light);
  assert.equal(sourceDocument(Object.assign(new PointLightSource(), { sourceId: "Token.T1", data: { radius: 30 } }), scene), token);
  assert.equal(sourceDocument(Object.assign(new PointLightSource(), { object: { document: light } }), scene), light, "objet direct (v12-v13)");
  assert.equal(isGlobalSource(src), false);
  assert.equal(isGlobalSource(Object.assign(new GlobalLightSource(), { data: {} })), true);
});
