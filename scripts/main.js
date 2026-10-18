/**
 * Palisade — murs auto-reliés pour Foundry VTT.
 * Point d'entrée : réglages, bouton dans les outils des murs, API publique.
 *
 * API (game.modules.get("palisade").api) :
 *   enabled                : true si la liaison est active pour ce client
 *   connected(wall)        : Set des ids des murs reliés à ce mur (lui compris)
 *   selectConnected(wall)  : sélectionne sur le canevas tous les murs reliés à ce mur
 *   snapStroke(...)        : colle un trait sur les murs d'une image (voir brush.js)
 *   geometry               : fonctions de géométrie (voir geometry.js)
 */

import { MODULE_ID, log } from "./constants.js";
import { registerLinker, isEnabled } from "./linker.js";
import { registerBrushTool, brushToolButton } from "./brush-tool.js";
import * as geometry from "./geometry.js";
import { snapStroke } from "./brush.js";

/* -------------------------------------------- */
/*  Réglages                                    */
/* -------------------------------------------- */

function registerSettings() {
  game.settings.register(MODULE_ID, "enabled", {
    name: "PALISADE.Settings.Enabled.Name",
    hint: "PALISADE.Settings.Enabled.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => ui.controls?.render()
  });

  game.settings.register(MODULE_ID, "snapDistance", {
    name: "PALISADE.Settings.SnapDistance.Name",
    hint: "PALISADE.Settings.SnapDistance.Hint",
    scope: "world",
    config: true,
    type: Number,
    range: { min: 0, max: 50, step: 1 },
    default: 12
  });

  game.settings.register(MODULE_ID, "moveJoints", {
    name: "PALISADE.Settings.MoveJoints.Name",
    hint: "PALISADE.Settings.MoveJoints.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "autoSplit", {
    name: "PALISADE.Settings.AutoSplit.Name",
    hint: "PALISADE.Settings.AutoSplit.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "brushRadius", {
    name: "PALISADE.Settings.BrushRadius.Name",
    hint: "PALISADE.Settings.BrushRadius.Hint",
    scope: "client",
    config: true,
    type: Number,
    range: { min: 16, max: 120, step: 4 },
    default: 48
  });

  game.settings.register(MODULE_ID, "skipDoors", {
    name: "PALISADE.Settings.SkipDoors.Name",
    hint: "PALISADE.Settings.SkipDoors.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });
}

/* -------------------------------------------- */
/*  API                                         */
/* -------------------------------------------- */

function wallList(scene) {
  return scene.walls.map((w) => ({ id: w.id, c: [...w.c], door: w.door > 0 }));
}

function connected(wall) {
  const doc = wall?.document ?? wall;
  if (!doc?.parent) return new Set();
  return geometry.connectedWalls(doc.id, wallList(doc.parent));
}

function selectConnected(wall) {
  const ids = connected(wall);
  if (!ids.size || !canvas.walls) return;
  canvas.walls.releaseAll();
  for (const id of ids) canvas.walls.get(id)?.control({ releaseOthers: false });
}

/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

Hooks.once("init", () => {
  registerSettings();
  registerLinker();
  registerBrushTool();

  game.keybindings.register(MODULE_ID, "selectConnected", {
    name: "PALISADE.Keybindings.SelectConnected.Name",
    hint: "PALISADE.Keybindings.SelectConnected.Hint",
    editable: [{ key: "KeyL", modifiers: ["Shift"] }],
    restricted: true,
    onDown: () => {
      const wall = canvas.walls?.hover ?? canvas.walls?.controlled[0];
      if (!wall) return false;
      selectConnected(wall);
      return true;
    }
  });

  game.modules.get(MODULE_ID).api = {
    get enabled() {
      return isEnabled();
    },
    connected,
    selectConnected,
    snapStroke,
    geometry
  };
});

Hooks.on("getSceneControlButtons", (controls) => {
  if (!game.user.isGM) return;
  const walls = Array.isArray(controls) ? controls.find((c) => c.name === "walls") : controls.walls;
  if (!walls) return;

  const tool = {
    name: MODULE_ID,
    title: "PALISADE.Controls.Toggle",
    icon: "fa-solid fa-link",
    toggle: true,
    active: game.settings.get(MODULE_ID, "enabled"),
    order: 100,
    onChange: (event, active) => game.settings.set(MODULE_ID, "enabled", active)
  };
  const brush = brushToolButton();
  if (Array.isArray(walls.tools)) walls.tools.push(tool, brush);
  else Object.assign(walls.tools, { [MODULE_ID]: tool, [brush.name]: brush });
});

Hooks.once("ready", () => log("prêt"));
