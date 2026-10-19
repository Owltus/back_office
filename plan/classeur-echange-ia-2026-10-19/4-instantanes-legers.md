# Étape 4 — Points de restauration sans mode d'emploi

## Objectif

Les instantanés (points auto, manuels, fusion, sécurité) n'embarquent plus le
mode d'emploi de l'IA (D6). Ils gardent les cinq clés exigées par Registre,
dont `periodicites`, que la restauration relit (`merge.ts:309`).

## Dépend de

2.

## Fichier(s) impacté(s)

- `src/lib/classeur/merge/schema.ts` : option `{ pourIa: boolean }` (ou
  fonction séparée) de `construireExport`.
- `src/lib/classeur/restauration.ts:142`, `src/lib/classeur/merge/apply.ts:511`,
  `src/lib/classeur/merge/history.ts:71` : appellent la variante sans consignes.
- `src/lib/classeur/merge/history.ts` l.20-22 : commentaire périmé sur
  `updated_at` (contredit E6) à corriger.

## Travail à réaliser

1. Ajouter l'option, défaut = export pour l'IA (les exports utilisateur ne
   changent pas d'appel).
2. Brancher les trois appelants d'instantanés.
3. Corriger le commentaire de `history.ts`.

## Implications propres

- `instantaneEgal` ignore `_metadata` : le dédoublonnage n'est pas touché.
- Un instantané téléchargé depuis l'Historique n'a plus de mode d'emploi : c'est
  une sauvegarde, pas un échange avec une IA. L'aide le dit si besoin.

## Phase de test /martin

- Restauration exacte (P8 de `audit.property.test.ts`) toujours verte.
- Un instantané sans `instructions` est lu par `parseImportJson` et contient les
  cinq clés.

## Critère de validation

- `pnpm test src/lib/classeur`.
