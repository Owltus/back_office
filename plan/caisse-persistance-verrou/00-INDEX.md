# Plan — Caisse : feuille de caisse persistée en SQL + verrou de validation

## Contexte

L'onglet **Caisse** (`src/routes/caisse.tsx`, aujourd'hui un simple `ComingSoon`) doit devenir la version numérique de la **feuille de caisse OKKO** réalisée à chaque fin de shift (voir `doc/NACV - CAISSE.pdf` et `doc/FEUILLE DE CAISSE 2025.pdf`). Une feuille = un couple **date + shift** (`ma` matin, `so` soir, `nu` nuit) rempli par un hôtelier (initiales, ex. `cbs/ma`). Elle confronte les montants **attendus** — issus de StayNTouch (réception) et de Lightspeed (club) — aux montants **réels comptés** dans la CAISSE, calcule les **écarts par mode de paiement** (CASH, CB sauf AX, AX, CHEQ, CVAC, et CB WEB / ADYEN le soir uniquement) qui doivent **tous être à 0 €**, détaille le **comptage du fond de caisse** (coupures de 500 € à 0,01 €, total attendu **150 €**), porte une zone **commentaires** pour justifier un écart, et se **signe + contre-signe**.

Le besoin ajouté par rapport au papier : **persister** ces feuilles en SQL (historique d'exploitation) et introduire une notion de **caisse validée = verrouillée** en écriture, avec **deux exceptions** : (a) une **fenêtre de grâce de quelques heures** après validation pendant laquelle l'auteur peut encore corriger, et (b) les **administrateurs**, qui peuvent toujours éditer / déverrouiller.

Contrainte critique : backend Supabase **partagé**, tables existantes en **LECTURE SEULE**. Ce chantier crée une **nouvelle table applicative** (`caisse_sheets`), indépendante, dont le script SQL est **exécuté par l'utilisateur** dans Supabase → SQL Editor (jamais par l'assistant). Pattern déjà éprouvé trois fois : `parking_reservations`, `affiche_templates`, `pdj_breakfasts`. Le verrou s'appuie sur la RPC `get_user_role()` (déjà déployée) et sur une policy RLS `UPDATE` à condition temporelle — nouveauté sans précédent dans le repo, mais faisable avec `now()` + `interval`.

## Angles à clarifier

Décisions actées (2026-07-06) : **D1 = fenêtre de grâce de 3 h** · **D3 = TanStack Query (façon PDJ)** · D2 = `/caisse` seule · D4 = 15 colonnes dédiées · D5 = contre-signature modélisée · D8 = RLS seule (pas d'Edge Function). Les options ci-dessous restent documentées pour référence.

Décisions ouvertes (les rapports d'exploration ne se contredisent pas frontalement ; ce sont des choix à trancher). Recommandations marquées. À acter avant l'Étape 1 pour D1, D2, D3, D4 (elles conditionnent schéma et découpage).

- **D1 — Durée de la fenêtre de grâce après validation (structurant).** L'utilisateur dit « quelques heures ». **Option A (recommandée)** : **3 heures**, en dur dans la policy RLS (`now() < validated_at + interval '3 hours'`) et rappelée côté UI. Option B : autre durée (2 h / 4 h / fin de shift). Option C : durée configurable en base (`hotel_config` est en lecture seule → nécessiterait une table de config Caisse, surcoût non justifié maintenant). La valeur est un seul littéral à changer dans le script SQL + une constante UI.
- **D2 — Périmètre du chantier (structurant).** Deux routes placeholder coexistent : `/caisse` (icône `Banknote`) et `/rapro` (Rapprochement, `ArrowLeftRight`). **Option A (recommandée)** : livrer **`/caisse` seule** maintenant ; `/rapro` reste `ComingSoon` (feature sœur, plus tard). Option B : traiter les deux conjointement (chantier plus large, non demandé explicitement).
- **D3 — Stack de données de la feature (structurant).** Le projet est incohérent : RepJour fait du `useState`/`useEffect` manuel ; PDJ et Affichage (plus récents, plus proches du besoin) utilisent **TanStack Query**. **Option A (recommandée)** : suivre le modèle **PDJ / TanStack Query** (`useQuery` en lecture + appel service direct + `invalidateQueries` en écriture), malgré la formulation initiale « modèle RepJour ». Option B : `useState` manuel façon RepJour (moins adapté à une saisie persistée).
- **D4 — Modélisation du comptage des coupures (structurant, schéma).** **Option A (recommandée)** : **15 colonnes `smallint`** dédiées (`cnt_500 … cnt_001`) — typé, simple à requêter, aligné sur le style « une colonne par champ » du repo. Option B : une colonne `jsonb denominations` (souple mais peu typée). Le calcul du total fond de caisse est purement dérivé (Étape 2), non stocké.
- **D5 — Signature / contre-signature (métier).** La feuille papier porte « Signature » (auteur) et « Contre-signature » (contrôle). **Option A (recommandée)** : `validated_by uuid` = signataire (celui qui valide) ; `countersigned_by uuid` **nullable** = contre-signataire optionnel (second agent / admin), posé par une action « contre-signer » distincte. Option B : ignorer la contre-signature pour la V1 (colonne prévue mais UI plus tard).
- **D6 — Gating de l'onglet (mineur, acté par analogie).** Lecture pour **tous les rôles connectés** ; création / édition / validation réservées à **`super_utilisateur` + `admin`** (miroir PDJ / Parking / Affiche : RLS + `canEdit` UI). Pas de `ProtectedRoute` restrictif sur l'onglet. Suppression d'une feuille : **admin seul** (D7).
- **D7 — Suppression d'une feuille (mineur).** **Option A (recommandée)** : `DELETE` réservé à l'**admin** (une feuille de caisse validée est une pièce comptable). Option B : autoriser le super_utilisateur à supprimer un brouillon non validé.
- **D8 — Où réside l'enforcement du verrou (acté).** La **RLS seule** suffit : policy `UPDATE` conditionnée par rôle + `validated_at` + fenêtre. Pas d'Edge Function nécessaire (la validation et le déverrouillage admin sont de simples `UPDATE`). Une Edge Function `service_role` reste documentée comme durcissement optionnel (validation atomique, audit) mais **hors périmètre**.
- **D9 — Clé d'unicité de l'upsert (mineur).** `(report_date, shift)` — une feuille par shift et par jour. Hypothèse : un seul opérateur par shift (cohérent avec la feuille papier `Poste/Shift`).

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-sql-table-caisse-verrou.md](./1-sql-table-caisse-verrou.md) | SQL : table `caisse_sheets` + RLS à verrou temporel + trigger | — | P0 | 1h30 | Script `supabase/caisse_sheets.sql` exécuté par l'utilisateur | ⚠ |
| 2 | [2-metier-caisse-lib.md](./2-metier-caisse-lib.md) | Métier : `src/lib/caisse/` (types, constants, calc écarts/fond, service + mappers) | 1 | P0 | 2h | Calculs purs + service CRUD + `canEditSheet` | |
| 3 | [3-board-saisie-persistance.md](./3-board-saisie-persistance.md) | Frontend : route Caisse + `CaisseBoard` (saisie, écarts temps réel, useQuery/persistance) | 2 | P0 | 3h | Feuille de caisse saisissable et persistée par (date, shift) | |
| 4 | [4-validation-verrou-roles.md](./4-validation-verrou-roles.md) | Verrou : action Valider/Contre-signer, état verrouillé + fenêtre de grâce, gating rôle/admin | 3 | P0 | 2h | Verrou UI aligné sur la RLS, déverrouillage admin | ⚠ |
| 5 | [5-validation-globale.md](./5-validation-globale.md) | Validation (typecheck, build, matrice rôles, test RLS du verrou temporel) | 1,2,3,4 | P1 | 1h | Build vert + verrou vérifié en base | ⚠ |

## Ordre d'exécution

Séquentiel strict. Les décisions **D1, D2, D3, D4** doivent être actées avant l'Étape 1 (elles conditionnent le schéma et la stack). L'Étape 1 (SQL) est **exécutée par l'utilisateur** dans Supabase ; le code des étapes 2-3-4 s'écrit ensuite en s'appuyant sur le schéma figé. L'Étape 4 est marquée critique car elle matérialise la logique de verrou côté UI et doit rester **strictement cohérente avec la RLS** de l'Étape 1 (la RLS est l'autorité ; l'UI n'est qu'ergonomique). L'Étape 5 valide de bout en bout, notamment le comportement du verrou temporel (édition possible dans la fenêtre, refusée après, admin toujours autorisé).

## Architecture cible

```
src/
├── routes/
│   └── caisse.tsx              ← remplace ComingSoon par <CaisseBoard/>          [modifié]
├── lib/
│   └── caisse/
│       ├── types.ts            ← DbCaisseSheet, CaisseSheet, Shift, ColKey       [nouveau]
│       ├── constants.ts        ← DENOMINATIONS, FUND_TARGET=150, SHIFTS, GRACE   [nouveau]
│       ├── calc.ts             ← computeEcarts, fundTotal, fundEcart, isBalanced [nouveau]
│       └── service.ts          ← mappers, fetchSheets/fetchSheet, upsert,         [nouveau]
│                                  validateSheet, countersign, canEditSheet
├── components/caisse/
│   └── CaisseBoard.tsx         ← saisie + écarts temps réel + verrou + canEdit    [nouveau]
├── styles/
│   └── caisse.css              ← classes .caisse-* (grille, impression)           [nouveau]
├── styles.css                  ← + @import './styles/caisse.css'                  [modifié]
supabase/
└── caisse_sheets.sql           ← CREATE TABLE + RLS verrou + trigger              [nouveau]
```

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|-------------------|-------------------|
| DB / Supabase | — | `supabase/caisse_sheets.sql` |
| Métier | — | `src/lib/caisse/{types,constants,calc,service}.ts` |
| Frontend | `src/routes/caisse.tsx`, `src/styles.css` | `src/components/caisse/CaisseBoard.tsx`, `src/styles/caisse.css` |
| **Total** | **2 modifiés** | **7 nouveaux** |
