# Étape 1 — Textes vrais, un mot par idée

## Objectif

Plus aucun texte qui promet ce que le moteur ne fait pas, et un seul mot par
idée. Aucun changement de comportement.

## Dépend de

—

## Fichier(s) impacté(s)

- `src/components/planning/parametres/BesoinsPage.tsx:79` « le garantit » → « le planning automatique les place en priorité ».
- `BesoinsPage.tsx:89` « seulement si quelqu'un manque d'heures » → « si quelqu'un manque d'heures ou pour tenir le matin et le soir » (selon D1).
- `src/components/planning/mois/VueMois.tsx:305` et `semaine/VueSemaine.tsx:377` : « complet » seulement s'il n'y a aucune place à pourvoir, sinon « Planning généré. 3 places restent à pourvoir. » ; « en X ms » retiré.
- `PostesPage.tsx:355-368` « Poste à part » (D7).
- « Catégorie » : `PostesPage.tsx:318,328` → « Catégorie HCR » ; `SectionIdentite.tsx:126,292`, `EquipePage.tsx:98,105`, `GestionCategories.tsx`, `affichage.ts:209` → « Groupe » (D9).
- `SectionsFiche.tsx:95` « en renfort » (D10).
- École : `HorairesPage.tsx:113,293`, `SectionsFiche.tsx:233`, `EditeurShift.tsx` : une seule phrase partout, « École : jour hors de l'hôtel, compté comme du temps de travail ».
- Mineurs restants de l'audit : codes `R-…` visibles, « Semi-auto », « staff ».

## Travail à réaliser

1. Relever chaque texte, le remplacer, mettre à jour les tests qui le citent (`VueSemaine.test.tsx:181-186`, `PostesPage.test.tsx:115-127`, `EquipePage.test.tsx:204-218`).
2. Ajouter dans l'en-tête des Besoins une phrase « Dans quel ordre le planning décide » : la loi d'abord, puis les personnes nécessaires, puis les contrats, puis le confort (repos groupés, jours habituels). Elle sera tenue vraie par l'étape 10.

## Phase de test /martin

Recherche dans `src/components/planning` : aucun « garantit », « Catégorie » seul, « en renfort ».

## Critère de validation

- `npx tsc --noEmit`, `npx vitest run src/components/planning src/lib/planning` verts.
