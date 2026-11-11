# Changelog

## 2.2.2

- Vue à travers les grilles : on voit à travers, mais les barreaux hachurent la vue du PJ, depuis ses yeux (à hauteur d'yeux selon la taille du token). Ce qu'il voit de l'autre côté, tokens compris, apparaît derrière les barreaux.
- Poser un motif rend le mur transparent au regard (il bloquait la vue comme un mur plein), le retirer le rend opaque ; les grilles déjà posées sont mises à jour au chargement de la scène.

## 2.2.1

- Corrigé : aucune ombre de grille ne s'affichait en Foundry v14. Les sources de lumière n'y sont plus reliées directement à leur lumière ou à leur token ; Palisade les retrouve maintenant par leur identifiant.
- Diagnostic : `game.modules.get("palisade").api.projectionStatus()` indique les grilles, lumières et ombres en cours de rendu, et les erreurs éventuelles.

## 2.2.0

Ombre des grilles projetée au sol.

- Une lumière et une grille ont une hauteur : les barreaux verticaux dessinent des rayons, les barreaux horizontaux des bandes parallèles à la grille, et ensemble un vrai quadrillage, déformé selon la position de la lumière.
- Pénombre : une flamme plus grande adoucit l'ombre, nette au pied de la grille et floue au loin.
- Hauteurs de la grille (bas, haut) dans la fiche du mur : herse au sol ou fenêtre avec un mur plein dessous.
- Hauteur d'une lumière posée et taille de la flamme dans la fiche de la lumière ; taille de la flamme dans la fiche du token, dont la hauteur suit sa taille (à hauteur de main).
- Réglage « Rendu des grilles » : projeté (par défaut) ou rayons (petits murs cachés, rendu de la 2.1).
- Le type « Grille » du pinceau pose des croisillons (il posait des barreaux).

## 2.1.1

- Motifs lumineux en chaîne : les murs reliés au même motif et au même écartement partagent leurs barreaux, répartis le long de la chaîne entière. Une grille découpée en petits murs (pinceau) laisse passer autant de lumière qu'un seul mur ; avant, les très petits murs étaient entièrement bouchés.
- Clic droit sur un morceau de grille : le cadran vise toute sa chaîne.

## 2.1.0

- Motifs lumineux : clic droit sur un mur pour ouvrir le cadran sur place. Segments pour le motif (aucun, barreaux, croisillons, grillage fin), bouton central pour l'écartement, Appliquer pour valider. S'applique à toute la sélection si le mur cliqué en fait partie.

## 2.0.0

Murs à motif lumineux.

- Un mur peut porter un motif (barreaux, croisillons, grillage fin) : il bloque le passage, la vue le traverse, et la lumière passe entre ses barreaux en projetant des ombres en bandes.
- Réglage dans la fiche du mur (motif et écartement) et type « Grille » dans le cadran du pinceau.
- Le mur reste un seul mur à manipuler ; ses barreaux, cachés, suivent ses déplacements et ses changements et disparaissent avec lui. La liaison et le pinceau les ignorent.

## 0.1.9

- Pinceau : relâcher le trait affiche l'aperçu ; le clic de validation ouvre le cadran à l'endroit cliqué (bouton central sous le curseur), et les murs sont créés par son bouton « Appliquer » (« Annuler » les abandonne ; Entrée et Échap au clavier).

## 0.1.8

- Pinceau : le cadran s'ouvre là où le trait est lâché, bouton central sous le curseur (un coup de molette règle aussitôt la précision).
- Soudure : un mur plus court que la distance d'accroche reste soudé par son extrémité la plus proche (il gardait sa position d'origine et se détachait de ses voisins).
- Accroche : la distance d'accroche se mesure à l'écran (12 px), même sensation à tout zoom ; le pinceau soude avec la même distance et ses murs ne sont plus ré-accrochés un par un.

## 0.1.7

- Pinceau : nouveau cadran à la place du panneau. Bouton moleté au centre pour la précision (molette, glisser, flèches), graduation de 1 à 10 px, segments de type de mur reliés à leur nom en éventail. Il n'apparaît qu'au moment de valider, tant que l'aperçu attend.

## 0.1.6

- Pinceau : choix du type de mur créé dans le panneau (normal, traversable, invisible, terrain). Traversable : les personnages passent, la vue et la lumière restent bloquées.

## 0.1.5

- Pinceau : les points du trait se soudent aux points et murs existants, et un trait qui repasse sur des murs ne les double plus (fini les murs superposés).

## 0.1.4

- Pinceau : panneau dans la vue pour régler la précision sans ouvrir les réglages ; l'aperçu en attente se recalcule aussitôt.

## 0.1.0

Première version : des murs auto-reliés.

- Accroche : une extrémité posée près d'un autre mur s'y colle (extrémité d'abord, sinon milieu du mur). Distance réglable, 12 px par défaut.
- Coupure en T : un mur dont l'extrémité tombe au milieu d'un autre coupe celui-ci en deux. Les portes ne sont pas coupées par défaut.
- Jointures qui suivent : déplacer une extrémité, un mur ou une sélection entraîne les murs qui partageaient ces points.
- Pinceau : dessiner à main levée près des murs de la carte crée des murs collés au dessin (traits sombres, murs de pierre ou bords de matière, reconnus seuls), avec aperçu à valider par Entrée ou un clic. Distance de recherche réglable, mesurée à l'écran.
- Bouton chaîne dans les outils des murs pour couper ou réactiver Palisade.
- Raccourci Maj + L pour sélectionner tous les murs reliés au mur survolé.
- API `game.modules.get("palisade").api` et tests de la géométrie (`node --test`).
