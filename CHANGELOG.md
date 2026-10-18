# Changelog

## 0.1.0

Première version : des murs auto-reliés.

- Accroche : une extrémité posée près d'un autre mur s'y colle (extrémité d'abord, sinon milieu du mur). Distance réglable, 12 px par défaut.
- Coupure en T : un mur dont l'extrémité tombe au milieu d'un autre coupe celui-ci en deux. Les portes ne sont pas coupées par défaut.
- Jointures qui suivent : déplacer une extrémité, un mur ou une sélection entraîne les murs qui partageaient ces points.
- Bouton chaîne dans les outils des murs pour couper ou réactiver Palisade.
- Raccourci Maj + L pour sélectionner tous les murs reliés au mur survolé.
- API `game.modules.get("palisade").api` et tests de la géométrie (`node --test`).
