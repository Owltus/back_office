# Étape 9 — Livrer en prod : UNE commande, `livrer.bat`

## Objectif

Mettre la prod à jour avec ce qui a été développé en local en UN geste :
double-clic sur `livrer.bat` (ou `pnpm livrer`), lecture du résumé, saisie
du mot de passe de la base, et c'est fini. Code, schéma et fonctions serveur
partent ensemble, dans le bon ordre, ou rien ne part.

Révisé le 2026-10-13 (relecture « étanchéité + livraison simple ») : la
version précédente laissait quatre gestes séparés (`db:livrer`,
`functions deploy`, `git push`, Worker) que l'utilisateur devait penser à
enchaîner dans l'ordre.

## Ce qui part en prod, ce qui ne part JAMAIS

| Développé en local | Part en prod ? | Par quoi |
|---|---|---|
| Code de l'app (`src/`) | Oui | `git push` → Vercel |
| Changement de schéma (tables, policies, RPC, triggers, buckets) | Oui | `supabase/migrations/` → `db push` |
| Données de RÉFÉRENCE nécessaires à l'app (nouvelle page dans un CHECK, nouveau référentiel) | Oui | une MIGRATION, jamais le seed |
| Edge Functions modifiées | Oui | `functions deploy`, seulement celles qui ont changé |
| Données fictives (`seed.sql`), comptes de test, documents écrits en local, images envoyées en local | **Jamais** | rien : chaque base garde ses données |
| Réglages Auth de `config.toml` | **Jamais** automatiquement | signalés par le résumé si `config.toml` a changé, à reporter à la main dans le dashboard |
| Secrets | **Jamais** | `livrer` compare les NOMS attendus (`.env.local.example`) à ceux de la prod et s'arrête s'il en manque un |
| Worker Cloudflare | Non (D11) | si `worker/` a changé, `livrer` le dit et rappelle `wrangler deploy` + `triggers deploy` + `wrangler tail` |

Conséquence à retenir : un document du Classeur rédigé en local reste en
local. On développe en local ; on SAISIT le contenu réel en prod, dans l'app.

## Fichier(s) impacté(s)

- `scripts/livrer.mjs` (nouveau) : logique PURE (`planDeLivraison`) +
  adaptateur (commandes) ; `scripts/livrer.test.ts`
- `livrer.bat` (nouveau, à côté de `start.bat`)
- `scripts/capturer.mjs` → `pnpm db:capturer <nom>` (voir 3)
- `supabase/README.md` (nouveau : ce qui fait foi, ce qui est de l'historique)
- `package.json` (`livrer`, `db:nouvelle`, `db:capturer`, `db:derive`)

## Travail à réaliser

### 1. Amorçage, une seule fois (D8-A, écriture confirmée)

`migration repair --status applied <baseline> <hors_public>` sur la prod :
crée `supabase_migrations.schema_migrations` et y inscrit les deux
migrations, sans rien rejouer. Empreinte du schéma relevée avant / après :
identique. Puis étiquette git `prod` posée sur `origin/main` (= ce qui tourne
sur Vercel).

### 2. Ce que fait `livrer`, dans cet ordre

1. **Contrôles locaux, sans rien toucher à la prod** — s'arrête au premier
   échec, avec une phrase qui dit quoi faire :
   - branche `main`, arbre git propre, à jour avec `origin/main` ;
   - `npx tsc --noEmit`, `pnpm test`, `pnpm build` ;
   - `supabase db reset` local (toutes les migrations + le seed rejouent sur
     une base vide) puis `pnpm test:db`.
2. **Liaison temporaire** : mot de passe de la base demandé (saisie masquée,
   jamais écrit sur le disque, D19), `supabase link`, et `supabase unlink`
   dans un `finally` — même en cas d'erreur, le poste ressort délié.
3. **Dérive** : schéma de la prod (`db dump --linked`) comparé au schéma
   local SANS les nouvelles migrations. Différence → arrêt : quelqu'un a
   modifié la prod hors migration, on ne livre pas par-dessus.
4. **Résumé**, en français :
   - commits qui partent (depuis l'étiquette `prod`) ;
   - migrations nouvelles (`db push --dry-run`) ;
   - fonctions modifiées (`git diff prod..HEAD -- supabase/functions`,
     `_shared` modifié = toutes) ;
   - avertissements : secret manquant, `config.toml` ou `worker/` modifiés,
     migration qui SUPPRIME quelque chose (voir 4).
5. **Confirmation** : taper `LIVRER`. Toute autre réponse → rien ne part.
6. **Envoi**, dans l'ordre qui ne casse pas l'app en service :
   1. `db push` (le schéma d'abord : l'ancien code doit le supporter) ;
   2. `functions deploy <nom> --project-ref …` pour chaque fonction modifiée
      (`import-report` toujours avec `--no-verify-jwt`) ;
   3. `git push origin main` → Vercel ;
   4. étiquette `prod` déplacée sur HEAD.
   Un échec à une étape arrête la suite et dit exactement ce qui est parti
   et ce qui n'est pas parti.
7. **Contrôle après** (lecture) : `verif_advisor.sql` et
   `verif_classeur_acces.sql` en prod, sonde `POST /auth/v1/token` (la seule
   qui prouve que la base sert), `migration list` local = prod.

### 3. Faire le zinzin dans Studio, puis le capturer

On peut modifier la base locale à la souris dans Studio
(`localhost:54323`) ou par SQL libre. `pnpm db:capturer <nom>` (=
`supabase db diff --local -f <nom>`) écrit la migration correspondante ;
on la relit, `pnpm db:reset` prouve qu'elle rejoue, et elle part au prochain
`livrer`. Un essai qu'on ne capture pas disparaît au prochain `db:reset`.

### 4. Règle « ajouter avant de retirer »

Entre `db push` et la fin du déploiement Vercel (1 à 2 minutes), l'ANCIEN
code tourne sur le NOUVEAU schéma. Une migration qui supprime ou renomme une
colonne, une table ou une fonction encore lue par le code en service casse
l'app pendant ce temps. `livrer` repère `drop` / `rename` et exige une
seconde confirmation. Méthode : ajouter (livraison 1), basculer le code
(livraison 1 ou 2), retirer l'ancien (livraison suivante).

### 5. Fichiers à plat (D8b-A)

Laissés en place ; `supabase/README.md` dit qu'ils sont de l'historique et
qu'aucun n'est plus rejoué. Tout nouveau changement va dans
`supabase/migrations/`.

## Implications propres

- C'est l'UTILISATEUR qui lance `livrer` : il saisit le mot de passe, et
  l'assistant ne saisit jamais d'identifiant. L'assistant peut préparer,
  lancer les contrôles locaux et le `--dry-run` local, jamais l'envoi.
- `seed.sql` n'est jamais joué en prod (`db push` sans `--include-seed`,
  vérifié par un test sur la commande construite).

## Phase de test /martin

- Famille A : `planDeLivraison` (pur) — arbre sale, pas sur `main`, en
  retard sur `origin`, dérive, secret manquant, `drop` sans seconde
  confirmation, réponse autre que `LIVRER` → aucune commande d'envoi dans le
  plan ; ordre des envois figé ; `--include-seed` jamais présent ;
  `unlink` toujours présent. Stryker ≥ 80 %.
- Essai à blanc complet : une migration inoffensive (commentaire sur une
  table) capturée, rejouée en local, `livrer` jusqu'au résumé, réponse
  « non ». La première vraie livraison est faite par l'utilisateur.

## Critère de validation

- `livrer.bat` mène au résumé et s'arrête proprement sur « non ».
- `supabase/.temp/project-ref` absent après chaque sortie (succès, échec,
  Ctrl + C).
- `supabase/README.md` écrit.
- Commit sans push.

## Contrôle /borg

- Aucun chemin d'envoi sans résumé ni `LIVRER`.
- Aucun mot de passe écrit sur le disque ni affiché.
- `migration repair` n'a rien rejoué (empreinte avant / après).
