# Étape 4 — Cœur PDJ porté (In-House Guests)

## Objectif

Importer automatiquement le rapport « In-House Guests » dans `pdj_breakfasts`, en
reproduisant `src/lib/pdj/csv.ts` + `service.ts`, sans toucher à l'import manuel.

## Qui

**MOI** (code).

## Fichier(s)

- `supabase/functions/import-report/` : module PDJ porté (copie du cœur `pdj/csv.ts`)
  - `parseGuestRows` / `csvToDbRows` / `mergeCsvFiles` (séparateur `;`/`,`, BOM,
    colonnes avant `Res. Notes`).
  - écriture `pdj_breakfasts` (upsert `service_date,room`, sans écraser
    `breakfasts_served`/`served`).

## Travail à réaliser

1. **Porter** le parsing PDJ à l'identique (colonnes requises, `stayKind`, calcul
   `breakfasts_included`, `hasPDJ`, `BB1PAX`).
2. **Date** : `service_date` = date du nom de fichier `_YYYYMMDD` (PDJ n'applique
   PAS le J-1 — c'est la date du rapport). Fuseau Europe/Paris.
3. **Règle « départ anticipé »** : conserver `CHECKED OUT` si `departure_date ===
   service_date` (fichier « du jour »), sinon logique archive. Reproduire fidèlement.
4. **RGPD** : `guest_name` conservé uniquement si `service_date` = J-0/J-1
   (Europe/Paris), sinon `null`. Ne pas casser le job cron d'anonymisation existant.
5. **Upsert** `onConflict: service_date,room` par lots ; **ne pas** inclure
   `breakfasts_served`/`served` (préserver la saisie staff). `imported_by` : PDJ
   n'a pas cette colonne (juste `imported_at` + `source_file`) — vérifier et poser
   `source_file` = nom du fichier reçu.

## Critère de validation

- Import d'un vrai `In-House Guests_YYYYMMDD.csv` → `pdj_breakfasts` identiques à
  l'import manuel (mêmes chambres, mêmes `breakfasts_included`).
- Ré-import = pas de doublon ; `breakfasts_served`/`served` déjà saisis **préservés**.
- `guest_name` anonymisé hors fenêtre J-0/J-1.

## Contrôle /borg

Critique (RGPD + écriture prod) : vérifier la fenêtre de rétention des noms, la
préservation de la saisie staff au ré-import, et l'unicité `(service_date, room)`.
