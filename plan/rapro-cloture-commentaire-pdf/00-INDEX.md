# Plan — Rapprochement : clôture, commentaire et impression PDF

## Contexte

La page **Rapprochement** (`/rapro`) suit le ménage par (jour, chambre) via la table `rapro_rooms` (une ligne par `report_date` + `room`, statut `nettoyee` / `non_nettoyee` / `refus` / `noshow`). Il manque la « finalisation » d'une journée : pouvoir la **clôturer** (comme la caisse, mais en plus simple), y attacher un **commentaire**, et une fois clôturée l'**imprimer** en PDF.

Le chantier reprend les mécanismes déjà éprouvés de la caisse (`src/components/caisse/CaisseBoard.tsx`, `src/lib/caisse/{service,pdf}.ts`, `supabase/caisse_sheets.sql`) en les **simplifiant** : clôture directe **sans modale**, **réouvrable à tout moment** par super_utilisateur / admin (pas de fenêtre de grâce), une zone commentaire, et un PDF de mise en page simple (au choix).

Point de design structurant : la clôture et le commentaire sont **au niveau du JOUR**, alors que `rapro_rooms` est granulaire à la chambre — il n'y a donc pas de porteur naturel. Il faut un stockage jour dédié (nouvelle table `rapro_sheets`, une ligne par jour).

Contrainte projet rappelée : backend Supabase **partagé**, tables historiques en **LECTURE SEULE** ; `rapro_sheets` est une table applicative **NOUVELLE et indépendante** ; tout script SQL est **exécuté par l'utilisateur** dans Supabase → SQL Editor, jamais par l'assistant.

## Angles à clarifier

**Décisions actées (2026-07-08, demande utilisateur)** : clôture **sans modale** (clic direct) · **réouvrable à tout moment** par super/admin (pas de grâce) · **zone commentaire** comme la caisse · bouton **Imprimer** visible **uniquement une fois clôturé** · **PDF simple**, mise en page libre · **grille verrouillée** (lecture seule) quand clôturé, déverrouillée à la réouverture.

**Décisions ouvertes** :

- **D1 — Stockage jour (structurant).** **Option A (recommandée)** : nouvelle table `rapro_sheets(report_date unique, status, comment, validated_at, validated_by, …)`, miroir simplifié de `caisse_sheets` (une ligne/jour, `status in ('draft','validated')`). **Option B** : hacks sur `rapro_rooms` (ligne sentinelle `room=0`, ou colonnes jour dupliquées sur chaque ligne) — non idiomatiques, écartés. Tout le plan suppose A.
- **D2 — Persistance du commentaire.** **Option A (recommandée)** : sauvegarde **au blur** (quand la zone perd le focus) + à la clôture — simple, sans machinerie de débounce, cohérent avec « en plus simple ». **Option B** : autosave débouncé façon caisse (refs `hydratedRef`/`mutationEpochRef`, flush au démontage) — plus lourd, non nécessaire ici.
- **D3 — Tracer qui/quand a clôturé.** **Option A (recommandée)** : conserver `validated_at` + `validated_by` (uuid auth) pour pouvoir afficher « Clôturé le … » dans le PDF, **sans** saisie de nom (pas d'`operator_initials` ni de modale comme la caisse). **Option B** : ne stocker que `status` (plus minimal, mais PDF sans mention de clôture).

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-sql-table-rapro-sheets.md](./1-sql-table-rapro-sheets.md) | Table jour `rapro_sheets` (status/comment/validated) + RLS super/admin **sans grâce** + trigger `updated_at` | — | P0 | 30 min | Script `supabase/rapro_sheets.sql` exécuté par l'utilisateur | ⚠ |
| 2 | [2-metier-sheet.md](./2-metier-sheet.md) | Types + service de la feuille jour (`fetchSheet` / `upsertSheet` / `validateSheet` / `reopenSheet`) via TanStack Query | 1 | P0 | 1h | `src/lib/rapro/{types,service}.ts` (modifiés) | |
| 3 | [3-ui-cloture-commentaire.md](./3-ui-cloture-commentaire.md) | UI : boutons Clôturer/Réouvrir (sans modale), zone commentaire, verrou de la grille quand clôturé | 2 | P0 | 1h30 | `src/components/rapro/RaproBoard.tsx` (modifié) | |
| 4 | [4-pdf-impression.md](./4-pdf-impression.md) | Module PDF `rapro/pdf.ts` (jsPDF dynamique + autoPrint) + bouton Imprimer visible si clôturé | 2,3 | P0 | 2h | `src/lib/rapro/pdf.ts` (nouveau), câblage `RaproBoard` | |
| 5 | [5-validation-globale.md](./5-validation-globale.md) | Validation globale : `tsc`, `build`, test manuel du cycle clôture → impression → réouverture | 1,2,3,4 | P1 | 30 min | `/rapro` complète, `npx tsc --noEmit` + `pnpm build` verts | ⚠ |

## Ordre d'exécution

Séquentiel : 1 → 2 → 3 → 4 → 5. Avant l'étape 1, **acter D1 à D3** (elles gouvernent le schéma SQL de l'étape 1 et le service de l'étape 2). L'étape 1 est **critique** (DDL + RLS sur Supabase, exécutée par l'utilisateur) ; l'étape 5 est **critique** (validation globale de fin de chantier). Les étapes 3 et 4 peuvent se recouvrir un peu (le PDF ne dépend que du modèle de données et du flag `isValidated`), mais 4 réutilise le commentaire et l'état de clôture posés en 3.

## Architecture cible

```
src/
  lib/
    rapro/
      types.ts       ← + SheetStatus / RaproSheet / DbRaproSheet [modifié]
      service.ts     ← + fetchSheet / upsertSheet / validateSheet / reopenSheet [modifié]
      pdf.ts         ← génération PDF (jsPDF import() dynamique + autoPrint + iframe caché) [nouveau]
  components/
    rapro/
      RaproBoard.tsx ← boutons Clôturer/Réouvrir/Imprimer, zone commentaire, verrou grille [modifié]
supabase/
  rapro_sheets.sql   ← table jour (status/comment/validated) + RLS sans grâce, exécuté par l'utilisateur [nouveau]
```

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|-------------------|-------------------|
| DB / Supabase | — | `supabase/rapro_sheets.sql` |
| Métier | `src/lib/rapro/types.ts`, `src/lib/rapro/service.ts` | `src/lib/rapro/pdf.ts` |
| Frontend | `src/components/rapro/RaproBoard.tsx` | — |
| **Total** | **3 modifiés** | **2 nouveaux** |
