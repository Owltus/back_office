# Étape 6 — Relecture : alertes images et pages

## Objectif

Guider sans bloquer : signaler, dans le panneau de relecture existant
(`lib/classeur/relecture.ts`), ce qui donnera une page laide ou illisible.
Les dimensions viennent de `classeur_images` (déjà chargées par la
médiathèque).

## Fichier(s) impacté(s)

- `src/lib/classeur/relecture.ts` (+ tests)
- l'appelant qui fournit les dimensions des images et le remplissage des pages

## Alertes (cas comptés sur la base au 2026-09-30)

| Alerte | Règle | Cas aujourd'hui |
|---|---|---|
| Capture trop large, illisible imprimée | largeur naturelle > 1 100 px sans recadrage | 23 |
| Image très haute | hauteur rendue > la moitié de la page | 21-22 |
| Bandeau très fin | hauteur rendue < 15 mm | 6 |
| Image sans légende | légende non affichable (`legende.ts`) | 102 |
| Page presque vide à cause d'un saut de page | page avant un `===` remplie à moins de 50 % (remontée par la pagination) | doc 66, 89, 6 |
| Bloc mal formé | `:::` non fermé, `::: photos` avec espace, directive inconnue, texte dans `:::photos` | 0 |

« Image sans légende » est groupée en UNE ligne par document (« 9 images sans
légende »), sinon elle noierait les autres.

## Critère de validation

- Tests par alerte, avec un cas négatif chacun ; mutation attrapée.
- Clic sur une alerte → ligne correspondante (mécanisme existant).
