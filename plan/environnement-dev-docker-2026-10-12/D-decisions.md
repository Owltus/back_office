# Décisions — Environnement de dev séparé

Numérotation figée : D1 à D18, jamais renumérotées. Une décision renversée
s'écrit `~~A~~ → **B**`.

---

## Décisions retenues le 2026-10-13

Questions posées à l'utilisateur une à une ; les points techniques non posés
(D4, D7, D15-D18, B1-B7) suivent la recommandation.

| # | Retenu | Raison |
|---|---|---|
| D1 | **A** — base sur le poste, Docker | Choix utilisateur |
| D2 | **B** — Vite sur le poste, base seule en Docker | Choix utilisateur ; étape 11 RETIRÉE |
| D3 | **A** — dump du schéma seul | Choix utilisateur |
| D4 | **A** | Recommandation |
| D5 | **B** — garde-fous d'abord, dump en exception confirmée | Choix utilisateur |
| D6 | **B** — générateur fictif réaliste | Choix utilisateur |
| D7 | Selon le relevé de l'étape 0 | Recommandation |
| D8 | **A** — migrations + `db push`, `migration repair` confirmé | Choix utilisateur |
| D8b | **A** — scripts à plat laissés en place, README | Choix utilisateur |
| D9 | **A** — `supabase unlink` | Choix utilisateur |
| D10 | **B** — hook `garde-prod.mjs` | Choix utilisateur |
| D11 | **A** — pas de Worker en dev | Choix utilisateur |
| D12 | **B** — Mailpit | Choix utilisateur |
| D13 | ~~B~~ → **A** — front local JAMAIS sur la prod | Choix utilisateur : pour voir la prod, le site en ligne |
| D14 | **B** — CLI mise à jour | Choix utilisateur |
| D15 | **A** | Recommandation |
| D16 | ~~A~~ → **B** — bucket en migration | Relecture du 2026-10-13 : `config.toml` ne part jamais en prod, une migration si |
| D17 | **A + B** | Recommandation |
| D18 | **A** | Recommandation |
| D19 | Mot de passe de la base demandé à chaque livraison, jamais stocké ; `livrer` lancé par l'utilisateur | Relecture du 2026-10-13 : `db push` / `db dump` exigent une liaison ou une connexion directe (CLI vérifiée) |
| D20 | UNE commande de livraison (`livrer.bat`) : code + schéma + fonctions, contrôles, résumé, `LIVRER` | Relecture du 2026-10-13 : objectif « mettre à jour la prod simplement » |
| R4 | Discipline STRICTE : aucun correctif en prod hors migration locale, **même en urgence** | Engagement de l'utilisateur (angle /rodin n° 4) |

---

## A. Questions pour l'utilisateur

La colonne « Recommandé » donne le choix de l'assistant. Une réponse globale
« comme recommandé » suffit pour lancer l'exécution.

| # | Question | Choix | Recommandé | Étape | Ce qui en dépend |
|---|---|---|---|---|---|
| D1 | Où vit la base de dev ? | A : sur le poste, `supabase start` (Docker), gratuit, remise à zéro en une commande ; B : second projet Supabase cloud gratuit (plus fidèle, sans Docker, en pause après 7 jours, accessible aux previews Vercel) | **A** (c'est votre demande, et la remise à zéro instantanée est ce qui permet de « faire le zinzin ») | 2 | Tout le plan ; B remplace l'étape 2 par la création du projet |
| D2 | Où tourne Vite ? | A : dans un conteneur aussi ; B : sur le poste, seule la base en Docker | **B** (rechargement à chaud natif, `start.bat` quasi inchangé ; un conteneur Vite sous Windows exige du polling ou WSL2) | 7, 11 | Étape 11 optionnelle si A |
| D3 | D'où vient le schéma de départ ? | A : `supabase db dump` du SCHÉMA seul de la prod (lecture, aucune donnée) ; B : rejouer les 150 scripts et réécrire le socle à la main | **A** (le socle et le trigger d'inscription n'existent nulle part ailleurs ; B est long et faux par construction) | 3 | Lecture en prod à l'étape 3 |
| D4 | Périmètre du dump | A : `public` + `private`, puis les objets à nous dans `auth`/`storage` (trigger, policies) recopiés depuis le catalogue ; B : dump avec `storage`, puis nettoyage des objets internes | **A** (`auth` et `storage` appartiennent à Supabase et sont recréés par la CLI ; on ne garde que ce qui est à nous) | 3, 4 | Étape 4 |
| D5 | Ordre dump / garde-fous | A : dump d'abord, garde-fous ensuite ; B : garde-fous d'abord, puis le dump comme exception explicite et confirmée | **B** (on ne retarde jamais la sécurité ; l'exception sert de premier essai du garde) | 1, 3 | — |
| D6 | Données de dev | A : petit seed fabriqué à la main ; B : générateur de données FICTIVES à volume réaliste (≈ 13 000 lignes PDJ, 90 jours de rapports, 3 classeurs) ; C : copie anonymisée de la prod | **B** (A ne montre aucun problème de volume ; C copie des personnes réelles et lit des données nominatives en prod) | 5 | Tests de pagination et de perf en local |
| D7 | `pg_cron` en local | A : ignoré ; B : activé avec la purge RGPD | **Selon le relevé de l'étape 0** : installé en prod → B, sinon A (CLAUDE.md et `pdj_breakfasts.sql:95` se contredisent) | 0, 4 | — |
| D8 | Comment un changement de schéma arrive en prod | A : `supabase/migrations/` + `supabase db push --project-ref …`, avec un `migration repair` initial qui ÉCRIT la table d'historique en prod (une fois, confirmé) ; B : on garde des scripts appliqués à la main, mais toujours rejoués d'abord en local | **A** (c'est la pratique établie de Supabase ; la prod sait quelles migrations elle a, et `db push` refuse ce qui diverge) | 9 | Une écriture en prod, confirmée |
| D8b | Que deviennent les 150 scripts à plat ? | A : laissés en place, figés, avec `supabase/README.md` (« historique, ne plus rejouer ») ; B : déplacés dans `supabase/historique/` | **A** (CLAUDE.md et la mémoire les citent par chemin des centaines de fois ; rien ne casse) | 9 | — |
| D9 | Le poste reste-t-il lié à la prod ? | A : `supabase unlink`, et `--project-ref` explicite pour toute action prod ; B : lien gardé, avec des garde-fous | **A** (sans lien, l'oubli d'un drapeau échoue au lieu de frapper la prod) | 1 | Bob, déploiement |
| D10 | Garde de l'assistant | A : règle de permission « ask » sur `--linked` ; B : hook PreToolUse qui refuse toute commande visant la prod sans le mot `PROD_CONFIRME=1` posé par vous | **B**, script versionné dans `scripts/garde-prod.mjs` (un hook est mécanique ; une règle « ask » se valide par réflexe) | 1 | — |
| D11 | Worker Cloudflare en dev | A : aucun, `import-report` testé par des fichiers `.eml` envoyés à la main ; B : `[env.dev]` + `wrangler dev` local | **A** (B partagerait le compte et les crons, pour un pipeline qui se teste très bien sans lui) | 8 | — |
| D12 | E-mails en dev | A : vraie clé Resend + `REPORT_TEST_TO` obligatoire ; B : en local, les e-mails partent dans Mailpit (boîte de test sur `localhost:54324`), jamais chez Resend ; C : envoi simplement refusé | **B** (vous VOYEZ l'e-mail sans qu'il parte nulle part ; la garde est dans le code, pas dans un secret à ne pas oublier) | 8 | Changement de `_shared/send-mail.ts` |
| D13 | Peut-on lancer le front local sur la prod ? | A : interdit ; B : autorisé par une commande distincte `pnpm dev:prod` (port 3001), bandeau ROUGE | **B** (utile pour enquêter en lecture ; port distinct = sessions séparées) | 7 | — |
| D14 | Version de la CLI Supabase | A : garder 2.101 ; B : mettre à jour (≥ 2.119) | **B** (images de conteneurs proches de la prod, Postgres 17) | 2 | — |
| D15 | `postgres` est superuser en local, pas en prod | A : tous les tests RLS sous `set role authenticated` + un contrôle que la baseline ne dépend pas du superuser ; B : écart seulement documenté | **A** | 6, 10 | — |
| D16 | Bucket `classeur-images` | A : déclaré dans `config.toml` (`[storage.buckets]`) ; B : SQL de migration | **A** pour le bucket, policies en migration (méthode documentée par Supabase) | 4 | — |
| D17 | Outil des tests sur la vraie base | A : pgTAP (`supabase test db`) ; B : les `verif_*.sql` existants | **A + B** : `verif_*` pour l'acceptation (étape 6), pgTAP pour les matrices (étape 10) | 6, 10 | — |
| D18 | Previews Vercel | A : hors périmètre, simple contrôle de leurs variables ; B : les brancher sur une base de dev (exige D1-B) | **A** (si une preview pointe sur la prod, on le saura et on le dira) | 0 | — |

---

## B. Réponses par défaut (réversibles)

| # | Point | Réponse par défaut | Raison |
|---|---|---|---|
| B1 | Ports | Stack Supabase sur les ports par défaut (54321-54324) ; app locale 3000 (plus de port prod : D13-A) | Convention CLI |
| B2 | Conteneurs inutiles | `analytics` et `vector` exclus (`-x`) | ≈ 1 Go de RAM gagné, aucun usage par l'app |
| B3 | Comptes de test | Mot de passe commun écrit dans `supabase/seed.sql` (local seulement) ; e-mails en `@exemple.test` | Domaine réservé, jamais livrable |
| B4 | Nom du projet local | `project_id = "back-office"` | Préfixe des conteneurs Docker |
| B5 | Bandeau | Ambre « DEV · base locale » ; rien sur Vercel (pas de bandeau rouge : D13-A) | Critère = la CIBLE, pas le mode Vite |
| B6 | Seed reproductible | Générateur à graine fixe : les mêmes données à chaque `db reset` | Tests et captures comparables |
| B7 | Volume du générateur | 90 jours glissants autour de la date du jour | Fenêtres RLS (3 j, 7 j, 30 j) toutes exercées |
