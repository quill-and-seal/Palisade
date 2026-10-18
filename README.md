# Palisade

**Foundry VTT v14** : des murs qui restent reliés.

Une palissade, ce sont des pieux plantés côte à côte et liés entre eux. Palisade fait la même chose avec les murs de Foundry : les extrémités s'accrochent pendant le tracé, un mur posé au milieu d'un autre le coupe proprement en T, et quand tu déplaces un mur, ceux qui le touchaient suivent au lieu de laisser des trous par où la vision passe.

Un module de l'atelier [Quill & Seal](https://github.com/quill-and-seal).

> **État : 0.1.** Accroche, coupure en T et jointures qui suivent. La suite est dans [ROADMAP.md](ROADMAP.md).

## Installation

Dans Foundry, **Modules complémentaires → Installer un module**, puis colle ce lien de manifeste :

```
https://github.com/quill-and-seal/Palisade/releases/latest/download/module.json
```

Active ensuite le module dans ton monde. Il n'a aucune dépendance.

## Ce que fait Palisade

Tout se passe dans l'outil des murs, sans rien changer à ta façon de tracer.

| Situation | Sans Palisade | Avec Palisade |
|---|---|---|
| Tu finis un mur près de l'extrémité d'un autre | Un petit écart reste, la lumière passe | L'extrémité se colle à l'autre |
| Tu finis un mur contre le milieu d'un autre | Les deux murs se croisent sans être reliés | L'extrémité se colle au mur, qui est coupé en deux à cet endroit |
| Tu déplaces l'extrémité d'un mur | Les murs voisins restent sur place | Les murs qui partageaient ce point le suivent |
| Tu déplaces un mur entier ou une sélection | Les jonctions avec le reste s'ouvrent | Les murs reliés s'étirent pour garder les jonctions |

Le bouton **chaîne** dans les outils des murs coupe ou réactive Palisade. Pratique pour poser un mur volontairement détaché.

Le raccourci **Maj + L** sélectionne tous les murs reliés au mur survolé, par exemple pour déplacer une pièce entière d'un coup. Il se change dans **Configurer les contrôles**.

## Réglages

| Réglage | Par défaut | Rôle |
|---|---|---|
| Murs auto-reliés | Activé | Interrupteur général, propre à ce navigateur (le même que le bouton chaîne) |
| Distance d'accroche | 12 px | Rayon dans lequel une extrémité se colle à un autre mur. 0 désactive l'accroche |
| Jointures qui suivent | Activé | Les murs voisins suivent un point déplacé |
| Coupure en T | Activé | Un mur touché en son milieu est coupé en deux |
| Ne jamais couper les portes | Activé | Une porte touchée en son milieu reste entière |

## API

```js
const palisade = game.modules.get("palisade").api;
palisade.enabled;                 // la liaison est-elle active pour ce client
palisade.connected(wall);         // Set des ids des murs reliés à ce mur
palisade.selectConnected(wall);   // les sélectionne sur le canevas
palisade.geometry;                // fonctions de géométrie (accroche, coupure, jointures)
```

Les modifications faites par Palisade portent l'option `{ palisade: true }`, pour que d'autres modules puissent les reconnaître.

## Développement

La géométrie (`scripts/geometry.js`) ne dépend pas de Foundry et se teste avec Node :

```
node --test tests/*.test.mjs
```

Une release GitHub publiée déclenche le workflow qui construit `module.json` et `module.zip` à partir du tag (`v0.1.0` → version `0.1.0`).
