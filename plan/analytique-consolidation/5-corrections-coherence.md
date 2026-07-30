# Étape 5 — Corrections de bugs + cohérence

## Objectif

Corriger les bugs concrets trouvés par l'audit et aligner les incohérences parent/enfant,
en réutilisant les composants du socle là où c'est du code réécrit à la main.

## Contexte

Étape critique (> 5 fichiers, plusieurs features). Aucun changement de données, uniquement
présentation et cohérence.

## Fichier(s) impacté(s)

- `src/components/parking/ParkingAnalytiqueBoard.tsx`, `ParkingAnalytiqueMoisBoard.tsx`
- `src/components/repjour/boards/AnalytiqueBoard.tsx`, `AnalytiqueMoisBoard.tsx`
- `src/components/pdj/PdjAnalytiqueMoisBoard.tsx`
- `src/components/rapro/RaproCatColumns.tsx`, `RaproAnalytiqueBoard.tsx`, `RaproMonthlyBoard.tsx`, `src/lib/rapro/constants.ts`
- Routes analytique enfant (validation des params)

## Travail à réaliser

### 1. BUG — double année dans le PDF parking mensuel

`ParkingAnalytiqueMoisBoard.tsx:79` : `monthLabel` inclut déjà l'année (« Juillet 2026 »),
puis `:88` `printTitle={\`Parking · ${monthLabel} ${year}\`}` → « Parking · Juillet 2026 2026 ».
Aligner sur caisse/pdj : `monthLabel` SANS année, l'année ajoutée séparément dans `title` et
`printTitle`.

### 2. BUG — parking mensuel affiche des zéros au lieu de tirets

`ParkingAnalytiqueMoisBoard.tsx:161-172` : les cellules sont rendues inconditionnellement, un
jour sans occupation montre « 0,0 % / 0 / 0 / 0 ». `hasData` (`:145`) ne pilote que le fond.
Aligner sur caisse (`CaisseStatCells` rend « — ») : utiliser `KpiCell` (socle) ou une cellule
« vide → tiret » pour les jours sans donnée.

### 3. repjour parent : utiliser `KpiCell`

`AnalytiqueBoard.tsx:239-387` réimplémente à la main le double affichage mobile/desktop et le
tiret vide que fait déjà `KpiCell` (le socle). L'enfant repjour l'utilise déjà. Remplacer les
cellules manuelles du parent par `KpiCell` (réduction nette de duplication).

### 4. BUG mineur — PDJ enfant `avgInclus` à 0 au lieu de « — »

`PdjAnalytiqueMoisBoard.tsx:88,176` : pour un mois sans jour de service, la carte affiche « 0 »
au lieu de « — ». Aligner sur le parent (`PdjAnalytiqueBoard.tsx:89,174` retombe sur `null`).

### 5. Couleurs rapro → tokens

`lib/rapro/constants.ts` : `CATEGORY_COLOR.bloquee` est un hex brut `#f87171` (les deux autres
sont des tokens). Ajouter des clés `vendues` (→ `var(--chart-1)`) et `moyenne`
(→ `var(--muted-foreground)`) et remplacer les littéraux `#818cf8`/`#94a3b8` répétés dans
`RaproAnalytiqueBoard.tsx`, `RaproMonthlyBoard.tsx`, `RaproCatColumns.tsx:46,82`. Objectif :
plus de hex en dur côté analytique rapro (simplifie aussi le remap dans `lib/analytique/pdf.ts`).
Attention : vérifier que le PDF (`pdf.ts:80-95`) sait lire les tokens `var(--chart-*)` (oui)
avant de retirer les cas spéciaux hex — ne PAS casser le rendu couleur du PDF.

### 6. repjour parent : accents en tokens

`AnalytiqueBoard.tsx:182,188,194,200` utilise des hex (`#818cf8`…) pour les accents de cartes
alors que pdj passe `var(--chart-*)`. Aligner sur les tokens.

### 7. Cohérence de libellés et de détails

- Libellés de cartes repjour parent vs enfant : « Revenu par chambre moyen » / « Revenu moyen
  par chambre » et « Chiffre d'affaires total » / « Chiffre d'affaires » — choisir une seule
  formulation.
- Libellés parking carte vs colonne : « Réservations »/« Résas », « Impayés »/« Impayées ».
- Corriger les squelettes `cols` sous-comptés (parking annuel 7 colonnes → `cols` correspondant,
  parking mensuel 5, caisse 7) pour éviter le décalage au chargement.
- Retirer le dead code : séries `resas`/`payees`/`arrivals` calculées mais non tracées
  (`ParkingAnalytiqueBoard.tsx:95-96`, `ParkingAnalytiqueMoisBoard.tsx:74`).
- Mettre à jour les commentaires d'en-tête périmés (« deux graphiques » alors qu'un seul) dans
  les 4 boards parking/caisse, et le commentaire `AnalytiqueSkeleton.tsx:23-25` (« Rapro
  mensuel n'affiche aucune carte » — faux depuis les 5 cartes).

### 8. Validation des params de route analytique

Les routes enfant `<feature>/analytique.$year.$month.tsx` font `Number(year)` sans garde →
`NaN` possible. Ajouter une validation légère (borne année plausible, mois 1-12) — soit dans la
route, soit une garde en tête de board qui rend un message clair si params invalides. Réutiliser
l'esprit de `parseDateSearch` (`lib/shared/searchParams.ts`) déjà utilisé côté routes jour.

## Ordre d'exécution

1. Bugs (1, 2, 4) — les plus visibles.
2. Réutilisation socle (3) + tokens couleur (5, 6).
3. Cohérence libellés/squelettes/dead code/commentaires (7).
4. Validation params routes (8).

## Critère de validation

- `npx tsc --noEmit` et `pnpm build` OK ; tests inchangés au vert.
- PDF parking mensuel : titre « Parking · Juillet 2026 » (une seule fois).
- Parking mensuel : jour vide → « — » (comme caisse).
- Aucun hex de couleur en dur résiduel côté analytique rapro/repjour (grep).
- Une URL analytique à params invalides ne produit plus un rendu cassé (message clair).

## Contrôle /borg

Étape critique :
- Le remplacement des cellules manuelles repjour par `KpiCell` conserve l'affichage
  mobile/desktop et les tirets (non-régression visuelle).
- Le passage des couleurs rapro aux tokens NE casse PAS le rendu PDF (le remap `pdf.ts`
  gère toujours les couleurs, via tokens désormais) — vérifier le PDF rapro annuel + mensuel.
- La validation des params ne bloque pas les URL légitimes (`/…/analytique/2026/7`).
- Aucune valeur métier changée : seuls présentation, libellés, couleurs, gardes.
