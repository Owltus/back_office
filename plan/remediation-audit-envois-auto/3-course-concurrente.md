# Étape 3 — Résilience à la course entre les deux e-mails

## Objectif

Éviter l'envoi auto MANQUÉ quand Comparison et Forecast arrivent en deux
invocations Edge concurrentes qui s'abstiennent toutes les deux.

## Contexte

Comparison et Forecast arrivent dans deux e-mails séparés → deux POST Worker →
deux invocations quasi simultanées. En interleave, l'invocation Comparison peut
lire la fraîcheur du Forecast avant son commit (« pas frais » → abstention), et
l'invocation Forecast peut lire le candidat avant le commit du Comparison
(candidat = veille → abstention). Les deux s'abstiennent → rapport du jour jamais
envoyé en auto.

Correctif pragmatique retenu (voir divergence en Phase 5 : la solution totale
serait un trigger DB). Deux leviers simples et sans nouvelle infra :

1. Une petite RELECTURE différée du candidat/fraîcheur en fin d'invocation, pour
   laisser le commit concurrent se matérialiser.
2. Grâce à l'idempotence atomique (`auto_sent_at`), une double tentative reste sûre
   (un seul gagnant).

## Fichier(s) impacté(s)

- `supabase/functions/import-report/index.ts`
- `supabase/functions/import-report/autoSend.ts` (aucune régression sur l'idempotence)

## Travail à réaliser

### 1. Seconde tentative brève après un premier échec « pas prêt »

Dans `index.ts`, là où `maybeAutoSendRepjour` est appelé après un import, si le
résultat est « non envoyé » pour une raison transitoire (candidat hors cycle OU
Forecast pas frais/absent), retenter UNE fois après un court délai, le temps que
l'invocation sœur commit. L'idempotence garantit qu'aucun double envoi ne peut en
résulter.

```ts
const TRANSIENT = /pas frais|absent|hors cycle/i
let outcome = await maybeAutoSendRepjour(admin, dryRun)
if (!dryRun && !outcome.sent && TRANSIENT.test(outcome.note)) {
  await new Promise((r) => setTimeout(r, 4000))
  outcome = await maybeAutoSendRepjour(admin, dryRun)
}
```

Note : borne volontairement courte (une seule relecture, ~4 s). Ce n'est pas une
garantie absolue (fenêtre résiduelle si le commit sœur dépasse le délai), mais elle
couvre le cas normal (commits à quelques centaines de ms). Documenter la fenêtre
résiduelle dans le commentaire.

## Ordre d'exécution

1. Étape 4 d'abord (le message « hors cycle » doit exister pour le motif transitoire).
2. Ajouter la relecture différée dans `index.ts`.

## Critère de validation

- `deno check` OK.
- Raisonnement : dans l'ordre Comparison-puis-Forecast comme dans l'inverse, au
  moins une invocation finit par voir les deux fichiers committés et envoie.
- L'idempotence empêche tout double envoi lors de la double tentative.
