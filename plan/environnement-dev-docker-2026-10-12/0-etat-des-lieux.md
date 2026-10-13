# Étape 0 — État des lieux et témoins de la prod

## Objectif

Relever, en LECTURE SEULE, tout ce que la base locale devra reproduire, AVANT
de couper l'accès direct à la prod (étape 1). Ces relevés sont les oracles
indépendants de l'étape 6 : on ne compare jamais la base locale à elle-même.

## Fichier(s) impacté(s)

- `plan/environnement-dev-docker-2026-10-12/releve-prod.md` (nouveau)

## Travail à réaliser

1. **Contrôles existants** (lecture, `supabase db query --linked -f`) :
   `verif_complet.sql`, `verif_advisor.sql`, `verif_audit_2026-09-06.sql`,
   `verif_classeur_acces.sql`. Noter chaque résultat (n/n). Ne pas jouer
   `verif_securite.sql` (partiellement obsolète, `email_recipients`).
2. **Catalogue** : `select extname, extversion, extnamespace::regnamespace from pg_extension` ;
   `pg_cron` présent ? jobs `cron.job` (D7) ; version Postgres ; schémas ;
   nombre de tables, policies, fonctions, triggers par schéma (empreinte
   chiffrée, comparée à l'étape 6) ; triggers sur `auth.users` ; policies sur
   `storage.objects` ; `storage.buckets` (id, public, limite, types) ;
   tables de la publication `supabase_realtime` ; `pg_db_role_setting`
   (`alter role … set`).
3. **Secrets des Edge Functions** : `supabase secrets list --project-ref …`
   (NOMS seulement). `REPORT_TEST_TO` est-il encore posé ?
4. **Réglages Auth** (dashboard, lecture) : inscription publique ouverte ou
   fermée, longueur et complexité du mot de passe, URL de site.
5. **Vercel** : variables par environnement (Production / Preview /
   Development) pour `VITE_SUPABASE_*` (D18). Une preview pointe-t-elle sur la
   prod ? Le dire, ne rien changer.
6. **Poste** : Docker Desktop démarré, backend WSL2, RAM libre (≥ 4 Go
   conseillés), `supabase --version`, ports 54321-54324 libres.
7. **Motifs à ne jamais retrouver dans le dépôt** (pour le contrôle PII de
   l'étape 5) : domaines des e-mails clients et noms de fournisseurs, sous
   forme de motifs génériques. Jamais de valeur nominative recopiée dans
   `releve-prod.md`.
8. **Inventaire des colonnes nominatives** (pour l'étape 14) : noms et types
   des colonnes texte de toutes les tables (`information_schema.columns`),
   AUCUNE valeur lue. Chaque colonne qui peut porter un nom de client, une
   plaque ou un commentaire libre est rangée « à anonymiser ».

## Implications propres

- Environ 15 requêtes de catalogue sur la prod. Elles sont espacées, et
  aucune ne lit une table de données.
- Aucune écriture.

## Phase de test /martin

- Famille C (acceptation) : `releve-prod.md` EST l'oracle. Il est committé
  avant l'étape 2, et son SHA est cité à l'étape 6.

## Critère de validation

- `releve-prod.md` contient les 8 rubriques, chiffrées.
- D7 et D18 sont tranchables sur pièces.
- Commit sans push.
