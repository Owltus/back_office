# Étape 5 — Validation globale

## Objectif

Vérifier l'ensemble sans régression, et le découpage de bundle (d3 lazy).

## Fichier(s) impacté(s)

- Aucun (vérification ; correctifs ponctuels).

## Travail à réaliser

```bash
npx tsc --noEmit
npx vitest run
pnpm build
npx prettier --write "src/lib/facturation/*.ts" "src/components/facturation/*.tsx"
```

Au build : vérifier que **d3 est dans un chunk séparé** (pas dans le bundle
initial de la route) — la galaxie est chargée à la demande.

Vérification navigateur :
- Card « Prévisualisation graphique » en haut du rail droit, au-dessus d'« Imputation
  comptable ».
- Clic → modal → galaxie : amas par code colorés par domaine, halos « nébuleuse ».
- Zoom molette + pan glisser + recentrage ; tooltip au survol (mot, code, libellé,
  count).
- Pool vide → bouton désactivé (ou état « pas encore de données »).
- Aucune régression : imputation, détection, tampon, tags, émetteur.

## Critère de validation

- tsc + vitest + build verts ; d3 en chunk séparé.
- Galaxie lisible et navigable ; tooltips corrects.
- Pas de fuite mémoire (simulation stoppée au démontage du modal).

## Contrôle /borg

Dernière étape → audit :
- d3 chargé UNIQUEMENT en import() dynamique (hors bundle initial).
- La galaxie LIT le pool (aucune écriture, aucune donnée nouvelle).
- Nettoyage effectif au démontage (simulation.stop, listeners retirés, ResizeObserver
  déconnecté) — pas de boucle d'animation qui survit au modal fermé.
- Couleurs : uniquement la palette hex statique (pas de classe Tailwind en Canvas).
