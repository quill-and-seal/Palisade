# Changelog

## 0.1.8

- Pinceau : relâcher le trait affiche l'aperçu ; le clic de validation ouvre le cadran à l'endroit cliqué (bouton central sous le curseur), et les murs sont créés par son bouton « Appliquer » (« Annuler » les abandonne ; Entrée et Échap au clavier).
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
