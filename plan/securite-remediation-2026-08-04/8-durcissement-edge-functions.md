# Étape 8 — F5 + F6 : durcissement des Edge Functions

## Objectif

Réduire l'impact d'un token admin compromis : plafonner le débit de `send-report`
(sinon relais de phishing/spam depuis un domaine vérifié) et borner le chemin
rollback de `create-user` (qui supprime un `auth.users` sans profil sous simple
garde admin, contournant les protections de `delete-user`). Rendre aussi les
messages d'erreur génériques (fuite d'info mineure).

## Contexte

Findings Faibles du pentest : atténués par la garde admin serveur (non exploitables
sans compte admin), mais un durcissement de défense en profondeur. Aucune faille
critique ici.

## Fichier(s) impacté(s)

- `supabase/functions/send-report/index.ts`
- `supabase/functions/create-user/index.ts`

## Travail à réaliser

### 1. Rate limiting `send-report` (F5)

Ajouter un compteur de débit par appelant avant l'envoi Resend : par exemple une
fenêtre glissante via une table `audit_log` (ou une table dédiée `send_log`), refus
au-delà de N envois / M minutes. À défaut de table, au minimum plafonner le nombre
de destinataires par appel et journaliser chaque envoi (appelant, horodatage,
nombre). Le garde-fou `REPORT_TEST_TO` limite déjà les destinataires mais ni le
débit ni le contenu.

### 2. Borner le rollback `create-user` (F6)

`create-user/index.ts:110-125` : le chemin `rollbackUserId` appelle
`admin.auth.admin.deleteUser(uid)` dès qu'aucun profil n'existe pour `uid`.
Restreindre aux identités créées à l'instant : soit vérifier `created_at` très
récent (< quelques minutes), soit exiger un jeton de corrélation renvoyé par
l'étape de création. Journaliser l'opération.

### 3. Messages d'erreur génériques (Mineur-1)

Dans `send-report` (détail Resend brut, l.168-171) et `create-user`/`delete-user`
(messages Postgres/Auth bruts), renvoyer au client un message générique et loguer
le détail côté serveur uniquement.

## Ordre d'exécution

1. Adapter les deux fonctions.
2. Déploiement des Edge Functions par l'utilisateur (`supabase functions deploy`).
3. Committer.

## Critère de validation

- `send-report` : au-delà du seuil, l'appel est refusé (message clair) ; en deçà,
  l'envoi fonctionne.
- `create-user` rollback : ne supprime plus une identité `auth.users` ancienne sans
  profil (test avec un `rollbackUserId` arbitraire -> refus).
- Les réponses d'erreur ne contiennent plus de détail interne Resend/Postgres.

## Contrôle /borg

Non requis (pas de schéma DB touché). Vérifier néanmoins que le rate limiting
n'introduit pas de faux refus sur l'usage normal (envoi quotidien légitime).
