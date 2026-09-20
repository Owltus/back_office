# Plan — Temps de chargement : lever la famine, supprimer les attentes en série

## Contexte

L'utilisateur constate que les pages sont **parfois** très longues à charger, sans
jamais dépasser 2 utilisateurs simultanés, et suppose que chaque page demande trop
de données d'un coup. Cinq agents ont audité en parallèle la couche données, le
démarrage, la base, le poids du JavaScript et l'historique des chantiers perf.

**L'hypothèse de départ est fausse sur le volume et juste sur le nombre d'allers-retours.**
Le schéma `public` complet pèse **11 Mo pour 36 tables**, `shared_buffers` vaut
224 Mo, `cache_hit_pct` est à **100,00 %** et `blk_read_time` à **0**. Les tables
que l'on croyait grosses ne le sont pas : `facturation_wordpool` = 1 640 lignes
(320 kB), `caisse_sheets` = 192 lignes, `daily_reports` = 170 lignes. L'application
émet **~16 985 requêtes PostgREST en 13 j 17 h, soit ~1 240 par jour**. Rien de
tout cela ne peut être lent en soi.

Trois causes indépendantes se cumulent, et c'est leur superposition qui produit le
« parfois ».

**1 — Famine CPU de l'instance.** `pg_stat_statements` sur 13 j 17 h :
`realtime.list_changes()` totalise **5 865 s de CPU pour 1 004 463 appels**, soit
**71,2 % du processeur de la base**, à raison de 0,85 appel par seconde en continu,
que quelqu'un soit connecté ou non, pour 3 tables publiées. L'application, elle,
pèse 14,7 %. L'instance est une **Micro** (`effective_cache_size` 384 Mo, 2 vCPU
burstable, `work_mem` 2 184 kB). La preuve de la famine ne se discute pas :
`set_config()`, appel purement mémoire sans I/O ni ligne rendue, met **5,13 ms en
moyenne et jusqu'à 1 211 ms** là où il devrait en mettre 0,05 ; `stddev ≥ mean` sur
toutes les familles de requêtes ; et le `max_exec_time` plafonne à **~7 000-7 400 ms
sur des familles indépendantes** (poller 7 159, `pg_timezone_names` 7 388,
`pdj_service_dates` 7 321) — ce sont des gels globaux, pas des requêtes lentes. Une
même lecture de `pdj_breakfasts` passe de **0,024 ms au mieux à 1 135 ms au pire**,
un facteur **1 900**. Réalité annexe : Realtime recrée son slot de réplication
**128 fois en 13,7 jours** (≈ 9,3 redémarrages par jour, signature d'un OOM sur
1 Go), et PostgREST recharge son cache de schéma **480 fois** (≈ 35 par jour, 1,1 s
minimum chacun, pendant lesquels il met les requêtes en attente).

**2 — Le démarrage attend le réseau, contrairement à ce que le code affirme.**
`AuthContext.tsx:142-144` écrit que `getSession` « lit le localStorage : c'est quasi
instantané ». La lecture du code d'`auth-js` installé
(`GoTrueClient.js:2526-2554`, `EXPIRY_MARGIN_MS` = 90 s) montre que la session est
rendue localement **uniquement si le jeton n'est pas près d'expirer**. Le JWT vit
1 h. Donc **toute ouverture de l'app plus d'une heure après la dernière activité
déclenche un rafraîchissement de jeton BLOQUANT** avant `setLoading(false)`
(`AuthContext.tsx:320-322, 339`), écran de squelette pendant tout ce temps. Et le
timeout global de 20 s (`lib/supabase.ts:35,49`) s'applique aussi à GoTrue, qui
retente une fois : **plafond ≈ 40 s**. Effet d'entraînement, `supabase-js`
`_getAccessToken` fait `await this.auth.getSession()` avant **chaque**
`.from()`/`.rpc()` : toutes les données de la page sont derrière ce verrou.
Enfin `lib/query.ts:30` écrit `count < 3`, ce qui autorise **3 réessais, soit
4 tentatives** — le commentaire des lignes 18-19 en annonce trois. Pire cas réel
sur une requête de board : **4 × 20 s + ~7 s de temporisation ≈ 87 s**.

**3 — Des attentes en série, pas un excès de données.** `/repjour`, la page
d'accueil, lance ~20 requêtes en **3 vagues successives** : les 12 requêtes de
`DayCrossSummary` n'existent qu'une fois `report`, `budget` et le forecast revenus
(`DashboardBoard.tsx:872-933`), alors qu'**aucune n'a besoin de leur résultat** —
la date suffit à toutes. Deux allers-retours complets perdus. Même schéma sur
`/rapro` (7 lectures de roulement derrière `oldest`, `RaproBoard.tsx:297-303`),
`/caisse` (`sheet → needsCarry → prev`, bloquant par `ready`, `CaisseBoard.tsx:342`)
et `/gestion` (2 vagues, et **hors TanStack Query**, donc sans aucun cache). À quoi
s'ajoute la cascade de chargement du code : HTML → **836 Ko de JS d'entrée en
17 chunks** → hydratation → découverte de la route → **2ᵉ vague de ~55 chunks** →
3ᵉ vague des `useQuery`. Trois étages sériels avant le premier contenu utile, et
**aucun retour visuel** pendant le second (`router.tsx` n'a ni
`defaultPendingComponent` ni `defaultPendingMs`). Le tout premier affichage est en
plus suspendu à une feuille de style **tierce et bloquante**
(`__root.tsx:50-53`, `fonts.googleapis.com`) : sur un réseau d'hôtel filtrant ou
lent, écran blanc jusqu'au timeout du navigateur.

S'y ajoutent trois poids morts mesurés : **echarts importé statiquement**
(`GalaxyChart.tsx:2-5`, 504 Ko bruts / 168 Ko gzip sur `/facturation/galaxie`),
**recharts importé statiquement** (`KpiLineChart.tsx:10`,
`KpiStackedBarChart.tsx:10`, 346 Ko / 101 Ko gzip payés à l'ouverture des **11**
pages analytique), et une simulation de galaxie en **O(N²) × 400 itérations**
synchrone dans un `useMemo` de rendu (`lib/facturation/galaxy.ts:108, 230-232`),
soit ~8 M opérations pour 200 nœuds, thread principal gelé.

Enfin, un seul défaut SQL **structurel et mesuré à froid** : la vue
`pdj_daily_agg` agrège **toute l'histoire avant de filtrer**, son `FULL JOIN` +
`COALESCE` bloquant le pushdown du prédicat — `explain analyze` rend
`Rows Removed by Filter: 802` pour 65 lignes utiles, **312 ms**. À distinguer de
`pdj_service_dates`, qui mesure **4,8 ms à froid** pour 1 053 ms de moyenne
cumulée : là, le coupable n'est pas la requête, c'est la famine. La leçon du
2026-09-06 (« toujours re-mesurer par `explain analyze` avant d'optimiser sur des
statistiques cumulées ») s'applique intégralement.

Ce qui est **hors de cause**, vérifié et à ne pas toucher : les clés de cache
(toutes scalaires et stables, `snapRangeToMonths` fait son travail), les
invalidations Realtime côté client (patch ciblé par `setQueryData`, aucune tempête),
les index (aucun manquant), les policies RLS (toutes enveloppées en `(select …)`,
aucune fonction `volatile` dans un `using()`), la règle des polices hors CSS, et
l'absence de barrels lourds.

---

## Remise en question (à défaut de /rodin)

- **Est-ce le bon chantier ?** En partie seulement, et il faut le dire. Le levier
  unique le plus puissant — **71 % du CPU de la base** — n'est pas du code : c'est
  une décision de configuration. Enchaîner treize étapes de code pendant que
  l'instance meurt de faim soigne les symptômes. Les étapes 2 à 5 améliorent le
  ressenti **quoi qu'il arrive**, parce qu'elles suppriment des attentes qui
  existent même sur une base au repos ; les gels de 7 secondes, eux, ne partiront
  pas sans trancher l'angle D1 ou D2.
- **Alternative moins coûteuse ?** Oui, et elle est honnête : **passer l'instance
  de Micro à Small** supprimerait la famine sans toucher une seule ligne de code.
  C'est quelques euros par mois contre plusieurs jours de travail. Elle avait été
  écartée le 2026-09-05 comme « non-réponse au problème » — à l'époque le problème
  diagnostiqué était une tempête de relectures, aujourd'hui c'est une famine CPU
  mesurée. Le contexte a changé, la décision mérite d'être reprise.
- **Angle mort.** Rien n'a été mesuré depuis un vrai navigateur. Tous les chiffres
  de la couche front sont **déduits** de la structure du code et du build, pas
  chronométrés. D'où l'étape 1 : sans repère avant/après, on ne saura pas si le
  chantier a servi. Second angle mort : les **35 rechargements quotidiens du cache
  de schéma PostgREST** — cause inconnue, 583 s de CPU, ~35 gels de plusieurs
  secondes par jour. Si la cause est triviale, c'est le meilleur rapport
  gain/effort du plan et il n'est dans aucune étape.

---

## Décisions actées (validées le 2026-09-20)

- **Temps réel** : **réduit au parking** (option B de D1). `parking_reservations`
  reste publiée et gardée ; `pdj_breakfasts` et `baby_cot_assignments` sortent de
  la publication et passent au rafraîchissement au retour d'onglet. Étape 14.
- **Instance** : **maintenue en Micro** (option B de D2). La famine CPU ne sera donc
  que partiellement levée — par la baisse du poller, pas par plus de puissance. À
  remesurer à l'étape 13 ; la question pourra être reprise avec les chiffres après
  travaux.
- **Police** : **auto-hébergée** (option A de D3).
- **Démarrage** : **attente bornée à 3 s** (option B de D4), le comportement de
  sécurité actuel est conservé.
- **Exécution** : les treize étapes sont lancées d'un trait, sans pause entre
  elles. L'étape 12 et l'étape 14 touchent la production : elles sont annoncées
  avant application.

---

## Angles à clarifier (tranchés le 2026-09-20)

**D1 — Le temps réel : garder, réduire, ou couper ?**
*Tranché : option B — réduit au parking.*
Le 2026-09-06, la décision explicite a été de **conserver Realtime partout**, en
connaissant déjà son poids. La mesure d'aujourd'hui le chiffre à **71,2 % du CPU**
pour 3 tables et 2 utilisateurs, avec un poller qui tourne **24 h/24 même quand
personne n'est connecté**. Côté client, l'implémentation est irréprochable
(patch ciblé, aucune invalidation large) : le coût est entièrement serveur.
*Option A* — ne rien changer, et lever la famine par D2.
*Option B* — réduire la publication aux tables réellement utiles en séance
(`parking_reservations` seule ?) et remplacer les deux autres par un `staleTime`
court + refetch au retour d'onglet.
*Option C* — couper Realtime et tout passer en refetch. Perte : les coches PDJ et
le planning parking ne se mettent plus à jour tout seuls entre deux postes.
**Cette décision appartient à l'utilisateur, aucune étape ne la présuppose.**

**D2 — L'instance : Micro ou Small ?**
*Tranché : Micro conservée. Le levier « puissance » n'est pas utilisé ; seul le
levier « moins de poller » l'est, via D1.*
`effective_cache_size` 384 Mo, 2 vCPU burstable, 1 Go. Les 128 recréations de slot
de réplication en 13,7 jours ressemblent à des OOM. Passer à Small (2 Go) ramènerait
mécaniquement les temps moyens vers les temps minimaux, soit un facteur ~100 sur les
requêtes gelées. Écarté le 2026-09-05, remesuré coupable le 2026-09-20.
*À noter* : c'est la seule action du dossier qui coûte de l'argent, et la seule qui
agit sur le symptôme n°1 sans écrire de code.

**D3 — La police Inter : auto-hébergée ou simplement non bloquante ?**
*Tranché : option A — auto-hébergée.*
*Option A (recommandée)* — auto-héberger les deux graisses en `woff2` dans
`public/fonts/`, retirer `fonts.googleapis.com` et `fonts.gstatic.com` de la CSP.
Supprime définitivement un tiers du chemin critique, et réduit la surface de la CSP.
Coût : ~100 Ko de fichiers dans le dépôt.
*Option B* — garder Google Fonts mais charger la feuille en non bloquant
(`media="print"` + `onload`). Moins de travail, mais l'écran blanc réapparaît si
`fonts.gstatic.com` est filtré.

**D4 — Le démarrage : afficher tout de suite, ou borner l'attente ?**
*Tranché : option B — attente bornée à 3 s.*
*Option A* — lever `loading` dès qu'une session est présente en cache local et
laisser le rafraîchissement du jeton se terminer en arrière-plan. Affichage
instantané. Risque assumé : une session révoquée côté serveur reste visible une
poignée de secondes avant l'éjection.
*Option B (recommandée)* — garder l'attente mais la **borner à 3 s** pour le seul
appel d'authentification, puis afficher avec la session locale et poursuivre en
arrière-plan. Conserve le comportement de sécurité actuel dans 99 % des cas et
supprime le pire cas de 40 s.

---

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-reperes-de-mesure.md](./1-reperes-de-mesure.md) | Repères avant/après | — | P0 | 45 min | Relevé navigateur + `supabase/verif_perf_2026-09-20.sql` | |
| 2 | [2-demarrage-non-bloquant.md](./2-demarrage-non-bloquant.md) | Démarrage : jeton, timeouts, réessais | 1 | P0 | 2h | Plafond d'attente 40 s → 3 s, 87 s → 25 s | ⚠ |
| 3 | [3-police-inter-locale.md](./3-police-inter-locale.md) | Police hors du chemin critique | 1 | P0 | 45 min | Plus aucune requête tierce bloquante | |
| 4 | [4-cascade-repjour.md](./4-cascade-repjour.md) | `/repjour` : 3 vagues → 1 | 1 | P0 | 1h30 | 2 allers-retours supprimés sur l'accueil | |
| 5 | [5-navigation-et-cache-assets.md](./5-navigation-et-cache-assets.md) | Retour visuel + cache des assets | 1 | P1 | 1h | `defaultPendingComponent` + `Cache-Control immutable` | |
| 6 | [6-graphiques-differes.md](./6-graphiques-differes.md) | recharts et echarts en différé | 1 | P1 | 1h30 | −101 Ko gzip sur 11 pages, −168 Ko sur la galaxie | |
| 7 | [7-galaxie-hors-rendu.md](./7-galaxie-hors-rendu.md) | Simulation galaxie hors du thread | 6 | — | — | **SANS OBJET** — mesuré : 22 nœuds actifs, pas 200 | |
| 8 | [8-parking-colonnes-visibles.md](./8-parking-colonnes-visibles.md) | Parking : ne rendre que le visible | 1 | P1 | 1h30 | 270+ colonnes → ~30 | |
| 9 | [9-rapro-memoisation.md](./9-rapro-memoisation.md) | Rapro : mémoïsation | 1 | P2 | 1h | 7 recalculs sortis du corps de rendu | |
| 10 | [10-lectures-bornees.md](./10-lectures-bornees.md) | Scans d'historique bornés | 1 | P1 | 2h | 5 lectures pleines table supprimées | |
| 11 | [11-gestion-sous-query.md](./11-gestion-sous-query.md) | `/gestion`, `/comptes`, `/profil` sous TanStack Query | 1 | P2 | 1h30 | Dernier fetch manuel du projet retiré | |
| 12 | [12-sql-vues-analytiques.md](./12-sql-vues-analytiques.md) | `pdj_daily_agg` et casts `::text` | 1 | P1 | 2h | Filtre poussé dans l'agrégat, dates indexables | ⚠ |
| 14 | [14-temps-reel-reduit.md](./14-temps-reel-reduit.md) | Temps réel réduit au parking | 1 | P0 | 1h30 | Poller allégé, PDJ et lits bébé en rafraîchissement | ⚠ |
| 13 | [13-validation-globale.md](./13-validation-globale.md) | Validation globale | 1-12, 14 | P0 | 1h | Comparaison chiffrée avant/après | ⚠ |

---

## Ordre d'exécution

1. **L'étape 1 d'abord, seule.** Sans repère de départ, aucune étape suivante ne
   pourra être jugée. C'est la leçon du 2026-09-06, appliquée dès le début.
2. **Sprint « ressenti » : 2, 3, 4, 5.** Ce sont les quatre étapes qui changent ce
   que l'utilisateur voit, indépendamment de D1 et D2. Elles ne se touchent pas
   entre elles (auth, `__root.tsx`, `DashboardBoard`, `router.tsx`/`vercel.json`) et
   peuvent être menées dans n'importe quel ordre.
3. **Sprint « poids et rendu » : 6, puis 7 ; 8 et 9 en parallèle.** L'étape 7 dépend
   de 6 parce qu'elle réécrit le même composant.
4. **Sprint « lectures » : 10, puis 11.** Même domaine, 11 hérite des conventions
   posées en 10.
5. **L'étape 12 en dernier avant la validation**, parce qu'elle touche la base de
   production et qu'il vaut mieux que tout le reste soit stable quand on l'applique.
6. **L'étape 13 clôt le dossier** et rejoue l'étape 1 pour produire la comparaison.

Les angles D1 et D2 sont **hors séquence** : ils peuvent être tranchés à tout
moment, y compris avant l'étape 1, et aucune étape n'en dépend.

---

## Architecture cible

```
Démarrage (à froid, jeton expiré)
  AVANT : HTML → CSS Google (bloquant, réseau tiers)
          → 836 Ko JS → getSession() BLOQUANT (1 RTT … 40 s)
          → chunk de route (~55 fichiers, aucun retour visuel)
          → vague 1 de requêtes → vague 2 → vague 3
  APRÈS : HTML → CSS local
          → 836 Ko JS → session locale affichée, refresh en fond (borné 3 s)
          → chunk de route (squelette de navigation visible)
          → une seule vague de requêtes

src/
  components/auth/AuthContext.tsx         [modifié] attente d'auth bornée
  components/repjour/DayCrossSummary.tsx  [modifié] monté sans attendre le rapport
  components/repjour/boards/DashboardBoard.tsx [modifié] branche conditionnelle levée
  components/analytique/KpiLineChart.tsx       [modifié] recharts en lazy
  components/analytique/KpiStackedBarChart.tsx [modifié] recharts en lazy
  components/facturation/GalaxyChart.tsx       [modifié] echarts en lazy
  components/facturation/FacturationGalaxie.tsx [modifié] simulation hors rendu
  components/parking/ParkingBoard.tsx     [modifié] colonnes filtrées à la fenêtre
  components/rapro/RaproBoard.tsx         [modifié] 7 useMemo
  components/repjour/boards/BudgetContent.tsx  [modifié] sous useQuery
  components/repjour/boards/DataContent.tsx    [modifié] sous useQuery
  components/repjour/boards/ComptesBoard.tsx   [modifié] sous useQuery
  components/repjour/boards/ProfilBoard.tsx    [modifié] sous useQuery
  components/shared/RouteSkeleton.tsx     ← réutilisé en defaultPendingComponent
  lib/supabase.ts                         [modifié] timeout distinct pour l'auth
  lib/query.ts                            [modifié] réessais alignés sur le commentaire
  lib/facturation/galaxyWorker.ts         [nouveau] simulation hors thread principal
  routes/__root.tsx                       [modifié] police locale
  router.tsx                              [modifié] retour visuel de navigation
public/fonts/                             [nouveau] Inter woff2
supabase/
  verif_perf_2026-09-20.sql               [nouveau] repères, lecture seule
  pdj_daily_agg_pushdown_2026-09-20.sql   [nouveau] vue réécrite
  vues_dates_typees_2026-09-20.sql        [nouveau] casts ::text retirés
vercel.json                               [modifié] Cache-Control des assets + CSP
```

---

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|-------------------|-------------------|
| Démarrage / socle | `AuthContext.tsx`, `lib/supabase.ts`, `lib/query.ts`, `routes/__root.tsx`, `router.tsx`, `vercel.json` | `public/fonts/` (2 woff2) |
| RepJour | `DashboardBoard.tsx`, `DayCrossSummary.tsx`, `AnalytiqueBoard.tsx`, `AnalytiqueMoisBoard.tsx`, `lib/repjour/daily.ts` | — |
| Analytique partagée | `KpiLineChart.tsx`, `KpiStackedBarChart.tsx` | — |
| Facturation | `GalaxyChart.tsx`, `FacturationGalaxie.tsx`, `lib/facturation/galaxy.ts` | `lib/facturation/galaxyWorker.ts` |
| Parking | `ParkingBoard.tsx`, `ParkingAnalytiqueBoard.tsx`, `ParkingAnalytiqueMoisBoard.tsx`, `lib/parking/service.ts` | — |
| Rapro | `RaproBoard.tsx` | — |
| PDJ | `BreakfastBoard.tsx`, `lib/pdj/service.ts` | — |
| Caisse | `CaisseAnalytiqueBoard.tsx`, `CaisseAnalytiqueMoisBoard.tsx`, `lib/caisse/service.ts` | — |
| Gestion / comptes | `BudgetContent.tsx`, `DataContent.tsx`, `ComptesBoard.tsx`, `ProfilBoard.tsx` | — |
| Base | — | `verif_perf_2026-09-20.sql`, `pdj_daily_agg_pushdown_2026-09-20.sql`, `vues_dates_typees_2026-09-20.sql` |
| **Total** | **28 modifiés** | **6 nouveaux** |

---

## Différé (hors chantier, à garder en tête)

- **Les 35 rechargements quotidiens du cache de schéma PostgREST** (480 appels,
  583 s de CPU, 766 ms de moyenne sur `pg_timezone_names`). Cause non identifiée :
  chaque DDL en déclenche un, mais 35 par jour n'est pas explicable par l'activité
  de développement seule. Demande les logs PostgREST, hors de portée du dépôt.
  C'est pourtant le meilleur rapport gain/effort potentiel du dossier.
- **Les 9,3 redémarrages quotidiens de Realtime** (128 `pg_create_logical_replication_slot`
  en 13,7 jours). Probablement un OOM sur 1 Go ; demande les logs de la plateforme.
  Traité indirectement par D2.
- **`private.is_admin()` non enveloppé** dans la policy `upp select self or admin`,
  et `auth.uid()` non enveloppé dans `Users update own profile`. Les deux tables
  font 22 et 5 lignes : impact nul, pure hygiène. À joindre au prochain script SQL
  de sécurité plutôt qu'à celui-ci.
- **`BackendStatusBanner.tsx:30`** appelle `useNow(1_000)` avant son `return null` :
  un `setState` par seconde pendant toute la vie de l'app, même quand tout va bien.
  Négligeable, mais empêche l'onglet de rester au repos.
- **`html2canvas` tiré par jspdf** (200 Ko bruts / 45 Ko gzip) alors que tous les
  PDF du projet sont vectoriels. Exclusion possible par configuration du bundler,
  gain limité au premier export PDF d'une session.
- **Premier accès sur un poste** : cache vide → `homeTarget()` retombe sur
  `/repjour` → `PageGuard` redirige vers la vraie page d'accueil → deux chunks de
  route téléchargés au lieu d'un. Une seule fois par poste, déjà documenté et assumé.
- **Aucun budget de taille en CI ni visualiseur de bundle.** Rien n'empêche une
  régression de poids. À poser quand le chantier sera stabilisé.
