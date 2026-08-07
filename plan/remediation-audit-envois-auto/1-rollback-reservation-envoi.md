# Étape 1 — Rollback de la réservation sur échec d'envoi

## Objectif

Ne plus « brûler » définitivement l'envoi auto d'un jour quand l'appel Resend
échoue après la réservation d'idempotence. Vaut pour le RepJour (`auto_sent_at`)
et le PDJ (`pdj_auto_send_log`). Défaut cross-confirmé par deux agents.

## Contexte

Séquence actuelle : on réserve d'abord (pose `auto_sent_at` / insère la ligne de
log), puis on envoie. Si `sendMail` renvoie `!ok` (Resend 5xx, table de
destinataires vide, timeout), la fonction retourne `{sent:false}` mais laisse la
réservation en place → le jour est marqué « envoyé » sans mail parti, et aucune
tentative auto ne le rattrapera (seul le renvoi manuel admin le peut).

## Fichier(s) impacté(s)

- `supabase/functions/import-report/autoSend.ts`
- `supabase/functions/import-report/autoSendPdj.ts`

## Travail à réaliser

### 1. PDJ — supprimer la réservation sur échec

Dans `autoSendPdj.ts`, au retour d'échec de `sendMail` (actuellement `if (!result.ok)
return { sent:false, note: ... }`), supprimer d'abord la ligne réservée :

```ts
if (!result.ok) {
  // Libérer la réservation : sinon le jour reste marqué « envoyé » sans mail parti.
  await admin.from('pdj_auto_send_log').delete().eq('service_date', D)
  return { sent: false, note: `envoi échoué (${result.error ?? 'inconnu'})` }
}
```

### 2. RepJour — remettre auto_sent_at à NULL sur échec

Dans `autoSend.ts`, symétriquement, au retour d'échec de `sendMail` :

```ts
if (!result.ok) {
  // Libérer la réservation atomique pour permettre une nouvelle tentative auto.
  await admin.from('daily_reports').update({ auto_sent_at: null }).eq('date', D)
  return { sent: false, note: `envoi échoué (${result.error ?? 'inconnu'})` }
}
```

Ne PAS toucher aux vérifs déjà correctement placées AVANT la réservation
(`RESEND_API_KEY` manquante). Le trou concerne uniquement l'échec Resend /
destinataires survenant APRÈS la réservation.

## Ordre d'exécution

1. Éditer `autoSendPdj.ts`.
2. Éditer `autoSend.ts`.

## Critère de validation

- `deno check --node-modules-dir=auto supabase/functions/import-report/index.ts` OK.
- Relecture : sur chemin d'échec, la réservation est bien annulée dans les deux fichiers.
- Un second import du même jour après un échec relance bien une tentative (raisonnement).
