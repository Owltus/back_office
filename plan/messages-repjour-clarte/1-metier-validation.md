# Étape 1 — Messages de validation (métier)

## Objectif

Finaliser et centraliser les messages de `validate.ts`. Cette session a déjà réécrit
l'objet `MSG` (7 messages forecast) et les 4 messages de `validateCoherence` en langage
simple, et posé le garde-fou TVA (`forceRequiresAdmin`). Il reste à centraliser les 4
messages de cohérence (aujourd'hui écrits en dur, dont un quasi-doublon de `MSG.impossible`)
dans `MSG` pour une source unique, et à vérifier la cohérence de ton.

## Fichier(s) impacté(s)

- `src/lib/repjour/calc/validate.ts`
- `src/lib/repjour/types.ts` (pour mémoire : `Alert.forceRequiresAdmin` déjà en place)

## Travail à réaliser

### 1. Centraliser les 4 messages de `validateCoherence` dans `MSG`

Aujourd'hui ces messages sont inline dans les `alerts.push` de `validateCoherence`
(lignes ~161-173). Les remonter dans l'objet `MSG` pour une source unique, comme les
messages forecast. Textes déjà validés cette session, on ne fait que les déplacer :

```ts
const MSG = {
  // ... messages forecast existants ...

  // Cohérence du rapport réel (réalisé) — étaient inline, centralisés ici.
  realNegatives:
    'Le fichier contient des chiffres négatifs. Il a mal été exporté, recommence.',
  tooManyRooms:
    "Le fichier compte plus de chambres vendues que l'hôtel n'en a. Vérifie le fichier.",
  roomNoRevenue:
    'Des chambres sont vendues mais leur montant est à zéro. Vérifie le fichier.',
  revenueNoRoom:
    'Il y a un montant mais aucune chambre vendue. Vérifie le fichier.',
} as const
```

Puis remplacer les chaînes en dur de `validateCoherence` par `MSG.realNegatives`,
`MSG.tooManyRooms`, `MSG.roomNoRevenue`, `MSG.revenueNoRoom`.

### 2. Vérifier les messages forecast existants (aucun changement de texte attendu)

Contrôler que les 7 messages de `MSG` (empty, incomplete, impossible, occNoRev,
adrWeird, tvaMissing, tvaHigh) sont bien en tutoiement, sans jargon, sans chiffre.
Ils l'ont été cette session — étape de relecture seulement.

### 3. Garde-fou TVA : rien à changer, à documenter

`MSG.tvaMissing` et `MSG.tvaHigh` portent `forceRequiresAdmin: true` (posé cette
session). Vérifier que le commentaire au-dessus explique bien le pourquoi (incident du
rapport sans TVA forcé). Ne pas retoucher la logique de détection.

## Ordre d'exécution

1. Ajouter les 4 clés de cohérence à `MSG`.
2. Remplacer les 4 chaînes inline de `validateCoherence`.
3. Relire les 7 messages forecast.

## Critère de validation

- `npx tsc --noEmit` sans erreur.
- Aucun message de `validate.ts` n'est plus écrit en dur hors de `MSG`.
- Les textes affichés à l'écran sont identiques à ceux validés cette session (pas de
  régression de formulation).
