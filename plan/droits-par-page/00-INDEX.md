# Plan — Droits par page (grades + niveaux Lecture/Écriture/Gestion)

## Contexte

Aujourd'hui un compte porte **un seul rôle global** (`profiles.role` ∈ `utilisateur` / `super_utilisateur` / `admin`) qui vaut identiquement sur toute l'application : la navbar montre les 6 pages métier à tout le monde, et chaque board dérive localement `canEdit` (= super/admin) et `isAdmin` (= admin) à partir de ce rôle global. Il n'existe **aucune notion de droit par page**, ni dans le code, ni dans la base.

L'objectif est de passer à une **granularité par page**. Deux grades de compte subsistent — **`admin`** (super-administrateur : accès total partout, seul à administrer les comptes et à distribuer les droits) et **`utilisateur`** (n'accède qu'à ce qu'on lui ouvre). Pour chaque utilisateur, l'administrateur ouvre page par page, depuis `/comptes`, un **niveau** parmi **Lecture** (consultation seule), **Écriture** (saisie / import) et **Gestion** (actions sensibles : suppression, clôture/réouverture, gestion des destinataires). Ces trois niveaux reprennent **exactement** la sémantique déjà implémentée (`utilisateur` → `super_utilisateur` → `admin`), déclinée par page au lieu d'être globale. Un utilisateur **ne voit que les pages qu'on lui a ouvertes** (masquées ailleurs dans la navbar) et **ne peut y agir que selon son niveau**.

**Contrainte de sécurité posée par l'utilisateur (décision S) : la granularité doit être ÉTANCHE, pas cosmétique.** La clé anon Supabase est publique : masquer un onglet ou griser un bouton n'empêche pas une écriture via l'API. La barrière réelle est la **RLS**. Le chantier applique donc les droits par page **aussi en base** (nouvelle table de permissions + fonction `get_page_level` + réécriture des règles RLS des tables métier), pas seulement dans l'interface.

**Base de production DÉDIÉE à cette app.** Le partage avec `repjour` a pris fin : écritures et migrations sont désormais légitimes. Le SQL reste **exécuté par l'utilisateur** dans Supabase → SQL Editor (l'assistant produit les scripts). Toute opération destructrice (`DROP`, `ALTER TYPE`, réécriture de données) demande une confirmation explicite. **L'approche retenue est purement ADDITIVE** : on conserve `profiles.role` intact (aucune migration d'enum), on ajoute une table + une fonction + on durcit les règles des tables propres à l'app — ce qui neutralise tout risque de casse même si un tiers lisait encore `profiles`.

## Angles à clarifier

- **D-migration — sort des comptes existants (tranché).** Les comptes `admin` restent grade `admin`. Tous les `super_utilisateur` et `utilisateur` deviennent grade `utilisateur` **sans aucune permission par défaut** (table rase) ; l'administrateur ré-ouvre ensuite chaque page depuis `/comptes`. **Conséquence opérationnelle à anticiper** : au go-live les non-admins perdent l'accès tant que les droits ne sont pas ré-attribués → prévoir une phase de pré-remplissage AVANT bascule (voir Étape 8). Étapes 1, 7, 8.
- **D-grade `super_utilisateur` (recommandée).** L'enum `profiles.role` n'est **pas** modifié (3 valeurs conservées, pas d'`ALTER TYPE` risqué). La valeur `super_utilisateur` devient simplement **legacy, non attribuable dans l'UI** ; un backfill `UPDATE profiles SET role='utilisateur' WHERE role='super_utilisateur'` (mise à jour ciblée, à confirmer) vide la valeur en usage. Étapes 1, 7.
- **D-mapping page ↔ tables (à confirmer).** Le durcissement RLS repose sur un mapping page → tables. Cas nets : `caisse`→`caisse_sheets` ; `rapro`→`rapro_sheets`+`rapro_rooms` ; `pdj`→`pdj_breakfasts` ; `parking`→`parking_reservations` ; `affichage`→`affiche_templates` ; `facturation`→toutes les `facturation_*` (via RPC). **À trancher** : (a) `pms_daily_metrics` (import Comparison) — rattachée à `repjour` ou à `pdj` ? proposé : `repjour` ; (b) `daily_reports`/`forecast_days` — page `repjour` ; (c) `budget` est édité dans `/gestion` (hors navbar) → reste gouverné par le **grade**, pas par la page. Étape 2.
- **D-page `artefact` (recommandée).** Artefact est une maquette (iframe), sans table propre → gating **UI seul** (`canView`), aucune RLS à écrire. Étapes 3, 5.
- **D-fonctions transverses.** `/comptes` reste grade-admin ; `/profil` reste ouvert à tous (chacun son compte) ; `/gestion` (gestion budgétaire, hors navbar) reste gouverné par le grade (lecture pour tous, édition admin — comportement actuel conservé). Étape 5.
- **D-redirection d'accueil.** `ROLE_HOME` renvoyait tout le monde vers `/repjour` ; un utilisateur peut désormais ne PAS avoir `repjour`. L'accueil devient « **première page accordée** » ; un utilisateur sans aucune page voit un écran « aucun accès, contacte un administrateur ». Étape 5.

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-socle-sql-permissions.md](./1-socle-sql-permissions.md) | Table `user_page_permissions` + fonction `get_page_level` + RPC d'attribution (admin) + backfill grades | — | P0 | 2h | Scripts SQL exécutés par l'utilisateur, RLS étanche sur la table elle-même | ⚠ |
| 2 | [2-durcissement-rls-tables.md](./2-durcissement-rls-tables.md) | Réécriture des policies write des tables métier (~14) + gardes des RPC facturation sur `get_page_level` | 1 | P0 | 3h | Scripts SQL idempotents, écriture réellement bornée par page/niveau | ⚠ |
| 3 | [3-modele-client-registre-pages.md](./3-modele-client-registre-pages.md) | Types (`PageKey`, `PageLevel`, `Grade`) + registre central des pages + helpers `canView`/`levelOf`/`atLeast` (métier pur) | — | P0 | 1h30 | `src/lib/permissions/` typé, `tsc` vert | |
| 4 | [4-authcontext-permissions.md](./4-authcontext-permissions.md) | `AuthContext` charge et expose la carte de permissions (cache localStorage, non bloquant) | 3 | P0 | 2h | `useAuth()` expose `permissions` + helpers, auth non bloquante préservée | ⚠ |
| 5 | [5-gardes-navigation.md](./5-gardes-navigation.md) | `PageGuard` (page + niveau requis) sur toutes les routes, Navbar filtrée, redirection d'accueil, UserMenu | 3, 4 | P0 | 2h | Pages masquées + inaccessibles par URL selon les droits | |
| 6 | [6-boards-niveau-par-page.md](./6-boards-niveau-par-page.md) | Brancher toutes les actions des boards + services sur le niveau de la page courante | 3, 4 | P1 | 3h | 8 boards + 2 services migrés de `role===` vers `atLeast(page, …)` | ⚠ |
| 7 | [7-admin-comptes-matrice.md](./7-admin-comptes-matrice.md) | `ComptesBoard` : sélecteur de grade + matrice pages × niveau, câblée sur les RPC | 1, 3, 4 | P1 | 2h30 | Attribution des droits par page opérationnelle depuis `/comptes` | |
| 8 | [8-validation-golive.md](./8-validation-golive.md) | Validation étanchéité (client + base), pré-remplissage des droits, bascule | 1-7 | P0 | 1h30 | `tsc` + `build` verts, RLS vérifiée, droits ré-attribués avant go-live | ⚠ |

## Ordre d'exécution

Séquentiel avec deux fronts parallélisables après le socle.

- **Sprint DB (séquentiel strict)** : Étape 1 (socle : table + fonction + RPC) puis Étape 2 (durcissement RLS). L'étape 2 dépend de `get_page_level` créée en 1. Ces deux étapes sont du **SQL exécuté par l'utilisateur** ; l'assistant produit les scripts, ne joue rien contre la base.
- **Sprint client (parallélisable une fois l'Étape 3 posée)** : Étape 3 (modèle/métier pur) d'abord ; ensuite Étape 4 (auth), puis en parallèle Étape 5 (gardes/navigation) et Étape 6 (boards) qui dépendent toutes deux de 3+4. Étape 7 (écran d'admin) requiert le socle DB (1) ET le modèle client (3, 4).
- **Étape 8 en dernier** : validation d'étanchéité de bout en bout + pré-remplissage des droits + bascule. C'est le seul jalon où l'on vérifie que la RLS bloque réellement une écriture non autorisée (test adversarial, pas seulement l'UI).

Jalon de sécurité : tant que l'Étape 2 n'est pas exécutée, la granularité reste **cosmétique** (UI seule) — ne pas considérer le chantier « sûr » avant la validation de l'Étape 8.

## Architecture cible

```
supabase/
├── user_page_permissions.sql   ← table (user_id, page, level) + RLS self-read / admin-write   [nouveau]
├── page_permissions_fn.sql      ← get_page_level(page) + page_level_rank(text) + is_admin()      [nouveau]
├── page_permissions_rpc.sql     ← set_page_permission / remove_page_permission / set_grade (admin) [nouveau]
├── backfill_grades.sql          ← super_utilisateur → utilisateur (ciblé, confirmé)              [nouveau]
├── caisse_sheets.sql            ← policies write → get_page_level('caisse') (grâce 24 h conservée) [modifié]
├── rapro_sheets.sql / rapro_rooms.sql                                                            [modifié]
├── pdj_breakfasts.sql / pms_daily_metrics.sql / parking_realtime.sql / affiche_templates.sql     [modifié]
└── facturation_*.sql            ← gardes RPC → get_page_level('facturation')                     [modifié]
src/lib/permissions/
├── pages.ts                     ← registre PAGES (key, label, route, icon, tables)               [nouveau]
├── levels.ts                    ← PageLevel, rank, atLeast, GRADES                                [nouveau]
└── index.ts                     ← barrel                                                          [nouveau]
src/components/
├── auth/AuthContext.tsx         ← charge/expose permissions (cache, non bloquant)                [modifié]
├── auth/PageGuard.tsx           ← garde (page + niveau requis) ← remplace ProtectedRoute         [nouveau]
├── Navbar.tsx / UserMenu.tsx    ← items filtrés par canView / grade                              [modifié]
└── repjour/boards/ComptesBoard.tsx ← grade + matrice pages × niveau                              [modifié]
src/components/{parking,pdj,rapro,caisse,affiche,repjour}/…Board.tsx  ← atLeast(page, niveau)      [modifié]
```

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|-------------------|-------------------|
| DB / Supabase (exécuté par l'utilisateur) | `supabase/{caisse_sheets,rapro_sheets,rapro_rooms,pdj_breakfasts,pms_daily_metrics,parking_realtime,affiche_templates,facturation_*}.sql` | `supabase/{user_page_permissions,page_permissions_fn,page_permissions_rpc,backfill_grades}.sql` |
| Métier pur | `src/lib/repjour/{types,roles}.ts`, `src/lib/repjour/services/data.ts`, `src/lib/caisse/service.ts` | `src/lib/permissions/{pages,levels,index}.ts` |
| Auth / gardes | `src/components/auth/AuthContext.tsx`, `src/components/repjour/ProtectedRoute.tsx` | `src/components/auth/PageGuard.tsx` |
| Navigation | `src/components/{Navbar,UserMenu}.tsx`, routes `src/routes/{pdj,parking,rapro,caisse,affichage,…}` | — |
| Boards | `src/components/{parking/ParkingBoard,pdj/BreakfastBoard,rapro/RaproBoard,caisse/CaisseBoard,affiche/AffichageBoard}.tsx` + `repjour/boards/{DashboardBoard,GestionBoard,ComptesBoard}.tsx` + `repjour/ImportSection.tsx` | — |
| **Total** | **~25 modifiés** | **~9 nouveaux** |
