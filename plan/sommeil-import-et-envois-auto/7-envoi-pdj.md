# Étape 7 — Envoi PDJ (extension send-report + nouvel expéditeur) + déclenchement

## Objectif

Envoyer l'e-mail PDJ à la liste PDJ, depuis `noreply@pdj.naostack.com`, manuellement
et/ou automatiquement.

## Qui

MOI (code).

## Décisions liées

- [C-INFRA] étendre `send-report` (champ `kind: 'repjour'|'pdj'`) vs nouvelle
  fonction `send-pdj`. **Reco : étendre** (moins de duplication).
- [C-DECLENCHE] envoi auto (après import In-House du jour) vs bouton manuel vs les deux.
- [C-SENDER] nouvel expéditeur `noreply@pdj.naostack.com` (secret `PDJ_REPORT_FROM`).

## Fichier(s)

- `supabase/functions/send-report/index.ts` (ajout `kind` + `from`/liste PDJ)
- `supabase/functions/import-report/{index,pdj}.ts` (si envoi auto)
- `src/lib/pdj/sendServer.ts` (si bouton manuel) + `src/components/pdj/BreakfastBoard.tsx`
  (bouton « Envoyer PDJ » + ⚙️ destinataires + `ServerSendDialog` réutilisé)

## Travail à réaliser

1. `send-report` : paramétrer `from` (secret `PDJ_REPORT_FROM` si `kind='pdj'`, sinon
   `REPORT_FROM`) et la table de destinataires (`pdj_report_recipients` si pdj). Le
   corps `html` vient de l'appelant (rendu PDJ, Étape 6). Réutilise le module d'envoi
   (Étape 3), les bornes, `REPORT_TEST_TO`.
2. **Auto (mode normal)** : dans `import-report`, après import du In-House du jour,
   déclencher l'envoi PDJ (garde-fous : `IMPORT_DRY_RUN`, idempotence par
   `service_date`, `REPORT_TEST_TO`).
3. **Manuel (fallback REQUIS) + UI** : `src/lib/pdj/sendServer.ts` (clone paramétré
   de repjour). Dans la barre d'actions du HAUT de la page PDJ, à côté de
   « Imprimer », un **groupe d'actions admin** (comme RepJour) :
   - bouton **Envoyer** (icône + tooltip) → `ServerSendDialog` (destinataires PDJ)
     avant envoi. NON bridé par l'idempotence auto.
   - ⚙️ **Gérer les destinataires** (icône + tooltip) → `RecipientsModal` avec
     `service={pdjReportRecipients} title="Destinataires PDJ"` (Étape 5).

## Critère de validation

- L'e-mail PDJ part depuis `noreply@pdj.naostack.com` vers la liste PDJ.
- Le flux RepJour (manuel + auto) n'est pas impacté.
- Idempotence (pas de double envoi) si auto.

## Contrôle /borg

Critique (envoi réel + expéditeur) : vérifier l'isolation RepJour/PDJ (bon `from`,
bonne liste), aucun mélange de destinataires, `REPORT_TEST_TO` respecté, pas de
double envoi.
