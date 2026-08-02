# Étape 5 — Message, refus et cohérence des surfaces

## Objectif

Afficher le refus « forecast en HT » clairement sur les deux surfaces d'import, et
conserver le mécanisme de « forcer » pour les avertissements bénins (où passer
outre est légitime). La TVA n'est plus un avertissement forçable mais une **erreur
bloquante** : le fichier est refusé, on ré-exporte — pas de bouton forcer.

## Contexte

Décision arrêtée : un forecast en HT est une donnée fausse → **erreur bloquante**,
pas un warning. Conséquence heureuse : le forçage n'a plus à être géré pour la TVA
(une erreur n'est jamais forçable). Le « forcer » historique servait à réimporter
un rapport propre par-dessus un mauvais ; ce besoin disparaît car réimporter un bon
forecast ne déclenche plus de faux avertissement (on compare au réalisé, plus au
rapport précédent). Le forçage reste utile pour les warnings bénins (jours
manquants, occupation sans revenu, ADR inhabituel).

Deux surfaces existent : `ImportSection.tsx` (dashboard, gère errors + warnings +
forçage via `AlertBanner` et une modale) et `ForecastImportButton.tsx` (analytique,
admin, rendu maison). La TVA étant désormais une erreur, elle emprunte le chemin
« erreur » DÉJÀ en place des deux côtés (bloc rouge « Fichier refusé »).

## Fichier(s) impacté(s)

- `src/components/repjour/ImportSection.tsx`
- `src/components/repjour/ForecastImportButton.tsx`
- (message : `src/lib/repjour/calc/validate.ts`, déjà traité étape 3)

## Travail à réaliser

### 1. Vérifier le chemin « erreur » sur les deux surfaces

L'erreur TVA remonte par `preValidateForecast` (errors) et par le `throw` de
`processImport`. S'assurer que les deux surfaces l'affichent proprement en « Fichier
refusé : ... » (bloc rouge / `AlertBanner`), sans proposer de forcer.

### 2. Ne rien casser du forçage des warnings bénins

Le mécanisme `forceRequiresAdmin` / `forceBlocked` reste en place pour les warnings
restants. Comme plus aucun warning ne porte `forceRequiresAdmin` (la TVA était le
seul), `forceBlocked` sera toujours faux : les warnings bénins redeviennent
forçables par tout niveau écriture. Vérifier que c'est le comportement voulu (sinon,
retirer proprement `forceRequiresAdmin`/`forceBlocked` devenus morts).

### 3. Cohérence de rendu

Aligner autant que possible `ForecastImportButton` sur `ImportSection` pour le rendu
des erreurs (idéalement réutiliser `AlertBanner`), pour que le refus TVA se présente
pareil quel que soit le point d'entrée.

## Ordre d'exécution

1. Confirmer l'affichage du refus TVA (erreur) sur les deux surfaces.
2. Nettoyer le forçage devenu mort (`forceRequiresAdmin`) si plus aucun warning ne
   le porte.
3. `npx tsc --noEmit` + `pnpm build`.

## Critère de validation

- Un forecast en HT est **refusé** (bloc rouge « Fichier refusé »), avec le message
  « ré-exporte en cochant Include Tax », sans bouton forcer, sur les deux surfaces.
- Les warnings bénins (jours manquants…) restent forçables normalement.
- `npx tsc --noEmit` et `pnpm build` sans erreur.
