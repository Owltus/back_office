# Étape 5 — Extraction SIRET/SIREN et clé émetteur fiabilisée

## Objectif

Reconnaître l'émetteur de façon fiable via son SIRET/SIREN lu sur la facture, au lieu du seul nom (fragile : noms courts type EDF, OCR bruité). Clé émetteur = SIREN si détecté, repli sur le nom normalisé.

## Contexte

Aujourd'hui `matchIssuer` cherche le nom normalisé en sous-chaîne (≥ 4 caractères) → EDF/RTE/SFR non mémorisables (`canLearn` false), et un nom mal océrisé casse la reconnaissance. Décision D4 : regrouper par SIREN (l'entreprise), pas par SIRET (l'établissement).

## Fichier(s) impacté(s)

- `src/lib/facturation/siret.ts` (nouveau : extraction + validation)
- `src/lib/facturation/text.ts` (modification : `issuerKey` accepte un SIREN prioritaire)
- `src/lib/facturation/issuers.ts` (modification : match par SIREN d'abord, repli nom)
- `src/lib/facturation/facturation.test.ts` (ajout tests SIRET/SIREN)

## Travail à réaliser

### 1. Extraction

`extractSiren(text)` : regex SIRET (14 chiffres) / SIREN (9 chiffres), tolérante aux espaces. Validation par la clé de Luhn pour écarter les faux positifs (montants, numéros de facture). Renvoie le SIREN (9 premiers chiffres du SIRET).

### 2. Clé émetteur

Clé canonique = `siren:<9 chiffres>` si détecté et valide, sinon `issuerKey(nom)` (repli actuel). Anti-fragilité conservée (`normalizeIssuer`, `similarity.closestName`).

### 3. Reconnaissance

`matchIssuer` privilégie le SIREN présent dans le texte ; repli sur la sous-chaîne de nom.

## Ordre d'exécution

1. `siret.ts` (pur, testable en Node).
2. Intégration dans `text.ts` / `issuers.ts`.
3. Tests.

## Critère de validation

- `npx tsc --noEmit` + `pnpm build` + tests verts.
- Une facture EDF (nom court) devient reconnaissable dès qu'un SIREN valide est présent.
- Un faux SIREN (Luhn invalide) est ignoré.
