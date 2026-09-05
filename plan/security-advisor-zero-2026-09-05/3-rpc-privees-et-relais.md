# Étape 3 — RPC privilégiées en `private`, relais invoker dans `public`

## Objectif

Sortir de l'API les 35 fonctions qui doivent garder leurs privilèges
(elles écrivent des tables volontairement fermées, journalisent dans
`audit_log`, ou croisent des pages) et exposer à leur place, dans `public`,
un relais `security invoker` de même nom, même signature, même type de
retour, qui appelle `private.<fn>(…)`. L'application ne change pas d'une
ligne.

## Contexte

- Liste (agent SQL) : `admin_update_password`, `set_user_grade`,
  `set_page_permission`, `remove_page_permission` (comptes et droits ;
  `audit_log` sans policy, `auth.users`, `user_page_permissions` fermée) ;
  `daily_reports_occ`, `rapro_occupancy` (croisement de pages, filtrage
  PII) ; 25 `facturation_*` (tables `facturation_*` sans policy d'écriture,
  validation `len >= 4`, idempotence par hash, jeton de confirmation :
  garanties que le passage en invoker ferait perdre).
- Retours typés à préserver à l'identique : `facturation_ref_comptes_reimport`
  et `facturation_ref_reimport` renvoient `integer`, `facturation_learn_document`
  renvoie `boolean`, `daily_reports_occ` renvoie `integer` scalaire,
  `rapro_occupancy` renvoie `table(room, adr, manual_kind)`. Le front lit
  `data` tel quel (`rapro/service.ts:307-311`, `cloudService.ts:184,237,493`).
- Surcharges : `facturation_issuer_codes_forget` existe en `(text)` et
  `(text, text)` ; les deux sont déplacées et relayées.
- Appels internes : `facturation_learn_document` appelle
  `facturation_wordpool_learn`, `facturation_issuer_learn`,
  `facturation_issuer_codes_learn` ; `facturation_ref_reimport_replace`
  appelle `facturation_ref_reimport`. Dans `private`, ces appels deviennent
  `private.…` (les relais publics ne doivent JAMAIS être appelés depuis
  `private`).

## Fichier(s) impacté(s)

- `supabase/private_rpc_admin.sql`, `supabase/private_rpc_rapro.sql`,
  `supabase/private_rpc_facturation.sql` (nouveaux, générés)
- `supabase/public_relais.sql` (nouveau, généré)

## Travail à réaliser

### 1. Génération depuis le catalogue

Pour chaque fonction : `pg_get_functiondef(oid)`, `pg_get_function_arguments`,
`pg_get_function_result`, `proconfig`, `provolatile`. Émettre :

```sql
-- déplacement (conserve OID, grants, dépendances)
alter function public.<fn>(<args>) set schema private;
-- corps régénéré : public.<aide>( → private.<aide>(, appels internes → private.
create or replace function private.<fn>(<args>) returns <result>
  language <l> <volatilité> security definer set search_path = public as $$ … $$;
revoke execute on function private.<fn>(<args>) from public, anon;
grant execute on function private.<fn>(<args>) to authenticated;

-- relais public, même signature exacte (noms de paramètres INCLUS : PostgREST
-- les apparie par nom), invoker, search_path figé
create function public.<fn>(<args>) returns <result>
  language sql security invoker set search_path = public as $$
  select * from private.<fn>(<args par nom>)   -- ou `select private.<fn>(…)` pour un scalaire / void
$$;
revoke execute on function public.<fn>(<args>) from public, anon;
grant execute on function public.<fn>(<args>) to authenticated;
```

Règles du générateur : `returns void` → relais `language sql` avec
`select private.fn(...)` ; `returns table(...)`/`setof` → `returns table(...)`
+ `select * from private.fn(...)` ; scalaire → `select private.fn(...)`.
Volatilité du relais = celle de la fonction (`stable` pour les lectures).
Les noms de paramètres sont copiés tels quels, avec leurs types exacts
(`smallint`, `text[]`, `jsonb`).

### 2. Ordre dans le fichier

Aides déjà en privé (étape 1). Puis les fonctions appelées par d'autres
(`facturation_wordpool_learn`, `facturation_issuer_learn`,
`facturation_issuer_codes_learn`, `facturation_ref_reimport`) AVANT leurs
appelantes. Un seul fichier d'application ou trois, mais une transaction
par application.

### 3. Essai à blanc, application, preuves

Essai `begin … rollback` avec, dans la transaction, un contrôle : 35
fonctions dans `private`, 35 relais invoker dans `public`, 0 `security
definer` non-trigger dans `public`. Application après confirmation
explicite (bascule des 35). Preuves en transaction annulée sous
`authenticated` : `select public.daily_reports_occ(current_date - 1)`
(compte rapro → entier ; compte sans rapro → null), `select * from
public.rapro_occupancy(current_date - 1)` (lignes), `select
public.facturation_learn_document(...)` avec un hash de test (compte admin →
`true`, puis `false` au second appel : idempotence conservée) puis
rollback, `select public.set_user_grade(...)` par un non-admin (refus).

## Ordre d'exécution

1. Générateur, relecture des 35 relais (signatures) et des 35 corps
   (substitutions uniquement).
2. Commit, essai à blanc, confirmation, application, contrôles.
3. Parcours navigateur : /comptes (changer un droit puis le remettre),
   /facturation (imputer une facture de test puis l'oublier), /rapro
   (occupation et contrôle OCF affichés), /repjour bande rapro.

## Critère de validation

- Aucun changement dans `src/` ; `npx tsc --noEmit` inchangé.
- Contrôle catalogue : 0 `security definer` non-trigger dans `public`.
- Les 31 appels RPC du front fonctionnent, retours typés identiques
  (`number`, `number`, `boolean`, `integer`, table).
- `verif_complet.sql`, `verif_securite_2026-08-05.sql` OK.

## Contrôle qualité (revue)

Étape critique (35 fonctions, modèle de droits). `/borg` n'étant pas
installé, revue manuelle ciblée : (1) chaque relais a EXACTEMENT les mêmes
noms, types et ordre de paramètres que l'original (diff automatique
`pg_get_function_arguments` avant/après) ; (2) aucun relais n'est
`security definer` ; (3) aucune fonction privée n'appelle un relais
public ; (4) les gardes internes (`private.is_admin()`,
`private.get_page_level('facturation') = 'gestion'`) sont présentes dans
chaque corps privé (grep automatique, 35/35).
