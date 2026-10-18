# Feuille de route

## Pistes

- **Annulation groupée** : un Ctrl+Z qui défait aussi les accroches, coupures et jointures faites par Palisade, pas seulement le geste d'origine.
- **Croisements** : couper deux murs qui se croisent en X à leur intersection.
- **Fusion** : réunir deux murs alignés qui se suivent et ont les mêmes réglages.
- **Aperçu pendant le tracé** : marquer le point où l'extrémité va s'accrocher avant de relâcher la souris.
- **Contrôle des trous** : repérer les extrémités isolées de la scène, là où la lumière risque de passer.

## Pinceau (en cours)

Un outil pinceau dans les outils des murs : on dessine à main levée près d'une paroi de la carte, le trait se colle à la paroi dessinée (trait sombre ou bord de matière, choisi automatiquement), un aperçu s'affiche, on valide avec Entrée ou un clic.

- [x] Algorithme (`scripts/brush.js`) et tests sur images synthétiques
- [x] Banc d'essai hors Foundry (`tools/brush-lab.html`, construit par `node tools/build-brush-lab.mjs`)
- [ ] Intégration dans Foundry : outil, lecture du fond de scène, aperçu, création des murs
