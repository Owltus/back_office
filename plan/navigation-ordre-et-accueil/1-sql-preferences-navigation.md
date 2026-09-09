# Étape 1 — Colonne d'ordre des pages

## Objectif

Poser sur `profiles` de quoi retenir l'ordre des pages d'un compte, sans
toucher aux droits, sans modifier une seule policy et sans backfill.

## Contexte

Les quatre décisions actées ferment le choix de stockage. L'admin doit pouvoir
personnaliser son ordre, or il n'a **aucune ligne** dans
`user_page_permissions` — son accès total vient de la branche
`when private.is_admin() then 'gestion'` de `private.get_page_level`. La
préférence ne peut donc pas être portée par les lignes de permission.

Et puisque chacun règle la sienne, aucune policy n'est à écrire. La policy
`Users update own profile` fige uniquement `role` et `email` dans son
`WITH CHECK` : toute autre colonne est déjà auto-éditable, comme
`first_name` et `display_name` le sont aujourd'hui. `Admin manages profiles`
(`FOR ALL`) couvre l'écriture par l'admin sur un autre compte. Aucune RPC n'est
nécessaire ; l'écriture se fait par `update` direct, comme celle des noms dans
`ComptesBoard`.

Enfin, `get_my_access()` bâtit son champ `profile` avec `to_jsonb(p)` : la
colonne remonte au client sans que la fonction soit modifiée, donc sans
toucher au contrôle 17 de `verif_audit_2026-09-06.sql`.

Reste un piège : ne jamais rejouer `supabase/profiles.sql` en entier. Son
bloc 2 porte « REMPLACÉ — NE PLUS REJOUER » et rouvrirait l'escalade de rôle à
l'insertion.

## Fichier(s) impacté(s)

- `supabase/nav_page_order_2026-09-09.sql` (nouveau)

## Travail à réaliser

### 1. Écrire le script

En-tête au format des scripts récents (`fk_auteur_triggers_2026-09-06.sql`),
une transaction, idempotent, non destructif, suivi d'un bloc de vérification en
lecture seule. Rappeler dans l'en-tête pourquoi la colonne vit sur `profiles`
et pourquoi aucune policy n'est modifiée.

### 2. La colonne

```sql
alter table public.profiles
  add column if not exists page_order text[];
```

**Nullable, sans valeur par défaut.** La valeur nulle signifie « aucune
préférence » et vaut ordre du registre côté client : les six comptes existants
gardent exactement le comportement actuel, sans backfill, et une page ajoutée
plus tard n'oblige à rien.

### 3. La contrainte

Une contrainte d'inclusion, immutable donc utilisable dans un CHECK, plus une
borne de longueur :

```sql
alter table public.profiles
  drop constraint if exists profiles_page_order_check;
alter table public.profiles
  add constraint profiles_page_order_check check (
    page_order is null
    or (
      page_order <@ array['repjour','pdj','parking','rapro','caisse',
                          'affichage','facturation','literie']::text[]
      and array_length(page_order, 1) <= 8
    )
  );
```

Ne pas chercher à interdire les doublons par un CHECK : l'expression
nécessaire n'est pas immutable. Les doublons sont écartés côté application, et
la réconciliation de l'étape 2 les rend de toute façon sans effet — une clé vue
deux fois n'apparaît qu'une fois dans l'ordre effectif.

Cette liste de huit clés est la **troisième** occurrence dans le dépôt, après
le CHECK de `user_page_permissions` (`securite_audit_2026-09-06.sql:152`) et le
registre `pages.ts`. Le noter dans l'en-tête du script et dans `CLAUDE.md` à
l'étape 7 : toute nouvelle page devra être ajoutée aux trois endroits.

### 4. Aucune journalisation

Décision actée : le trigger `audit_profiles` reste sur `UPDATE OF role`. Ne pas
l'élargir, et ne rien écrire dans `audit_log` — ce qui éviterait de toute façon
d'élargir le CHECK sur `action`.

## Ordre d'exécution

1. Écrire et commiter `supabase/nav_page_order_2026-09-09.sql`.
2. Essai à blanc : `begin; ... rollback;` et lire le bloc de vérification.
3. Appliquer : `supabase db query --linked -f supabase/nav_page_order_2026-09-09.sql`.
4. Rejouer `verif_advisor.sql`, `verif_audit_2026-09-06.sql`, `verif_complet.sql`.

## Critère de validation

- Le script est idempotent : deux applications successives donnent le même
  état, la seconde sans erreur.
- `select count(*) from profiles where page_order is not null` = 0 juste après
  application : aucun compte existant n'a été modifié.
- La contrainte refuse une clé inconnue et un tableau de plus de huit entrées,
  vérifié en transaction annulée.
- Un compte non-admin peut écrire son propre `page_order` **et** toujours son
  `first_name` — vérifié par endossement de rôle
  (`set local role authenticated` + `request.jwt.claims`) dans une transaction
  annulée.
- Un compte non-admin ne peut pas écrire le `page_order` d'un autre compte.
- `verif_advisor.sql` 11/11, `verif_audit_2026-09-06.sql` 20/20.

## Contrôle qualité (revue)

Étape critique (schéma sur base de production). `/borg` n'étant pas installé,
revue manuelle : (1) confirmer qu'aucune policy n'a été touchée — un
`select ... from pg_policies where tablename = 'profiles'` doit rendre les
quatre policies inchangées, mot pour mot ; (2) confirmer que le trigger
`protect_role_escalation` est intact ; (3) vérifier que la liste des huit clés
du CHECK est identique à celle de `user_page_permissions` ; (4) relire les
grants : la colonne n'en demande aucun, mais vérifier qu'`anon` reste sans
privilège sur `profiles`.
