# Étape 1 — L'envoi manuel pose le marqueur d'envoi

## Objectif

Faire en sorte qu'un envoi MANUEL (bouton « Envoyer » de la page) marque le rapport
comme envoyé en base, exactement comme l'envoi auto. C'est ce qui permettra au
bandeau (étape 3) de disparaître après un envoi manuel.

## Contexte

Aujourd'hui, seul l'envoi AUTO pose un marqueur (`daily_reports.auto_sent_at` pour
RepJour ; ligne dans `pdj_auto_send_log` pour PDJ). L'envoi manuel (Edge Function
`send-report`) envoie l'e-mail mais ne pose rien. On réutilise ces mêmes marqueurs
(pas de nouvelle colonne) : après un envoi manuel réussi, `send-report` les pose.

## Fichier(s) impacté(s)

- `supabase/functions/send-report/index.ts`

## Travail à réaliser

### 1. Récupérer la date du rapport envoyé

Vérifier comment `send-report` connaît la date/`kind` (repjour|pdj) du document envoyé
(paramètre reçu du client, ou lu en base). Identifier la date cible.

### 2. Poser le marqueur APRÈS un envoi Resend réussi

- `kind === 'repjour'` : `update daily_reports set auto_sent_at = now() where date = D`
  (on ne conditionne PAS sur `is null` ici : un renvoi manuel doit rafraîchir/garder
  le marqueur). Documenter que `auto_sent_at` signifie désormais « envoyé (auto ou manuel) ».
- `kind === 'pdj'` : `upsert pdj_auto_send_log (service_date = D)` on conflict do nothing.

Le marqueur n'est posé QUE si l'envoi a réussi (après le retour OK de Resend), jamais
avant. En cas d'échec, on ne pose rien (le bandeau reste).

## Ordre d'exécution

1. Lire `send-report/index.ts` (entrées, date, kind, point de succès Resend).
2. Ajouter la pose du marqueur après succès, selon `kind`.

## Critère de validation

- `deno check --node-modules-dir=auto supabase/functions/send-report/index.ts` OK.
- Raisonnement : après un envoi manuel réussi, `auto_sent_at` (RepJour) est posé /
  une ligne `pdj_auto_send_log` existe (PDJ) → le bandeau (étape 3) se retire.
- Un envoi manuel qui échoue ne pose aucun marqueur.
