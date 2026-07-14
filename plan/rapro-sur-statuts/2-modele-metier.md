# Étape 2 — Modèle base + qualificatif (types, constants, service)

## Objectif

Décomposer le `RoomStatus` plat en deux dimensions : un **statut de base**
terminal (le circuit classique) et un **qualificatif** optionnel (sur-statut).
Adapter le stockage pour porter les deux champs par (jour, chambre).

## Contexte

État actuel (`src/lib/rapro/types.ts:11-16`) : `RoomStatus = nettoyee |
non_nettoyee | refus | noshow | faux_noshow`. `RaproDay.statuses` est un
`Map<number, RoomStatus>` (absence = `nettoyee`). `service.ts` upsert une seule
colonne `status` ; `clearRoom` supprime la ligne ; `materializeCleaned` insère
`nettoyee` à la clôture. Décisions **D2** (qualificatif orthogonal/informatif) et
**D4** (`faux_noshow` exclut `noshow`) cadrent la sémantique.

## Fichier(s) impacté(s)

- `src/lib/rapro/types.ts` (modifié)
- `src/lib/rapro/constants.ts` (modifié)
- `src/lib/rapro/service.ts` (modifié)

## Travail à réaliser

### 1. Types (types.ts)

```ts
/** Statut de base (circuit classique, terminal). */
export type RoomStatus = 'nettoyee' | 'non_nettoyee' | 'refus' | 'noshow'

/** Sur-statut / qualificatif (dimension orthogonale, extensible). Une chambre en
 * porte au plus un. Rendu par ICÔNE (pas par couleur). */
export type Qualifier = 'faux_noshow' | 'depart_anticipe' | 'delogement'

/** État d'une chambre : base + qualificatif optionnel. */
export interface RoomState {
  base: RoomStatus
  qualifier: Qualifier | null
}

export interface DbRaproRoom {
  report_date: string
  room: number
  status: RoomStatus
  qualifier: Qualifier | null
}
```

`RaproDay.statuses` devient `Map<number, RoomState>` (absence = `{ base:
'nettoyee', qualifier: null }` via `statusOf`).

### 2. Constants (constants.ts)

- `statusOf(statuses, room)` retourne un `RoomState` (défaut base `nettoyee`,
  qualifier `null`).
- `STATUS_LABEL: Record<RoomStatus, string>` (base uniquement) + nouveau
  `QUALIFIER_LABEL: Record<Qualifier, string>` (`faux_noshow: 'Faux no-show'`,
  `depart_anticipe: 'Départ anticipé'`, `delogement: 'Délogement'`) + un mapping
  `QUALIFIER_ICON: Record<Qualifier, LucideIcon>` (icône affichée en case, cf.
  étape 5).
- `toggleClean` reste sur le BASE (`refus ⇄ nettoyee`), sans toucher le qualifier.
- `JUSTIFIED_STATUSES = ['refus', 'noshow']` inchangé (raisonne sur le base).
- `cellState(base, isEmpty)` : dérive la couleur de fond du **base** seul
  (garde d'exhaustivité `never` reconstruite sur `RoomStatus` réduit à 4 valeurs).
  Le qualificatif ne change PAS `CellState` — il produit un marqueur additif géré
  à part (cf. étape 4/5).
- `countStats` : partition des bases (`clean/todo/refus/noshow`) + des compteurs
  séparés par qualificatif (nombre de chambres dont `qualifier === X`), sans
  casser la partition des bases (un qualificatif est orthogonal, il ne retire pas
  la chambre de sa catégorie de base).

### 3. Service (service.ts)

- `setStatus(reportDate, room, base, qualifier)` upsert `{report_date, room,
  status: base, qualifier}` (jamais `created_by`/`updated_at`).
- Helper `setQualifier(reportDate, room, qualifier)` si besoin de ne changer que
  le qualificatif (lecture du base courant côté appelant).
- `clearRoom` inchangé (supprime la ligne → base `nettoyee`, qualifier `null`).
- `materializeCleaned` : insère `{status:'nettoyee', qualifier:null}` (ignore
  duplicates) — inchangé dans l'esprit.
- `fetchDay` lit `room, status, qualifier` et construit `Map<number, RoomState>`.

## Ordre d'exécution

1. Acter D1, D2, D4.
2. `types.ts` : `RoomStatus` réduit + `Qualifier` + `RoomState` + `DbRaproRoom`.
3. `constants.ts` : suivre les erreurs de compilation (Record exhaustifs) ;
   reconstruire la garde `never` sur les 4 bases.
4. `service.ts` : payloads à deux champs, `fetchDay` enrichi.
5. `npx tsc --noEmit`.

## Critère de validation

- `RoomStatus` ne contient plus `faux_noshow` ; `Qualifier` le porte.
- `statusOf` renvoie un `RoomState` ; tous les `Record<RoomStatus, …>` exhaustifs.
- Un nouveau base non mappé casse la compilation (garde d'exhaustivité active).
- `npx tsc --noEmit` vert.
