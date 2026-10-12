# Étape 4 — Objets à nous dans `auth`, `storage`, `realtime`

## Objectif

Recréer, dans une seconde migration, ce qui nous appartient hors des schémas
`public` et `private` : sans cela, l'inscription ne crée pas de profil, les
images ne s'envoient pas, et le planning parking ne se rafraîchit pas.

## Fichier(s) impacté(s)

- `supabase/migrations/<ts>_hors_public.sql` (nouveau)
- `supabase/config.toml` (`[storage.buckets.classeur-images]`, D16)

## Travail à réaliser

1. **Trigger d'inscription** `auth.users → profiles` : définition et fonction
   reprises du catalogue de la prod (`pg_get_triggerdef`,
   `pg_get_functiondef`, lus à l'étape 0, jamais recopiés de mémoire).
2. **Bucket** `classeur-images` : `public = false`, 20 MiB, types autorisés
   `image/webp`, déclaré dans `config.toml`.
3. **Policies `storage.objects`** : les trois policies d'autorité
   (`classeur_acces_2026-09-28.sql`, section storage), lecture par
   `private.classeur_lecture_ok`, écriture par `private.classeur_write_ok`.
4. **Realtime** : `alter publication supabase_realtime add table
   public.parking_reservations` (seule table, règle du 2026-09-20).
5. **Extensions** : `btree_gist` dans `extensions`, `pgcrypto`,
   `pg_stat_statements` ; `pg_cron` selon D7.
6. **Réglages de rôles** : `idle_in_transaction_session_timeout = 60s` sur
   `authenticated`, `anon` et `authenticator` (`perf_audit_2026-09-06.sql`).
7. **Écart superuser** (D15-A) : un contrôle SQL qui échoue si une
   migration exige d'être superuser (`alter system`, `create role` sans
   `if not exists`…).

## Implications propres

- 100 % local. Aucune de ces instructions n'est rejouée en prod : elles y
  existent déjà. La migration sera marquée « appliquée » à l'étape 9.

## Phase de test /martin

- Inscription d'un compte de test → une ligne `profiles` créée.
- Envoi d'une image `.webp` par un compte en écriture → 200 ; en lecture
  seule → 403 ; un `.png` → refusé par le bucket.
- Modification de `parking_reservations` → évènement reçu sur le canal
  (script Node avec `supabase-js` local).

## Critère de validation

- `supabase db reset` vert.
- Les trois essais ci-dessus réussissent.
- Commit sans push.

## Contrôle /borg

- Le trigger d'inscription est identique, mot pour mot, à celui de la prod.
- Les policies storage sont identiques au catalogue de la prod.
- Aucune autre table dans la publication realtime.
