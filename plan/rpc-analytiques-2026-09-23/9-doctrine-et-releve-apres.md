# Étape 7 — Doctrine à jour et relevé d'après

## Objectif

Prouver le gain par une mesure comparable au relevé d'avant, et remettre
`CLAUDE.md` d'accord avec le code — y compris sur les points où il est déjà
périmé.

## Contexte

Le projet s'est fait mordre deux fois par de la documentation périmée : un
fichier SQL rejoué qui rouvrait des policies, et une consigne « ne pas migrer
sous `useQuery` » qui était elle-même la cause de la lenteur. Une doctrine
fausse coûte plus cher qu'une doctrine absente.

Trois affirmations sont **déjà fausses** avant même ce chantier :

1. `CLAUDE.md:140-142` décrit `DashboardBoard` comme faisant « **4 lectures
   parallèles** ». Depuis `e83e354`, il en fait **une**.
2. `AnalytiqueMoisBoard.tsx:201-204` affirme que `['repjour','available-dates']`
   est partagée avec le tableau de bord. Faux depuis `e83e354` : le dashboard
   obtient `datesDisponibles` dans sa RPC.
3. `DayCrossSummary.tsx` parle de « douze lectures » là où il y en a dix.

## Fichier(s) impacté(s)

- `plan/rpc-analytiques-2026-09-23/releve-apres.md` (nouveau)
- `CLAUDE.md` (modifié : section Performance / chargement)
- `src/components/repjour/boards/AnalytiqueMoisBoard.tsx` (modifié : commentaire)
- `src/components/repjour/DayCrossSummary.tsx` (modifié : commentaire)
- Anciens fichiers SQL remplacés (modifiés : en-tête « NE PLUS REJOUER »)

## Travail à réaliser

### 1. Relevé d'après — même protocole, exactement

Rejouer le protocole de l'étape 1 : **mêmes cinq pages, trois chargements
espacés d'au moins 60 s, médiane**. Un protocole différent invaliderait la
comparaison.

Présenter en regard du relevé d'avant, page par page :

| page | requêtes avant → après | pic de concurrence | dernière donnée utile | cascade |
|---|---|---|---|---|

⚠ **Ne pas retenir le meilleur tir.** La médiane, et l'écart min/max affiché à
côté. C'est la discipline qui a manqué plusieurs fois dans ce chantier : en
rechargeant en boucle, on mesure une base chaude et on annonce un gain que
l'utilisateur ne verra jamais.

### 2. Relevé côté base

`pg_stat_statements` remis à zéro au début de l'étape 1, relu ici : les requêtes
supprimées doivent avoir un compteur à **zéro**, pas seulement un compteur plus
bas. Un compteur non nul signifie qu'un appelant a été oublié.

### 3. Corriger la doctrine

Dans `CLAUDE.md`, section Performance / chargement :

- remplacer « `DashboardBoard` : 4 lectures parallèles » par la description
  réelle (une RPC, `repjour_dashboard`) ;
- ajouter la règle née de ce chantier : **une page = une lecture quand les
  données ne dépendent que de ses paramètres de route** ; les clés partagées
  entre plusieurs écrans restent séparées (leçon D4) ;
- ajouter, si D6 option A est retenue : **`to_jsonb(row)` est interdit dès
  qu'une RPC touche une table à PII** — construire le `jsonb_build_object`
  colonne par colonne. Préciser que `repjour_dashboard` l'emploie légitimement
  parce que `daily_reports` ne porte pas de PII nominative ;
- ajouter, si D7 option A est retenue : **toute RPC de consolidation
  s'accompagne d'un `verif_*.sql` rejouable** ;
- rappeler que le **préchauffage** (Worker Cloudflare, `1f64e2c`) est ce qui
  rend les mesures reproductibles : sans lui, tout relevé oscille d'un facteur 4.

### 4. Corriger les commentaires devenus faux

Les trois cités en contexte. Un commentaire faux est pire qu'absent : il fait
prendre une décision sur une information erronée.

### 5. Marquer les fichiers SQL remplacés

Tout fichier `supabase/*.sql` dont les objets sont remplacés reçoit en tête
« **REMPLACÉ — NE PLUS REJOUER** », avec la date et le nom du fichier
successeur. Le projet s'est fait mordre deux fois par un fichier rejoué.

### 6. Mémoire de session

Écrire ou mettre à jour la mémoire correspondante, en y consignant ce qui a
été **démenti par la mesure** autant que ce qui a été gagné. Les erreurs de ce
chantier — conclure avant de mesurer, lire un 401 comme une donnée, mesurer une
base chaude et annoncer un gain — valent plus cher que ses succès.

## Ordre d'exécution

1. Relevé d'après (points 1 et 2).
2. Si un gain n'est pas au rendez-vous, **le dire** et chercher pourquoi avant
   d'écrire quoi que ce soit dans la doctrine.
3. Corriger `CLAUDE.md` et les commentaires (points 3 et 4).
4. Marquer les fichiers SQL remplacés (point 5).
5. Mémoire (point 6).

## Critère de validation

- `releve-apres.md` existe, suit le même protocole que `releve-avant.md`, et
  affiche médiane **et** écart min/max pour chaque page.
- Les compteurs `pg_stat_statements` des requêtes supprimées sont à **zéro**.
- `CLAUDE.md` ne contient plus aucune des trois affirmations fausses listées en
  contexte.
- Aucun fichier SQL remplacé ne reste sans son en-tête « NE PLUS REJOUER ».
- Un gain non obtenu est écrit comme tel, avec son hypothèse d'explication.

## Contrôle qualité (revue)

Dernière étape du chantier, donc critique par convention. `/borg` n'étant pas
installé, revue manuelle globale : (1) relire les sept étapes et confirmer que
chaque critère de validation a été atteint **ou** explicitement classé sans
objet avec sa raison mesurée ; (2) vérifier par requête sur `pg_proc` que toutes
les fonctions créées sont `security invoker`, `search_path` figé, fermées à
`anon` ; (3) rejouer `supabase/verif_complet.sql` et `verif_advisor.sql` pour
confirmer qu'aucune régression de sécurité n'a été introduite ; (4) confirmer
que les fonctions TypeScript conservées pour leurs appelants hors react-query
(`fetchBudgetYears`, `fetchYearBudget`, `fetchUnifiedDays`,
`fetchAllAddonProduction`, `fetchSheets`) sont toujours exportées et appelées ;
(5) vérifier que le compte de tests n'a pas **baissé**.
