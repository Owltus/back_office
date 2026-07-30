# Étape 2 — Constantes de date + helpers de format partagés

## Objectif

Supprimer la duplication des constantes de date et des helpers de formatage repérée par
l'audit : `MONTHS_SHORT` recopié dans 3 boards, `fmtInt`/`fmtPct`/`fmtEur` réécrits dans 4
modules avec des rendus divergents, constantes de date rangées sous `repjour/`.

## Contexte

Étape critique (touche > 5 fichiers dont des modules importés partout). Le risque est de
casser un import existant : on procède par AJOUT + ré-export, sans supprimer brutalement.

## Fichier(s) impacté(s)

- `src/lib/shared/dates.ts` (nouveau)
- `src/lib/format/index.ts` (nouveau)
- `src/lib/repjour/constants.ts` (ré-export des constantes de date)
- `src/lib/{repjour,pdj,parking,caisse}/format.ts`
- `src/components/parking/ParkingAnalytiqueBoard.tsx`, `CaisseAnalytiqueBoard.tsx`, `RaproAnalytiqueBoard.tsx` (retrait des `MONTHS_SHORT` locaux)

## Travail à réaliser

### 1. Déplacer les constantes de date vers `lib/shared/dates.ts`

Déplacer `MONTHS`, `MONTHS_LABELS`, `MONTHS_SHORT`, `DAY_NAMES` (aujourd'hui dans
`lib/repjour/constants.ts:9-32`) vers `src/lib/shared/dates.ts`. Conserver le commentaire
expliquant pourquoi Juin/Juil gardent 4 lettres. Dans `repjour/constants.ts`, les
RÉ-EXPORTER (`export { MONTHS, … } from '#/lib/shared/dates.ts'`) pour ne casser aucun
import existant (repjour, pdj, parking, caisse, rapro en dépendent).

### 2. Retirer les `MONTHS_SHORT` locaux dupliqués

Supprimer les redéclarations locales et importer depuis `lib/shared/dates.ts` :
- `ParkingAnalytiqueBoard.tsx:34-47`
- `CaisseAnalytiqueBoard.tsx:36-49`
- `RaproAnalytiqueBoard.tsx:41-54` (+ son `MONTHS` local `:39`)
- `CaisseAnalytiqueMoisBoard.tsx:29` : le `DAY_NAMES_SHORT` local — remplacer par une
  dérivation de `DAY_NAMES` partagé (cohérent avec pdj).

### 3. Créer `lib/format/index.ts` (base commune)

Factoriser les helpers réécrits 4× (audit §4 couche câblage) :

```ts
const nf0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
export const fmtInt = (n: number) => nf0.format(n)
export const fmtPct = (n: number, decimals = 1) => `${n.toFixed(decimals).replace('.', ',')} %`
export const fmtEur = (n: number, decimals = 0) => `${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n)} €`
```

Convention retenue (à confirmer, cf. Angle « unification des formats ») : pourcentage AVEC
espace insécable avant `%`, séparateur milliers systématique.

### 4. Spécialiser chaque `format.ts` de feature sur la base commune

Chaque `lib/<feature>/format.ts` réexporte/enveloppe la base plutôt que de recréer ses
`Intl.NumberFormat` :
- `pdj/format.ts` : `fmtInt` ← base ; `fmtPctInt` = `fmtPct(n, 0)` (aujourd'hui `Math.round` sans Intl, `:15`).
- `parking/format.ts` : `fmtInt`/`fmtPct`/`fmtPctInt` ← base (retire les impls manuelles).
- `caisse/format.ts` : garde `fmtEur` 2 décimales (centimes) via `fmtEur(n, 2)` ; conserve
  `fmtEcart`/`signEcart` (gestion `-0` soignée, spécifique caisse).
- `repjour/format.ts` : l'objet `fmt` délègue à la base ; conserve `dateFr`/`dayName`/`ecart*`
  (spécifiques). Aligner `pct` sur la convention (aujourd'hui « 72,5% » sans espace, `:14`).

Ne PAS casser les signatures publiques existantes (les boards importent `fmt.eurInt`, etc.).

## Ordre d'exécution

1. `lib/shared/dates.ts` + ré-export depuis `repjour/constants.ts`.
2. `lib/format/index.ts`.
3. Spécialiser les 4 `format.ts`.
4. Retirer les `MONTHS_SHORT`/`DAY_NAMES_SHORT` locaux des boards.

## Critère de validation

- `npx tsc --noEmit` sans erreur.
- `pnpm build` OK.
- Grep : plus aucune redéclaration locale de `MONTHS_SHORT` dans les boards.
- Les valeurs affichées (%, €, entiers) sont identiques ou volontairement alignées sur la
  convention retenue ; aucun import cassé (repjour/pdj/parking/caisse/rapro compilent).

## Contrôle /borg

Étape critique (modules transverses) :
- Aucun import de `MONTHS`/`DAY_NAMES`/`fmt*` cassé dans TOUT le dépôt (pas seulement
  l'analytique — ces constantes sont utilisées aussi par les boards opérationnels et le PDF).
- Le ré-export depuis `repjour/constants.ts` préserve les noms exacts et les valeurs.
- Les changements de format (% avec espace, arrondis) sont volontaires et cohérents partout,
  pas des régressions accidentelles de précision.
