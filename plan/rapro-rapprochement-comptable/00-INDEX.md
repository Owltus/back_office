# Plan — Rapprochement comptable Réception/Étages et récap mensuel ELIOR

## Contexte

L'onglet `/rapro` fait aujourd'hui un **suivi ménage** par chambre (grille,
statuts nettoyée/bloquée/refus/no-show, roulement calculé, clôture, commentaire,
PDF). L'utilisateur a précisé (Q&A) le **vrai objectif comptable** : rapprocher le
nombre de chambres **vendues (Réception)** et **nettoyées (Étages)** chaque jour —
l'écart doit tomber à 0 — et sortir un **récap mensuel des chambres nettoyées**
pour la facture **ELIOR** (le prestataire ménage facture uniquement les chambres
nettoyées). Ce chantier met à jour l'existant et l'améliore pour coller à ce
besoin, sans jeter le suivi par chambre (qui sert de saisie).

Règles métier actées : séjours nettoyés **tous les jours sauf refus** ; une
**bloquée** est facturée le jour où elle est enfin nettoyée (pas de double
comptage) ; **no-show hors rapprochement** (l'occupation ne les compte pas) ; la
saisie reste **chambre par chambre**, faite par la réception d'après le rapport de
la gouvernante en fin de journée.

Contrainte projet : backend Supabase **partagé / lecture seule** sauf
`rapro_rooms` et `rapro_sheets` (app-owned) ; **tout SQL exécuté par
l'utilisateur** ; migration **additive** sur `rapro_sheets` uniquement
(`rapro_rooms` reste intouché — son script est destructif).

## Angles à clarifier

**Décisions actées (2026-07-08)** — issues du Q&A et de la reconnaissance :

- ELIOR facture les **nettoyées** uniquement → total mensuel = somme des
  `status='nettoyee'` par jour (une requête sur `rapro_rooms`).
- **Arrivées après clôture** et **corrections** = **saisie manuelle par jour**
  (introuvables dans les données ; stockées dans `rapro_sheets`).
- **No-show** hors rapprochement (occupation PDJ les exclut déjà) ; le statut
  no-show par chambre reste, pour info seulement.
- Le patron d'édition = celui du **commentaire** (state + hydratation + sauvegarde
  optimiste au blur) ; le patron de vue mensuelle = celui de `analytique`.

**Décisions tranchées (2026-07-08)** — validées avec l'utilisateur :

- **D1 — Occupées = PDJ + contrôle OCC.** Base = l'**occupation PDJ**
  (`occupied.size`, fiable, même jour) ; **plus** une **ligne de contrôle** qui
  affiche l'**OCC officiel PMS** (`daily_reports.rj_nuitees`, lu à **date = jour −
  1** à cause du décalage de datage) quand il existe, avec l'écart PDJ↔OCC — sans
  faire dépendre le calcul de base de `daily_reports`. Lecture seule sur
  `daily_reports` (table partagée).
- **D2 — Bloquées = jour seulement.** Côté Étages, `blocked = stats.todo`
  (occupées non nettoyées **du jour**), comme l'Excel. Le roulement reste affiché à
  part (card « Reste à faire » / « Reportées »).
- **D3 — Export du récap mensuel = PDF.** jsPDF-impression, comme le PDF du jour
  (pas de CSV). Réutilise le harnais d'impression existant.

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-donnees-sheets-nombres.md](./1-donnees-sheets-nombres.md) | Données : `late_arrivals`/`corrections` sur `rapro_sheets` | — | P0 | 1h | Migration additive + service/types étendus | ⚠ |
| 2 | [2-metier-rapprochement.md](./2-metier-rapprochement.md) | Métier : rapprochement Réception/Étages/écart (pur) | 1 | P0 | 1h | `accounting.ts` (`reconcileAccounting`, `ecart`) | |
| 3 | [3-ui-bloc-rapprochement.md](./3-ui-bloc-rapprochement.md) | UI : bloc Réception/Étages/Écart + 2 champs saisis | 1,2 | P1 | 1h30 | Board avec le rapprochement du jour | |
| 4 | [4-recap-mensuel-elior.md](./4-recap-mensuel-elior.md) | Récap mensuel ELIOR : données + vue jour-par-jour + export | 1 | P1 | 2h30 | Route `/rapro/mois` + total + export | |
| 5 | [5-validation.md](./5-validation.md) | Validation globale (écart, mois, décalage date, clôture) | 1-4 | P0 | 45 min | `tsc` + `build` verts, scénarios validés | ⚠ |

## Ordre d'exécution

Séquentiel. **D1, D2, D3 doivent être tranchées avant les étapes 2 et 4**. Étape 1
est **critique** (schéma `rapro_sheets`, SQL additif exécuté par l'utilisateur).
Étape 2 (pur métier) puis 3 (UI du jour) s'appuient sur 1. Étape 4 (récap mensuel)
ne dépend que de 1 et peut se faire en parallèle de 2-3. Étape 5 valide l'ensemble
(dernière étape → **critique**).

## Architecture cible

```txt
src/lib/rapro/
  accounting.ts      ← rapprochement comptable pur : reconcileAccounting() [nouveau]
  monthly.ts         ← agrégation mensuelle des nettoyees (facturable ELIOR) [nouveau]
  service.ts         ← rapro_sheets: late_arrivals/corrections ; requete mensuelle ; OCC controle [modifié]
  types.ts           ← DbRaproSheet/RaproSheet + late_arrivals/corrections [modifié]
  pdf.ts             ← + printRaproMonthly() (recap mensuel PDF, harnais reutilise) [modifié]
src/components/rapro/
  RaproBoard.tsx     ← bloc Reception/Etages/Ecart + 2 champs + ligne controle OCC [modifié]
  RaproMonthlyBoard.tsx ← vue recap mensuel jour-par-jour + total + bouton PDF [nouveau]
src/routes/
  rapro.mois.tsx     ← route du recap mensuel (ssr:false) [nouveau] + generate-routes
src/styles/rapro.css ← styles bloc rapprochement + tableau mensuel [modifié]
supabase/
  rapro_sheets.sql   ← ALTER ADD late_arrivals, corrections (additif, non destructif) [modifié]
```

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|-------------------|-------------------|
| DB / Supabase | `supabase/rapro_sheets.sql` | — |
| Métier | `src/lib/rapro/service.ts`, `types.ts`, `pdf.ts` | `src/lib/rapro/accounting.ts`, `monthly.ts` |
| Frontend | `src/components/rapro/RaproBoard.tsx`, `src/styles/rapro.css` | `src/components/rapro/RaproMonthlyBoard.tsx`, `src/routes/rapro.mois.tsx` |
| **Total** | **6 modifiés** | **4 nouveaux** |
