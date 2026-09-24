# Back Office — contexte projet

Application web interne de gestion opérationnelle hôtelière (OKKO Nantes).
Onglets : **RepJour** (reporting journalier, la seule feature aboutie),
Parking, PDJ, Affichage, Rapprochement/Caisse (à venir).

## Stack

- **TanStack Start** (SSR) + **TanStack Router** (routing par fichier) + TanStack Query
- **React 19**, TypeScript, **Tailwind CSS v4**, **shadcn/ui** (thème dark navy forcé sur `<html>`)
- **Supabase** (Auth + PostgreSQL + RLS + Storage)
- Recharts, papaparse, html2canvas (pour l'onglet RepJour)

## Backend Supabase — DÉDIÉ à cette app (prod live)

Le projet Supabase est désormais **dédié à cette application** : il n'est **plus
partagé** avec `repjour-okko-nantes` (le partage a pris fin). L'ancien principe
« tout en LECTURE SEULE parce qu'une autre app en dépend » **ne s'applique plus**.

Mais c'est **toujours une base de PRODUCTION avec de vrais utilisateurs** (l'app
tourne dessus) : la prudence reste de mise.

- **Écritures et migrations désormais légitimes** sur les tables de l'app
  (`profiles`, `daily_reports`, `forecast_days`, `budget`, `email_recipients`,
  `hotel_config`, `audit_log`, `facturation_*`, `rapro_*`, `caisse_*`, `pms_*`…).
- **Opérations destructrices = confirmation explicite à chaque fois** : `DROP`,
  `TRUNCATE`, `DELETE`/`UPDATE` de masse (sans `WHERE` ciblé), suppression de
  colonnes, réécriture de données. Ne jamais les lancer par réflexe.
- **Exécution du SQL** : depuis le 2026-09-05, l'assistant a un **accès direct**
  via le CLI (`supabase db query --linked`, skill `bob-assistant-supabase`,
  liaison `supabase link --project-ref ozpavwghrmmkrnmkxodg` faite une fois par
  poste). Le fichier `supabase/*.sql` reste la source de vérité (écrit et commité
  AVANT d'être appliqué avec `-f`), et la règle destructif = confirmation
  explicite reste entière. Repli : l'utilisateur colle le script dans le SQL
  Editor.
- Les écritures via l'app (RPC `SECURITY DEFINER` à garde de rôle + RLS) restent
  le canal normal pour les features ; l'assistant ne teste pas les écritures
  applicatives contre la prod à la place de l'utilisateur.

## Clés Supabase (`.env`, jamais committé, gitignoré)

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` : **publiques** (embarquées dans le
  bundle navigateur, protégées par les RLS).
- `SUPABASE_SERVICE_ROLE_KEY` : **SECRÈTE**, contourne toute la RLS (accès total).
  - **Jamais** de préfixe `VITE_` (sinon fuite dans le bundle = faille critique).
  - **Jamais** committée, **jamais** en code client. (Ces deux règles restent
    absolues, indépendamment de la fin du partage.)
  - Usage : inspection / maintenance en local, ou fonction serveur (Edge Function).
    Pour supprimer un `auth.users` (suppression totale d'un compte) → Edge Function
    serveur, jamais le client.

## Authentification (applicative, globale)

- `AuthProvider` monté à la racine (`src/routes/__root.tsx`) + garde globale
  `src/components/auth/AppAuthGate.tsx` : toute page exige une session, sinon
  redirection vers `/login`. Auth 100 % client (localStorage) → l'app est de fait
  rendue côté client (spinner puis contenu ; le SSR ne rend que le spinner).
- Rôles : `utilisateur` (lecture), `super_utilisateur` (+ import), `admin`
  (+ gestion, comptes). Gating par rôle via `components/repjour/ProtectedRoute.tsx`.
  **La sécurité réelle des données = RLS Supabase** ; la garde UI est ergonomique.
- Menu utilisateur (dans la Navbar) : Profil (`/profil`), Gestion budgétaire
  (`/gestion`), Gestion des comptes (`/comptes`, admin), Déconnexion.
- **Ordre des pages et page d'accueil PAR COMPTE (2026-09-09)** : colonne
  `profiles.page_order text[]` nullable (`supabase/nav_page_order_2026-09-09.sql`).
  La TÊTE de cet ordre est la page d'accueil du compte — c'est vers elle que `/`,
  les deux redirections de `/login` et le logo pointent (plus aucun `/repjour` en
  dur). `null` = aucune préférence → ordre du registre `PAGES`, dont l'ordre
  n'est donc plus qu'un REPLI. Autorité unique de l'ordre affiché :
  `orderedPages` / `homePage` (`lib/permissions/navigation.ts`), qui filtrent sur
  les droits puis COMPLÈTENT avec les pages accordées absentes de la préférence —
  une préférence partielle ou périmée ne masque jamais une page, et rien n'est à
  réécrire quand un droit change. Aucun repli ne relit la préférence brute :
  c'est ce qui interdit la boucle de redirection. Réglage ouvert à l'admin
  (`/comptes`, tout compte) ET à chacun sur le sien (`/profil`), via un `update`
  direct — aucune RPC, aucune policy modifiée (`Users update own profile` ne fige
  que `role` et `email` ; `Admin manages profiles` couvre l'écriture croisée).
  `get_my_access()` est INCHANGÉE : son `to_jsonb(p)` remonte la colonne seul.
  Le `beforeLoad` de `/` lit le cache local (`lib/auth/cache.ts`,
  `lib/auth/homeTarget.ts`) : aucune lecture réseau ajoutée au démarrage — ce qui
  n'est possible que parce que l'app est une SPA (`spa: { enabled: true }`,
  rewrite Vercel vers `_shell.html`, aucune page prérendue). ⚠ Une nouvelle page
  doit désormais être déclarée à TROIS endroits : le CHECK de
  `user_page_permissions`, celui de `profiles.page_order`, et `pages.ts`.
- **Expiration par inactivité (2026-09-06)** : 24 h sans ouvrir l'app →
  déconnexion, appliquée par l'app (`lib/auth/inactivity.ts`, horodatage
  `bo.auth.lastActive.v1`, contrôle au démarrage et à chaque retour d'onglet
  dans `AuthContext`). GoTrue Free ne borne pas les sessions ; révocation
  serveur = `delete from auth.sessions` (fait le 2026-09-06, 17 sessions).
- **Passe red team 2026-09-06** (mémoire `securite-blindage-2026-09-06`) :
  anon sans aucun privilège sur `public`, TRUNCATE retiré à authenticated,
  audit_log append-only + journal des droits/comptes (`private.log_row_change`),
  `daily_reports.imported_by` estampillé, SSL imposé sur Postgres (⚠ toute
  commande `ssl-enforcement`/`postgres-config` REDÉMARRE la base ~1 min),
  Edge Function orpheline `smart-handler` supprimée, Edge Functions
  redéployées avec versions épinglées et sans repli service_role, Worker
  Cloudflare à domaine exact + SPF/DKIM/DMARC (`ALLOWED_SENDER_DOMAINS`,
  `REQUIRE_SENDER_AUTH`, à redéployer par l'utilisateur), pdf.js ≥ 6.2.108,
  bornes de taille sur tous les imports (`lib/shared/files.ts`), filet
  d'erreur global (`shared/RouteError.tsx`). Dashboard vérifié : mot de passe
  12 + complexité, aucune URL de redirection, MFA refusée par l'utilisateur.
  CSP `script-src` sans `'unsafe-inline'` : essayée par meta d'empreintes,
  incompatible avec l'hydratation du shell TanStack → NE PAS retenter sans
  preview Vercel ; `'unsafe-inline'` reste.

## Architecture / conventions

- **Métier pur** (sans React ni Tailwind) → `src/lib/<domaine>/`
  (`lib/repjour/{calc,parse,services,import,constants,format,...}`).
- Composants d'une feature → `src/components/<feature>/` ; auth →
  `src/components/auth/` ; réutilisables transverses → `src/components/shared/` ;
  primitives shadcn (vendored, **jamais retouchées à la main**) → `src/components/ui/`.
- Intégrations tierces → `src/lib/` (`supabase.ts`, `query.ts`). Styles par feature
  → `src/styles/<feature>.css` (préfixe `.<feature>-*`), chaînés par `@import`
  depuis `src/styles.css`.
- **Named exports uniquement** (jamais `export default`), alias `#/` **avec
  extension explicite** (`.ts` / `.tsx`), simple quotes, pas de point-virgule final.
- `/repjour` est en **`ssr: false`** (recharts/html2canvas client-only).
  `/` redirige vers `/repjour` (pas de page Dashboard pour l'instant).

## Performance / chargement (bonnes pratiques)

Le temps de chargement perçu vient surtout de l'auth cliente + du mode SPA. Règles :

- **Auth non bloquante** : la garde ne bloque QUE sur la session (`getSession`,
  lecture `localStorage`, quasi instantanée), jamais sur un aller-retour réseau.
  Le profil/rôle se charge EN ARRIÈRE-PLAN, avec cache `localStorage` + un signal
  `profileLoading` distinct (voir `components/auth/AuthContext.tsx`). Ne JAMAIS
  remettre un `await fetchProfile` bloquant avant de lever `loading`.
- **Cache de données = TanStack Query** : toute nouvelle lecture Supabase passe par
  `useQuery` (jamais `useEffect` + `useState` + fetch manuel). Réglages par défaut
  dans `lib/query.ts` (`staleTime` 60 s, `gcTime` 5 min, `refetchOnWindowFocus:false`,
  `retry:1`). `queryKey` en tableau versionné `['<feature>', '<vue>', ...params]`.
  Le router précharge au survol (`defaultPreload:'intent'` + `defaultPreloadStaleTime`
  60 s dans `router.tsx`).
- **Realtime + cache, pas realtime SEUL** : `DashboardBoard` et `ParkingBoard`
  ont un abonnement `postgres_changes`. Le temps réel garantit la FRAÎCHEUR tant
  que la page est montée, mais pas la latence AU MONTAGE : sans cache, chaque
  visite repayait tout le réseau (c'était la première cause de lenteur perçue).
  Les deux passent donc par `useQuery` :
  - `DashboardBoard` : **UNE** lecture depuis le 2026-09-23
    (`public.repjour_dashboard(date)`), qui en remplace huit — 13,8 ms de SQL,
    17 ko. Il n'a PAS d'abonnement Realtime : refetch au retour d'onglet.
  - `ParkingBoard` : seul le chargement INITIAL est mis en cache (lignes brutes,
    `staleTime: 0` → stale-while-revalidate au retour). Le canal continue de
    patcher l'état LOCAL ligne à ligne : dériver l'affichage du cache effacerait
    les mises à jour optimistes encore en vol (drag, copie).
- **Lazy-load des grosses libs client-only** : `html2canvas` (et tout poids lourd
  non nécessaire au premier rendu) est chargé par `import()` DYNAMIQUE au moment de
  l'usage, jamais en import statique de haut de module (voir `lib/repjour/email.ts`).
  Le découpage par route est déjà automatique (TanStack Router).
- **Polices : jamais d'`@import url(…)` dans le CSS.** Un `@import` ne se
  parallélise pas — le navigateur doit recevoir la feuille, y découvrir la ligne,
  puis ouvrir une connexion tierce, texte invisible pendant ce temps. Inter est
  chargée par `<link>` + `preconnect` dans `routes/__root.tsx` ; Poppins, qui ne
  sert qu'à l'affiche A3, uniquement par `routes/affichage.tsx`.
- **Chargement perçu** : préférer un squelette (`components/repjour/BoardSkeleton.tsx`,
  primitive `ui/skeleton`) à un spinner plein écran pour les états de chargement.
- **Résilience backend (panne du 2026-09-05, plan `perf-resilience-2026-09-05`)** :
  toute requête Supabase passe par le `global.fetch` de `lib/supabase.ts`
  (timeout 20 s) qui alimente le disjoncteur pur `lib/backendHealth.ts`
  (`up`/`down`, backoff exponentiel avec jitter 1 s → 30 s, `shouldSkip()`,
  `createSingleFlight`). `lib/query.ts` réessaie 3 fois une PANNE
  (`isOutageError`), 1 fois une erreur métier. Le bandeau
  `shared/BackendStatusBanner.tsx` (monté par `AppAuthGate`) est la SEULE
  restitution d'une panne : jamais de renvoi sur `/login`, jamais de faux
  « Aucune page accessible » (`PageGuard` lit `backendDown` + `permsResolved`).
  Règles à ne pas casser : relecture profil/droits en single-flight, cadence
  3 min onglet visible + 60 s minimum, JAMAIS de relecture sur
  `TOKEN_REFRESHED`, une erreur réseau n'efface JAMAIS le cache local, le chemin
  d'éjection (`profiles` renvoie 0 ligne → `signOut`) reste intact.
- **Lectures sobres** : `select` de colonnes explicites (jamais `select *` sur une
  table à PII) ; `queryKey` STABLE d'un jour à l'autre (arrondir une fenêtre
  glissante, cf. `snapRangeToMonths`) ; bornes historiques (« première date »)
  en `staleTime: Infinity` ; un seul refetch par retour d'onglet (coalescer
  visibility/focus/online) ; invalidations Realtime avec debounce ; la liste des
  dates PDJ vient de la vue `pdj_service_dates` (jamais de l'agrégat).
- **Depuis l'audit du 2026-09-06** (plan `correctifs-audit-2026-09-06`) : le
  boot auth lit UNE RPC `get_my_access()` (profil + droits ; réponse vide =
  erreur réseau, JAMAIS une éjection — seul `profile === null` éjecte, voir
  `lib/auth/access.ts`) ; la purge RGPD des noms PDJ passe par `purgeGate`
  (`lib/pdj/purgeGate.ts`, une fois par jour hôtelier et par poste, jamais par
  un `useRef` remis à zéro au montage) ; `DashboardBoard` n'a PAS d'abonnement
  Realtime (`daily_reports` n'est pas publiée) : refetch au retour d'onglet
  avec écart minimal 30 s. Toujours re-mesurer par `explain analyze` avant
  d'optimiser sur des statistiques cumulées (les 300 ms de `pdj_daily_agg`
  dataient de la saturation d'avant la panne ; à froid : 5 ms).
- **Audit du chargement, 2026-09-20** (plan `perf-chargement-2026-09-20`) — trois
  règles nées de faits mesurés, qui en corrigent d'autres :
  - **`getSession()` n'est PAS une lecture locale** quand le jeton approche de
    son expiration : auth-js part le renouveler (marge de 90 s sur un jeton
    d'une heure), donc chaque première ouverture de la journée passait par le
    réseau, écran bloqué, jusqu'à ~40 s. La règle « auth non bloquante » tient
    toujours, mais l'attente est désormais **bornée** (`BOOT_AUTH_MAX_WAIT_MS`
    = 3 s, `AuthContext.tsx`) — jamais supposée nulle. Ne pas retirer ce filet.
  - **Une feuille de style tierce bloque le rendu**, même chargée par `<link>`
    avec `preconnect`. « Polices hors du CSS » était nécessaire, pas suffisant :
    Inter et Poppins sont **auto-hébergées** depuis ce jour (paquets
    `@fontsource*`, inlinés au build), et la CSP ne mentionne plus Google. Ne
    pas réintroduire de `<link>` vers `fonts.googleapis.com`.
  - **Distinguer une requête lente d'une base affamée.** Signature d'une
    famine : `stddev ≥ mean`, un `min_exec_time` sous la milliseconde, et un
    `max_exec_time` qui plafonne au même endroit sur des familles de requêtes
    indépendantes. Quand elle est là, `explain analyze` **à froid** est le seul
    juge — complément de la leçon du 2026-09-06. Repère : `set_config()`, appel
    purement mémoire, mettait 5,13 ms de moyenne pour 0,019 au mieux.
  - **Temps réel réduit à `parking_reservations`** (décision utilisateur du
    2026-09-20, révise celle du 2026-09-06) : son poller consommait **71,1 % du
    CPU** de la base, en continu et sans utilisateur connecté, pour 3 tables.
    PDJ et lits bébé rafraîchissent au retour d'onglet. Autorité :
    `supabase/realtime_reduction_2026-09-20.sql`, retour arrière en deux lignes.
  - **`pdj_daily_agg` réécrite** (`pdj_daily_agg_pushdown_2026-09-20.sql`) :
    `UNION ALL` + CTE `not materialized` à la place du `FULL JOIN`, pour que le
    filtre de date descende sous l'agrégat. 98 ms → 11 ms. Les trois anciens
    fichiers portent « REMPLACÉ — NE PLUS REJOUER ».
  - **Retour visuel de navigation** : `defaultPendingComponent` dans
    `router.tsx`. L'angle D1 de `squelette-chargement-global` l'avait écarté
    comme « inutile sans `loader` » — vrai pour les DONNÉES, faux pour le
    téléchargement du CODE d'une route.
  - **Cache des fichiers statiques** : `/assets/*` en `immutable` dans
    `vercel.json` (ils étaient servis en `max-age=0, must-revalidate`, mesuré en
    production). ⚠ Ne JAMAIS étendre cette règle à `/_shell.html`.
  - Trois suppositions de l'audit **démenties par la mesure**, à ne pas
    ressusciter : la simulation de la galaxie (22 nœuds actifs, pas 200), les
    colonnes du planning parking (`days` ne contient déjà que le visible), et la
    mémoïsation de `RaproBoard` (~100 opérations par rendu).
- **La base sature, elle n'est pas lente — mesuré le 2026-09-22.** C'est la
  règle qui CORRIGE l'instinct « tout paralléliser » du 2026-09-20, lequel avait
  rendu inconditionnelles les dix lectures de `DayCrossSummary` :
  - au repos, PostgREST répond en **106 ms** (240 sondes `curl` espacées d'une
    seconde ; p90 165 ms, p99 497 ms, une seule au-dessus d'une seconde) ;
  - **pendant** l'ouverture de `/repjour`, la MÊME sonde — un `curl` anonyme,
    extérieur à l'app — passe à **3,6 s puis 9,9 s**. Ce n'est donc ni le
    navigateur, ni le thread principal (zéro `longtask`), ni le client Supabase ;
  - la concurrence seule est INNOCENTE : 40 requêtes triviales en parallèle sont
    servies en 1,9 s. C'est le **coût** qui compte, pas le nombre
    (`pdj_service_dates` 1 057 ms de moyenne, `pdj_daily_agg` 684 ms,
    `rapro_daily_agg` 541 ms — relevés `pg_stat_statements`).
  Conséquence : sur cette instance, **N requêtes chères simultanées ne se
  parallélisent pas, elles se font concurrence**. Scinder une salve en deux
  vagues n'ajoute pas une attente, elle en retire une pour le contenu regardé.
  `DayCrossSummary` a donc un prop `armed` (`armed={!reportPending}` dans
  `DashboardBoard`) : médiane du rapport du jour **5 906 → ~1 700 ms**, tout
  prêt **6 461 → ~4 000 ms** (6 chargements de production). Avant d'ajouter une
  lecture à une page, se demander dans QUELLE vague elle tombe.
- ⚠ **`duration` d'un `fetch()` n'est pas un temps serveur.** Sans
  `Timing-Allow-Origin`, `connectStart`/`requestStart` valent 0 et `duration`
  court jusqu'à la lecture du corps. Vingt requêtes qui finissent toutes dans la
  même fenêtre de 80 ms se lisent donc de deux façons opposées (blocage serveur
  OU thread principal occupé) : seule une sonde EXTÉRIEURE au navigateur
  tranche. Ne jamais conclure sur le seul Resource Timing.
- **Plafond global de 6 requêtes simultanées** (`lib/requestQueue.ts`, branché
  dans le `global.fetch` de `lib/supabase.ts`). C'est le SEUL endroit où ce
  réglage existe : toute page, présente ou future, en bénéficie sans rien faire.
  GoTrue est HORS file (sinon un renouvellement attendrait derrière six lectures
  qui l'attendent toutes) et le minuteur de 20 s ne démarre qu'APRÈS l'obtention
  du jeton de file. Ne pas relever le plafond sans refaire la mesure de débit :
  le sommet est à 9, l'effondrement à 14, et le plafond est PAR ONGLET.
- **`select distinct` nu = scan complet.** `pdj_service_dates` (`select distinct
  service_date from pdj_breakfasts`) coûtait 1 057 ms de moyenne alors que
  l'index sur `service_date` EXISTAIT : le planificateur ne saute pas tout seul.
  Réécrite en CTE récursive (« loose index scan », `Index Only Scan`, 251 sondes
  au lieu de 13 601 lignes) : **317,9 → 27,7 ms**, autorité
  `supabase/pdj_service_dates_loose_index_2026-09-22.sql`. ⚠ Une vue réécrite
  doit REPOSER `security_invoker = true` explicitement, sinon elle
  court-circuite les RLS. Effet de bord mesuré et instructif : les cinq AUTRES
  requêtes de `/pdj` ont accéléré de 4 à 7× sans être touchées — une requête
  gourmande affame toutes les autres, donc corriger la pire les corrige toutes.
- **Consolider des requêtes ne sert QUE si elles se font concurrence**
  (mesuré le 2026-09-23, chantier `rpc-analytiques-2026-09-23`). Le tableau de
  bord lançait vingt lectures d'un coup sur une instance qui s'effondre à
  quatorze : les fusionner en une RPC l'a fait passer de **5 906 à 1 112 ms**.
  Les pages analytiques en lancent quatre, parallèles, sous le plafond de six :
  les fusionner n'a RIEN donné, parce que le temps d'une page vaut alors
  `max(durées)` et non leur somme. **Avant de consolider, lire le
  chronogramme** — si les requêtes partent ensemble et finissent étalées, il y a
  concurrence et le gain est réel ; si elles finissent groupées, il n'y en a pas.
- **Le démarrage à froid était la première cause de lenteur vécue**, et il était
  invisible dans toutes les mesures parce qu'on recharge en boucle. Après une
  pause, la première requête coûtait **1 398 ms** contre 394 ms à chaud
  (2026-09-23). Un Worker Cloudflare envoie désormais une **rafale de trois
  pings** par minute pendant les heures d'ouverture
  (`cloudflare/stayntouch_in_to_supabase.js`, cron `* 4-22 * * *`). ⚠ UN ping ne
  suffit pas : la rampe de chauffe est 1,372 / 0,511 / 0,237 / 0,157 s, il faut
  trois à quatre requêtes rapprochées. Le ping doit porter la clé publishable —
  sans elle il est rejeté à la porte et ne réchauffe rien ; le `401 permission
  denied` qu'il reçoit est le SUCCÈS attendu.
- **`pg_stat_statements` n'enregistre PAS les requêtes refusées en permission.**
  Démontré par témoin le 2026-09-23 : cinq requêtes réelles, dont on voyait les
  réponses, n'ont pas bougé le compteur d'une unité. Valider l'instrument avant
  de croire la mesure.
- **`jsonb` n'a pas de type flottant** : il range les nombres en `numeric`, donc
  un `double precision` calculé en SQL y perd ses derniers bits. Une RPC de
  consolidation doit rendre les **valeurs brutes** et laisser l'arithmétique au
  TypeScript — sinon l'équivalence est impossible à prouver (31 écarts de 1e-13
  mesurés sur une première version qui calculait en SQL). Bénéfice secondaire :
  les formules, donc `TOTAL_ROOMS`, restent à un seul endroit.
- **Le `staleTime` de TanStack Query est évalué PAR OBSERVATEUR.** Deux
  composants qui montent la même clé avec des seuils différents : le plus court
  décide pour tout le monde. Quatre clés étaient dans ce cas avant le
  2026-09-23, et c'était toujours la page analytique qui périmait le cache que
  le board protégeait. Répéter le réglage à chaque site d'appel, avec un
  commentaire — une constante partagée donnerait l'illusion d'une source unique.
- **L'invalidation compare la clé ÉLÉMENT PAR ÉLÉMENT.** `['rapro','daily-agg']`
  n'attrape PAS `['rapro','daily-agg-range', …]` : « daily-agg » n'est pas un
  préfixe de « daily-agg-range » au sens du filtrage, c'est une autre chaîne.
- ⚠ **MESURER DÉGRADE CE QU'ON MESURE.** Constaté le 2026-09-23, en fin de
  chantier : après une session entière d'`explain analyze` sur des agrégats de
  13 000 lignes, de rechargements de page en boucle et de sondes en rafale,
  l'instance s'est retrouvée BRIDÉE — PostgREST à 1 079 ms pour un simple refus
  de permission, la couche edge à 1 350 ms par-dessus, et un chargement de page
  dont TOUTES les requêtes ont été abandonnées au bout de 20 s. La base
  Postgres, elle, était au repos (1 connexion active sur 10) : ce n'était donc
  ni une requête lente ni une saturation applicative.

  Sur cette offre, le budget d'entrées-sorties se consomme sous charge soutenue
  et **ne se recharge qu'au repos**. Vérifié : 13,9 s au pire, puis retour à
  0,16-0,33 s après **moins de deux minutes sans aucune sollicitation**.

  Conséquences pratiques, à respecter avant de juger une mesure :
  - **laisser l'instance tranquille 2 à 3 minutes** avant tout relevé qui compte ;
  - **espacer les chargements de page** d'au moins 60 s, jamais en boucle ;
  - se méfier de tout chiffre aberrant (plusieurs secondes, abandons à 20 s)
    relevé après une salve de mesures : c'est probablement l'observateur qui l'a
    causé. Plusieurs chiffres catastrophiques de ce chantier viennent de là ;
  - `x-envoy-upstream-service-time` dans les en-têtes de réponse sépare le temps
    PostgREST du temps de la couche edge : c'est l'outil qui tranche entre
    « la base rame » et « la plateforme rame ».
- **Squelettes de chargement — chantier du 2026-09-23/24** (`components/shared/
  skeleton/PageShapes.tsx`). Quatre règles nées d'erreurs commises pendant ce
  chantier même, toutes vérifiées par une passe d'agents adverses :
  - **UNE seule silhouette par page.** Chaque board avait son squelette local ET
    recevait celui de la route ; les deux dérivaient en silence. Sur /pdj,
    4 cellules par ligne contre 5 (215 px) ; sur /repjour, 3 cartes sur
    `sm:grid-cols-3` contre 4 sur `sm:grid-cols-4`, si bien que la rangée
    passait de 4 à 3 puis à 4 colonnes et que la page s'effondrait de ~500 px
    avant de regrandir. Les boards DÉLÈGUENT tous à `PageShapes` ; ne jamais
    réécrire une silhouette dans un board.
  - **Relever la forme sur le DOM réel, jamais à l'œil sur une capture.** Les
    silhouettes écrites de mémoire décrivaient des pages inexistantes :
    /literie dessinait des cartes de stock et un tableau que la page n'a pas
    (elle a `literie-floors` + le planning des lits bébé), /caisse un bandeau
    d'état qui n'existe pas, /repjour une « barre de date » qui est en fait le
    `title` du PageHeader. Réutiliser les VRAIES classes CSS (elles sont dans la
    feuille globale, donc disponibles sans importer de code de board).
  - **Un test qui ne peut pas échouer n'est pas un garde-fou.** Le premier
    vérifiait qu'une partition d'`ALL_ROOMS` par étage a pour somme
    `ALL_ROOMS.length` (vrai par construction) et qu'aucune classe n'est vide
    (impossible par construction) — et, étant un `.ts`, il ne pouvait pas rendre
    de JSX. `PageShapes.test.tsx` REND les silhouettes et les compte ; toute
    modification doit être validée en posant une mutation à la main et en
    vérifiant qu'elle est attrapée. ⚠ `jsdom` ne démarrait pas (override de
    sécurité `undici` résolu en v8, API changée) : aucun test de rendu n'était
    possible dans ce dépôt avant le 2026-09-24. L'override est borné à `<8`.
  - **Un état vide affirmé pendant un chargement est un MENSONGE, pas un saut.**
    `useFacturationModel` exposait huit lectures sans aucun drapeau : la page
    affirmait « Aucune facture apprise », « 0 émetteurs · 0 postes · 0 mots »,
    et « Rien d'appris pour cet émetteur — aucune imputation à corriger » avec
    une coche verte. Même famille : le fond de caisse affiché à 150 € avant que
    les cautions n'arrivent. Toute lecture qui alimente un état vide, un
    compteur ou un montant doit exposer son `isPending` (jamais `isFetching` :
    un rafraîchissement d'arrière-plan ne doit rien masquer), et toute garde de
    chargement doit utiliser `isPending` et non `isSuccess` — sinon une erreur
    laisse la page en squelette pour toujours.
- **Désamorçage de la panne du 2026-09-24** (commits `ac9e64a`, `259e0d9`).
  On ne sait pas empêcher la panne ; on a supprimé ce qu'elle coûtait.
  - **Le cache de données est PERSISTÉ sur disque** (`lib/queryPersist.ts`,
    `localStorage`, 24 h). Pendant une coupure, l'app continue de LIRE les
    dernières données connues au lieu d'un écran vide. ⚠ `gcTime` est passé à
    **24 h** pour cette raison précise : une entrée évincée de la mémoire n'est
    plus écrite sur disque, donc un `gcTime` court annulerait le cache de
    secours. `staleTime` est inchangé (60 s) — la fraîcheur, elle, ne se
    négocie pas.
  - ⚠ **CE QUI NE DOIT JAMAIS TOUCHER LE DISQUE** : le poste de la réception
    est PARTAGÉ. `PREFIXES_SENSIBLES` exclut `pdj/day` (noms clients, qui font
    l'objet d'une purge RGPD serveur — les recopier l'annulerait),
    `parking/reservations` (noms clients ; ⚠ clé construite par une FONCTION,
    invisible à une recherche de `queryKey:` — elle a failli être oubliée),
    `comptes`, `facturation`, `caisse/cautions` (`select(*)` + commentaire
    libre). Toute nouvelle lecture nominative doit y être ajoutée ;
    `queryPersist.test.ts` échoue si on retire une entrée.
  - **Les ÉCRITURES ne sont pas mises en file** et ne repartent pas toutes
    seules. Décision explicite : rejouer des écritures différées sur une caisse
    ou un rapprochement demanderait une résolution de conflits que personne n'a
    demandée.
  - **Le disjoncteur coupe enfin le trafic.** `fetchWithTimeout`
    (`lib/supabase.ts`, passage unique de TOUT le trafic Supabase) consulte
    `backendHealth.shouldSkip()` AVANT d'émettre. Avant, rien ne le consultait
    sur le chemin des données : chaque lecture partait, attendait 20 s,
    échouait, était réessayée deux fois — une vingtaine de lectures par page.
    ⚠ `/auth/v1/` en est EXEMPTÉ délibérément (un disjoncteur ouvert à tort
    enfermerait tout le monde dehors) ; c'est figé par un test.
  - **Le préchauffage s'arrête au premier échec.** Il enchaînait 7 tirs à 15 s
    même sur une base morte, soit jusqu'à 135 s pour une minuterie à 60 s : les
    invocations se chevauchaient et la pression montait quand la base
    ralentissait. Désormais : arrêt au premier échec, délai par tir à 5 s, pire
    cas 5 s. ⚠ **Le Worker n'est pas déployé automatiquement** — `wrangler
    deploy` PUIS `wrangler triggers deploy`, et CONSTATER un déclenchement.
- **Panne du 2026-09-24 — trois règles payées cher** (post-mortem complet :
  `plan/panne-supabase-2026-09-24/00-INDEX.md`). Toute la couche de service est
  tombée (PostgREST en boucle de redémarrage, Auth à 100 % d'échecs, Storage et
  pooler muets) pendant que **Postgres tournait** sans servir les requêtes. Un
  redémarrage du projet a tout rétabli en trois minutes.
  - **SEULE UNE REQUÊTE QUI LIT DES DONNÉES PROUVE QU'UNE BASE SERT.** J'ai
    conclu deux fois « la base va bien » sur des signaux vides : un
    `permission denied` est tranché à l'analyse, AVANT tout accès aux données
    (une base incapable de lire refuse instantanément), et `/auth/v1/health`
    ne touche pas la base. La sonde valable, sans identifiants, est un
    `POST /auth/v1/token?grant_type=password` avec une adresse volontairement
    inexistante : un `400 invalid_credentials` prouve que GoTrue a bien lu
    `auth.users`. C'est elle qui a montré 7,32 s puis 0,09 s. Même famille que
    le `pg_stat_statements` aveugle du 2026-09-23 : l'instrument répondait,
    mais ne mesurait pas ce qu'on croyait.
  - **CAPTURER AVANT DE REDÉMARRER.** Le redémarrage relance Postgres et remet
    à zéro `pg_stat_database`, `pg_stat_statements` et `pg_stat_activity`
    (`pg_postmaster_start_time()` le confirme). La base inspectée ensuite était
    fraîche — 100 % de cache, zéro verrou — donc inexploitable, et la cause
    première n'a JAMAIS pu être établie. Premier réflexe désormais :
    `supabase/diagnostic_panne.sql` (lecture seule intégrale). Ces vues sont
    servies depuis la MÉMOIRE : une base qui ne lit plus ses tables a de bonnes
    chances d'y répondre quand même.
  - **UNE SONDE QUI AVALE SES ERREURS N'EST PAS UNE SURVEILLANCE.** La panne
    n'a été détectée que parce qu'un humain a ouvert l'application. Le
    préchauffage Cloudflare tournait toutes les minutes, a très probablement
    observé la panne de bout en bout, et n'en a rien dit — il journalise mais
    n'alerte pas, et ses pings en refus de permission auraient « réussi »
    quoi qu'il arrive. Un vendredi soir, l'hôtel serait resté sans application
    jusqu'au lundi. Rien ne remplace une sonde qui LIT et qui ALERTE.
  - Éliminés et vérifiés, à ne pas re-suspecter sans preuve neuve : taille
    (27 Mo), gonflement, verrous, slots de réplication (616 octets de retard),
    WAL (128 Mo), index de `pdj_breakfasts` (valides), CTE récursive du 22/09
    (terminaison prouvée), `pg_cron` (pas même installé), planificateur caché
    (balayage exhaustif), incident de plateforme.
  - ⚠ Le préchauffage `* 4-22 * * *` ne laisse **qu'une heure de repos par
    24 h** (la veille du rapport couvre 0h-4h59). Or le budget d'E/S ne se
    recharge qu'au repos. Chaque invocation vit au moins 30 s, la suivante part
    60 s après : la fenêtre de deux minutes nécessaire est structurellement
    impossible. Et sans disjoncteur, une invocation sur base malade dure
    jusqu'à 135 s pour une minuterie à 60 s — les invocations se chevauchent et
    la pression AUGMENTE à mesure que la base souffre.
- Valider toute modif perf : `pnpm build` (vérifier le découpage des chunks) +
  `npx tsc --noEmit` ; côté base `supabase/verif_perf.sql` (lecture seule).

## Faits base de données (vérifiés en lecture)

- Tables : profiles, daily_reports, forecast_days, budget, email_recipients,
  hotel_config, audit_log.
- Fonctions RPC déployées : `get_user_role`, `admin_update_password`.
- Table **`postes` : n'existe PAS** → feature volontairement différée, non portée.
- Hôtel unique : **80 chambres, TVA 10 %** (constantes en dur dans
  `lib/repjour/constants.ts`).
- **Durcissement sécurité vérifié le 2026-07-27** (dashboard `supabase/verif_securite.sql`,
  8/8 OK) : lectures **par page** (un compte sans permission sur une page lit 0 ligne
  de ses tables, PII incluse) ; `anon` **ne peut plus exécuter** `admin_update_password`
  / `set_user_grade` / `set_page_permission` / `remove_page_permission` ;
  `admin_update_password` a une garde admin + `search_path` figé ; anti-escalade
  `profiles` (policy self-update figeant `role` + trigger `protect_role_escalation`) ;
  contrainte de format sur `email_recipients`. Objets désormais **versionnés** :
  `supabase/{profiles,security_core,page_permissions_rls_lectures,verif_securite}.sql`.
- **Pentest red team + remédiation le 2026-08-04** (rapport `doc/pentest-2026-08-04.md`,
  plan `plan/securite-remediation-2026-08-04/`, contrôle `supabase/verif_securite_2026-08-04.sql`
  OK) : correction du seul XSS stocké (branche arête du tooltip `GalaxyChart`,
  nom d'émetteur PDF non échappé) ; anti-escalade `profiles` étendue à l'**INSERT**
  (policy INSERT bornée + trigger `before insert or update`) ; `daily_reports`
  refermé en lecture sur `page:repjour` seul, `/rapro` lit l'occupation via la RPC
  `daily_reports_occ` (SECURITY DEFINER, `rj_nuitees` uniquement) ; `set_user_grade`
  refuse de rétrograder le dernier admin ; `get_user_role` **versionnée** dans
  `security_core.sql` ; policies dupliquées **retirées des fichiers de table**
  (autorité unique = `page_permissions_rls*`/`*_rls_fenetre_*` ; anti « revert
  silencieux ») ; `search_path` figé dans les défs de triggers d'estampillage ;
  `drop table … cascade` de `rapro_rooms.sql` neutralisé ; Edge Functions durcies
  (plafond destinataires `send-report`, rollback `create-user` borné à 10 min,
  erreurs génériques) ; client `detectSessionInUrl:false` + garde des params de
  route `$year/$month`. Risque **accepté** : tokens de session en `localStorage`
  (structurel au client Supabase JS ; son vecteur XSS a été supprimé).
- **Schéma `private` depuis le 2026-09-05** (plan `security-advisor-zero-2026-09-05`,
  Security Advisor à zéro côté SQL) : TOUTE fonction `security definer` vit dans
  `private` (non exposé à PostgREST ; usage `authenticated` + `service_role`,
  jamais `anon`/PUBLIC ; ne JAMAIS l'ajouter aux « Exposed schemas » du
  dashboard). Aides des policies : `private.get_page_level`, `private.is_admin`,
  `private.get_user_role`, `private.page_level_rank`,
  `private.repjour_manual_forecast_allowed`, `private.get_user_email`. Les 34 RPC
  privilégiées (comptes/droits, `daily_reports_occ`, `rapro_occupancy`, 28
  `facturation_*`) y vivent aussi ; `public` ne porte que des **relais
  `security invoker`** de même nom/signature (l'app appelle `public.<nom>`
  sans changement) et `dismiss_send_reminder` (invoker, policy identique).
  Fichiers d'autorité : `private_schema_aides.sql`, `rpc_invoker_2026-09.sql`,
  `private_rpc_relais.sql`, `facturation_garde_null_2026-09-05.sql` ; contrôle
  `verif_advisor.sql` (11 contrôles) + `verif_complet.sql`. Les anciens fichiers
  de fonctions portent « REMPLACÉ — NE PLUS REJOUER ». Règles : une nouvelle
  RPC privilégiée = fonction dans `private` + relais invoker dans `public` ;
  une garde de niveau s'écrit `is distinct from 'gestion'` ou
  `page_level_rank(...) >= n`, JAMAIS `<> 'gestion'` (NULL passe) ; générer le
  SQL depuis le catalogue (`pg_get_functiondef`) plutôt que recopier. Deux
  failles préexistantes corrigées ce jour : garde NULL des 28 RPC facturation
  (tout compte connecté sans droit facturation pouvait écrire), policy
  `Users update own profile` auto-référente (42P17 : aucun non-admin ne pouvait
  modifier son profil depuis le 2026-08-05). Fonctions supprimées (aucun
  appelant) : `set_parking_tarif`, `literie_record_movement`,
  `literie_toggle_bedding`.
- **Audit + correctifs du 2026-09-06** (plan `correctifs-audit-2026-09-06`,
  scripts `securite_audit_2026-09-06.sql`, `fk_auteur_triggers_2026-09-06.sql`,
  `perf_audit_2026-09-06.sql`, `email_recipients_drop_2026-09-06.sql`,
  contrôle `verif_audit_2026-09-06.sql` 20/20) : régression refermée (5
  policies `using (true)` sur facturation venues du fichier ROLLBACK rejoué,
  désormais « NE PLUS REJOUER ») ; **0 fonction trigger definer dans public**
  (`log_delete` vit dans `private`, les 3 autres sont invoker) et toute
  fonction trigger est fermée à PUBLIC/anon/authenticated ; 0 policy
  `to public` ; **18 FK d'auteur `on delete set null`** (cible `profiles`
  pour les nouvelles, colonnes nullables) et les 7 triggers d'estampillage
  figent l'auteur via `private.keep_author(new, old)` (figé pour un
  utilisateur de l'app, NULL accepté d'un contexte système : c'est ce qui
  permet la suppression d'un compte) ; CHECK `profiles.role` =
  utilisateur|admin, CHECK `user_page_permissions.page` = 8 clés de
  `lib/permissions/pages.ts` (à étendre avec toute nouvelle page) ; cautions
  UPDATE fenêtré 30 j pour l'écriture ; index partiel
  `pdj_breakfasts_guest_name_pending_idx` ; vue `pdj_daily_agg` fermée à
  anon ; RPC invoker `public.get_my_access()` ;
  `idle_in_transaction_session_timeout = 60s` sur authenticated/anon/
  authenticator ; **table `email_recipients` SUPPRIMÉE** (seule liste :
  `server_report_recipients`). Décisions explicites de l'utilisateur, à ne
  pas re-proposer : daily_reports/pms UPDATE-DELETE en écriture (import =
  upsert), compte de test et compte Réception partagé conservés, 1 seul admin
  sans MFA, ~~Realtime conservé (parking, PDJ, lits bébé)~~ **RÉVISÉ le
  2026-09-20 : Realtime réduit au SEUL `parking_reservations`** (voir plus bas),
  doublons de section
  PMS fidèles au fichier source, contresignature caisse = papier.
  `track_io_timing` et `log_min_duration_statement` sont IMPOSSIBLES sur ce
  plan (clés refusées par l'API `postgres-config`, ALTER DATABASE refusé :
  `postgres` n'est pas superuser) : l'observabilité = `pg_stat_statements`
  (remis à zéro le 2026-09-06) et Reports du dashboard.
- **Clés API migrées le 2026-07-27** : le projet est passé du legacy (anon/service_role
  JWT) au **nouveau système** — client sur `sb_publishable` (`VITE_SUPABASE_ANON_KEY`
  local + Vercel), Edge Functions sur `sb_secret` (secret `SB_SECRET_KEY`, lu avec repli
  legacy dans le code), puis **legacy JWT-based keys DÉSACTIVÉ** dans le dashboard. La
  `service_role` legacy est donc révoquée. Rollback = « Re-enable JWT-based API keys ».

## Commandes

- `pnpm dev` (port 3000) · `pnpm build` · `pnpm generate-routes` (après
  ajout/suppression de route) · `pnpm lint` · `pnpm check` (format).
- shadcn : `pnpm dlx shadcn@latest add <composant>`.

## Plans

Les chantiers sont documentés dans `plan/` (notamment `plan/repjour-portage/`
pour le portage de l'app repjour dans l'onglet, et
`plan/organisation-arborescence/` pour les conventions d'arborescence).
