# Étape 6 — Validation globale

## Objectif

Valider l'ensemble du chantier : compilation, build, tests, et surtout une revue navigateur
des 10 pages analytique (5 parents + 5 enfants) puisque le gros des changements est visuel
(tooltips, hints, cohérence).

## Fichier(s) impacté(s)

Aucun code modifié — vérification et restitution.

## Travail à réaliser

### 1. Validation technique

```bash
npx tsc --noEmit
pnpm build
npx vitest run
```

- `tsc` sans erreur, `build` OK (chunks analytique inchangés en poids d'ordre de grandeur),
  tous les tests au vert.

### 2. Revue navigateur (les 10 pages)

Pour chaque feature (repjour, pdj, parking, rapro, caisse), vérifier PARENT + ENFANT :
- Infobulle de graphe : en-tête riche (mois complet en annuel, jour daté en mensuel), pastilles
  et valeurs correctes, formats homogènes.
- Cartes : hints présents et clairs au survol.
- Tableau : cellules vides en « — » (pas de zéros parasites), pas de décalage de squelette au
  chargement.
- Sélecteur d'année (parent) et bouton retour (enfant) fonctionnels.
- PDF/impression : titre correct (parking sans double année), couleurs rapro correctes.

### 3. Grep de non-régression

- Plus de `MONTHS_SHORT` local dans les boards.
- Plus de hex de couleur en dur côté analytique (rapro/repjour) — tout en tokens.
- Plus de `stackId="pdj"` ni de magic number `220`/marge dupliqués dans les primitives.

### 4. Restitution

Récapituler ce qui a été factorisé (nouveaux composants/hooks partagés), les bugs corrigés,
et les incohérences alignées. Rappeler ce qui reste OPTIONNEL et hors périmètre (hooks de
données `useAnnualAnalytics`/`useMonthlyDetail`, `Parts` pour repjour/parking, drill-down
repjour mois) au cas où l'utilisateur voudrait un chantier de suivi.

## Ordre d'exécution

1. tsc + build + tests.
2. Revue navigateur des 10 pages.
3. Grep de non-régression.
4. Restitution.

## Critère de validation

- Toutes les vérifications techniques passent.
- Les 10 pages rendent correctement, tooltips et hints en place, aucun bug de l'audit
  résiduel.

## Contrôle /borg

Dernière étape (validation globale) :
- Cohérence d'ensemble : le socle enrichi est utilisé partout de la même façon, aucun board
  n'a régressé.
- Aucune primitive partagée cassée pour un consommateur (les 10 boards compilent et rendent).
- Les décisions d'arbitrage (légende, formats, portée) sont respectées telles que validées.
- Aucune valeur métier modifiée : le chantier est présentation + factorisation seulement.
