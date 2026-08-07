# Étape 8 — Infra : domaine expéditeur PDJ + secrets + déploiement

## Objectif

Rendre `noreply@pdj.naostack.com` opérationnel comme expéditeur, et mettre le tout
en ligne.

## Qui

TOI (guidé par MOI, comme pour repjour.naostack.com).

## Décision liée

[C-SENDER] confirmer que c'est bien un expéditeur (envoi), pas un récepteur.

## Travail à réaliser

1. **Resend** : Add Domain `pdj.naostack.com` (région EU) → récupérer les records DNS.
2. **Cloudflare** (zone naostack.com) : poser les records (MX/SPF/DKIM comme pour
   `repjour`), nom sans suffixe de zone, CNAME en « DNS only » → Verify dans Resend.
   (La même `RESEND_API_KEY` couvre tous les domaines vérifiés du compte.)
3. **Secrets Supabase** :
   - `supabase secrets set PDJ_REPORT_FROM="OKKO PDJ <noreply@pdj.naostack.com>"`
   - (destinataires PDJ : gérés en base via la modale, pas en secret)
4. **Déploiement** : `supabase functions deploy send-report` (et `import-report` si
   envoi auto PDJ). Exécuter les SQL des Étapes 4 et 5.
5. Garder `REPORT_TEST_TO` posé le temps de la validation (Étape 9), puis le retirer.

## Critère de validation

- `pdj.naostack.com` = Verified dans Resend.
- Un envoi PDJ de test part réellement (via `REPORT_TEST_TO` d'abord).

## Contrôle /borg

Critique (infra/DNS) : vérifier que l'ajout du domaine pdj ne perturbe pas les
records `repjour`/`send.repjour` existants (noms distincts), et que `PDJ_REPORT_FROM`
n'est jamais committé.
