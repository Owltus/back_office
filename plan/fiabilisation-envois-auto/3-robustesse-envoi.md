# Étape 3 — Envoi robuste (retry ≤5 + rollback sur toute erreur)

## Objectif

Qu'un aléa réseau (hoquet Resend) ou une erreur survenant APRÈS la réservation ne
fasse plus perdre un e-mail EN SILENCE ni « brûler » un jour.

## Contexte

Deux défauts confirmés par l'audit :
- (C) Échec Resend = e-mail perdu, aucun réessai. La note « envoi échoué » ne relance
  pas la relecture différée (sa regex ne matche que « pas frais / absent / hors cycle »).
- (D) Une erreur APRÈS la réservation (relecture des lignes PDJ, génération du PDF)
  laisse le jour marqué « envoyé » sans mail parti : la libération ne couvre QUE
  l'échec Resend, pas une exception dans le bloc post-réservation.

(L'horloge unique — défaut F — est traitée en étape 2.)

## Fichier(s) impacté(s)

- `supabase/functions/_shared/send-mail.ts`
- `supabase/functions/import-report/autoSendPdj.ts`
- `supabase/functions/import-report/autoSend.ts`

## Travail à réaliser

### 1. Retry avec arrêt au succès (C) — dans send-mail.ts

Encadrer l'appel Resend d'une boucle : **jusqu'à 5 tentatives, stop dès succès**,
backoff court entre essais (ex. 1s, 2s, 4s, 8s ; total < ~15s, compatible Edge).
Ne retenter que sur erreur transitoire (5xx / réseau / timeout), PAS sur une config
absente (destinataires vides = 4xx métier). Bénéficie à l'auto ET au manuel.

```ts
// pseudo — dans sendMail, autour de l'appel Resend
for (let attempt = 1; attempt <= 5; attempt++) {
  try {
    const res = await fetch(RESEND, ...)
    if (res.ok) return { ok: true, ... }          // stop dès succès
    if (!isTransient(res.status)) return { ok: false, ... } // 4xx : inutile de réessayer
  } catch (_networkErr) { /* transitoire : on retente */ }
  if (attempt < 5) await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)))
}
return { ok: false, error: 'échec après 5 tentatives' }
```

### 2. Rollback sur TOUTE erreur après réservation (D)

Dans `autoSendPdj.ts` (et symétriquement `autoSend.ts`), envelopper le bloc
post-réservation (relecture lignes, build feuille/PDF, envoi) dans un `try` ; sur toute
exception OU tout `!ok`, libérer la réservation avant de retourner :
- PDJ : `delete pdj_auto_send_log where service_date = D`.
- RepJour : `update daily_reports set auto_sent_at = null where date = D`.

Ne libérer QUE si l'envoi n'a pas réussi (jamais après un succès). Corriger le
commentaire trompeur (« un ré-import pourra relancer ») : aucun ré-import auto n'existe ;
le rattrapage se fait par le bandeau + envoi manuel.

```ts
// pseudo (PDJ) — après la réservation atomique réussie
try {
  // relecture lignes, build feuille, PDF, sendMail (avec retry de l'étape 1)
  if (!result.ok) throw new Error(result.error ?? 'envoi échoué')
  return { sent: true, note: ... }
} catch (err) {
  await admin.from('pdj_auto_send_log').delete().eq('service_date', D) // libère
  return { sent: false, note: `envoi non abouti (${err.message})` }
}
```

## Ordre d'exécution

1. Retry dans `send-mail.ts`.
2. Rollback total dans `autoSendPdj.ts` puis `autoSend.ts`.

## Critère de validation

- `deno check --node-modules-dir=auto supabase/functions/import-report/index.ts` OK.
- Raisonnement : 5 essais max, arrêt au 1er succès ; une erreur post-réservation
  (rowsErr, exception PDF, échec Resend) libère bien le jour → ré-envoi possible (auto
  au prochain déclenchement, ou manuel via le bandeau) ; jamais de « déjà envoyé » fantôme.
- L'idempotence tient toujours : deux invocations concurrentes → un seul gagnant, pas
  de double envoi malgré le retry.
