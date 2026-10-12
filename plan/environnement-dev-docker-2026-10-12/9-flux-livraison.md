# Étape 9 — Du local à la prod : le flux de livraison

## Objectif

Une seule façon, écrite, de faire arriver un changement en prod, toujours
après l'avoir joué et vérifié en local. Fin des scripts « joués à la main
dans le SQL Editor ».

## Fichier(s) impacté(s)

- `scripts/db-livrer.mjs` (nouveau) + test
- `supabase/README.md` (nouveau : ce qui fait foi, ce qui est de
  l'historique)
- `package.json` (`db:nouvelle`, `db:livrer`)

## Travail à réaliser

1. **Aligner l'historique de la prod** (D8-A, UNE écriture, confirmée dans
   le chat) :
   `PROD_CONFIRME=1 supabase migration repair --status applied <ts_baseline> <ts_hors_public> --project-ref …`.
   Cela crée `supabase_migrations.schema_migrations` en prod et y inscrit
   les deux migrations, sans rien rejouer.
2. **Circuit d'un changement** :
   1. `pnpm db:nouvelle <nom>` → `supabase migration new` ;
   2. écrire le SQL (en-tête symptôme / cause / correctif / innocuité /
      vérification, comme aujourd'hui) ;
   3. `pnpm db:reset` : toutes les migrations plus le seed, en local ;
   4. tests (`pnpm test:db`, `verif_*` en local), puis essai dans l'app ;
   5. commit ;
   6. `pnpm db:livrer` : `supabase db push --dry-run --project-ref …`
      affiché, confirmation explicite, puis `db push` réel ;
      `verif_*` relus en prod (lecture).
3. **Garde de `db:livrer`** : refuse si l'arbre git n'est pas propre, si la
   migration n'est pas committée, ou si le `--dry-run` liste autre chose que
   les migrations attendues (dérive de la prod détectée → stop).
4. **Fichiers à plat** (D8b-A) : laissés en place, `supabase/README.md`
   explique qu'ils sont l'historique et qu'aucun n'est plus rejoué ; les
   nouveaux changements vont TOUS dans `supabase/migrations/`.
5. **Checklist de mise en prod** (dans `supabase/README.md`) : migrations,
   Edge Functions (`supabase functions deploy <nom> --project-ref …`,
   `import-report` avec `verify_jwt` figé), secrets, Worker (`wrangler
   deploy` puis `triggers deploy`, constater dans `wrangler tail`), Vercel
   (push sur `main`).
6. **Dérive** : `supabase db diff --linked`, impossible puisque non lié, est
   remplacé par `pnpm db:derive` (dump du schéma de la prod comparé à
   `db dump --local`) ; à lancer avant chaque livraison et une fois par
   mois.

## Implications propres

- Écriture en prod : `migration repair`, une fois, puis chaque `db push`,
  confirmés un par un (règle des opérations destructrices étendue à toute
  livraison).
- `CLAUDE.md` (« le fichier `supabase/*.sql` reste la source de vérité ») est
  réécrit à l'étape 12 : la source de vérité devient `supabase/migrations/`.

## Phase de test /martin

- Famille A : la garde de `db:livrer` (arbre sale, migration non committée,
  dry-run inattendu → refus) ; Stryker ≥ 80 %.
- Essai à blanc complet : une migration inoffensive (commentaire sur une
  table) créée, rejouée en local, livrée en `--dry-run` seulement ; le vrai
  `db push` attend la première vraie livraison.

## Critère de validation

- `supabase migration list --project-ref …` (lecture) montre local = prod.
- `supabase/README.md` écrit.
- Commit sans push.

## Contrôle /borg

- Aucun chemin de livraison sans dry-run ni confirmation.
- `seed.sql` n'est jamais joué en prod.
- `migration repair` n'a rien rejoué (empreinte de la prod inchangée,
  relevé avant / après).
