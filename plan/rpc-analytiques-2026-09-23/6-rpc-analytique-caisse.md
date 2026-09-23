# Étape 6 — RPC analytique caisse (annuel + mensuel)

## Objectif

Ramener les quatre lectures des deux pages analytiques caisse à deux, et
supprimer la seule lecture « toute la table » de la couche.

## Contexte

Gain **faible et assumé** : chaque page ne fait que deux lectures. L'utilisateur
a demandé l'uniformité (décision du 2026-09-23). L'intérêt réel est ailleurs :

`fetchSheets` (`service.ts:92-110`) lit **toute** la table `caisse_sheets`,
`select('*')`, en pagination séquentielle par 1 000. 199 lignes aujourd'hui,
~4 600 dans cinq ans — soit cinq allers-retours **en série**. Et le `select('*')`
ramène les 15 colonnes de coupures plus les 11 colonnes de montants, alors que
l'analytique n'utilise que `caisse.*`, `snt.*`, `ls.*`, `counts.*`, `status` et
`report_date`.

Bonne nouvelle : `fetchSheets` n'a **que deux appelants**, les deux boards
analytiques. Le board `/caisse` ne s'en sert pas. La fonction peut donc être
contournée intégralement sans toucher à la saisie.

### Ce qui n'est PAS à corriger ici

`['caisse','analytics']` est invalidée à chaque action caisse par
`CaisseBoard.tsx:644` (`invalidateQueries({ queryKey: ['caisse'] })`, en succès
comme en échec). Le `staleTime` de 10 minutes ne protège donc de rien dès qu'un
hôtelier travaille — **c'est cohérent** : les chiffres doivent suivre la saisie.
On aligne les seuils (étape 2), on ne touche pas à l'invalidation.

## Fichier(s) impacté(s)

- `supabase/caisse_analytique_rpc_2026-09-XX.sql` (nouveau : 2 fonctions)
- `src/lib/caisse/service.ts` (modifié : + 2 `fetch`, anciens CONSERVÉS)
- `src/components/caisse/CaisseAnalytiqueBoard.tsx` (modifié : 2 → 1)
- `src/components/caisse/CaisseAnalytiqueMoisBoard.tsx` (modifié : 2 → 1)

## Travail à réaliser

### 1. Les cas limites à reproduire

- **Seules les feuilles `status = 'validated'` comptent** (`analytics.ts:123,148`).
  Les brouillons sont **ignorés**, pas comptés à zéro.
- `sheets = 0` est le drapeau « pas de donnée » : `hasData = m.sheets > 0` fait
  passer toute la ligne en `—`. Un mois sans feuille renvoie quand même une
  ligne à zéros, **distinguée par `sheets`**. Côté mensuel,
  `aggregateCaisseDaily` ne renvoie **que** les jours ayant au moins une feuille
  validée.
- `encaisse = caisse.cash + caisse.cb + caisse.cvac + caisse.adyen` — le bloc
  `caisse` (réel compté), **jamais** `snt` / `ls` (attendus).
- **`fundTotal` se calcule en centimes entiers** (`calc.ts:29-33`) :
  `Σ round(valeur × 100) × count / 100`. En SQL : `numeric` ou entiers,
  **jamais** `float`.
- ⚠ **`round2` de la caisse est `Math.round((n + Number.EPSILON) * 100) / 100`**
  (`calc.ts:145`) — **différent** de celui du PDJ (`amounts.ts:19`, sans
  `Number.EPSILON`). Deux arrondis coexistent dans le projet. Ne pas les
  confondre.
- **Anomalies** : compteur de **feuilles**, pas de montants. Une feuille est
  anormale si l'un des quatre écarts dépasse `EPSILON = 0,005`, avec
  `écart_cash/cb/cvac = round2(snt.k + ls.k − caisse.k)` et
  **`écart_web = round2(snt.cbweb − caisse.adyen)`** — pas de `ls` pour le web.
- `isCautionActiveOn` (`cautions.ts:30-34`) : `takenDate <= date` ET
  (`status='active'` OU (`refundedDate` non nul ET `date < refundedDate`)).
  Borne **exclusive** au jour du remboursement. Comparaisons de chaînes
  `YYYY-MM-DD`.
- `yearsFromSheets` : années distinctes **∪ `{annéeCourante}`**, tri croissant.
  L'année courante figure dans la liste même sans aucune donnée.
- **Tous** les `data` sont déstructurés avec `= []` côté React : une RPC qui
  renverrait `null` au lieu d'un tableau vide casserait `months.map`. Garantir
  `coalesce(…, '[]'::jsonb)`.

### 2. Un calcul qui s'annule — à reproduire tel quel

`analytics.ts:99-103` : la seconde condition d'anomalie compare
`fundTotal(s) + activeCautionsTotal(…)` à `150 + activeCautionsTotal(…)`. Les
cautions apparaissent **des deux côtés** et s'annulent arithmétiquement.

Ne pas « simplifier » en supprimant les deux termes : le `round2` intermédiaire
de `activeCautionsTotal` peut théoriquement laisser un résidu, et la structure
est voulue. Reproduire tel quel, ou simplifier **consciemment** après avoir
vérifié qu'aucun résidu n'existe sur les données réelles.

### 3. Le découpage retenu

- `public.caisse_analytique_annuelle(p_annee int, p_aujourdhui date)`
  → `{ annees, mois[12], cautions }`
- `public.caisse_analytique_mensuelle(p_annee int, p_mois int, p_aujourdhui date)`
  → `{ jours, cautions }`

⚠ `['caisse','cautions']` est **partagée avec `CaisseBoard.tsx:374`**. Elle
reste une lecture séparée (décision D4) : la RPC ne l'absorbe pas. Chaque page
passe donc de 2 lectures à 1, plus la lecture partagée des cautions — soit 2 au
total, mais l'une des deux est mutualisée avec le board.

⚠ Les clés doivent rester sous `['caisse', …]` pour que
`invalidateQueries({ queryKey: ['caisse'] })` continue de les attraper.

### 4. `fetchSheets` reste exportée

Aucun autre appelant aujourd'hui, mais la règle du chantier est constante : les
fonctions remplacées restent le chemin de repli si la RPC est retirée
(`drop function`).

### 5. Discipline d'application

Écrire → **commiter avant d'appliquer** → essayer en `begin … rollback` →
appliquer → **prouver l'équivalence avant de toucher au client** → modifier les
composants.

## Ordre d'exécution

1. Vérifier sur les données réelles si le `round2` des cautions laisse un résidu
   (point 2).
2. Écrire et commiter le SQL, l'essayer en `rollback`, l'appliquer.
3. Prouver l'équivalence, **au centime**, sur toutes les années et tous les mois.
4. Écrire les deux `fetch`, réécrire les deux boards.
5. `npx tsc --noEmit` + `npx vitest run` + `pnpm build`.

## Critère de validation

- Écarts SQL↔TS à **zéro**, au centime, sur tout l'historique — y compris un
  mois sans aucune feuille validée (ligne à zéros avec `sheets = 0`) et un mois
  à brouillons seuls (ignorés).
- Le compteur d'anomalies est identique avant/après sur au moins trois mois.
- Plus aucune lecture de `caisse_sheets` sans borne dans le code.
- Le board `/caisse` (saisie, clôture, cautions) fonctionne à l'identique.

## Contrôle qualité (revue)

Étape critique (fonctions en base, arrondis financiers). `/borg` n'étant pas
installé, revue manuelle : (1) confronter les montants de trois mois au centime,
**à la main**, et non par différence agrégée qui compenserait deux erreurs de
signe opposé ; (2) vérifier que `round2` caisse (avec `Number.EPSILON`) n'a pas
été confondu avec celui du PDJ ; (3) vérifier `prosecdef`, grants et
`search_path` par requête sur `pg_proc` ; (4) confirmer qu'une feuille en
brouillon reste **ignorée** et non comptée à zéro ; (5) confirmer que
`['caisse','cautions']` est toujours partagée avec le board.
