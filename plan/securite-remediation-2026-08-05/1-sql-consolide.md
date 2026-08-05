# Étape 1 — [ASSISTANT] Script SQL consolidé + vérification

## Objectif

Produire UN SEUL script SQL corrigeant tous les findings DB du pentest #2, plus UN
script de vérification. L'assistant écrit ; l'utilisateur exécutera (fiche 5).

## Findings couverts

- **A2** — `admin_update_password` : refuser une cible admin + journaliser dans `audit_log`.
- **A3** — `caisse_stamp` : figer `countersigned_by` (anti-forge de contre-signature).
- **A4** — `set_user_grade` : reverser la garde « dernier admin » (déjà en base, pas dans le repo) + refuser de rétrograder un autre admin + journaliser.
- **B2** — `profiles` : figer `email` et les noms dans le `with check` de la policy self-update.
- **B7** — Fusionner les migrations `rapro_rooms_status_*` en une contrainte CHECK unique et idempotente (ordre de rejeu sans effet).
- **A1 (partie serveur)** — RPC `facturation_learn_document` idempotente (`on conflict (hash)`), qui remplace les incréments non idempotents (le câblage client est en fiche 4).

## Fichiers impactés

- `supabase/remediation_securite_2026-08-05.sql` (nouveau, script unique)
- `supabase/verif_securite_2026-08-05.sql` (nouveau)
- Fichiers repo mis en cohérence : `page_permissions.sql` (A4), `caisse_sheets.sql` + `security_hardening_triggers.sql` (A3), `security_core.sql` (A2), `profiles.sql` (B2), `rapro_rooms_status_non_vendue.sql`/`_rattrapage.sql` (B7).

## Travail à réaliser

### 1. `caisse_stamp` fige `countersigned_by` (A3)
Dans `caisse_stamp()` : `new.countersigned_by := (tg_op='INSERT') ? null : old.countersigned_by`.

### 2. `admin_update_password` (A2)
Après la garde admin : `if (select role from profiles where id = target_user_id) = 'admin' and target_user_id <> auth.uid() then raise 'cible admin interdite'`. Puis `insert into audit_log(...)` (action, acteur, cible).

### 3. `set_user_grade` (A4)
Garde « dernier admin » (déjà posée en base) reversée dans `page_permissions.sql` ; ajouter le refus de rétrograder un autre admin + `audit_log`.

### 4. `profiles` self-update (B2)
`with check` : figer `email`, `first_name`, `last_name`, `display_name` à leur valeur courante pour un non-admin (comme `role`).

### 5. CHECK `rapro_rooms.status` unique (B7)
Une seule instruction idempotente listant les 5 valeurs (`nettoyee`, `non_nettoyee`, `refus`, `rattrapage`, `non_vendue`), rejouable dans n'importe quel ordre.

### 6. RPC `facturation_learn_document` idempotente (A1 serveur)
Une RPC transactionnelle unique : teste `on conflict (hash) do nothing` sur le journal, et n'incrémente wordpool/issuer/comptes QUE si le hash est nouveau.

### 7. Script de vérification
`verif_securite_2026-08-05.sql` : un contrôle OK/KO par finding (colonne stampée, gardes présentes, CHECK à 5 valeurs, RPC existante).

## Critère de validation

- Le script consolidé est idempotent et transactionnel (l'`audit_log`/CHECK ne fait jamais échouer la transaction).
- Le script de vérif renvoie OK partout une fois exécuté (fiche 5).

## Contrôle /borg

Auditer : (1) aucune garde existante affaiblie ; (2) `audit_log` a bien les colonnes utilisées (sinon adapter) ; (3) la RPC idempotente ne casse pas l'apprentissage légitime ; (4) le CHECK fusionné n'exclut aucune valeur en cours d'usage.
