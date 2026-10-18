// Construit tools/brush-lab.html : la page de test du pinceau, avec l'algorithme recopié
// depuis scripts/geometry.js et scripts/brush.js (une seule source de vérité).
//   node tools/build-brush-lab.mjs
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("..", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const strip = (src) => src.replace(/^export\s+/gm, "");

const sources = ["scripts/geometry.js", "scripts/brush.js"]
  .map((path) => `/* ${path} */\n${strip(read(path))}`)
  .join("\n");

const page = read("tools/brush-lab.template.html").replace("/*INLINE_SOURCES*/", () => sources);
writeFileSync(new URL("tools/brush-lab.html", root), page);
console.log(`tools/brush-lab.html (${(page.length / 1024).toFixed(1)} Ko)`);
