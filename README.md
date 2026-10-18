# Palisade

**Foundry VTT v14** : des murs qui restent reliés.

Une palissade, ce sont des pieux plantés côte à côte et liés entre eux. Palisade fait la même chose avec les murs de Foundry : les extrémités s'accrochent pendant le tracé, un mur posé au milieu d'un autre le coupe proprement en T, et quand tu déplaces un mur, ceux qui le touchaient suivent au lieu de laisser des trous par où la vision passe.

Un module de l'atelier [Quill & Seal](https://github.com/quill-and-seal).

> **État : 0.1.** Accroche, coupure en T, jointures qui suivent, et pinceau qui colle les murs au dessin de la carte. La suite est dans [ROADMAP.md](ROADMAP.md).

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

## Pinceau

L'outil **pinceau** (icône pinceau, dans les outils des murs) pose les murs en suivant le dessin de la carte :

1. Dessine à main levée le long d'un ou plusieurs murs du fond de scène, sans viser précisément.
2. Relâche : le trait se colle aux murs dessinés et prend les angles avec eux. L'aperçu ambre montre les murs qui vont être créés (en rouge si aucun mur net n'a été trouvé : le trait est alors gardé tel quel).
3. **Entrée** ou un clic crée les murs, **Échap** annule. Un nouveau trait remplace l'aperçu.

À la création, les points du trait se soudent aux points et aux murs déjà posés (8 px à l'écran), et les passages qui repassent sur un mur existant ne sont pas recréés : pas de murs superposés.

Au moment de valider, tant que l'aperçu attend, un **cadran** apparaît à gauche de la vue :

- le **bouton central** règle la précision (molette, glisser vers le haut ou le bas, ou flèches du clavier) ; la graduation à gauche suit la valeur, et l'aperçu en attente se recalcule aussitôt ;
- les **segments de droite** choisissent le type de mur créé (clic sur le segment ou sur son nom) :

| Type | Personnages | Vue et lumière |
|---|---|---|
| Normal | Bloqués | Bloquées |
| Traversable | Passent | Bloquées |
| Invisible | Bloqués | Passent |
| Terrain | Bloqués | Limitées |

Le pinceau reconnaît seul les murs dessinés (traits sombres, murs de pierre) et les bords de matière, et cherche jusqu'à 48 px à l'écran autour du trait (réglable). Zoomer rend la recherche plus fine. Les murs créés s'accrochent aux murs voisins comme les autres.

Limites : le pinceau lit l'image de fond de la scène, pas les tuiles. Si les joints du sol (parquet, dallage) sont aussi marqués que les murs et plus proches du trait, il peut les suivre : dessine alors sur le mur lui-même. Le banc d'essai `tools/brush-lab.html` permet de tester le pinceau sur une carte hors de Foundry.

## Réglages

| Réglage | Par défaut | Rôle |
|---|---|---|
| Murs auto-reliés | Activé | Interrupteur général, propre à ce navigateur (le même que le bouton chaîne) |
| Distance d'accroche | 12 px | Rayon dans lequel une extrémité se colle à un autre mur. 0 désactive l'accroche |
| Jointures qui suivent | Activé | Les murs voisins suivent un point déplacé |
| Coupure en T | Activé | Un mur touché en son milieu est coupé en deux |
| Ne jamais couper les portes | Activé | Une porte touchée en son milieu reste entière |
| Pinceau : distance de recherche | 48 px | Jusqu'où le pinceau cherche un mur autour du trait, à l'écran. Propre à ce navigateur |
| Pinceau : type de mur | Normal | Type des murs créés par le pinceau (aussi dans le cadran du pinceau). Propre à ce navigateur |
| Pinceau : précision | 2 px | Écart maximal entre les murs créés et le contour suivi, à l'écran. Plus bas : plus de détails. Propre à ce navigateur |

## API

```js
const palisade = game.modules.get("palisade").api;
palisade.enabled;                 // la liaison est-elle active pour ce client
palisade.connected(wall);         // Set des ids des murs reliés à ce mur
palisade.selectConnected(wall);   // les sélectionne sur le canevas
palisade.snapStroke(stroke, image, options); // colle un trait sur les murs d'une image
palisade.geometry;                // fonctions de géométrie (accroche, coupure, jointures)
```

Les modifications faites par Palisade portent l'option `{ palisade: true }`, pour que d'autres modules puissent les reconnaître.

## Développement

La géométrie (`scripts/geometry.js`) et le pinceau (`scripts/brush.js`) ne dépendent pas de Foundry et se testent avec Node :

```
node --test tests/*.test.mjs
```

Le banc d'essai du pinceau se reconstruit avec `node tools/build-brush-lab.mjs`.

Une release GitHub publiée déclenche le workflow qui construit `module.json` et `module.zip` à partir du tag (`v0.1.0` → version `0.1.0`).
