# Plan — PDJ : persistance jour par jour + RGPD (nettoyage des noms)

## Contexte

La page PDJ (petit-déjeuner) importe un CSV PMS « In-House Guests » et affiche, pour un jour donné, le tableau des clients par chambre (nom, statut, VIP, nb de couverts, PDJ inclus). Aujourd'hui tout vit dans un store mémoire (`src/lib/pdjStore.ts`) : rien n'est persisté, tout est perdu au rechargement, et il n'existe aucun suivi de consommation (les « cases à cocher » sont des repères d'impression, sans état).

L'objectif est de **sortir du volatile** : persister les données jour par jour dans Supabase pour conserver l'historique d'exploitation, tout en respectant le **RGPD** — les noms des clients ne sont conservés que le jour du service, puis effacés le lendemain. Les données **non personnelles et exploitables** (typologie chambre, nuitées, canal de distribution, plan tarifaire, PDJ inclus, etc.) sont conservées durablement pour de l'analytique future (l'utilisateur ne sait pas encore quels champs seront pertinents, donc on capture un ensemble raisonnable dès maintenant). L'import doit traiter la donnée selon la **date du fichier** (nom `_YYYYMMDD`), pas « aujourd'hui », et savoir ingérer d'anciens exports comme des récents (fichier de test fourni : `csv/In-House Guests _20260426012157.csv`, daté 2026-04-26).

Contrainte critique : backend Supabase **partagé**, tables existantes en LECTURE SEULE. Ce chantier crée une **nouvelle table applicative** (`pdj_breakfasts`) dont le script SQL est **exécuté par l'utilisateur**. Minimisation RGPD « by design » : les colonnes ultra-sensibles du CSV (`Res. Notes`/`Guest Notes` avec réfs CB, `Vehicle Reg. No.`, `Accompanying`, `Balance`, identifiants de résa) ne sont **jamais** persistées — filtrées dès le parsing.

## Angles à clarifier

Décisions actées (2026-07-05) : **D1 = purge app + job pg_cron nocturne** · **D2 = nom stocké seulement le jour même** · **D3 = ensemble riche** · **D4 = OUI, suivi de consommation digital** (cases « servi » persistées) · D5 = clé `(service_date, room)` · D6 = écriture super/admin. Conséquences : D4 ajoute des colonnes de consommation (`breakfasts_served`, `served`) au schéma (Étape 1) et une UI de saisie au board (Étape 3) ; D1 conserve le bloc `pg_cron` dans le script SQL (nécessite l'extension activée). Les options ci-dessous restent documentées pour référence.

Décisions ouvertes (les rapports d'exploration ne se contredisent pas ; ce sont des choix à trancher). Recommandations marquées.

- **D1 — Mécanisme de purge RGPD des noms (structurant).** **Option A (recommandée)** : purge déclenchée par l'app (UPDATE nullant `guest_name` où `service_date < aujourd'hui`, au chargement de la page, idempotent) — zéro infra, aligné sur les conventions du projet, la PII est réellement effacée en base. Faiblesse : le délai dépend d'une visite (borné à la prochaine ouverture, pas « minuit pile »). Option B : ajouter en filet un job `pg_cron` nocturne (délai garanti) — mais c'est de l'infra sur la base **partagée**, à activer au dashboard et à confirmer explicitement. Recommandation : A maintenant, B documentée comme durcissement optionnel.
- **D2 — Règle du nom pour les dates passées (structurant).** **Option A (recommandée)** : à l'import, `guest_name` n'est stocké que si `service_date == aujourd'hui` (Europe/Paris) ; tout import d'une date passée stocke `guest_name = null` d'emblée. Conséquence : le fichier de test daté (2026-04-26) s'importe **sans aucun nom** mais avec toutes les stats — « ancien traité comme nouveau », sans fuite PII et sans dépendre de la purge. Option B : stocker les noms puis compter sur la purge (fenêtre de PII plus large).
- **D3 — Étendue des champs exploitables conservés.** **Option A (recommandée, « garder l'exploitable »)** : ensemble RICHE non-PII — `status, vip, adults, children, guests, no_of_nights, room_type, rate_plan, channel (TravelAgent), company, guarantee, payment_type, addons, stay_count, breakfasts_included` + `adr` (prix/nuit) + `arrival_date`/`departure_date` (date seule, sans l'heure). Option B : minimal (seulement ce qu'affiche le board aujourd'hui). Dans les deux cas, les colonnes [B] (réfs CB, plaque, accompagnants, identifiants de résa, balance, notes) sont exclues. Sous-décisions : garder `adr` (prix) ? garder les dates arrivée/départ ?
- **D4 — Suivi de consommation digital (périmètre).** Aujourd'hui l'app est un **imprimé** (cases cochées au stylo), sans suivi digital. **Option A (recommandée)** : ne PAS construire de suivi digital maintenant — le chantier livre la persistance + la rétention + la capture des données exploitables ; l'imprimé reste. Option B : ajouter un suivi digital (cocher qui a pris son PDJ, compteurs servis) — chantier plus large, non demandé explicitement. Le schéma pourra être étendu plus tard (`ALTER TABLE`).
- **D5 — Clé d'unicité de l'upsert (mineur).** **Option A (recommandée)** : `(service_date, room)` — simple, non identifiant, cohérent avec le modèle par chambre. Hypothèse : une résa active par chambre et par nuit (cas limites rares : changement de résa en journée). Option B : `(service_date, reservation_id)` — plus robuste mais force à stocker un identifiant ré-identifiant (contraire à la minimisation).
- **D6 — Gating par rôle (mineur, acté par analogie).** Lecture pour tous les connectés ; **import + purge réservés à `super_utilisateur`/`admin`** (miroir parking/affiche, RLS + UI). La consultation d'un jour reste ouverte à tous.

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-sql-table-pdj-purge.md](./1-sql-table-pdj-purge.md) | SQL : table `pdj_breakfasts` + RLS + trigger + purge RGPD | — | P0 | 1h | Script `supabase/pdj_breakfasts.sql` exécuté par l'utilisateur | ⚠ |
| 2 | [2-metier-csv-service.md](./2-metier-csv-service.md) | Métier : extension `csv.ts` (rows datées, règle nom) + `pdj/service.ts` | 1 | P0 | 1h30 | `csvToDbRows`, service CRUD + purge | |
| 3 | [3-board-persistance-roles.md](./3-board-persistance-roles.md) | Board : import→upsert, chargement par jour (useQuery), purge au load, gating rôle | 2 | P0 | 2h30 | PDJ persisté, noms purgés J+1, sélecteur de jour | |
| 4 | [4-validation-globale.md](./4-validation-globale.md) | Validation (typecheck, build, test CSV daté, RLS, matrice rôles) | 1,2,3 | P1 | 1h | Build vert + RGPD vérifié sur le fichier de test | ⚠ |

## Ordre d'exécution

Séquentiel strict. Les décisions **D1, D2, D3** doivent être actées avant l'Étape 1 (elles conditionnent le schéma et la logique). L'Étape 1 (SQL) est **exécutée par l'utilisateur** dans Supabase ; le code des étapes 2-3 s'écrit en parallèle. L'Étape 4 valide de bout en bout en s'appuyant sur le fichier de test daté (vérifie qu'un import passé n'écrit aucun nom mais toutes les stats) et vérifie la RLS en lecture seule.

## Architecture cible

```
src/
├── lib/
│   └── pdj/
│       ├── csv.ts              ← + parseRows factorisé + csvToDbRows (rows datées)   [modifié]
│       └── service.ts          ← DbPdjRow, mappers, fetchDates/fetchByDate,          [nouveau]
│                                  importRows (upsert), purgeOldGuestNames
├── lib/pdjStore.ts             ← réduit à l'UI (jour sélectionné) ou retiré          [modifié]
├── components/pdj/
│   └── BreakfastBoard.tsx      ← useQuery par jour + import→upsert + purge + canEdit  [modifié]
supabase/
└── pdj_breakfasts.sql          ← CREATE TABLE + RLS + trigger + purge (UPDATE)        [nouveau]
```

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|-------------------|-------------------|
| DB / Supabase | — | `supabase/pdj_breakfasts.sql` |
| Métier | `src/lib/pdj/csv.ts`, `src/lib/pdjStore.ts` | `src/lib/pdj/service.ts` |
| Frontend | `src/components/pdj/BreakfastBoard.tsx` | — |
| **Total** | **3 modifiés** | **2 nouveaux** |
