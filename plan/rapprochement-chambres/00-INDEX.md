# Plan — Rapprochement de chambres : premier jet

## Contexte

L'onglet **Rapprochement** (`/rapro`) n'est aujourd'hui qu'un placeholder `ComingSoon` (route déjà enregistrée, entrée de nav déjà câblée avec l'icône `ArrowLeftRight`). Le document de référence `doc/02-RAPPRO FEVRIER 2026.pdf` est un formulaire papier OKKO Nantes intitulé « RAPPROCHEMENT DE CHAMBRES » : il réconcilie le nombre de chambres occupées **vu par la Réception (1)** avec le nombre **vu par les Étages (2)**, l'écart `(2) − (1)` devant être justifié. Ce formulaire agrégé est volontairement complexe (chambres bloquées J-1/J+1, hors service, refus de service, no show, arrivées après clôture, gratuités, corrections de vente).

L'objectif de ce chantier est **une version bien plus simple** : réutiliser le modèle chambres de la page **PDJ** (grille étages → chambres) pour afficher toutes les chambres, avec **une checkbox par chambre pour signaler celles « non faites »** (non nettoyées / bloquées / refus). La navigation dans le temps reprend la **logique de la page Caisse**, mais à granularité **jour** (pas de shift). C'est un premier jet, simple et efficace.

Contrainte projet rappelée : le backend Supabase est **partagé**, les tables historiques (`profiles`, `daily_reports`, `hotel_config`…) sont en **LECTURE SEULE**. Si ce chantier persiste l'état des chambres, il le fait dans une **table applicative NOUVELLE et indépendante** (`rapro_rooms`), sur le patron de `pdj_breakfasts` / `caisse_sheets` ; tout script SQL est **exécuté par l'utilisateur** dans Supabase → SQL Editor, jamais par l'assistant.

## Angles à clarifier

**Décisions actées (2026-07-07)** : feature = **checklist par chambre** (pas le formulaire agrégé du PDF) · modèle chambres repris de **PDJ** (étages dérivés par `Math.floor(room/100)`) · **navigation temporelle par jour** reprise de la Caisse · une **checkbox « chambre non faite »** par chambre · premier jet simple.

Inventaire chambres confirmé : `ALL_ROOMS` (`src/lib/pdj/csv.ts`) = **80 chambres** — étage 1 : 102-114 (13), étages 2-5 : x01-x14 (14 chacun), étage 6 : 621-631 (11). Les numéros du PDF (204, 504, 623…) collent exactement. Pas de divergence 76/80 (erreur d'arithmétique d'un agent, corrigée).

**Décisions ouvertes** (à trancher avant l'exécution) :

- **D1 — Persistance : table Supabase vs état local (structurant).** La navigation temporelle n'a de sens que si l'état des chambres est **persisté par jour** (sinon changer de jour affiche du vide). **Option A (recommandée)** : nouvelle table `rapro_rooms` + service, comme pdj/caisse (nécessite un script SQL exécuté par l'utilisateur). **Option B** : état local `useState` sans persistance — plus rapide à livrer mais la navigation par jour devient décorative (aucune mémoire). Le reste du plan suppose A.
- **D2 — Forme de la table : une ligne par jour vs une ligne par chambre.** **Option A (recommandée pour un premier jet)** : une ligne par jour, `unique (report_date)`, colonne `rooms_not_done` (tableau des numéros cochés) — on n'écrit que les exceptions, un seul upsert par sauvegarde. **Option B** : une ligne par `(report_date, room)` avec `not_done boolean` — plus idiomatique maison (pattern `pdj_breakfasts`) mais beaucoup plus de lignes pour un usage « on coche 2-3 chambres ».
- **D3 — Inventaire chambres : où vit la liste.** **Option A (recommandée)** : remonter `ALL_ROOMS` + `range` + le calcul d'étage dans un module partagé `src/lib/hotel/rooms.ts`, réutilisé par pdj ET rapro (touche légèrement pdj). **Option B** : importer `ALL_ROOMS` depuis `#/lib/pdj/csv.ts` (couplage rapro → pdj). **Option C** : re-déclarer une constante locale `src/lib/rapro/rooms.ts` (duplication assumée, zéro impact pdj).
- **D4 — Primitive de la case à cocher.** Aucune `ui/checkbox.tsx` n'existe. **Option A (recommandée)** : ajouter la primitive shadcn `pnpm dlx shadcn@latest add checkbox` (vendored, cohérent avec le reste). **Option B** : réutiliser `ui/switch.tsx` (déjà présent). **Option C** : `<input type="checkbox">` natif (zéro dépendance).
- **D5 — Portée de l'affichage.** **Option A (recommandée)** : la grille cochable + un simple compteur « N chambres non faites / 80 ». **Option B** : ajouter en plus le calcul de l'écart Réception/Étages agrégé (rapproche du PDF, mais réintroduit les lignes d'ajustement qu'on cherche à éviter).
- **D6 — Sémantique de « non faite ».** **Option A (recommandée)** : booléen binaire (faite / non faite). **Option B** : plusieurs états (bloquée / refus / hors service) fidèles au PDF — reporté après le premier jet.

Note de nommage : le front utilise `rapro` (un seul p) ; le plan aligne table/lib sur ce préfixe (`rapro_rooms`, `src/lib/rapro/`, `src/components/rapro/`).

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-metier-inventaire-jour.md](./1-metier-inventaire-jour.md) | Métier pur : inventaire étages/chambres (`ALL_ROOMS`, `floorOf`, `FLOORS`) + helpers de navigation par jour (`today`, `addDays`, bornes) | — | P0 | 1h | Modules purs `src/lib/rapro/{rooms,day}.ts` (+ éventuel `src/lib/hotel/rooms.ts` selon D3) | |
| 2 | [2-sql-table-rapro.md](./2-sql-table-rapro.md) | Table applicative `rapro_rooms` (par jour) + RLS (`select` authentifiés, écriture super/admin) + trigger `updated_at` dédié | — | P0 | 30 min | Script `supabase/rapro_rooms.sql` exécuté par l'utilisateur | ⚠ |
| 3 | [3-metier-service.md](./3-metier-service.md) | Types DB/app + service Supabase (`fetchDay`, `fetchOldestDay`, `saveNotDone`) via `useQuery`, mappers snake↔camel | 2 | P0 | 1h | `src/lib/rapro/{types,service}.ts` | |
| 4 | [4-ui-board.md](./4-ui-board.md) | `RaproBoard` : grille étages→chambres avec checkbox par chambre, navigation par jour (`DatePickerButton` + chevrons), compteur, styles `.rapro-*` | 1,3 | P0 | 2h | `src/components/rapro/RaproBoard.tsx`, `src/styles/rapro.css` (+ `ui/checkbox.tsx` selon D4) | |
| 5 | [5-cablage-validation.md](./5-cablage-validation.md) | Câblage route (remplacer `ComingSoon` par `RaproBoard`), `@import` du CSS, validation globale (`tsc`, `build`) | 4 | P1 | 30 min | `/rapro` fonctionnelle, `npx tsc --noEmit` + `pnpm build` verts | ⚠ |

## Ordre d'exécution

Séquentiel, mais les étapes 1 et 2 sont indépendantes et peuvent être menées en parallèle. Avant l'étape 1, **acter D1 à D6** (elles conditionnent le code écrit : D1/D2 gouvernent les étapes 2 et 3, D3 l'étape 1, D4 l'étape 4). L'étape 2 est **critique** (DDL/RLS sur Supabase, exécutée par l'utilisateur) : si D1 = Option B (pas de persistance), l'étape 2 est **supprimée** et l'étape 3 se réduit à un état local. L'étape 5 est **critique** au sens « validation globale de fin de chantier ».

## Architecture cible

```
src/
  lib/
    hotel/
      rooms.ts              ← ALL_ROOMS + range + floorOf partagés [nouveau, si D3=A]
    rapro/
      rooms.ts              ← inventaire étages→chambres (ou ré-export de hotel/rooms) [nouveau]
      day.ts                ← today(), addDays(), bornes de navigation par jour [nouveau]
      types.ts              ← DbRaproDay (snake) + RaproDay (camel) [nouveau]
      service.ts            ← fetchDay / fetchOldestDay / saveNotDone (Supabase) [nouveau]
  components/
    rapro/
      RaproBoard.tsx        ← grille cochable + navigation par jour [nouveau]
    ui/
      checkbox.tsx          ← primitive shadcn vendored [nouveau, si D4=A]
  routes/
    rapro.tsx               ← ComingSoon → RaproBoard [modifié]
  styles/
    rapro.css               ← classes .rapro-* (grille dense, @media print) [nouveau]
  styles.css                ← @import './styles/rapro.css' [modifié]
supabase/
  rapro_rooms.sql           ← table + RLS + trigger, exécuté par l'utilisateur [nouveau, si D1=A]
```

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|-------------------|-------------------|
| DB / Supabase | — | `supabase/rapro_rooms.sql` (si D1=A) |
| Métier | `src/lib/pdj/csv.ts` (si D3=A, ré-export) | `src/lib/rapro/{rooms,day,types,service}.ts`, `src/lib/hotel/rooms.ts` (si D3=A) |
| Frontend | `src/routes/rapro.tsx`, `src/styles.css` | `src/components/rapro/RaproBoard.tsx`, `src/components/ui/checkbox.tsx` (si D4=A), `src/styles/rapro.css` |
| **Total** | **2 à 3 modifiés** | **6 à 8 nouveaux** |
