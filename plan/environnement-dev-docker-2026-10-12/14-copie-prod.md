# Étape 14 — Copier les données de la prod en local, à la demande

Ajoutée le 2026-10-13, à la demande de l'utilisateur : « que toutes les
données de la prod […] soient envoyées, quand j'en ai besoin, au serveur en
mode dev, histoire que je voie des données réelles et non des données
fictives. » Décisions D21 à D23.

## Objectif

UNE commande, `copier-prod.bat` (ou `pnpm copier-prod`), lancée par
l'utilisateur quand il le souhaite, qui remplace TOUTES les données de la
base locale par celles de la prod :
- **les noms des clients remplacés** (« Client 1 », « Client 2 »…, D22) ;
- **les vrais comptes** : connexion en local avec son e-mail et son mot de
  passe habituels, avec les mêmes droits (D23).

Sens unique : prod → poste. Rien ne repart (étape 9 : `livrer` n'envoie
jamais de données).

## Fichier(s) impacté(s)

- `scripts/copier-prod.mjs` (nouveau) : logique PURE
  (`planDeCopie`, liste des tables exclues, liste des colonnes à anonymiser)
  + adaptateur (commandes) ; `scripts/copier-prod.test.ts`
- `supabase/anonymiser.sql` (nouveau) : remplacement des noms, joué en LOCAL
  seulement, après le chargement
- `copier-prod.bat` (nouveau, à côté de `start.bat` et `livrer.bat`)
- `package.json` (`copier-prod`)

## Travail à réaliser

### 1. Prérequis, sinon refus de démarrer

- Stack locale démarrée (étape 2), cible prouvée locale (`127.0.0.1:54322`).
- **Étape 8 faite** : les vrais destinataires de rapport
  (`server_report_recipients`) arrivent avec la copie. Les e-mails des
  fonctions locales doivent partir dans Mailpit, par construction (D12),
  AVANT la première copie.
- Arbre git propre (la copie rejoue les migrations du dépôt).

### 2. Ce que fait `copier-prod`, dans cet ordre

1. **Mot de passe** de la base demandé (saisie masquée, jamais écrit, D19),
   liaison temporaire, `supabase unlink` dans un `finally`.
2. **Version de la prod** : `migration list --linked` → dernière migration
   appliquée en prod.
3. **Lecture** (seul contact avec la prod, une requête de dump, ≈ 27 Mo) :
   `supabase db dump --linked --data-only` sur `public`, `private`, `auth`,
   `storage`, avec les **tables exclues** (voir 3), vers un fichier du
   dossier temporaire du système (jamais dans le dépôt).
4. **Base locale remise à la version de la prod** :
   `supabase db reset --local --no-seed --version <dernière migration prod>`.
   Les données arrivent donc sur EXACTEMENT le schéma qui les a produites.
5. **Chargement** sous `session_replication_role = replica` : les triggers
   d'estampillage, de version, de journal (`keep_author`, `classeur_stamp`,
   `classeur_version_monotone`, `log_row_change`) ne réécrivent rien. Les
   séquences et identités sont recalées (`setval`).
6. **Anonymisation** (`supabase/anonymiser.sql`, en local) — voir 4.
7. **Fichier de dump EFFACÉ** (`finally`, succès comme échec).
8. **Migrations pas encore livrées** : `supabase migration up --local`. Si
   l'une échoue sur les vraies données, c'est exactement ce qu'on voulait
   savoir AVANT `livrer` : message clair, base laissée dans cet état pour
   enquête.
9. **Images du Classeur** : les fichiers du bucket `classeur-images` copiés
   de la prod vers le stockage local (les lignes de `storage.objects`
   arrivent avec le dump, pas les fichiers). Moyen exact à vérifier à
   l'écriture (`supabase storage cp` en lecture côté prod) ; repli :
   images manquantes signalées, le reste de la copie est valable.
10. **Résumé** : lignes par table, comptes copiés, noms remplacés, images
    copiées, migrations rejouées ; rappel « vos essais locaux précédents
    sont remplacés ».

### 3. Ce qui n'est PAS copié

| Exclu | Pourquoi |
|---|---|
| `auth.sessions`, `auth.refresh_tokens`, `auth.mfa_*`, `auth.flow_state`, `auth.one_time_tokens`, `auth.audit_log_entries` | Sessions et jetons de la prod : jamais sur le poste. Les comptes (`auth.users`, `auth.identities`) sont copiés, donc la connexion locale se fait avec le mot de passe habituel |
| `supabase_migrations.*` | L'historique local vient du `db reset --version` |
| `realtime.*`, `storage.migrations`, `net.*`, `cron.job_run_details` | Internes à Supabase |

### 4. Anonymisation (D22)

- Chaque nom de client devient `Client <n>`, **le même n pour le même nom**
  dans une même copie (un client qui revient garde son numéro : les
  regroupements restent justes). Plaques d'immatriculation remplacées de la
  même façon ; commentaires libres des cautions vidés.
- **Liste des colonnes** : inventaire du catalogue à l'étape 0 (noms et
  types des colonnes seulement, aucune valeur lue), figée dans
  `copier-prod.mjs`. Premières candidates : `pdj_breakfasts`, réservations
  parking, `caisse_cautions`, lits bébé, et les copies de ces lignes dans
  `audit_log`.
- **Test bloquant** : toute colonne texte d'une table classée sensible doit
  être rangée « anonymisée » ou « conservée » dans la liste ; une colonne
  nouvelle et non rangée fait ÉCHOUER le test (même principe que
  `PREFIXES_SENSIBLES` de `queryPersist.test.ts`).
- Le personnel (`profiles`, auteurs des versions de documents) est conservé
  : ce sont les vrais comptes (D23).
- Limite assumée : entre le chargement et l'anonymisation (quelques
  secondes), et dans le fichier temporaire effacé à la fin, les vrais noms
  passent sur le disque du poste.

## Implications propres

- C'est l'UTILISATEUR qui lance `copier-prod` (mot de passe de la base).
  L'assistant ne la lance pas et ne lit pas le dump.
- Prod : une lecture par copie, ≈ 27 Mo, sans écriture. Ne pas la lancer
  en boucle (règle du 2026-09-23 : la lecture soutenue vide le budget d'E/S).
- `pnpm db:reset` garde le seed FICTIF (étape 5), qui reste la base des
  tests automatiques (`pnpm test:db`) : déterministe, sans dépendre de la
  prod. Deux états possibles de la base locale, dits par le résumé et par le
  bandeau (« DEV · base locale · copie du 13/10 » ou « DEV · données
  fictives »).
- Martin et l'assistant peuvent écrire sur cette copie : elle est locale. Les
  vrais comptes y existent avec leurs vrais mots de passe (hachés) :
  l'assistant ne s'y connecte JAMAIS avec un compte réel, il utilise un
  compte de test qu'il crée en local.
- Les mots de passe changés en prod ne sont repris qu'à la copie suivante.

## Phase de test /martin

- Famille A : `planDeCopie` (pur) — stack arrêtée, cible non locale, étape 8
  absente, arbre sale → aucune commande ; `unlink` et effacement du dump
  toujours présents ; tables exclues toujours exclues ; `--no-seed`
  toujours présent ; aucune commande d'écriture vers la prod dans le plan.
  Stryker ≥ 80 %.
- Anonymisation : sur une base locale garnie de noms fictifs connus,
  `anonymiser.sql` → plus aucun nom d'origine (oracle : la liste injectée),
  même n pour le même nom, nombre de lignes inchangé, rejouable.
- Essai réel (par l'utilisateur, puis contrôle par l'assistant en lecture
  locale) : connexion avec son compte, pages remplies, `select count(*)` de
  noms ne correspondant pas à `^Client [0-9]+$` = 0 sur chaque colonne
  anonymisée, dump absent du disque, `supabase/.temp/project-ref` absent.

## Critère de validation

- Une copie complète en moins de 5 minutes, de bout en bout.
- Aucun nom de client réel en base locale.
- Connexion locale avec un vrai compte, droits identiques à la prod.
- Une migration non livrée est rejouée sur les vraies données.
- Commit sans push.

## Contrôle /borg

- Aucun chemin d'écriture vers la prod dans le script.
- Rien de la prod dans le dépôt (dump hors dépôt, effacé).
- Aucune session ni aucun jeton copié.
