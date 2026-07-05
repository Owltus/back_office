# Étape 4 — Validation globale (typecheck, build, test CSV daté, RLS, rôles)

## Objectif

Valider le chantier de bout en bout : compilation/build, comportement RGPD sur le fichier de test daté, gating par rôle (UI + RLS), et non-régression de l'affichage/impression PDJ.

## Contexte

Dernière étape, critique pour l'audit RGPD (la PII ne doit ni fuiter ni persister au-delà du jour). Vérification RLS en **lecture seule** (comme parking/affiche). Le fichier `csv/In-House Guests _20260426012157.csv` est daté dans le passé : c'est le cas de test idéal pour prouver qu'un import ancien n'écrit aucun nom.

## Fichier(s) impacté(s)

- Aucun nouveau fichier — validation transverse.

## Travail à réaliser

### 1. Validation technique

- `npx tsc --noEmit`, `pnpm lint` (pas de nouvelle erreur ; dette préexistante hors périmètre), `pnpm check` (Prettier), `pnpm build` (build vert).

### 2. Test RGPD sur le fichier daté

- Importer `csv/In-House Guests _20260426012157.csv` (daté 2026-04-26, passé).
- Vérifier en base (lecture seule) : les lignes du 2026-04-26 ont `guest_name IS NULL` (aucun nom stocké pour une date passée, règle D2) mais `room_type`, `no_of_nights`, `channel`, `breakfasts_included`, etc. renseignés.
- Vérifier qu'aucune colonne [B] (réfs CB, plaque, accompagnants, identifiants, balance, notes) n'existe ni n'a été stockée.
- Simuler un jour courant : un import daté d'aujourd'hui stocke bien le nom ; après passage au lendemain (ou appel manuel de la purge), le nom est mis à NULL et `purged_at` renseigné, sans toucher les stats.

### 3. Matrice de rôles (manuel, via l'app)

| Action | utilisateur | super_utilisateur | admin |
|--------|:-----------:|:-----------------:|:-----:|
| Consulter un jour, imprimer | oui | oui | oui |
| Importer un CSV | non (zone masquée) | oui | oui |
| Cocher les PDJ servis (D4) | non (RLS) | oui | oui |
| Déclencher la purge | non (RLS) | oui | oui |

### 4. Vérification RLS (lecture seule)

- `select policyname, cmd, roles from pg_policies where tablename = 'pdj_breakfasts'` : 4 policies, écriture super/admin.
- Accès anonyme : ne lit rien. Un `utilisateur` ne peut pas écrire (rejet RLS).

## Ordre d'exécution

1. `npx tsc --noEmit`, `pnpm lint`, `pnpm check`, `pnpm build`.
2. Import du CSV daté + vérifications RGPD en base (lecture seule).
3. Matrice de rôles dans l'app (utilisateur).
4. Vérification des 4 policies + accès anonyme.

## Critère de validation

- Build vert, typecheck/lint/format OK.
- Un import daté du passé n'écrit **aucun nom** mais toutes les stats ; la purge efface les noms des jours écoulés sans casser les stats.
- Matrice de rôles respectée côté UI et RLS.
- Affichage et impression PDJ inchangés (6 KPI + tableaux par étage, PDF `Breakfast_JJ-MM-AAAA`).

## Contrôle /borg

Étape critique (validation RGPD + double gating sur backend partagé). Audit final :
- Aucune PII persistée hors nécessité : `guest_name` est le seul champ nominatif, NULL pour toute date passée et purgé le lendemain pour le jour courant ; aucune colonne [B] en base.
- Cohérence UI ↔ RLS : ce que l'UI masque au rôle `utilisateur` est aussi refusé par la RLS.
- Minimisation « by design » : les colonnes sensibles du CSV ne transitent jamais vers Supabase (filtrées dès `csvToDbRows`), y compris les réfs CB des notes.
- Aucune écriture sur les tables partagées ; seule `pdj_breakfasts` est écrite, par des rôles autorisés via l'app.
- Pas de régression sur parking/affiche/repjour (QueryClient partagé, conventions perf respectées).
