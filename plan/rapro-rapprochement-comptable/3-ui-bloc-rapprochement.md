# Étape 3 — UI : bloc Réception / Étages / Écart + champs saisis

## Objectif

Afficher dans le board le **rapprochement du jour** façon Excel : deux colonnes
**Réception (1)** et **Étages (2)**, l'**écart** (vert à 0), et **deux champs
éditables** (« arrivées après clôture », « corrections ») sauvegardés comme le
commentaire. Le suivi par chambre et le roulement restent inchangés.

## Contexte

Le board (`src/components/rapro/RaproBoard.tsx`) a déjà tout sous la main :
`occupied` (occupation PDJ), `stats = countStats(...)` (`{clean, refus, noshow,
todo}`), `sheet` (query `['rapro','sheet',date]`), `canEditFields`. Le patron
d'édition à copier est le **commentaire** : state local + `useEffect`
d'hydratation depuis le `sheet` + `onBlur` qui met à jour **optimistiquement** le
cache `['rapro','sheet',date]` (`setQueryData`) **puis** persiste — sinon
l'hydratation ré-injecte l'ancienne valeur (staleTime 60 s) et la saisie
« disparaît ».

## Fichier(s) impacté(s)

- `src/components/rapro/RaproBoard.tsx` (modifié)
- `src/styles/rapro.css` (modifié — styles du bloc rapprochement)

## Travail à réaliser

### 1. État + hydratation des 2 nombres

Répliquer le trio du commentaire :

```tsx
const [lateArrivals, setLateArrivals] = useState(0)
const [corrections, setCorrections] = useState(0)
useEffect(() => {
  setLateArrivals(sheet?.lateArrivals ?? 0)
  setCorrections(sheet?.corrections ?? 0)
}, [sheet?.reportDate, sheet?.lateArrivals, sheet?.corrections])
```

`onBlur` de chaque champ : `if (!canEditFields) return`, `setQueryData` optimiste
sur `['rapro','sheet',selectedDate]` (fusionner `{...prev, lateArrivals}` /
`{...prev, corrections}`), puis `saveSheetNumbers(selectedDate, { late_arrivals,
corrections }).catch(()=>{})`. `disabled={!canEditFields}`.

### 2. Calcul et bloc d'affichage

```tsx
import { reconcileAccounting, isEcartNul } from '#/lib/rapro/accounting.ts'

const acct = reconcileAccounting({
  occupancy: occupied.size,
  lateArrivals,
  corrections,
  clean: stats.clean,
  refus: stats.refus,
  blocked: stats.todo, // D2 : jour seul
})
```

Bloc `.rapro-recap` (à insérer après `.rapro-stats` ou près du commentaire) :
deux colonnes façon Excel —
- **RÉCEPTION** : Occupées `occupied.size` · + Arrivées après clôture (champ) · ± Corrections (champ) · = **`acct.reception`**.
- **ÉTAGES** : Nettoyées `acct.clean` · Refus `acct.refus` · Bloquées `acct.blocked` · = **`acct.etages`**.
- **ÉCART** = `acct.ecart`, en **vert si `isEcartNul(acct)`**, sinon accent d'alerte.

Champs numériques : `type="number"`, largeur réduite, `disabled={!canEditFields}`.
Garder les cards existantes (ou en retirer les redondantes — « Reste à faire »
reste utile pour l'opérationnel/roulement).

### 2b. Ligne de contrôle OCC (D1)

Récupérer l'OCC officiel du PMS à **`date = selectedDate − 1`** (décalage de
datage confirmé) via `daily_reports.rj_nuitees` — réutiliser un fetch repjour
existant, ou une requête minimale en lecture seule :

```ts
const occDate = addDays(selectedDate, -1)
const { data: officialOcc } = useQuery({
  queryKey: ['rapro', 'occ-control', occDate],
  queryFn: () => fetchOfficialOcc(occDate), // daily_reports.rj_nuitees @ occDate, ou null
})
```

Passer `officialOcc ?? null` à `reconcileAccounting`. Sous la ligne RÉCEPTION,
afficher une **petite ligne de contrôle** « OCC PMS (J-1) : `officialOcc` · écart
`acct.occGap` » quand `officialOcc != null` ; sinon rien. Purement informatif
(n'entre pas dans l'écart principal).

### 3. Accès au récap mensuel

Ajouter dans le header un bouton **« Récap mois »** qui navigue vers
`/rapro/mois` (étape 4).

## Ordre d'exécution

1. State + hydratation + `onBlur` des 2 champs (patron commentaire).
2. `reconcileAccounting` + bloc `.rapro-recap` + styles CSS.
3. Bouton « Récap mois » (lien vers la route de l'étape 4).
4. `npx tsc --noEmit`.

## Critère de validation

- Les 2 champs se saisissent, persistent, et ne « disparaissent » pas au retour sur le jour (cache synchronisé).
- Le bloc affiche Réception, Étages, Écart ; l'écart est **vert à 0** et signale un déséquilibre sinon.
- Verrou `canEditFields` respecté (figé quand clôturé).
- `npx tsc --noEmit` vert.
