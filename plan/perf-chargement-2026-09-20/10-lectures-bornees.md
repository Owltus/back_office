# Étape 10 — Borner les lectures qui rapatrient tout l'historique

## Objectif

Supprimer cinq lectures de table entière dont le résultat sert à afficher une
fraction de ce qui est téléchargé, et arrêter de périmer un cache partagé.

## Contexte

C'est ici que l'hypothèse de départ de l'utilisateur — « je charge trop de données
d'un coup » — est **à moitié vraie**. Les lectures listées ci-dessous rapatrient
bien plus que nécessaire, mais les tables sont petites (`caisse_sheets` :
192 lignes, `facturation_wordpool` : 1 640, `daily_reports` : 170) : le gain en
octets est modeste. Le vrai gain est ailleurs — **moins de requêtes, moins de
travail pour une base affamée, et des lectures qui ne se dégraderont pas** quand
l'historique grossira.

À traiter, par ordre d'importance.

**1. PDJ — deux scans d'historique complet.** `BreakfastBoard.tsx:417` appelle
`fetchAllAddonProduction()` (toute la table) et `:433`
`fetchDailyAgg('2000-01-01', '2100-12-31')` (toute la vue), soit ~1 600 lignes,
pour en extraire **un prix unitaire et un seuil statistique**. Aggravant : la clé
`['pdj','addon-all']` n'a **pas** de `staleTime` ici, alors que
`DayCrossSummary.tsx:175-176` lui en donne un d'une heure. La version courte
l'emporte dès qu'on ouvre `/pdj`, ce qui **périme le cache pour `/repjour`**.
C'est une régression silencieuse du partage de cache acquis en août.

**2. Caisse — toute la table, toutes années.** `lib/caisse/service.ts:92-110`,
`fetchSheets()` : `select('*')` sur `caisse_sheets` (~35 colonnes), pagination par
1 000, puis **filtrage par année côté navigateur**. Appelé par
`CaisseAnalytiqueBoard.tsx:48` et `CaisseAnalytiqueMoisBoard.tsx:47`. C'est le
pire rapport « octets téléchargés / octets affichés » du projet, et il croît
linéairement et pour toujours.

**3. Parking — `['parking','arrivals-all']`.** `lib/parking/service.ts:151-168`
lit toute la vue `parking_arrivals_agg` sans aucune borne. Une ligne par jour
d'arrivée, sans fin.

**4. Deux `select('*')` pour lire une colonne.**
`ParkingAnalytiqueMoisBoard.tsx:72` appelle `fetchUnifiedDays`
(`lib/repjour/data.ts:33-43`, deux `select('*')` sur `daily_reports` et
`forecast_days`) pour n'en tirer que `rj_nuitees`. `fetchNuiteesByMonth`
(`data.ts:80-95`) fait exactement cela et n'est branché que sur la bande RepJour.
Le commentaire de `DayCrossSummary.tsx:246-248` reconnaît déjà le défaut.

**5. `refetchOnMount: 'always'`** sur `AnalytiqueBoard.tsx:82` et
`AnalytiqueMoisBoard.tsx:61` : annule délibérément le `staleTime` et relit l'année
entière à chaque ouverture, même deux secondes après la précédente.

**6. Lectures sans borne, à surveiller plutôt qu'à corriger.**
`fetchAvailableDates` (`lib/repjour/daily.ts:54-61`) fait un `select('date')` sans
`.limit()` : PostgREST le tronquerait silencieusement à 1 000 lignes.
`daily_reports` en compte 170, donc aucun risque avant des années — mais le jour
où la troncature surviendra, le calendrier grisera des dates existantes **sans
aucune erreur**. Même chose pour `fetchAllCautions`
(`lib/caisse/service.ts:262-269`), dont le commentaire dit « petite table », ce qui
est vrai aujourd'hui.

## Fichier(s) impacté(s)

- `src/components/pdj/BreakfastBoard.tsx` (modifié : bornes et `staleTime`)
- `src/lib/pdj/service.ts` (modifié : bornes de `fetchAllAddonProduction`)
- `src/lib/caisse/service.ts` (modifié : `fetchSheets` filtré côté base)
- `src/components/caisse/CaisseAnalytiqueBoard.tsx` (modifié)
- `src/components/caisse/CaisseAnalytiqueMoisBoard.tsx` (modifié)
- `src/lib/parking/service.ts` (modifié : borne sur `parking_arrivals_agg`)
- `src/components/parking/ParkingAnalytiqueMoisBoard.tsx` (modifié : `fetchNuiteesByMonth`)
- `src/components/repjour/AnalytiqueBoard.tsx` (modifié)
- `src/components/repjour/AnalytiqueMoisBoard.tsx` (modifié)
- `src/lib/repjour/daily.ts` (modifié : borne de sécurité)

## Travail à réaliser

### 1. PDJ — aligner le `staleTime` d'abord

Le correctif le moins risqué et le plus immédiat : donner à `['pdj','addon-all']`
de `BreakfastBoard.tsx:417` **le même `staleTime` d'une heure** qu'en
`DayCrossSummary.tsx:175-176`. Une ligne, et le partage de cache entre `/pdj` et
`/repjour` est restauré.

Ensuite seulement, regarder si les deux scans peuvent être bornés. Les prix de
carte sont déduits d'un **mode sur 21 jours** (`cardPrices`) : une fenêtre de
quelques mois suffit très probablement. ⚠ Vérifier ce point dans
`lib/pdj/pricing.ts` avant de borner — un prix mal déduit fausserait le chiffre
d'affaires PDJ, et la mémoire du projet est formelle : **ne jamais dériver un prix
par recette ÷ couverts**.

### 2. Caisse — filtrer par année côté base

`fetchSheets()` devient `fetchSheetsByYear(year)`, avec un filtre `date` dans la
requête plutôt qu'un `filter()` en mémoire, et des colonnes explicites plutôt que
`select('*')`. La clé de cache devient `['caisse','analytics', year]`.

⚠ Vérifier ce que consomment réellement les deux boards : si la vue annuelle a
besoin de l'année précédente pour une comparaison, la clé doit le refléter.

### 3. Parking et RepJour — les lectures évidentes

- Borner `parking_arrivals_agg` à la plage affichée, sur le modèle de ce qui
  existe déjà pour les autres vues d'agrégation.
- Remplacer `fetchUnifiedDays` par `fetchNuiteesByMonth` dans
  `ParkingAnalytiqueMoisBoard.tsx:72`. La fonction existe, elle est testée : c'est
  un simple rebranchement.
- Retirer `refetchOnMount: 'always'`. L'intention — voir un import récent — est
  légitime mais mal servie : la remplacer par une **invalidation ciblée après
  import**, qui existe déjà ailleurs dans le projet.

### 4. Bornes de sécurité

Ajouter un `.limit()` généreux et explicite à `fetchAvailableDates` et
`fetchAllCautions`, avec un commentaire disant pourquoi. Ce n'est pas une
optimisation : c'est un garde-fou contre une troncature silencieuse dans deux ans.

## Ordre d'exécution

1. Le `staleTime` de `['pdj','addon-all']` — une ligne, gain immédiat.
2. `refetchOnMount: 'always'` retiré des deux boards analytique repjour.
3. `fetchNuiteesByMonth` rebranché sur le parking.
4. `fetchSheets` filtré par année.
5. `parking_arrivals_agg` borné.
6. Bornes de sécurité.
7. Les scans PDJ, **en dernier** et seulement après vérification de `cardPrices`.
8. `npx tsc --noEmit`
9. `pnpm test`
10. `pnpm build`

## Critère de validation

- Ouvrir `/repjour` puis `/pdj` puis revenir sur `/repjour` : `['pdj','addon-all']`
  n'est lu **qu'une fois**.
- `/caisse/analytique` sur une année : le nombre de lignes rapatriées correspond à
  cette année seule.
- Les chiffres affichés sont **identiques** avant/après sur les cinq pages
  touchées. C'est le seul critère qui compte : cette étape ne doit rien changer à
  l'affichage.
- Le chiffre d'affaires PDJ et le prix unitaire affiché sont inchangés au centime
  près, sur trois dates réparties dans l'année.
- Après un import, l'analytique repjour montre bien les nouvelles données sans
  qu'on ait à recharger la page.
