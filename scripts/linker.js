/**
 * Palisade — liaison automatique des murs.
 *
 *   Accroche   : à la création ou au déplacement, une extrémité proche d'un autre mur
 *                s'y colle (extrémité d'abord, sinon milieu du mur).
 *   Coupure    : une extrémité posée au milieu d'un mur coupe ce mur en deux (jonction en T),
 *                pour que chaque morceau reste relié.
 *   Jointures  : déplacer une extrémité ou un mur entraîne les murs qui partageaient ce point.
 *
 * Seul le client qui a fait la modification réagit, et les modifications de Palisade
 * portent l'option { palisade: true } pour ne pas se déclencher elles-mêmes.
 */

import { MODULE_ID, setting, snapTolerance } from "./constants.js";
import { snapCoords, planJointMoves, planSplits, endpoints, samePoint } from "./geometry.js";

/** Anciennes coordonnées des murs en cours de mise à jour, par uuid. */
const previousCoords = new Map();

/** Changements à traiter, par scène : { scene, created: Set, moves: [] }. */
const pending = new Map();

export function isEnabled() {
  return game.user.isGM && setting("enabled");
}

function shouldHandle(options, userId) {
  return !options?.[MODULE_ID] && userId === game.user.id && isEnabled();
}

function wallsOf(scene) {
  return scene.walls.map((w) => ({ id: w.id, c: [...w.c], door: w.door > 0 }));
}

function queueFor(scene) {
  if (!pending.has(scene.id)) pending.set(scene.id, { scene, created: new Set(), moves: [] });
  return pending.get(scene.id);
}

/* -------------------------------------------- */
/*  Accroche                                    */
/* -------------------------------------------- */

function onPreCreateWall(doc, data, options, userId) {
  if (!shouldHandle(options, userId) || !doc.parent) return;
  // les murs du pinceau arrivent déjà soudés (weldChain) : ne pas les ré-accrocher un par un
  if (options?.palisadeBrush) return;
  const tolerance = snapTolerance();
  const c = snapCoords([...doc.c], wallsOf(doc.parent), tolerance, doc.id);
  if (c.some((v, i) => v !== doc.c[i])) doc.updateSource({ c });
}

function onPreUpdateWall(doc, changes, options, userId) {
  if (!("c" in changes) || !doc.parent) return;
  previousCoords.set(doc.uuid, [...doc.c]);
  if (!shouldHandle(options, userId)) return;

  // N'accroche que les extrémités qui bougent : l'autre reste où elle est.
  const [oldA, oldB] = endpoints(doc.c);
  const [newA, newB] = endpoints(changes.c);
  const which = [!samePoint(oldA, newA), !samePoint(oldB, newB)];
  if (!which[0] && !which[1]) return;
  changes.c = snapCoords(changes.c, wallsOf(doc.parent), snapTolerance(), doc.id, which);
}

/* -------------------------------------------- */
/*  File d'attente                              */
/* -------------------------------------------- */

function onCreateWall(doc, options, userId) {
  if (!shouldHandle(options, userId) || !doc.parent) return;
  queueFor(doc.parent).created.add(doc.id);
  scheduleFlush();
}

function onUpdateWall(doc, changes, options, userId) {
  const from = previousCoords.get(doc.uuid);
  previousCoords.delete(doc.uuid);
  if (!("c" in changes) || !from || !shouldHandle(options, userId) || !doc.parent) return;
  queueFor(doc.parent).moves.push({ id: doc.id, from, to: [...doc.c] });
  scheduleFlush();
}

// Les hooks d'un même lot (collage, déplacement d'une sélection) arrivent ensemble :
// on attend la fin du lot pour tout traiter d'un coup.
const scheduleFlush = foundry.utils.debounce(() => flush().catch((err) => console.error("Palisade |", err)), 20);

async function flush() {
  const batches = [...pending.values()];
  pending.clear();
  for (const { scene, created, moves } of batches) {
    if (!scene.walls) continue;
    const candidates = new Set([...created, ...moves.map((m) => m.id)]);
    const opts = { [MODULE_ID]: true };

    if (setting("moveJoints") && moves.length) {
      const updates = planJointMoves(moves, wallsOf(scene));
      if (updates.length) {
        await scene.updateEmbeddedDocuments("Wall", updates, opts);
        for (const u of updates) candidates.add(u._id);
      }
    }

    if (setting("autoSplit") && candidates.size) {
      const { updates, creates } = planSplits(candidates, wallsOf(scene), { skipDoors: setting("skipDoors") });
      if (updates.length) await scene.updateEmbeddedDocuments("Wall", updates, opts);
      if (creates.length) {
        const data = creates.map(({ sourceId, c }) => {
          const source = scene.walls.get(sourceId).toObject();
          delete source._id;
          return { ...source, c };
        });
        await scene.createEmbeddedDocuments("Wall", data, opts);
      }
    }
  }
}

export function registerLinker() {
  Hooks.on("preCreateWall", onPreCreateWall);
  Hooks.on("preUpdateWall", onPreUpdateWall);
  Hooks.on("createWall", onCreateWall);
  Hooks.on("updateWall", onUpdateWall);
}
