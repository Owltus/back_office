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
  Précédent à suivre : **page `classeur` (2026-09-25)**, ajoutée VIDE le matin (remplie le jour même, voir la section Classeur) —
  `pages.ts` + `routes/classeur.tsx` + `routes/classeur/index.tsx`
  (`PageGuard page="classeur"`) + `components/classeur/ClasseurBoard.tsx`,
  script `supabase/page_classeur_2026-09-25.sql` (les deux CHECK, borne
  `page_order` à 9), tests recopiés à la main (`registres.test.ts`,
  `navigation*.test.ts`, `authorization.property.test.ts`). Pas de squelette
  dédié tant qu'elle n'a pas de forme. Quand elle aura des tables : policies
  sur `private.get_page_level('classeur')`, RPC privilégiées dans `private`.
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
    ⚠ **Effet de bord constaté le 2026-09-30** : Vercel applique cet en-tête
    aussi aux 404 (impossible de conditionner un en-tête au code de réponse
    dans `vercel.json`). Un navigateur qui demande le point d'entrée PENDANT
    une mise en ligne reçoit un 404 et le garde un an : page blanche sur ce
    poste seulement (PC de travail de l'utilisateur ; Ctrl + Maj + R répare).
    Parade : `lib/autoReparationAssets.ts`, script autonome en tête de
    `<head>` (comme celui du thème) — sur l'échec d'un `<script>`/`<link>`
    `/assets/` du site, re-téléchargement `cache: 'reload'` (remplace l'entrée
    en cache) puis UN rechargement si le fichier existe, au plus 1 / min ;
    rien si le fichier est vraiment absent (vieil onglet → `vite:preloadError`).
    Alternative écartée faute de préversion : réécrire `vercel.json` en
    `routes` (ancien format) avec un 404 `no-store` après `handle: filesystem`.
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
- **~~Préchauffage~~ → SONDE DE SANTÉ (révisé le 2026-09-24, après la panne).**
  La règle précédente (« rafale de trois pings par minute pour garder la base
  chaude ») était FAUSSE sur trois points, tous mesurés :
  - un `permission denied` est tranché AVANT tout accès aux données : ces pings
    revenaient en 300 ms pendant que la base ne servait plus rien. Ils ne
    prouvaient rien de ce qu'ils prétendaient ;
  - chaque refus écrivait une ligne ERROR dans Postgres, PostgREST et l'API
    Gateway : ~8 000/jour, le dashboard noyé sous notre propre bruit ;
  - la pratique documentée est UN ping tous les 3 jours (pause à 7 j
    d'inactivité), dont cette app n'a même pas besoin (usage quotidien + import
    nocturne). Le gain de chaleur (1,37 → 0,17 s) exigeait une charge continue
    qui ne laissait qu'une heure de repos par 24 h.
  Désormais : `sonder()` dans le Worker, UNE requête `/auth/v1/health` toutes
  les 10 min (cron `*/10 4-22 * * *`), 200 = silence, échec = `console.error`
  visible comme ERREUR dans Cloudflare. Elle a répondu 504 pendant toute la
  panne : elle l'aurait vue. ⚠ Elle ne prouve PAS que Postgres sert : une vraie
  sonde de lecture exigerait `public.ping()` exécutable par `anon`, ce qui
  contredit `verif_advisor.sql` n° 2 — décision de sécurité, pas de plomberie.
- **Planificateur Cloudflare : le calendrier ACTIF n'est pas celui que le
  dashboard affiche** (constaté le 13/09, puis à nouveau le 24/09 avec preuves).
  Après `deploy` + `triggers deploy` annonçant `*/10 4-22`, l'ancien
  `* 4-22 * * *` a continué de tirer **chaque minute pendant ~19 minutes**,
  alors que la page Déclencheurs ne le listait plus ; il s'est éteint seul
  ~7 min après le second `triggers deploy`. Deux règles : (1) **le Worker
  ignore tout cron qu'il ne connaît pas** (`VEILLE_CRON` / `SONDE_CRON`
  explicites, `console.warn` sinon) — un calendrier fantôme ne doit rien
  pouvoir déclencher, or l'ancien code traitait tout inconnu comme la veille et
  a appelé l'Edge Function d'import une fois par minute pendant onze minutes ;
  (2) **constater dans les logs**, pas déduire du déploiement : `wrangler
  tail --format json > fichier` pendant un tick complet, puis compter
  `[sonde]` et `cron inconnu`. Ne pas redéployer en rafale pour « réveiller »
  le planificateur : c'est ce qui l'avait figé le 13/09.
- **Le mécanisme de la panne du 2026-09-24 est un BUG SUPABASE CONNU, non
  corrigé** : `supabase/supabase#50043` — la maintenance quotidienne des
  partitions `realtime.messages` exécute ~90 `ALTER TABLE … OWNER TO` par jour,
  chacun déclenche `pgrst_ddl_watch` → `NOTIFY pgrst` → PostgREST reconstruit
  TOUT son cache et répond 503 pendant ce temps (371 s d'indisponibilité en
  28 h chez le rapporteur). Correctif `supabase/postgres#2464` en BROUILLON.
  `pgrst_ddl_watch` appartient à `supabase_admin` : aucun contournement côté
  projet. Ce que nous contrôlons : ne pas aggraver (sonde sobre, disjoncteur,
  cache persisté), la taille de l'instance (Nano = 0,5 Go, Supabase
  recommande textuellement Micro pour la production), et la surface Realtime
  (`parking_reservations` seule publiée).
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
  - ⚠ **CE QUI NE SURVIT PAS AU JSON N'EST PAS ÉCRIT** (bug du 2026-09-25,
    trouvé par l'utilisateur en local : « carriedManual is not iterable »).
    Le persister écrit du JSON, et un `Set`/`Map` y devient `{}` ; restauré
    au démarrage suivant, `RaproDay` faisait planter `/repjour` (bande de
    synthèse) et `/rapro` au lieu de les aider — l'écran planté est PIRE que
    l'écran vide que le cache devait éviter. `doitPersister` passe désormais
    la DONNÉE au crible de `survitAuJson` (primitives finies, tableaux,
    objets nus, à toute profondeur ; Set, Map, Date, instances refusés) :
    une `queryFn` qui rend un `Set` n'est pas persistée, et repart en réseau
    comme avant. Version de cache passée à `v2`, clé `v1` effacée au
    branchement (`CLES_PERIMEES`). Réflexe pour toute nouvelle `queryFn` :
    rendre des objets nus si on veut qu'elle serve hors ligne.
  - ⚠ **Ne jamais poser une mutation de test sur un fichier que le serveur
    Vite sert à un navigateur en cours de vérification.** Le 2026-09-25, la
    mutation `return true` de `survitAuJson` a été servie à chaud pendant le
    rechargement de contrôle : l'instance mutée a écrit un cache v2 corrompu,
    puis le rechargement à chaud l'a restauré — la page « réparée » a
    replanté sous mes yeux. Vérifier la mutation par vitest seul, PUIS
    recharger le navigateur, jamais les deux en parallèle.
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

## Classeur — portage de Registre (2026-09-25)

La page `/classeur` est le portage de l'application de bureau **Registre**
(`github.com/Owltus/Registre`, Tauri v2 + SQLite + Rust) dans NOTRE stack,
sans Rust : classeurs réglementaires (registre de sécurité, carnet
sanitaire) structurés par chapitres, prêts à imprimer. Plan et décisions :
`plan/page-classeur/00-INDEX.md`. Ce qu'il faut savoir pour y toucher :

- **Base** : 8 tables `classeur_*` (autorité unique
  `supabase/classeur_2026-09-25.sql`, rejouable) — classeurs, chapitres,
  périodicités (référentiel seedé, lecture seule), documents Markdown,
  feuilles de suivi, feuilles de signature, intercalaires, historique de
  fusion (`snapshot jsonb`). Identifiants `bigint identity`, colonne `uuid`
  (CLÉ DE FUSION, jamais réécrite), **suppression douce** partout
  (`deleted_at`) ; la seule suppression physique (classeur, entrée
  d'historique) est réservée à `gestion` par la RLS et n'est pas exposée
  par l'app. Trigger unique `classeur_stamp` (via `private.keep_author`).
  RLS : lecture rang ≥ 1, insert/update rang ≥ 2, aucune fenêtre de grâce.
- **Métier pur** dans `lib/classeur/` : `service.ts` (colonnes explicites,
  toute lecture filtre `deleted_at is null` sauf les `*AvecSupprimes` de la
  fusion), `keys.ts` (`classeurKeys`, préfixe `classeur` — persistable :
  aucune donnée nominative), `slug.ts` (`slugify` = miroir EXACT du Rust,
  clé d'appariement des exports existants : ne pas modifier), `ordre.ts`,
  `sommaire.ts`, `importFichiers.ts`, exports (`download`, `exportMarkdown`
  ZIP via `jszip` dynamique, `exportJson` format v2 de Registre —
  interopérable dans les deux sens avec l'application de bureau).
- **Impression** : moteur A4 pur DOM porté tel quel (`lib/classeur/print/`,
  `paginate` avec mesure injectable pour jsdom), rendu Markdown
  `react-markdown` + GFM + KaTeX + Mermaid (`mermaid` chargé par `import()`
  au premier diagramme, prouvé hors du chunk d'entrée). PDF = dialogue
  d'impression du navigateur sur l'iframe (`printViaIframe`), jamais jsPDF
  ici : le contenu est mis en page par le DOM. Pages A4 TOUJOURS blanches
  (pas de variante thématique). Classes `.a4-page`, `.pdf-prose`,
  `.tracking-table` dans `styles/classeur.css` : le moteur en dépend.
  ⚠ **Budget de pagination d'un document (corrigé le 2026-09-27)** :
  `A4Page` réserve la ligne de sous-titre (7 mm) dès que `subtitle` est
  défini, même vide — donc TOUJOURS pour un document (sa description).
  `usePagination` calculait avec `CONTENT_HEIGHT_MM` (sans sous-titre) :
  une page pleine débordait jusqu'à 7 mm et rognait le pied de page à
  l'impression (`overflow: hidden`). Défaut hérité de Registre.
  `DocumentPages` passe désormais `DOCUMENT_CONTENT_HEIGHT_WITH_SUBTITLE_MM`
  et la hauteur fait partie de la clé de re-mesure. Même famille :
  l'espacement d'une image est un PADDING (une marge fusionnait avec le
  paragraphe parent et échappait à la mesure, ~20 px par capture). Trouvés
  en contrôlant les 31 documents du classeur « Procédures de la réception »
  (id 5, 2026-09-27). ⚠ Pour mesurer une page, l'onglet doit être au premier
  plan : Chrome y suspend `requestAnimationFrame`, donc la pagination.
  ⚠ **Pagination RÉVISÉE le 2026-09-30** (retour utilisateur : « le contenu
  saute trop vite d'une page à l'autre ») — `print/paginate.ts`, cinq
  rigidités héritées de Registre corrigées : (1) paragraphes et encadrés
  COUPÉS entre deux lignes (`couperTexteDom`, lignes lues NŒUD DE TEXTE par
  nœud — un Range sur tout le bloc inclut la boîte entière du `<p>` d'un
  encadré ; 2 lignes min. de chaque côté ; images, blocs de code, diagrammes
  restent insécables) ; (2) un titre n'exige plus 15 % de page libre mais le
  DÉBUT MINIMAL de ce qui suit (2 lignes, 2 items, en-tête + 2 lignes, ou le
  bloc insécable entier) ; (3) listes et tableaux coupables dès 4 éléments,
  dernier morceau RÉÉQUILIBRÉ (2+2) au lieu d'être recollé ; (4) un grand
  bloc remplit d'abord la place restante au lieu d'ouvrir une page neuve ;
  (5) marges FUSIONNÉES comme le navigateur, sans la marge haute du 1er bloc
  (annulée par le CSS) ni la basse du dernier. Tout ce qui demande un
  navigateur est injectable (`OutilsPagination`), 15 tests jsdom. Mesuré en
  navigateur sur les 86 documents réels (banc temporaire, lecture seule) :
  252 → 231 pages, 20 documents raccourcis, AUCUN allongé, AUCUN débordement,
  AUCUN mot perdu ni dupliqué (en-têtes de tableau répétés exclus de la
  comparaison), pages non finales remplies à 89 % en moyenne ; les pages
  encore peu remplies s'expliquent toutes par un `===` ou une capture qui ne
  tient pas. ⚠ Mesurer en onglet caché : Chrome suspend
  `requestAnimationFrame` et ralentit `setTimeout` à 1/min — remplacer les
  deux par `MessageChannel` le temps d'un banc.
  ⚠ **Le document imprimé doit être stylé EXACTEMENT comme la page**
  (défaut trouvé par l'utilisateur le 2026-09-26 : « très grosse différence
  entre l'aperçu et l'impression, liens colorés, mise en page différente »).
  Cause : `buildPrintHtml` (porté de Registre) inlinait les `<link>` par
  `fetch()`, et en dev Vite répond à un `fetch()` de `/src/styles.css` par
  un MODULE JAVASCRIPT (`text/javascript`, « import { createHotContext }
  … »), pas par du CSS : l'iframe n'avait AUCUN style de l'app. Désormais
  les feuilles sont réémises en `<link>` (demandées par le navigateur
  comme feuilles, donc servies comme telles, dev comme prod) et attendues
  (`attendreFeuilles`) avant `fonts.ready` et `print()` ; `<html>` reprend
  la classe `dark` et les `data-*` de la page (mêmes tokens) ; le bloc
  `@page { margin: 0 }` du classeur est émis EN DERNIER parce que RepJour,
  PDJ, Rapro et Analytique déclarent chacun un `@page` à 10-12 mm dans la
  même feuille globale. Contrôle fait par import du module compilé par
  Vite dans la page et comparaison des styles calculés page/iframe
  (`buildPrintHtml.test.ts` fige les trois garanties). Règle générale :
  ne JAMAIS `fetch()` une ressource servie par Vite pour en lire le
  contenu — demander au navigateur de la charger dans son rôle.
- **Fusion JSON** (`lib/classeur/merge/`) : `planifierFusion` est PURE et
  reproduit les 12 règles de `do_merge` côté Rust (documentées en tête du
  fichier, tests R1…R12), avec 5 écarts assumés (E1…E5) qui corrigent des
  défauts de la source. `appliquerFusion` écrit l'INSTANTANÉ AVANT toute
  écriture, puis les actions séquentiellement (pas de RPC, pas de
  transaction : un échec au milieu laisse un état partiel restaurable) ;
  élagage à 10 entrées, 42501 ignoré. Restauration = fusion en
  remplacement avec instantané de sécurité, jamais de purge physique.
  **Audit adverse du 2026-09-25** (`merge/audit.property.test.ts`, 27 tests
  de propriétés fast-check sur un simulateur en mémoire) : 7 défauts rouges,
  tous corrigés (E6…E8 en tête de `merge.ts`). Les trois qui comptent :
  (1) le trigger `classeur_stamp` réestampillait `updated_at = now()` à
  chaque écriture, donc « dernier écrit gagne » était cassé dès la deuxième
  fusion — il RESPECTE désormais un `updated_at` fourni
  (`classeur_stamp_updated_at_2026-09-25.sql`), et la fusion passe celui du
  fichier ; (2) un élément apparié n'était jamais déplacé ni réordonné, et un
  supprimé était restauré sans ses champs — la restauration d'un instantané
  n'était donc PAS exacte (Registre purgeait et réinsérait) ; quand le
  fichier gagne, chapitre, ordre, uuid et horodatage suivent ; (3) les
  fichiers v1 à titres ou slugs en doublon écrasaient/dupliquaient
  (appariement par titre désormais consommé un à un). Règle de méthode :
  « fidèle au Rust » n'est pas « correct » — le Rust avait ces défauts.
- **JSON d'un chapitre ou d'un document « pour un LLM » (2026-09-29,
  demande utilisateur)** : bouton accolades `{}` sur la page d'un chapitre
  (et menu « ⋯ ») et d'un document → `dialogs/EchangeJsonDialog.tsx` :
  1) exporter (Copier / Télécharger), 2) réimporter (coller la réponse du
  LLM, même entourée de texte ou de ```json — `extraireJson` —, ou choisir
  un fichier), aperçu, Importer (droit d'écriture). MÊME format v2 que le
  classeur complet : un classeur à UN chapitre (ou un chapitre contenant ce
  seul document), `_metadata` enrichi de `portee` (uuid) et `instructions`
  (consignes pour le LLM : ce qu'il peut modifier, jamais `uuid`/`kind`/
  chemins d'images, conventions Markdown de la page — ligne vide, `===`,
  `> `, `- [ ]`, tableaux GFM). Logique pure `lib/classeur/merge/portee.ts`
  (14 tests, mutations vérifiées) : `planifierFusion` en REMPLACEMENT
  (le LLM ne met pas `updated_at` à jour : en fusion « le plus récent
  gagne », ses modifications seraient ignorées) puis FILTRÉ à la portée —
  jamais d'autre chapitre, position du chapitre conservée, suppression des
  absents seulement sur option (un LLM tronque parfois), chapitre ignoré
  pour un document ; `updated_at` du fichier RETIRÉ (sinon le document
  reprendrait sa date d'export et un éditeur ouvert avant écraserait le
  travail sans conflit). Refus clair d'un JSON d'un autre chapitre/document.
  Application : `appliquerFusionPortee` = même circuit que la fusion
  (point `fusion` AVANT toute écriture, élagage). Vérifié navigateur sans
  écrire (aperçus chapitre, option de suppression, mauvais chapitre,
  document) ; base inchangée.
- **UI** : TanStack Query partout (`useClasseur.ts`, `useMerge.ts`,
  invalidation de `classeurKeys.all`, optimistes pour le réordonnancement),
  `isPending` pour les gardes, pas de toasts (alertes inline,
  `messageErreur` rend un 42501 lisible), `can('classeur','ecriture')`
  masque toute écriture, `gestion` la suppression d'un classeur et la
  purge d'historique. Glisser-déposer `@dnd-kit` : la colonne des chapitres
  est cible de dépôt (`chapterDropId`), les cartes posent `ItemDragData`.
  Routes minces : la logique vit dans `ClasseurListActions` /
  `ClasseurDashboardActions`.
- **Images dans les documents (2026-09-26, « un truc de très simple »)** :
  `lib/classeur/images.ts` convertit DANS LE NAVIGATEUR (`createImageBitmap`
  avec orientation EXIF, plus long côté 1600 px, `canvas.toBlob` WebP 0,8,
  seconde passe 1280 px / 0,65 si > 2 Mo) puis envoie dans le bucket
  Storage `classeur-images` sous `<classeurId>/<uuid>.webp`. Le Markdown
  reçoit le CHEMIN, jamais une URL : `![nom](2/uuid.webp)`.
  - **Bucket PRIVÉ, aucune URL publique** (l'utilisateur a REFUSÉ la
    première version publique : « exposées sur le web sans RLS, pensé
    sécurité »). Lecture par `storage.download` (API authentifiée, policy
    select rang ≥ 1) dans `print/ImageDocument.tsx`, affichage par une URL
    `blob:` locale (`urlObjetImage`, une par chemin, gardée pour la
    session : les pages A4 sont des COPIES HTML du conteneur de mesure) —
    à l'écran comme dans l'iframe d'impression (même origine). Blob en
    cache TanStack (`classeurKeys.image`, `staleTime: Infinity`, jamais
    persisté : `survitAuJson` refuse une instance). Vérifié : URL publique
    et API sans session → 400 ; avec session → 6 ko en 3 ms.
  - Bucket créé par l'assistant dans le dashboard à la demande de
    l'utilisateur (2 Mo, `image/webp` seul — le serveur refuse tout autre
    format), puis rendu privé par `supabase/classeur_images_2026-09-26.sql`
    (JOUÉ, idempotent) qui porte aussi 3 policies `storage.objects` :
    select rang ≥ 1, insert/delete par `private.classeur_write_ok(dossier)`.
    `create policy on storage.objects` passe par le CLI sans souci
    d'ownership. CSP `img-src 'self' data: blob:` inchangée.
  - Éditeur : `detail/InsertionImage.tsx` (bouton Image, collage, dépôt
    sur le textarea, insertion au curseur relevé AU DÉPART, état inline
    « 3,2 Mo → 106 ko »). `usePagination` ATTEND `data-image-status=
    "pending"` puis le décodage des `<img>` (sinon hauteur 0 et page qui
    déborde ; 8 s max). ⚠ `img.decode()` sur une `Image` DÉTACHÉE avec une
    URL `blob:` ne résout pas toujours dans Chrome : n'attendre que
    `load`/`error` sur un `<img>` du DOM.
  - **Médiathèque (même jour, demande utilisateur : « si elles sont dans
    le bucket je ne les vois pas… rangement à plusieurs niveaux »)** :
    table `classeur_images` (fiche par image : chemin unique, nom, taille,
    dimensions ; suppression douce ; RLS lecture ≥ 1, insert/update par
    propriétaire, pas de delete ; `classeur_images_table_2026-09-26.sql`
    JOUÉ, autorité à 9 tables / 26 policies / trigger × 8). Une image
    appartient au CLASSEUR ; son USAGE est CALCULÉ (`imagesReferencees`,
    `usagesImages`) depuis les contenus déjà chargés, jamais stocké — le
    Markdown en cours de frappe fait foi pour le document ouvert. Dialogue
    `dialogs/ImagesDialog.tsx` : vues Tout le classeur / Ce document /
    Non utilisées (= les fichiers morts), renommer, supprimer (prévient si
    utilisée ; fichier retiré PUIS fiche marquée), ajouter ; depuis
    l'éditeur, bouton Médiathèque + « Insérer » au curseur ; depuis
    l'accueil, carte « Images du classeur ». L'envoi crée la fiche et
    retire le fichier si elle échoue (jamais d'orphelin). ⚠ La requête de
    la liste est conditionnée à l'ouverture du dialogue (`useImages(id,
    open)`) : un dialogue fermé mais monté ne se rafraîchirait jamais, et
    le cache persisté (préfixe `classeur`) restaurait une liste vide.
    Vérifié navigateur : ajout, carte « Non utilisée », suppression avec
    confirmation, bucket vide et fiche `deleted_at` en base.
    **Suppression PROPRE (même jour, demande utilisateur)** :
    `supprimerImage(image, documents)` réécrit D'ABORD les documents qui
    la référencent (`retirerImageDuMarkdown`, testé : ligne seule retirée
    sans double vide, jeton en milieu de ligne ôté seul, idempotent) par
    `updateItem` (garde des points de restauration), PUIS retire le
    fichier, PUIS marque la fiche. `dialogs/SuppressionImageDialog.tsx`
    liste les documents et l'ordre des opérations. ⚠ L'usage qui fonde la
    décision est relu FRAIS (refetch à l'ouverture, `fetchQuery` staleTime
    0 à la confirmation) : trouvé au contrôle, le cache de 60 s manquait
    un document créé hors de l'onglet, qui serait resté avec « Image
    indisponible ». L'éditeur ouvert retire aussi la référence de son
    texte non sauvegardé (`onImageSupprimee`).
  - **Préparation avant envoi et mise en page (même jour, demande
    utilisateur : « centrées automatiquement, option de crop, UX »)** :
    `dialogs/ImagePreparationDialog.tsx` (`react-easy-crop`) s'ouvre pour
    TOUT ajout (bouton, collage, dépôt, médiathèque) : cadre à ratio et
    zoom, « Utiliser telle quelle » saute le cadre. **Rotation et largeur
    RETIRÉES du dialogue le jour même à la demande de l'utilisateur**
    (« toujours 0° et pleine largeur ») : `PreparationImage` ne porte
    qu'un `recadrage` ; `convertirEnWebp` garde l'option `rotation`
    (pure, testée : `boiteTournee`, `recadrageBorne`) sans UI, et
    `largeurDepuisTitre` lit encore un `"largeur=NN"` écrit à la main
    dans le Markdown — ne pas les réexposer sans demande. ⚠ **LARGEUR
    RÉEXPOSÉE le 2026-09-30 à la demande de l'utilisateur** (« une image a
    vite fait de prendre toute la place ; recadrer plus simplement ; pouvoir
    la toucher ») : `ImagePreparationDialog` refait — recadrage LIBRE à
    poignées (`react-image-crop`, souris et doigt ; formats Libre / Original
    / Carré / 4:3 / 16:9 ; « Image entière »), taille sur la page (Petite 33
    / Moyenne 50 / Grande 75 / Pleine largeur + curseur 20-100 %, hauteur
    toujours proportionnelle) et page A4 miniature qui montre le résultat.
    RETOUCHE d'une image placée : en édition, un clic sur l'image dans
    l'aperçu (`img[data-chemin]`, contour au survol) rouvre le dialogue ;
    la taille ne fait que réécrire la ligne (`trouverImage` sur la ligne
    cliquée puis 1re occurrence, `jetonImage`), un recadrage envoie une
    NOUVELLE version (l'originale reste en médiathèque, elle peut servir
    ailleurs) ; ligne réécrite par `appliquerQuandLibre` (Ctrl + Z). Rotation
    toujours non exposée. Vérifié navigateur sans rien écrire (retouche 50 %
    → seule la ligne changée, aperçu à 50 %, collage d'une image, format
    Carré, abandon) ; le recadrage d'une image placée (qui envoie) n'a pas
    été exercé contre la prod. `.pdf-prose img`
    est en bloc centré (`break-inside: avoid`). Pas de recadrage libre :
    react-easy-crop est un cadre fixe
    que l'on déplace/zoome (ratios prédéfinis), choix assumé pour le
    tactile. ⚠ Leçon de méthode (patchs Python rejoués) : un guard
    « déjà appliqué » qui compare le texte APRÈS prettier ne détecte
    rien — le rejeu a dupliqué un `<ImagePreparationDialog>` (deux
    dialogues ouverts en même temps, trouvé au contrôle navigateur) ;
    ne rejouer un patch qu'après `git diff`, jamais à l'aveugle.
  - Mesuré : PNG 3,2 Mo → WebP 106 ko en 610 ms. Non couvert, à dire si
    demandé : les points de restauration et la fusion JSON ignorent les
    fiches d'images ; les exports Markdown/JSON portent des chemins que
    Registre (bureau) ne saura pas afficher.
- **Éditeur des documents pour non-initiés (2026-09-27, demande
  utilisateur : « le Markdown n'est pas inné, simplifier au maximum »)** :
  barre `detail/BarreMiseEnForme.tsx` (titres 1-3, gras/italique/barré,
  puces/numéros/cases/encadré, lien, tableau, séparateur, saut de page,
  puis Image/Médiathèque) qui ÉCRIT le Markdown ; logique PURE dans
  `lib/classeur/markdownEdition.ts` (chaque action rend une `Edition` :
  plage, texte, sélection ; boutons en BASCULE ; un bloc est isolé par des
  lignes vides — un `---` collé sous du texte en ferait un titre).
  Raccourcis Ctrl + B / I / K, Entrée qui continue une liste (sort sur un
  élément vide), Tab/Maj + Tab qui décale une liste (hors liste, Tab garde
  son rôle d'accessibilité). ⚠ L'édition passe par
  `execCommand('insertText')` pour que Ctrl + Z annule un clic de la barre ;
  `setRangeText` n'est qu'un repli (jsdom). Bouton « ? » dans l'en-tête en
  édition → `dialogs/AideMiseEnFormeDialog.tsx` : chaque exemple « vous
  tapez / sur la page » est rendu par le vrai moteur et `.pdf-prose`
  (figé par un test de rendu). Le rendu Markdown est INCHANGÉ : un retour
  simple colle toujours les lignes (le tuto l'explique) — `remark-breaks`
  changerait la mise en page des documents existants et l'interop Registre.
  Titre et description d'un document en édition : plus d'encart au-dessus
  de l'éditeur, crayon de l'en-tête (à côté du « ? ») →
  `dialogs/TitreDocumentDialog.tsx`, qui ne fait que reporter dans le
  brouillon (écrit par Sauvegarder). Les trois autres pages de détail
  gardent leur encart `DetailFields`.
  Zone d'édition NON redimensionnable (`resize-none`, `[field-sizing:fixed]`
  contre le `field-sizing-content` du `Textarea` shadcn) : à partir de
  `lg`, la grille éditeur + aperçu reçoit une hauteur MESURÉE jusqu'au bas
  de la fenêtre (`hooks/useHauteurJusquEnBas.ts`, depuis `.app-scroll`,
  rembourrages bas des ancêtres déduits, remesure au redimensionnement),
  chaque colonne défile en interne ; en dessous, 60 dvh.
- **Éditeur : ne plus perdre de travail (2026-09-27, points 1 à 5 de la
  liste NUMÉROTÉE `plan/classeur-editeur-ameliorations/00-INDEX.md` —
  l'utilisateur demande par numéro, ne jamais renuméroter)**. Tout vit dans
  `detail/useEditionDocument.ts` :
  - (1) quitter avec des modifications = confirmation
    (`dialogs/AbandonModificationsDialog.tsx`, défaut = continuer) : bouton
    Annuler, navigation (`useBlocker` + `withResolver`), onglet fermé
    (`enableBeforeUnload`). « Modifié » se mesure contre l'état AU DÉBUT de
    l'édition, jamais contre le cache (un refetch ne doit rien inventer).
    Sauvegarder sans modification sort sans écrire (ni point de restauration).
  - (2) `sauvegarderDocumentSiInchange` (service) : `update … eq(updated_at,
    base)` ; 0 ligne → relecture pour départager conflit / supprimé / refus
    RLS (un `update` refusé par la RLS ne lève PAS d'erreur). Conflit →
    `dialogs/ConflitDocumentDialog.tsx` (revenir, garder ma version = écrase
    via `updateItem`, voir la sienne ; « Copier mon texte »). Pas de nom de
    l'auteur : les tables n'ont pas d'`updated_by`. Testé par simulateur
    (`sauvegardeDocument.test.ts`, mutation « sans filtre » attrapée).
  - (3) brouillon de secours `lib/classeur/brouillon.ts` : `localStorage`,
    clé PAR COMPTE et par document (poste partagé), 7 jours, écrit 500 ms
    après la frappe et aussitôt sur `pagehide`/onglet caché, effacé à la
    sauvegarde ou à l'abandon ; proposé (jamais appliqué d'office) par un
    bandeau à la réouverture ; il garde SA `base`, donc reprendre un
    brouillon périmé mène au dialogue de conflit, pas à un écrasement.
  - (4) insertion d'image par `appliquerQuandLibre` (`detail/
    editionTextarea.ts`) : `execCommand('insertText')` une fois le dialogue
    d'origine FERMÉ (`[data-state="open"]` seulement ; minuterie, pas
    `requestAnimationFrame`, suspendu fenêtre masquée) → Ctrl + Z la retire.
    Le retrait d'une image SUPPRIMÉE reste hors historique, volontairement.
  - (5) indicateur « Non enregistré » / « Aucune modification » à gauche
    d'Annuler (`statut` de `DetailActions`).
  Point 13 (même jour) : l'éditeur est en police NORMALE de l'app (plus
  de `font-mono`, décision utilisateur). Décisions sur la suite, notées
  dans le plan : 6, 9, 10 refusés (rester en noir et blanc, Markdown
  officiel), 7 refusé sauf outil qui n'écrit que du tableau Markdown
  standard, 8 en attente.
  Point 7 FAIT (même jour, « fais ton truc avec le tableau ») : le bouton
  Tableau ouvre `dialogs/TableauDialog.tsx`, grille vide ou PRÉ-REMPLIE
  avec le tableau sous le curseur (`trouverTableau`) ; la validation écrit
  du tableau GFM standard (`lib/classeur/tableauMarkdown.ts` :
  `ecrireTableau` protège `|`, aplatit les retours, CONSERVE les
  alignements `:---:` ; lecture tolérante, lignes courtes complétées, jamais
  tronquées) via `insererTexteEnBloc` + `appliquerQuandLibre` (Ctrl + Z).
  Vérifié sur « Dégradations constatées – prix » (20 lignes) : relire puis
  remplacer sans rien changer ne modifie QUE le séparateur (`|----|` →
  `| --- |`). Refusés le même jour : 11, 14, 15.
  Points 16 à 19 FAITS (même jour). 16 : `rehypeLignesSource`
  (`lib/classeur/print/lignesSource.ts`) pose `data-ligne` sur chaque
  élément rendu — les pages A4 étant des COPIES HTML, l'attribut les suit ;
  ⚠ tout composant Markdown surchargé doit transmettre ses props (`p` le
  fait) ; chaque `===` devient 3 lignes rendues (`ligneRendueVersSource` /
  `ligneSourceVersRendue` compensent). Clic dans l'aperçu → `allerALigne`
  (défilement du textarea MESURÉ sur un miroir invisible) ; curseur → bloc
  de l'aperçu montré s'il est hors vue (`selectionchange`) ; la synchro
  proportionnelle se tait 400 ms après un défilement piloté. 17 : bouton
  masquer/afficher l'aperçu (≥ lg). 18 : `lib/classeur/relecture.ts`
  (image supprimée, lien vide, tableau aux cases en trop ou au séparateur
  invalide, titre sauté ; blocs de code ignorés), repliable sous la barre,
  clic = aller à la ligne, jamais bloquant. 19 : « N pages » discret
  (`onPageCount` de `DocumentPages`). 23 refusé.
  Point 22 FAIT : `mentionVersion` = LA DATE SEULE « jj/mm/aaaa » (fuseau
  de Paris ; l'utilisateur a refusé tout texte et l'heure) ; date du jour
  dans l'aperçu d'édition → prop `mention` de
  `A4Page`, positionnée en ABSOLU dans la marge basse (sous le pied de
  page, centrée, opacité 0,2, à 6,5 mm du bord — à 3,5 mm les
  imprimantes la coupaient, 2026-09-28) : hors flux, la pagination ne la
  voit pas ;
  posée par `DocumentPages` depuis `ItemPages`, `DocumentCard` et
  `DocumentDetail`. Refusés aussi : 8 (retour à la ligne simple), 12
  (menu « / »).
  Points 20-21 FAITS : table `classeur_document_versions`
  (`supabase/classeur_versions_documents_2026-09-27.sql`, JOUÉ, 5/5 ;
  bloc identique en §7 de l'autorité) écrite par le trigger definer
  `private.classeur_document_version` après tout changement de titre,
  description ou texte, quel que soit le chemin ; état d'avant conservé
  au 1er enregistrement (`etat_initial`) ; auteur FIGÉ en clair (prénom
  nom / nom affiché, jamais l'e-mail : les lecteurs ne lisent pas les
  profils des autres) ; 50 versions par document ; lecture rang ≥ 1, AUCUN
  grant d'écriture (insert direct → 42501, testé en transaction annulée).
  Clé `classeurKeys.versions` EXCLUE du cache disque (noms de collègues,
  `PREFIXES_SENSIBLES`). UI `dialogs/HistoriqueDocumentDialog.tsx` +
  `lib/classeur/diff.ts` (LCS ligne à ligne, préfixe/suffixe communs
  retirés, repli des parties inchangées, propriété « le diff reconstitue
  les deux versions » testée) ; « Reprendre cette version » = l'éditeur
  s'ouvre dessus avec la base ACTUELLE, rien n'est écrit avant
  Sauvegarder. ⚠ Doublons de patchs rejoués retirés ce jour : interface
  `DbImage` (types.ts) et bloc Médiathèque de `classeur_2026-09-25.sql`.
  Vérifié navigateur sans rien écrire (base et points de restauration
  inchangés). ⚠ Fenêtre Chrome non affichée = captures en échec et
  animations de sortie figées (`data-state="closed"` reste dans le DOM) :
  contrôler par script, ne pas conclure à un défaut de l'app.
- **ACCÈS PAR CLASSEUR (2026-09-28, remplace le modèle « Affichage » du
  26/09 ; plan `plan/classeur-acces-par-classeur/`)**. Règle validée par
  l'utilisateur : **niveau effectif = le plus petit de (droit sur la PAGE,
  droit sur le CLASSEUR)** ; gestion de la page et admin : tout. Droit sur
  le classeur, par priorité : exception de la personne (`classeur_acces`,
  aucun/lecture/ecriture, dans les DEUX sens — y compris retirer le
  créateur), sinon créateur → écriture, sinon `classeur_classeurs.acces_tous`
  (défaut `lecture` = bascule ; `aucun` = « Privé »). Source de vérité
  UNIQUE en base : `private.classeur_niveau_de(id, created_by, acces_tous)`
  (⚠ la policy de lecture de `classeur_classeurs` l'appelle avec les
  COLONNES de la ligne : une recherche par `id` rendait invisible la ligne
  en cours d'insertion et refusait toute création — trouvé à la
  répétition) ; `classeur_niveau(id)`, `classeur_lecture_ok`,
  `classeur_write_ok` (même nom qu'avant : les policies d'écriture suivent),
  `classeur_chapter_read_ok`, `classeur_gestion_ok`. Lecture filtrée sur
  TOUT le contenu : classeurs, chapitres, 4 familles d'éléments,
  médiathèque, points de restauration (copies complètes), versions,
  fichiers du stockage (sinon un classeur masqué reste lisible par ses
  à-côtés). Trigger `private.classeur_garde` : `acces_tous`, `deleted_at`,
  `sort_order` du classeur = gestion seule (42501), « privé » à la création
  forcé à `lecture` hors gestion. Journal : `log_row_change` sur
  `classeur_acces` et sur `acces_tous`. RPC `classeur_personnes` (gestion,
  prénom/nom/droit de page, JAMAIS l'e-mail). Réservé gestion côté UI (la
  base ne peut pas distinguer une restauration d'une saisie) : restaurer
  un point, supprimer un point. Autorité : `classeur_acces_2026-09-28.sql`
  (JOUÉ) = §8 de `classeur_2026-09-25.sql` (EN DERNIER : il remplace les
  lectures « rang ≥ 1 ») ; les fichiers images et versions sont alignés
  (ne jamais y remettre « rang ≥ 1 »). Matrice `verif_classeur_acces.sql` :
  25/25, rejouable, s'annule toute seule (exception finale), 3 mutations
  vérifiées détectées ; `verif_advisor` 11/11 (13 aides), `verif_complet`
  20/20. Côté app : `lib/classeur/droits.ts` = miroir exact
  (`niveauEffectif`, `capacites`, propriétés fast-check),
  `useDroitsClasseur` (tout `false` tant que classeur ET `useMesAcces` ne
  sont pas chargés), `useDroitsPageClasseur` ; `dialogs/
  AccesClasseurDialog.tsx` (bouclier dans la barre du haut de l'accueil,
  à côté du crayon « Modifier le classeur », gestion) ; option Privé à la création (gestion) ; liste : suppression et
  ordre = gestion, cadenas « lecture seule », icône « Privé ». Clés
  `['classeur','acces',…]` exclues du disque. ⚠ **Cache PAR COMPTE**
  (`lib/queryPersist.ts`, `changerDeCompte` appelé par `applyUser`) : le
  cache n'est restauré que pour le compte qui l'a écrit
  (`bo.query.cache.proprietaire`, lu face à la session `sb-*-auth-token`),
  vidé (mémoire + disque) à chaque changement de compte et à la
  déconnexion — jamais sur une panne (même compte). Avant ce jour, B
  pouvait voir depuis le cache ce que A avait lu sur le poste partagé.
- **Liste des classeurs `/classeur` (décision utilisateur du 2026-09-26,
  « plus comme d'origine »)** : la colonne centrée de Registre
  (`ClasseurListPage`), SANS titre de page — deux cartes pointillées côte à
  côte (« Nouveau classeur » ; « Importer classeur », qui reçoit aussi un
  fichier déposé : « Déposez ici »), un séparateur, puis les classeurs en
  LISTE VERTICALE réordonnable (la carte entière est la poignée, activation
  à 5 px ; les actions Exporter/Supprimer vivent HORS du lien et arrêtent
  le `pointerdown`). Plus de grille 2/3 colonnes ni de voile de dépôt sur
  la page. `ActionCard` est partagée avec l'accueil
  (`components/classeur/ActionCard.tsx`) ; `FormeClasseurListe` suit la
  même colonne (`actions={false}` = liste seule sous les cartes réelles).
- **Accueil d'un classeur (décision utilisateur du 2026-09-26)** : les
  chapitres ne sont PAS répétés dans la page (ils vivent dans la colonne de
  gauche, pleine hauteur, 20 rem — « trop petite » à 16 rem) ; le corps de
  l'accueil est la COLONNE de cartes d'actions de Registre, à l'identique
  (28 rem centrés : nouveau chapitre ; Sommaire | Exporter PDF ; séparateur ;
  Exporter en Markdown ; Exporter en JSON | Importer un JSON avec dépôt de
  fichier ; puis, ajout à nous, séparateur + Points de restauration) sous la
  recherche ; l'en-tête ne garde que l'édition du classeur. Libellés de
  Registre conservés (« Export en cours... », « Déposez ici »).
- **Points de restauration (2026-09-26, demande de l'utilisateur : « de
  vraies sauvegardes, faciles, une dizaine, mineures et majeures »)** :
  `classeur_merge_history` n'est plus l'historique des seules fusions mais
  la table des points de restauration, typés par `kind`
  (`supabase/classeur_points_restauration_2026-09-26.sql`, JOUÉ ; autorité
  `classeur_2026-09-25.sql` à jour). Un point = l'export JSON v2 complet
  (~43 ko pour le Registre de Sécurité, colonne `taille` posée par trigger),
  restauré par `restaurerInstantane` (fusion en remplacement).
  - `auto` (mineur) : pris AVANT la première écriture d'une session, au plus
    un par quart d'heure et par classeur, par la garde `definirGardeEcriture`
    posée dans `service.ts` — TOUTE écriture du service l'appelle
    (`avantEcriture(ref)`), quel que soit l'écran ; résolution
    élément → chapitre → classeur mémorisée ; jamais bloquante
    (`console.warn`). Suspendue par `sansPointsAuto` pendant une fusion ou
    une restauration (`pointsAutoGarde.ts`, compteur : réentrant).
  - `manuel` (majeur) : nommé par l'utilisateur dans le dialogue ; toujours
    écrit. `fusion` et `securite` (majeurs) : inchangés, typés.
  - Quotas `QUOTAS = {auto: 10, majeur: 10}` (`entreesAElaguerParGenre`) ;
    à quota majeur atteint, les `securite` partent avant les jalons. La RLS
    delete autorise le rang `ecriture` sur les SEULS points `auto` (sinon
    l'historique d'un compte écriture grandirait sans borne) ; un 42501
    arrête l'élagage sans erreur.
  - Dédoublonnage : un point non manuel n'est pas écrit s'il est égal au
    DERNIER point, tous genres confondus (`instantaneEgal`, `updated_at`
    ignorés). Leçon du contrôle navigateur : comparer au dernier point du
    même genre laissait passer un auto identique au manuel pris 40 s avant.
  - Choix assumé « avant la session » plutôt qu'« après chaque écriture » :
    l'état d'arrivée est l'état courant, figé par le prochain point ; un
    point par frappe coûterait un instantané complet à chaque sauvegarde.
  - ⚠ `SOURCE_SAUVEGARDE` vit dans `merge/history.ts` (seul). Le simulateur
    de `audit.property.test.ts` porte `kind`/`label`/`taille`.
- **Menu contextuel des chapitres + suppression avec sauvegarde
  (2026-09-28, demande utilisateur)** : clic droit sur un chapitre de la
  colonne (`ChapterSidebar`, droit d'écriture seulement — sinon le menu du
  navigateur reste) → Modifier (`ChapterDialog`, celui de la barre de la
  page chapitre) / Supprimer. `dialogs/SuppressionChapitreDialog.tsx` sert
  AUSSI au bouton de la barre (l'ancien `ConfirmDialog` est retiré) :
  point de restauration `manuel` « Avant suppression du chapitre « … » »
  coché par défaut et pris AVANT `softDeleteChapter` — s'il échoue, rien
  n'est supprimé (testé) ; copie ZIP Markdown téléchargeable à la demande ;
  avertissement si la sauvegarde est décochée. Supprimer depuis la colonne
  le chapitre ouvert ramène à l'accueil du classeur.
- **Tactile / téléphone / tablette (audit par 3 agents, 2026-09-28 ;
  signalement utilisateur : « en faisant défiler un chapitre au doigt,
  j'attrape un document »)**. Cause : un seul `PointerSensor` à 5 px (il
  capte AUSSI le doigt) + `touch-none` sur les cartes ENTIÈRES. Désormais
  `dnd/useCapteursClasseur.ts` : `MouseSensor` 5 px + `TouchSensor` appui
  long 250 ms / tolérance 8 px + clavier, partagé par `DndProvider` et
  `ClasseurList` ; cartes en `CLASSES_CARTE_GLISSABLE` (touch-manipulation,
  pas de loupe iOS) ; ⚠ un bouton DANS une carte glissable arrête
  `onMouseDown`/`onTouchStart` (`neDemarrePasDeGlisser`), plus
  `onPointerDown` que ces capteurs n'écoutent pas ; `touch-none` gardé sur
  la seule poignée des chapitres (qui arrête `pointerdown` pour ne pas
  ouvrir le menu contextuel Radix, appui long 700 ms). Tailwind v4 met
  `hover:` sous `@media (hover: hover)` : les actions `opacity-0
  group-hover:` étaient INVISIBLES mais CLIQUABLES au doigt →
  `pointer-coarse:opacity-100` partout (cartes, liste, poignée, case de
  sélection agrandie). Voies au doigt ajoutées : bouton « Sélectionner »
  (`useSelection.commencer`, mode ouvert sans élément coché ; Échap ne vide
  pas la sélection si un menu/dialogue est ouvert), « Déplacer vers… »
  (menu des autres chapitres, seule voie sous 1024 px où la colonne est un
  tiroir), « Importer des fichiers .md/.txt » (`useDropZone().importer`),
  « Supprimer le classeur » dans la barre de l'accueil (gestion), boutons
  Décaler/Ramener (sous-listes) au doigt (légendes souris / doigt sous la
  grille d'un chapitre RETIRÉES le 2026-09-30, demande utilisateur : « c'est
  de trop »), « Privé »/« Lecture » en texte au doigt. Écran : éditeur
  en deux colonnes à partir de `xl` (1280) seulement, bouton de l'aperçu à
  toute largeur ; aperçu d'impression `items-center-safe` (page plus large
  que l'écran atteignable) ; préparation d'image et 10 dialogues bornés en
  `dvh` avec défilement ; cartes d'action sur 2 lignes sous `sm` ;
  squelettes sans débordement ; tiroir `w-[85vw] max-w-80`. Rien de ce qui
  S'IMPRIME n'a changé. Garde-fou : `useCapteursClasseur.test.tsx`.
  En-têtes (même jour, « boutons à droite, bien en responsive ») :
  `actionsAlign="end"` sur les `PageHeader` du chapitre et des détails
  (le repli par défaut écartait les groupes aux deux bords sous 640 px au
  doigt, un groupe tombait à GAUCHE) ; accueil d'un classeur : recherche à
  gauche + boutons (Modifier, Accès, Supprimer) à droite sur UNE ligne,
  plus de boutons dans l'en-tête ; sous 640 px, chapitre = créer +
  sélectionner + menu « ⋯ » (le reste), document en édition = Sauvegarder
  en icône, « Non enregistré » en point, flèche Retour masquée — avant, à
  la souris (une seule ligne imposée par `PageHeader`), « Nouvel élément »
  et le tiroir sortaient de l'écran par la gauche. Mesuré à 309 px : tout
  entre 16 et 293 px.
  Bouton du tiroir des chapitres (même jour) : sur la LIGNE DU TITRE à
  toute largeur (`PageHeader` range `leading` avec le bloc titre dans une
  rangée `items-stretch` ; seules les pages du Classeur passent `leading`,
  rendu inchangé ailleurs), en `outline`, 48 px de large, aussi haut que
  titre + sous-titre (`self-stretch`).
  Page d'un chapitre (même jour) : comme l'accueil, recherche à gauche et
  boutons à droite sur UNE ligne (plus d'actions dans le `PageHeader`) ;
  sous 640 px en mode sélection, le compteur est retiré de l'écran
  (`max-sm:sr-only`, toujours annoncé aux lecteurs d'écran).
  Non fait (à rediscuter) : `PageHeader` partagé (tiroir sur sa propre
  ligne sous `sm`), zoom de grille au doigt, croix des dialogues, pages A4
  petites sur téléphone (pincement du navigateur), clavier virtuel.
- **Audit de sécurité du 2026-09-28** (agent catalogue + agent code + tests
  d'attaque en transaction annulée) : aucune faille critique. Base :
  `supabase/classeur_securite_2026-09-28.sql` (autorité §9, APRÈS §8) —
  `id` en `generated always` (un `id` choisi reprenait un classeur supprimé
  physiquement et ses fichiers), horodatages bornés à now()+5 min, création
  hors gestion forcée non supprimée et en fin de liste, CHECK chemin d'image
  ↔ `classeur_id`, versions qui suivent un document ou un chapitre déplacé,
  `search_path` vide ; ⚠ `classeur_images_table`, `classeur_points_restauration`
  et `classeur_proprietaire` (2026-09-26) portent « NE PLUS REJOUER » :
  chacun rouvrirait l'accès, et `verif_classeur_acces.sql` (33 contrôles)
  échoue désormais s'ils ont été rejoués. Client : `messageErreur` ne montre
  plus JAMAIS le message brut d'une erreur de la base (tables, contraintes),
  image Markdown externe remplacée par un encart (la CSP la bloquait déjà),
  SVG Mermaid assaini par DOMPurify (chargé à la demande, `foreignObject`
  gardé, vérifié identique au brut dans Chrome), `getIcon` par `Object.hasOwn`.
  Écartés sciemment : iframe d'impression non « sandboxée » (même origine,
  contenu déjà rendu dans la page, risque de casser l'impression), brouillons
  gardés à la déconnexion (c'est leur raison d'être, clé par compte).
  Questions de conception laissées ouvertes : un classeur supprimé
  doucement reste lisible et modifiable par ses ayants droit (seule
  l'interface le masque) ; déplacer un chapitre vers son propre classeur
  en garde l'écriture après un retrait de droits.
- **Squelettes** : variante `classeur` de `RouteSkeleton`, forme choisie par
  `paramsClasseur(pathname)` (liste, tableau de bord, chapitre, détail) ;
  silhouettes `FormeClasseurListe`, `FormeClasseurDashboard`, `FormeChapitre`,
  `FormeDetail` dans `PageShapes.tsx`, relevées sur le DOM des boards, qui y
  DÉLÈGUENT (le chapitre transmet son `gridStyle` de zoom).
- **UI alignée le 2026-09-25 soir** sur la grammaire des autres pages
  (retour utilisateur « les boutons n'ont pas le style des autres pages ») :
  `PageHeader` + `ButtonGroup` de boutons icône outline avec `Tip`
  (`IconAction`), création en outline sm avec `Plus` + libellé, aucun bouton
  plein dans un en-tête, états vides en carte compacte, tiroir des chapitres
  ouvert depuis le `leading` du PageHeader sous `lg` et nom du classeur en
  sous-titre de Navbar (`useNavbarSubtitle`), pages A4 encadrées `bg-card`.

## Audit complet du 2026-09-28 (relecture de code, 6 zones)

Six relectures en parallèle (auth, RepJour, PDJ/Parking/Literie,
Rapro/Caisse/Facturation, socle, scripts SQL), SANS accès à la base, puis
correctifs par zone avec tests vérifiés par mutation. ~35 commits, rien
poussé. Règles qui en sortent :

- **`<>` sur un rôle ou un niveau laisse passer NULL — PARTOUT, pas
  seulement en facturation.** `admin_update_password` (`<> 'admin'` :
  appelant SANS profil accepté, prise de contrôle des comptes non admin par
  un compte révoqué au jeton encore valide) et `set_user_grade`
  (`p_grade not in (…)` : grade NULL, garde « dernier admin » sautée).
  Scripts `admin_update_password_garde_null_2026-09-28.sql` et
  `set_user_grade_garde_null_2026-09-28.sql`, autorité
  `private_rpc_relais.sql` alignée. `verif_advisor.sql` compte désormais les
  gardes `<>`/`!=` sur 'gestion'/'admin' (attendu 0).
- **supabase-js ne lève JAMAIS : lire `{ error }`, et un `update`/`delete`
  refusé par la RLS rend 0 ligne SANS erreur.** Trouvé à nouveau sur :
  ban de `delete-user` (`.catch` inopérant, « banni » annoncé à tort ;
  désormais ban AVANT le retrait du profil), annulation de création de
  compte, Parking, Lits bébé, Literie, Affichage, RepJour (données),
  saisies manuelles PDJ. Règle : `.select('id')` + erreur si 0 ligne, et
  retour arrière visible à l'écran.
- **`signOut()` n'efface pas la session si le renouvellement du jeton
  échoue** (auth-js `_signOut` rend `sessionError` avant `_removeSession`) :
  poste partagé reconnecté tout seul après une panne. `effacerSessionLocale`
  (`lib/auth/sessionLocale.ts`) + `changerDeCompte(null)` explicite.
- **Une garde qui ne distingue pas « erreur » de « rien » ment** :
  `PageGuard`/`ProtectedRoute` affichaient « Aucune page accessible » /
  « Aucun rôle » après une simple erreur de lecture → `AccessReadErrorNotice`
  (Réessayer). `ROLE_HOME` retiré : l'accueil vient de `homePage` partout.
- **La purge RGPD des noms PDJ ne doit pas dépendre d'une visite** : elle est
  aussi jouée par l'import In-House nocturne (`import-report/pdj.ts`,
  `purgerNomsAnciens`, clé serveur).
- **Un script « rejouable » doit l'être AUJOURD'HUI.** ~25 fichiers SQL
  portent désormais « REMPLACÉ — NE PLUS REJOUER » ou une note d'ordre ;
  `private_rpc_relais.sql` (section 2) doit être suivi de
  `facturation_garde_null_2026-09-05.sql` puis des deux scripts du
  2026-09-28 ; la section (4) de `private_schema_aides.sql` ne se rejoue
  JAMAIS. Les `verif_securite*.sql` ne plantent plus sur `email_recipients`.
- Feuilles clôturées (caisse, rapprochement) figées EN BASE par
  `feuilles_cloturees_figees_2026-09-28.sql` (compatible avec la clôture et
  la réouverture, lire son en-tête) ; fenêtre caisse sur la date CALENDAIRE
  (`caisseWindowToday`).
- **Contre-revue adverse des correctifs (même soir)** — ils avaient
  eux-mêmes introduit des régressions, d'où la règle : toute vague de
  correctifs passe par une relecture adverse avant d'être poussée.
  Trouvés et corrigés : /rapro pouvait CLÔTURER un jour dont la grille
  n'avait pas été lue (la garde `isPending` laissait afficher une grille
  vide ; la matérialisation écrasait les statuts réels) → clôture et
  réouverture exigent `isSuccess` du jour (`lib/rapro/editability.ts`) ;
  le rechargement sur chunk perdu ne part que pendant une VRAIE navigation
  et en ligne (`doitRechargerSurChunkPerdu`), jamais au survol ni en pleine
  saisie ; une suppression déjà faite par un collègue (0 ligne) ne fait
  plus réapparaître l'élément (relecture de l'id) ; la relance au retour du
  backend est bornée (erreurs seules, une salve / 30 s) et `AuthContext`
  relit les droits au retour.
- ⚠ **postgrest-js masque la nature des pannes** : une exception de `fetch`
  devient `{ message: "<Nom>: …", code: '' }`, SANS `status` ni `name`.
  `isOutageError` reconnaît donc aussi les préfixes `AbortError:`,
  `TimeoutError:`, `BackendIndisponible:` — avant, le délai de 20 s et le
  refus du disjoncteur passaient pour des erreurs MÉTIER.
- Resend : seul un 409 `concurrent_idempotent_requests` est ambigu (même
  clé en cours) ; les autres 409 restent un échec visible (un doublon vaut
  mieux qu'une journée marquée envoyée sans e-mail).
- Vérifié en prod (lecture seule) : `verif_advisor.sql` n'a qu'un KO, la
  garde `<> 'admin'` de `private.admin_update_password` (donc bien en
  production) ; 0 compte sans profil aujourd'hui (faille non exploitable à
  l'instant, elle le redevient à chaque suppression de compte) ;
  `verif_securite.sql` OK ; `verif_classeur_acces.sql` 28/33 en attendant
  `classeur_securite`.
- ✅ **Les 7 scripts ci-dessous ont été JOUÉS en prod le 2026-09-29 vers 9 h**
  (par l'assistant, à la demande explicite de l'utilisateur) : `verif_advisor`
  12/12 « TOUT EST EN PLACE », `verif_classeur_acces` 33/33, attaque
  `admin_update_password` sans profil refusée. Diagnostic des privilèges
  par défaut relu avant application (défaut Supabase standard confirmé).
- Scripts (historique : écrits le 2026-09-28, application = utilisateur) :
  `classeur_securite_2026-09-28.sql`, `admin_update_password_garde_null`,
  `set_user_grade_garde_null`, `pdj_delete_manuel_ecriture`,
  `feuilles_cloturees_figees`, `affiche_templates_icon_check`,
  `default_privileges_fonctions` (lire son diagnostic (0) avant). Edge
  Functions à redéployer : `import-report` (`--no-verify-jwt`),
  `send-report`, `delete-user`.
- Laissés à l'utilisateur (décisions) : contrôle SPF/DKIM du Worker trop
  permissif (tout `dkim=pass`, même d'un autre domaine, est accepté —
  durcir sans en-têtes RÉELS observés a déjà bloqué l'import le 07/09) ;
  rejet permanent du Worker sur un 5xx transitoire ; projeté `pm_*` recalculé
  quand le Forecast arrive après le Comparison ; PDJ « inclus » manuels face
  à l'Addon ; cautions sans borne de date en base ; commentaire de la feuille
  de caisse persisté sur disque (choix documenté par `queryPersist.test.ts`) ;
  `signOut` global (déconnecte TOUS les postes du compte Réception partagé).

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
  utilisateur|admin, CHECK `user_page_permissions.page` = les clés de
  `lib/permissions/pages.ts` (9 depuis `classeur`, 2026-09-25 ; à étendre
  avec toute nouvelle page) ; cautions
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
