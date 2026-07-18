# Étape 1 — Retrait des règles mot-clé = libellé

## Objectif

Supprimer de `SEED_RULES` les dernières règles déterministes dont le mot-clé recoupe le
LIBELLÉ de l'imputation (attribution par le nom de la ligne), pour laisser ces cas à
l'éducation du pull de mots. Les règles de FOURNISSEURS spécifiques (marques : booking,
mazars, adyen, castalie…) sont conservées comme graine légitime.

## Contexte

Diagnostic de l'agent détection : `gaz`/`electricite` sont déjà retirés. Restent quatre
court-circuits « mot générique = libellé » :
- `alcool` (id `alcool` → `REBEALCOOL`) — explicitement visé.
- `chauffage urbain` (id `chauffage` → `FMCHAUFFUo`).
- `blanchissage` / `location linge` (id `linge` → `HELINGEooo`).
- `gardiennage` dans la règle `prestataires` (garder `loomis`, retirer `gardiennage`).

Aucun test n'assertait sur ces mots (vérifié par l'agent tests) → retrait sûr côté suite.
Voir décision **D1** pour l'ampleur (option A = tout retirer, retenue).

## Fichier(s) impacté(s)

- `src/lib/facturation/constants.ts` (SEED_RULES)
- `src/lib/facturation/facturation.test.ts` (nouveau test de gel du comportement)

## Travail à réaliser

### 1. Retirer les règles génériques de SEED_RULES

- Supprimer les objets `id: 'alcool'`, `id: 'chauffage'`, `id: 'linge'`.
- Dans `id: 'prestataires'`, retirer `'gardiennage'` de `keywords` (conserver `'loomis'`).
- Ajouter un commentaire expliquant le principe (comme celui déjà présent pour gaz/électricité).

### 2. Figer le nouveau comportement par un test

```ts
it('alcool : plus de règle mot-clé générique → imputation laissée à l’éducation', () => {
  expect(detect('Facture achat alcool — vins et spiritueux', SEED_RULES).code).toBeNull()
})
```

## Ordre d'exécution

1. Éditer `SEED_RULES` (retraits + commentaire).
2. Ajouter le test.
3. `npx tsc --noEmit` puis `npx vitest run src/lib/facturation`.

## Critère de validation

- `SEED_RULES` ne contient plus que des mots-clés de fournisseurs spécifiques (aucun mot
  générique recoupant un libellé).
- `detect('… alcool …', SEED_RULES).code === null` (sans pool appris).
- `npx tsc --noEmit` et `npx vitest run` verts (les tests `booking`/`adyen` restent OK).
