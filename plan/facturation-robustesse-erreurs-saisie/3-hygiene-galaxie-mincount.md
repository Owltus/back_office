# Étape 3 — Hygiène de la galaxie (seuil minCount)

## Objectif

Empêcher que le bruit à très faible `count` (fautes de frappe, mots OCR parasites)
n'apparaisse dans la galaxie sous forme de nœuds/liens qui n'ont pas de sens, sans rien
supprimer en base (masquage d'affichage seulement).

## Contexte

Diagnostic frontend : `buildGalaxy` (`galaxy.ts`) crée un nœud dès `count ≥ 1` (aucun
seuil minimal), pour chaque token des `topWordsPerCode` d'un code. Un mot pollué devient
un petit nœud `word` en périphérie ; un émetteur légitime mal imputé crée un lien
`issuer→code` vers le mauvais soleil (le cas le plus trompeur). La galaxie lit l'appris
serveur (`serverPool`). Décision **D6** : seuil `minCount` d'AFFICHAGE (non destructif),
cohérent avec la sémantique `idf` (`cf<2 → 0`) et avec `pruneClouds(minCount=2)`.

## Fichier(s) impacté(s)

- `src/lib/facturation/galaxy.ts`
- `src/components/facturation/FacturationGalaxie.tsx`

## Travail à réaliser

### 1. Paramètre `minCount` dans `buildGalaxy`

Ajouter un paramètre optionnel (défaut par ex. 2) qui filtre les tokens sous ce seuil
AVANT la construction des nœuds/liens, sans toucher au pool ni à la base.

```ts
export function buildGalaxy(
  pool: WordPool,
  issuers: Issuer[],
  topWordsPerCode = 12,
  minCount = 2,
): GalaxyGraph {
  // ... pour chaque code : entries.filter(([, count]) => count >= minCount) avant tri/slice
}
```

Attention : garder le comportement déterministe et ne pas casser les tests existants de
`buildGalaxy` (`facturation.test.ts`) — s'ils utilisent des counts ≥ 2, ils restent
valides ; sinon ajuster les données de test ou passer `minCount = 1` dans ces tests.

### 2. Câblage dans la page galaxie

`FacturationGalaxie.tsx` appelle `buildGalaxy(serverPool, issuers, WORDS_PER_CODE)` →
passer le `minCount`. Optionnel (D6) : le rendre réglable (mais un défaut fixe suffit en v1).

### 3. Cohérence du compteur d'en-tête

Le panneau affiche « N émetteurs · N imputations · N mots » (comptés depuis le graphe) :
comme le graphe est déjà filtré, le compteur reflète l'affiché (pas le bruit) — vérifier
que le comptage se fait bien sur le graphe filtré.

## Ordre d'exécution

1. `minCount` dans `buildGalaxy` (filtre avant nœuds).
2. Ajuster/valider les tests `buildGalaxy`.
3. Passer `minCount` depuis `FacturationGalaxie`.

## Critère de validation

- Un token à `count = 1` (typo) n'apparaît plus comme nœud dans la galaxie.
- Les nœuds/liens légitimes (count ≥ seuil) sont inchangés ; layout et survol intacts.
- `npx tsc --noEmit`, `npx vitest run` passent (tests `buildGalaxy` ajustés si besoin).
