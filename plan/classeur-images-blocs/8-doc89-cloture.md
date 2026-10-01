# Étape 8 — Doc 89 refait, contrôle global, CLAUDE.md

## Objectif

Démontrer le résultat sur le document qui a déclenché le chantier, puis
vérifier qu'aucun des 86 documents n'a régressé.

## Travail à réaliser

### 1. Doc 89 « Suivi sanitaire hebdomadaire » (par l'éditeur de l'app)

- Étapes 1, 2, 4 → `:::etape` (photo à droite de la consigne).
- Repérage des 4 manchettes → `:::photos` 2 × 2, légendes « Manchette 1 :
  près du ballon rouge, en hauteur »…
- Aller / Retour → `:::photos` de 2.
- Retrait des 4 `+++`, des réglages `largeur/position`, des alts `PXL_…`.
- Contenu métier inchangé (seule la mise en page bouge) ; texte proposé à
  l'utilisateur AVANT d'enregistrer. Enregistrement par l'éditeur : version
  et point de restauration automatiques.

### 2. Contrôle global (lecture seule)

Banc navigateur sur les 86 documents, comme le 2026-09-30 : pages, débordement
(0 attendu), texte identique hors légendes, pages remplies. Comparer au relevé
d'avant chantier (231 pages).

### 3. CLAUDE.md

Remplacer, dans la section Classeur, les paragraphes « POSITION » et « `+++` »
par les règles nouvelles : pipeline partagé, directives en liste blanche,
légendes génériques masquées, 3 tailles, retrait de l'habillage.

## Critère de validation

- Doc 89 : aucun vide à côté d'une photo, planches régulières, 0 débordement.
- 86 documents : 0 débordement, 0 mot perdu, nombre de pages ≤ avant.
- `npx tsc --noEmit`, tous les tests, `pnpm build`.

## Contrôle /borg

Relecture adverse complète du chantier avant tout push (règle du 2026-09-28 :
toute vague de correctifs passe par une contre-revue).
