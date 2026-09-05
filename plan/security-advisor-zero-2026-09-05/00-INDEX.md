# Plan — Security Advisor à zéro, par les bonnes pratiques

## Contexte

Après le durcissement du 2026-09-05 (`lint_hardening_2026-09-05.sql` :
`anon` retiré de 6 RPC, `btree_gist` déplacé), le Security Advisor Supabase
n'affiche plus que deux familles :

- **0029** « Signed-In Users Can Execute SECURITY DEFINER Function » : les
  42 fonctions `security definer` non-trigger de `public`, toutes exécutables
  par `authenticated` via `/rest/v1/rpc/…`.
- **auth_leaked_password_protection** : un réglage du dashboard (plan Pro).

L'utilisateur veut zéro avertissement ET le respect des bonnes pratiques,
pas un contournement. Deux agents Explore (audit SQL des 42 fonctions ;
appelants front et Edge) plus une extraction du catalogue de prod donnent
les faits suivants :

- **Trois fonctions d'aide** (`get_page_level`, `is_admin`, `get_user_role`)
  ne sont appelées par AUCUN code applicatif, seulement par 91 policies,
  39 fonctions et 2 triggers. Elles DOIVENT rester `security definer`
  (récursion RLS sinon : la policy de `profiles` appelle `get_user_role` qui
  relit `profiles`). La bonne pratique Supabase pour ce cas est un schéma
  privé non exposé à l'API. `page_level_rank` (pure, déjà invoker) et
  `repjour_manual_forecast_allowed` suivent le lot par cohérence.
- **Une fonction est convertible sans rien changer au modèle** :
  `dismiss_send_reminder` (sa garde est strictement identique à la policy
  UPDATE de `daily_reports`).
- **Trois fonctions n'ont aucun appelant** : `set_parking_tarif`,
  `literie_record_movement`, `literie_toggle_bedding` (la literie écrit
  directement `hotel_rooms` ; le stock est abandonné côté app).
- **Les 35 autres** (25 `facturation_*`, 4 d'administration des comptes,
  `daily_reports_occ`, `rapro_occupancy`, …) écrivent ou lisent des tables
  que le projet a VOLONTAIREMENT fermées à l'écriture directe (« seule la RPC
  écrit », validation des entrées, journalisation `audit_log` sans policy,
  croisement de pages). Les convertir en `security invoker` exigerait
  d'ouvrir ces tables : c'est un affaiblissement, pas une bonne pratique.
  Elles restent `security definer`, dans le schéma privé, avec un relais
  `security invoker` de même nom et même signature dans `public` pour l'app.
- Les Edge Functions n'appellent aucune RPC ; le front en appelle 31, toutes
  par nom sous `public` ; trois ont un retour typé sensible (`number`,
  `number`, `boolean`).

Toute la production SQL est GÉNÉRÉE depuis le catalogue de prod (comme
`perf_rls_ecriture_2026-09-05.sql`), appliquée en une transaction, contrôlée
par un script en lecture seule, avec preuves par rôle en transaction
annulée.

## Remise en question (à défaut de /rodin)

- **Le relais est-il un contournement du linter ?** Pour les 35 fonctions
  qui doivent garder leurs privilèges, oui en partie : la sécurité réelle ne
  change pas. Le gain réel est ailleurs : les fonctions d'aide et les
  fonctions privilégiées quittent l'API, leurs privilèges sont accordés au
  schéma privé de façon explicite et unique, et le linter redevient utile
  (un nouveau `security definer` oublié dans `public` sera signalé au lieu
  d'être noyé dans 42 lignes « voulues »).
- **Alternative moins coûteuse** : ne faire que les étapes 1 et 2 (aides en
  privé, conversion, suppression des fonctions mortes) ramène 42 à 35 sans
  relais. Zéro exige l'étape 3.
- **Angle mort** : les fichiers d'autorité SQL sont éclatés (4 définitions
  divergentes de `set_user_grade`, `facturation_admin_only.sql` =
  concaténation). Ce chantier crée de NOUVEAUX fichiers d'autorité par
  schéma et marque les anciens comme remplacés ; il ne nettoie pas tout
  l'historique.

## Angles à clarifier

1. **Fonctions sans appelant** (`set_parking_tarif`, `literie_record_movement`,
   `literie_toggle_bedding`) : les supprimer (le plus propre) ou les garder
   en privé avec relais ? *Défaut proposé : supprimer, avec `drop function`
   annoncé et confirmation explicite.* Note : `parking_tarifs` reste
   modifiable par le SQL Editor.
2. **Mot de passe compromis** : réglage dashboard, plan Pro. Hors SQL.
3. **Schémas exposés de l'API** (Settings, API, « Exposed schemas ») : le
   schéma `private` ne doit JAMAIS y figurer. À vérifier une fois par
   l'utilisateur, rien à faire s'il n'y est pas.

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-schema-prive-aides.md](./1-schema-prive-aides.md) | Schéma `private` + 5 fonctions d'aide déplacées, 91 policies et 2 triggers repointés | — | P0 | 2h | `supabase/private_schema_aides.sql` appliqué, 0 aide dans `public` | ⚠ |
| 2 | [2-invoker-et-fonctions-mortes.md](./2-invoker-et-fonctions-mortes.md) | `dismiss_send_reminder` en invoker ; suppression des 3 fonctions sans appelant | 1 | P1 | 45 min | `supabase/rpc_invoker_2026-09.sql` appliqué | ⚠ |
| 3 | [3-rpc-privees-et-relais.md](./3-rpc-privees-et-relais.md) | 35 RPC privilégiées déplacées en `private`, relais invoker dans `public` | 1 | P0 | 3h | `supabase/private_rpc_*.sql` + `supabase/public_relais.sql` appliqués, app inchangée | ⚠ |
| 4 | [4-privileges-et-verif-advisor.md](./4-privileges-et-verif-advisor.md) | Privilèges du schéma privé, boucle de durcissement étendue, `verif_advisor.sql` | 3 | P0 | 1h | 0 `security definer` dans `public`, contrôle OK | ⚠ |
| 5 | [5-fichiers-autorite.md](./5-fichiers-autorite.md) | Fichiers d'autorité : nouveaux par schéma, anciens marqués remplacés, CLAUDE.md | 4 | P1 | 1h30 | Dépôt cohérent avec la prod, plus de dérive possible | |
| 6 | [6-validation-globale.md](./6-validation-globale.md) | Validation : Advisor vide, preuves par rôle, parcours navigateur, commit | 1-5 | P0 | 1h30 | Security Advisor : 0 ligne SQL (reste le réglage Pro) | ⚠ |

## Ordre d'exécution

1. Étape 1 seule (fondation : tout le reste référence `private.…`).
2. Étapes 2 et 3 en parallèle (fichiers SQL distincts, tables distinctes),
   chacune appliquée séparément après commit et annonce.
3. Étape 4, puis 5, puis 6.
4. Chaque application en prod : fichier commité AVANT, essai à blanc en
   `begin … rollback`, application, contrôle, preuve par rôle annulée.
   Confirmation explicite pour tout `drop function` (étape 2) et pour la
   bascule des relais (étape 3, 35 fonctions).

## Architecture cible

```
schéma private        [nouveau, NON exposé à PostgREST, usage: authenticated]
  get_page_level, is_admin, get_user_role, page_level_rank,
  repjour_manual_forecast_allowed                 [security definer, aides]
  admin_update_password, set_user_grade,
  set_page_permission, remove_page_permission      [security definer]
  daily_reports_occ, rapro_occupancy               [security definer]
  facturation_* (25)                               [security definer]
schéma public         [exposé]
  dismiss_send_reminder                            [security INVOKER, converti]
  relais invoker de même nom → private.<fn>(…)     [35]
  policies : (select private.get_page_level('x')) …
  triggers : prevent_self_role_change, parking_no_past_rewrite → private.*
supabase/
  private_schema_aides.sql, rpc_invoker_2026-09.sql,
  private_rpc_admin.sql, private_rpc_rapro.sql, private_rpc_facturation.sql,
  public_relais.sql, verif_advisor.sql            [nouveaux, autorité]
  anciens fichiers de fonctions                     [en-tête « REMPLACÉ PAR … »]
```

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|-------------------|-------------------|
| SQL Supabase (autorité) | `page_permissions.sql`, `security_core.sql`, `page_permissions_rls*.sql`, `*_rls_fenetre_*.sql`, `perf_rls_ecriture_2026-09-05.sql`, `profiles.sql`, `parking_rls_fenetre_7j.sql`, fichiers `facturation_*.sql`, `rapro_occupancy_fn.sql`, `remediation_securite_*.sql`, `repjour_send_reminder_dismiss.sql`, `literie.sql`, `parking_tarifs.sql`, `lint_hardening_2026-09-05.sql` (en-têtes « remplacé » + policies repointées) | `private_schema_aides.sql`, `rpc_invoker_2026-09.sql`, `private_rpc_admin.sql`, `private_rpc_rapro.sql`, `private_rpc_facturation.sql`, `public_relais.sql`, `verif_advisor.sql` |
| Front | aucun (noms et signatures des RPC inchangés) | — |
| Edge Functions | aucun | — |
| Documentation | `CLAUDE.md` (schéma privé, règle « jamais de security definer dans public ») | — |
| **Total** | **environ 25 modifiés** | **7 nouveaux** |
