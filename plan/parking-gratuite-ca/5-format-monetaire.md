# Étape 5 — Formatage monétaire

## Objectif

Rendre disponible un formateur € côté parking pour afficher le CA, et
corriger le commentaire devenu obsolète qui affirme qu'aucun montant € n'est
jamais calculé.

## Fichier(s) impacté(s)

- `src/lib/parking/format.ts` (modifié)

## Travail à réaliser

### 1. Réexporter `fmtEur`

`src/lib/parking/format.ts` réexporte actuellement `fmtInt, fmtPct,
fmtPctInt` depuis `src/lib/format/index.ts`. Ajouter `fmtEur` à cette
réexportation (signature existante : `fmtEur(n: number, decimals: 0 | 2 =
0)`, déjà utilisée ailleurs dans l'app — ne pas en recréer une nouvelle).

### 2. Corriger le commentaire obsolète

`src/lib/parking/format.ts:2-4` porte un commentaire du type « Aucun montant
€ (la table parking ne porte pas de tarif) » — devenu faux depuis les
étapes 1-2. Le remplacer par une note factuelle courte (le CA vient des
vues analytiques, au tarif versionné dans `parking_tarifs`), ou le
supprimer s'il n'apporte plus rien une fois le CA en place.

## Ordre d'exécution

1. Ajouter la réexportation.
2. Corriger/supprimer le commentaire obsolète.

## Critère de validation

- `import { fmtEur } from '#/lib/parking/format.ts'` compile et fonctionne
  (`npx tsc --noEmit`).
- Le commentaire obsolète n'existe plus dans le fichier.
