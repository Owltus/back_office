# Étape 4 — Guidage à l'import

## Objectif

Que le guidage se voie DÈS le dépôt d'une facture : un résumé directionnel (« plutôt telle
famille, rarement telle autre ») pour un émetteur connu, et une alerte douce quand on choisit
une imputation dans une famille improbable pour cet émetteur (« la mauvaise direction »).

## Contexte

À l'import, `processInvoice` (`FacturationBoard.tsx:126-186`) appelle `matchIssuer` puis
`detect(text, undefined, pool, issuerHintFor(...))`. `issuerHintFor` (`FacturationBoard.tsx:104-121`)
assemble déjà le prior code + la denylist en `IssuerHint {prior, concentrated, deny}`
(`detect.ts:26`). C'est le point naturel pour calculer AUSSI le prior famille et le porter
jusqu'à l'UI via `Detection`.

## Fichier(s) impacté(s)

- `src/lib/facturation/detect.ts` (`IssuerHint` + `Detection` : champ `familyPrior`)
- `src/components/facturation/FacturationBoard.tsx` (`issuerHintFor` calcule le prior famille)
- `src/components/facturation/InvoicePanel.tsx` (résumé directionnel + alerte)
- `src/lib/facturation/notices.ts` (notice « inhabituel pour cet émetteur »)

## Travail à réaliser

### 1. Porter le prior famille dans la détection

- `IssuerHint` (`detect.ts:26`) gagne `familyPrior?: Record<string, number>`.
- `Detection` gagne `familyPrior?: Record<string, number>` et `familyReady?: boolean`, simplement
  recopiés (le guidage famille ne re-pondère PAS les codes ici — départage doux, on n'altère
  pas la détection code existante ; on EXPOSE le signal pour l'UI). Ne pas casser `redetect`.
- `issuerHintFor` (`FacturationBoard.tsx:104-121`) calcule `issuerFamilyPrior(issuerCodes,
  key, budgetCategory)` (le board a accès au registre) + `familyGuidanceReady(total)` via
  `issuerMaturity`, et les passe dans le hint.

### 2. Résumé directionnel (InvoicePanel)

Sous l'émetteur, quand `detection.familyReady` : une ligne courte, en langage clair, dérivée
des familles `plausible` (mises en avant) et `improbable` (« rare »). Style hôtelier : phrase
courte, pas de jargon, pas de message si l'émetteur n'est pas mûr (démarrage à froid → rien).

Exemple : « Plutôt : Exploitation, Maintenance. Rare pour cet émetteur : Restauration. »

### 3. Alerte « mauvaise direction » (notices.ts)

Ajouter une notice `famille-improbable` : si un code retenu appartient à une famille
`improbable` pour l'émetteur courant, message doux, NON bloquant (`tone: 'warn'`, `canStamp`
inchangé — c'est un signal, pas une interdiction, cohérent AA1). Réutiliser `familyTier`.

Exemple : « Imputation inhabituelle pour cet émetteur — à vérifier. »

## Ordre d'exécution

1. `IssuerHint`/`Detection` + `issuerHintFor`.
2. Résumé directionnel dans InvoicePanel.
3. Notice `famille-improbable`.

## Critère de validation

- `npx tsc --noEmit` propre, tests verts.
- Émetteur connu et concentré → résumé directionnel affiché ; émetteur inconnu → aucun résumé.
- Choisir un code d'une famille jamais vue pour cet émetteur → alerte douce, tampon toujours
  possible.
- La détection des CODES est inchangée (le guidage famille n'altère pas `d.codes`).
