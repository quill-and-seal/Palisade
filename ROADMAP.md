# Feuille de route

## Pistes

- **Annulation groupée** : un Ctrl+Z qui défait aussi les accroches, coupures et jointures faites par Palisade, pas seulement le geste d'origine.
- **Croisements** : couper deux murs qui se croisent en X à leur intersection.
- **Fusion** : réunir deux murs alignés qui se suivent et ont les mêmes réglages.
- **Aperçu pendant le tracé** : marquer le point où l'extrémité va s'accrocher avant de relâcher la souris.
- **Contrôle des trous** : repérer les extrémités isolées de la scène, là où la lumière risque de passer.

## Pinceau (en cours)

Un outil pinceau dans les outils des murs : on dessine à main levée près d'une paroi de la carte, le trait se colle à la paroi dessinée (trait sombre ou bord de matière, choisi automatiquement), un aperçu s'affiche, on valide avec Entrée ou un clic.

- [x] Algorithme (`scripts/brush.js`) : carte de force de mur en 2D, chemin le moins coûteux entre le début et la fin du trait, bouts sans mur retirés, angles vifs ; tests sur images synthétiques
- Limite connue : quand les joints du sol (parquet, dallage) sont aussi marqués que les murs et plus proches du trait, le pinceau peut les suivre. Dessiner sur le mur lui-même règle le cas. Une simple frontière de matière (parquet contre dallage, sans mur dessiné) n'est bien suivie que si aucun mur ni joint marqué n'est dans la zone de recherche.
- [x] Banc d'essai hors Foundry (`tools/brush-lab.html`, construit par `node tools/build-brush-lab.mjs`)
- [ ] Intégration dans Foundry : outil, lecture du fond de scène, aperçu, création des murs
