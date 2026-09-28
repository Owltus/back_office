# Étape 7 — Interface alignée sur les droits

## Objectif

Chaque action visible est une action permise. Plus aucun refus « surprise »
de la base dans le parcours normal.

## Fichier(s) impacté(s)

- `src/components/classeur/ClasseurList.tsx`, `ClasseurListActions.tsx`
- `src/components/classeur/ClasseurDashboard.tsx`, `ClasseurDashboardActions.tsx`
- `src/components/classeur/ChapterBoard.tsx`, `ChapterSidebar.tsx`
- `src/components/classeur/dialogs/HistoriqueDialog.tsx` (points de restauration)
- `src/components/classeur/dialogs/ImagesDialog.tsx`
- `src/routes/classeur/$classeurId.tsx`

## Travail à réaliser

| Élément | Règle |
|---|---|
| Liste des classeurs | ne contient que les classeurs lisibles (la RLS filtre déjà) ; réordonner : gestion seule |
| Supprimer un classeur | gestion seule |
| Restaurer un point, vider l'historique | gestion seule |
| Point manuel, contenu, images, clic droit des chapitres | `peutModifier` |
| Classeur inexistant OU interdit | écran « Ce classeur n'existe pas ou vous n'y avez pas accès » (la base ne distingue pas les deux, et c'est voulu : ne pas révéler l'existence) |
| Classeur orphelin (créateur supprimé) | mention discrète pour la gestion |
| Lecture seule | cadenas « lecture seule » existant, gardé |

## Critère de validation

- Tests de rendu : pour chaque niveau, les boutons présents / absents.
- Aucun `can('classeur', …)` restant là où un classeur précis est en jeu
  (tout passe par `useDroitsClasseur`).
