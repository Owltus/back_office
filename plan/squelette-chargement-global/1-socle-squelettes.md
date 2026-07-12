# Étape 1 — Socle de squelettes composables

## Objectif

Créer un petit kit de primitives de squelette réutilisables (sur `ui/skeleton`)
que chaque page composera pour obtenir un squelette-reflet de SON layout, sans
réinventer la silhouette à chaque fois et sans perdre la propriété anti-saut.

## Contexte

Aujourd'hui seuls `AnalytiqueSkeleton` (riche, borné, paramétrable) et
`BoardSkeleton` (cartes + tableau, non borné) existent, plus la primitive
`ui/skeleton` (`animate-pulse rounded-md bg-accent`). Les pages non analytique ont
des layouts variés (formulaire Profil, tableau Gestion, liste Comptes, grille
Parking, cartes+grille Rapro, tableau montants Caisse). Un squelette unique ne les
reflète pas ; d'où un kit de blocs composables. Règle d'or : le squelette doit
reprendre les MÊMES classes de layout que le contenu réel (`shrink-0`,
`flex-1 min-h-0`, hauteurs fixes) pour ne pas décaler à la bascule.

## Fichier(s) impacté(s)

- `src/components/shared/skeleton/SkeletonCardsRow.tsx` (nouveau)
- `src/components/shared/skeleton/SkeletonTable.tsx` (nouveau)
- `src/components/shared/skeleton/SkeletonForm.tsx` (nouveau)
- `src/components/shared/skeleton/SkeletonList.tsx` (nouveau)
- `src/components/shared/skeleton/SkeletonBlock.tsx` (nouveau)
- `src/components/repjour/BoardSkeleton.tsx` (modification : composer le kit / aligner sur la colonne bornée)
- `src/components/analytique/AnalytiqueSkeleton.tsx` (modification optionnelle : recomposer via le kit)

## Travail à réaliser

### 1. Primitives (toutes `aria-hidden`, sur `Skeleton` de `ui/skeleton.tsx`)

- `SkeletonCardsRow({ count = 4, withBar = false })` : grille
  `grid shrink-0 grid-cols-2 gap-3 sm:grid-cols-4` de `count` cartes
  (`rounded-xl border bg-card p-4`) avec un libellé, une valeur, un sous-texte
  (barre optionnelle) — mêmes classes que les cartes réelles.
- `SkeletonTable({ cols = 5, rows = 10, bordered = true })` : conteneur borné
  `flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card` + en-tête
  `bg-muted` + `rows` lignes ; reprend le motif de `AnalytiqueSkeleton`.
- `SkeletonForm({ fields = 4 })` : carte formulaire (`rounded-xl border bg-card p-4`
  ou `p-6`) avec, par champ, un label court + un rectangle de champ ; pour Profil
  (identité + inputs).
- `SkeletonList({ rows = 6 })` : liste de lignes (avatar rond + deux lignes de
  texte + action à droite) pour Comptes.
- `SkeletonBlock({ className })` : rectangle générique paramétrable (aperçu
  affichage, grille parking) — juste un `Skeleton` plein avec `className`.

### 2. Uniformiser `BoardSkeleton`

Recomposer `BoardSkeleton` à partir de `SkeletonCardsRow` + `SkeletonTable`, et
l'aligner sur la colonne bornée (utilisable tel quel dans un layout `flex-1`), pour
que le dashboard ne saute pas si son contenu est borné. Conserver l'API `rows`.

### 3. (Optionnel) Recomposer `AnalytiqueSkeleton` via le kit

Sans changer son rendu, faire consommer `SkeletonCardsRow`/`SkeletonTable` par
`AnalytiqueSkeleton` pour une seule source de vérité. À ne faire que si le rendu
reste identique au pixel (sinon laisser tel quel).

## Ordre d'exécution

1. Les 5 primitives.
2. `BoardSkeleton` recomposé.
3. Recomposition optionnelle d'`AnalytiqueSkeleton` (si iso-rendu).

## Critère de validation

- `npx tsc --noEmit` sans erreur.
- Les primitives se rendent sans wrapper de page (blocs composables), `aria-hidden`.
- `BoardSkeleton` inchangé visuellement pour le dashboard (ou amélioré, sans saut).
- Aucune page encore rebranchée (socle seul).
