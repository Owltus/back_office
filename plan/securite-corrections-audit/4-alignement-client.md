# Étape 4 — Alignement client (colonnes désormais serveur)

## Objectif

Nettoyage optionnel : retirer des payloads client les colonnes désormais estampillées serveur (`validated_at`, `validated_by`), pour que le code reflète la réalité (ces valeurs ne sont plus contrôlées par le client) et éviter toute confusion future.

## Contexte

Après les étapes 2 et 3, les triggers écrasent toute valeur d'identité/horodatage envoyée par le client. Le payload actuel (`validated_at: new Date().toISOString()`, `validated_by: userId`) est donc IGNORÉ, pas dangereux — d'où le caractère purement cosmétique de cette étape (P2). Ne la faire QUE si l'affichage optimiste immédiat ne dépend pas de ces valeurs locales (sinon les laisser, elles seront de toute façon corrigées au refetch).

## Fichier(s) impacté(s)

- `src/lib/caisse/service.ts` (fonction `validateSheet`, ~ligne 198-204)
- `src/lib/rapro/service.ts` (fonction `validateSheet`, ~ligne 111-133)

## Travail à réaliser

### 1. Caisse — ne plus envoyer `validated_at`/`validated_by`

`validateSheet` ne transmet plus que la transition de statut ; le trigger pose l'horodatage et le signataire.

```ts
// avant : .update({ status: 'validated', validated_at: new Date().toISOString(), validated_by: userId })
// après :
.update({ status: 'validated' })
```

Le paramètre `userId` de `validateSheet` peut devenir inutile (à vérifier : encore utilisé pour un affichage optimiste ?). S'il ne sert plus, le retirer de la signature et de l'appelant (`CaisseBoard`).

### 2. Rapro — idem

`validateSheet` (rapro) : retirer `validated_by`/`validated_at` du upsert de clôture, ne garder que `status: 'validated'` (+ `comment`). Vérifier l'usage de `userId`.

## Ordre d'exécution

1. Éditer les deux services.
2. Ajuster les signatures/appelants si `userId` devient inutile.
3. `npx tsc --noEmit` puis `pnpm build`.

## Critère de validation

- `tsc` + `build` verts.
- La validation caisse/rapro fonctionne toujours (statut passe à `validated`, signataire correct via trigger au refetch).
- Aucun paramètre mort laissé dans les signatures.
