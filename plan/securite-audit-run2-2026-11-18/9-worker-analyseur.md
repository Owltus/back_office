# Étape 9 — Worker : analyseur conforme et expéditeur strict

## Objectif

Corriger la piste « guillemets dans l'expéditeur » avec deux barrages :

- refuser tout expéditeur d'enveloppe hors d'une grammaire simple ;
- lire `Authentication-Results` comme le dit la RFC 8601.

L'alignement passe aussi en exact.

## Contexte

- Ne commencer qu'après l'étape 8 et 2 nuits propres.
- L'expéditeur réel est `bounce+66d2df.8f0739-backoffice=naostack.com@stayntouch.com`.
- Son en-tête réel porte `dkim=pass header.d=stayntouch.com`, `dmarc=pass header.from=stayntouch.com`, `spf=none`.
- Cloudflare accepte un e-mail dont le SPF ou le DKIM est valide, sans exiger l'alignement. Le Worker est donc le seul à le contrôler.

## Fichier(s) impacté(s)

- `cloudflare/stayntouch_in_to_supabase.js`
- `cloudflare/worker.audit.test.ts` (+ cas fast-check)
- `cloudflare/wrangler.toml` (commentaires seulement)

## Travail à réaliser

### 1. Grammaire de l'enveloppe

Après la lecture de `message.from`, refuser ce qui ne correspond pas à `^[a-z0-9._+=-]+@[a-z0-9.-]+$` : un seul `@`, pas de guillemet, de `;`, de parenthèse ni d'espace. L'adresse réelle passe.

### 2. Analyseur

- Créer un petit lecteur qui respecte les chaînes entre guillemets et les commentaires imbriqués. S'il trouve quelque chose de déséquilibré, le contrôle échoue.
- `header.d` et `header.from` doivent être un domaine nu, sans `@`.
- `domaineDe` refuse un guillemet ou plusieurs `@`.

### 3. Alignement exact

Accepter seulement `dkim=pass` avec `header.d === domaine`, ou `dmarc=pass` avec `header.from === domaine`. SPF ne suffit plus à lui seul (StayNTouch n'a pas de SPF).

### 4. Divers

- `X-Mail-From` passe par `sanitizeHeader`.
- Le contrôle `message.rawSize` refuse un e-mail de plus de 25 Mo.
- Noter l'en-tête `From:` dans la ligne d'observation, pour plus tard.

### 5. Gardé tel quel

- `ALLOWED_SENDER_DOMAINS`, `REQUIRE_SENDER_AUTH`, `keep_vars` ;
- les crons, `SONDE_CRON`, `VEILLE_CRON` ;
- le délai de 20 s ;
- l'ancien contrôle `senderAuthPassed` et la variable `SENDER_AUTH_ALIGNEE` : ils restent comme retour arrière d'une seule variable.

## Ordre d'exécution

1. Tests qui échouent aujourd'hui : local part entre guillemets avec `;`, parenthèse ouverte, `@` dans `header.d`, CR/LF. Les 3 cas d'en-têtes réels doivent toujours passer.
2. Code, puis tests verts.
3. Noter l'identifiant de la version en place avant le déploiement.
4. Déployer en journée, au moins 2 h avant 02:00, avec l'accord de l'utilisateur et `--worker-deploye` à la livraison.
5. Première nuit : `wrangler tail --format json` entre 02:00 et 03:00. Compter « auth pass (aligne oui) », vérifier qu'il n'y a ni « expediteur refuse » ni « Import refusé », et que l'e-mail du rapport est reçu.
6. Au moindre refus : `wrangler rollback <id>` tout de suite, puis import manuel dans l'app.

## Critère de validation

- Trois nuits sans refus, avec les 4 rapports importés chaque nuit.

## Contrôle /borg

- Aucune ancienne voie n'est rouverte.
- Le retour arrière est prêt et noté avant le déploiement.
