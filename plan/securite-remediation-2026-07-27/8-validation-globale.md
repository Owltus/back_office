# Étape 8 — Validation globale (re-test + clôture)

## Objectif

Prouver, sur un **compte jetable**, que chaque finding de l'audit du 27/07 est **clos**
(corrigé) ou **explicitement accepté**, et dater le re-test. Sans cette étape, le plan
n'a « corrigé » que sur le papier.

## Contexte

L'audit était statique : la preuve d'exploitabilité (et de non-exploitabilité après
correctif) se fait ici, en conditions réelles, contre un compte de test — jamais sur des
comptes ou des données de production.

## Fichier(s) impacté(s)

- `doc/rapport securité/retest-2026-07-XX.md` (nouveau)
- `CLAUDE.md` (faits DB : refléter l'état durci final)

## Travail à réaliser

### 1. Matrice de re-test (compte jetable `utilisateur`, JWT en main)

| Finding | Test | Attendu après correctif |
|---------|------|-------------------------|
| C1 | `rpc/admin_update_password` avec JWT non-admin | 403 / forbidden |
| G1/G2 | `PATCH profiles {role:'admin'}` sur soi, JWT non-admin | refusé / role inchangé |
| H1 | `GET /rest/v1/caisse_sheets` (compte sans caisse) | 0 ligne |
| H1 | `GET /rest/v1/pdj_breakfasts` (compte sans pdj) | 0 ligne |
| H2 | `GET /rest/v1/facturation_ref_imputations` (compte sans facturation) | 0 ligne |
| H1 (non-rég.) | `/rapro` avec compte rapro sans repjour | ligne de contrôle OCC visible |
| M4 | `insert email_recipients {email:'a;b@x.fr'}` (compte gestion) | rejeté (CHECK) |
| M3 | recherche de la nouvelle clé service_role dans `dist/` | absente ; ancienne révoquée |
| B1 | `delete-user` d'un autre admin | 403 |

### 2. Contrôle de complétude RLS

```sql
select relname from pg_class
where relnamespace='public'::regnamespace and relkind='r' and not relrowsecurity;
-- attendu : 0 ligne
select tablename, policyname, qual from pg_policies
where schemaname='public' and cmd='SELECT'
  and (qual='true' or qual ilike '%auth.uid() IS NOT NULL%');
-- attendu : seul hotel_config
```

### 3. Clôture

Rédiger `retest-2026-07-XX.md` : pour chaque finding (C1, H1, H2, M2, M3, M4, B1-B7),
statut **corrigé** / **accepté** (avec raison) et preuve (requête + résultat). Mettre à
jour `CLAUDE.md` (faits DB) avec l'état durci.

### 4. Nettoyage

Supprimer le compte jetable. Ne laisser aucun compte de test actif.

## Ordre d'exécution

1. Créer le compte jetable, dérouler la matrice.
2. Lancer les contrôles de complétude RLS.
3. Rédiger le re-test + mettre à jour `CLAUDE.md`.
4. Supprimer le compte jetable.

## Critère de validation

- Chaque ligne de la matrice au vert (ou accepté motivé).
- Les deux requêtes de complétude renvoient l'attendu.
- `retest-2026-07-XX.md` daté et complet ; compte jetable supprimé.

## Contrôle /borg

Dernière étape (validation globale) : auditer que le re-test couvre **tous** les findings
du rapport (aucun oublié), que les tests ont bien été faits avec un JWT réel via PostgREST
(et pas seulement via l'UI, qui masquerait un contournement direct), et qu'aucun compte de
test ne subsiste.
