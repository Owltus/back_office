# Étape 4 — [ASSISTANT] Correctifs de code métier

## Objectif

Corriger les findings d'intégrité côté code applicatif : câbler le client sur la
RPC d'apprentissage idempotente (partie client de A1), purger la rémanence de
facturation rapro (A5), sommer les totaux caisse en entiers (B10/C1).

## Findings couverts

- **A1 (client)** — Remplacer les appels non idempotents (`learnClouds`/`learnIssuerCodes`/`learnIssuer` + `recordLearnedDoc`) par l'unique RPC `facturation_learn_document` (créée en fiche 1). Retirer la garde purement cliente comme SEULE protection.
- **A5** — Rapro : à la réouverture (`reopenSheet`) ou à l'import d'occupation, purger/recroiser les lignes `nettoyee` matérialisées qui ne correspondent plus à une occupation réelle (sur-facturation ELIOR fantôme).
- **B10 / C1** — Caisse : sommer les totaux analytiques en centimes entiers (comme `fundTotal`), pas en float euros.

## Fichiers impactés

- `src/lib/facturation/cloudService.ts`, `src/components/facturation/InvoicePanel.tsx` (A1)
- `src/lib/rapro/service.ts`, `src/components/rapro/RaproBoard.tsx` (A5)
- `src/lib/caisse/analytics.ts` (B10/C1)

## Travail à réaliser

### 1. A1 client
Appeler `supabase.rpc('facturation_learn_document', { hash, deltas, codes, issuer, comptes })` en un seul appel transactionnel ; l'idempotence est garantie serveur. Conserver la garde cliente comme simple optimisation UX (pas comme sécurité).

### 2. A5 rémanence rapro
Dans `reopenSheet` (ou au chargement), recroiser les lignes `status='nettoyee'` du jour avec l'occupation réelle ; supprimer (ou re-neutraliser) celles sans occupation ni couleur explicite posée à la main. À cadrer pour ne pas effacer une correction manuelle légitime.

### 3. B10/C1 caisse
Dans `analytics.ts`, cumuler en centimes entiers puis diviser par 100 à l'affichage.

## Ordre d'exécution

1. A1 client (dépend de la RPC de la fiche 1 — jouée par toi en fiche 5).
2. A5, puis B10/C1.
3. `npx tsc --noEmit` + tests + `pnpm build`, committer, pousser.

## Critère de validation

- Double-tampon du même PDF (2 onglets) : les compteurs n'augmentent qu'une fois (après fiche 5).
- Réouverture d'un jour rapro avec occupation corrigée : plus de chambre `nettoyee` fantôme dans l'analytique.
- Totaux caisse sans dérive float (`12345.67`, pas `12345.6700000001`).
- Suite de tests au vert.
