# Étape 2 — Affichage multi-imputation

## Objectif

Afficher **la ou les imputations les plus probables** au lieu d'une seule, chacune
avec son niveau de confiance et ses mots votants. La donnée existe déjà ; c'est un
travail d'affichage.

## Contexte

`Detection` porte déjà tout le nécessaire (aucun type à créer) :
- `codes: string[]` — les codes présélectionnés (1 à `CLOUD_MAX=3`), la vraie multi-imputation ;
- `scores?: {code, proba, words}[]` — jusqu'à 5 candidats, chacun avec sa proba absolue et ses mots votants ;
- `confidence`, `abstained`.

Aujourd'hui `DetectionCard` n'affiche QU'UN candidat (`d.confidence`, une barre,
`d.scores[0].words`) et ignore les candidats 2..5. C'est le point à généraliser.
Décision **D1** : afficher les codes présélectionnés (`detection.codes`), en croisant
avec `scores` pour la proba et les mots ; option « voir les autres candidats » possible
mais non requise en v1.

## Fichier(s) impacté(s)

- `src/components/facturation/DetectionCard.tsx`
- `src/components/facturation/InvoicePanel.tsx` (uniquement si un prop supplémentaire est nécessaire)

## Travail à réaliser

### 1. Rendu multi-candidats dans `DetectionCard`

Remplacer le rendu mono par une **itération** sur les candidats. Pour chaque code de
`detection.codes`, retrouver sa ligne dans `detection.scores` (proba + mots), et
rendre :
- le libellé lisible `budgetLabel(code)` (+ code mono discret) ;
- une barre de confiance via `confidenceTone(proba)` (réutiliser la fonction existante, cohérence garantie) ;
- les mots votants (`words`), en petit.

Distinguer le **meilleur** candidat (premier) des suivants (typographie/opacité), pour
que « la plus probable » reste lisible d'un coup d'œil tout en montrant les alternatives.

### 2. États conservés

Garder les états existants et les rendre cohérents avec le multi :
- `abstained` → message « preuve insuffisante » (inchangé) ;
- `!codes.length` → « aucune imputation détectée » (inchangé) ;
- sinon → liste des candidats.

### 3. Pastilles réutilisables (optionnel)

Si l'on veut des pastilles colorées, réutiliser `Tag.tsx` (`TAG_COLORS` statiques). La
liste éditable (`ImputationList` dans `InvoicePanel`) reste la source d'édition ; la
carte reste la **suggestion** (lecture). Ne pas dupliquer l'édition.

## Ordre d'exécution

1. Refactor `DetectionCard` en itération sur `detection.codes` ∩ `detection.scores`.
2. Différenciation visuelle meilleur candidat / alternatives.
3. Vérifier les trois états (abstention, vide, multi).

## Critère de validation

- Une facture dont `codes.length > 1` affiche plusieurs candidats, chacun avec sa barre de confiance et ses mots.
- Le meilleur candidat reste visuellement dominant.
- Les cas « abstention » et « aucune imputation » sont inchangés.
- `npx tsc --noEmit` passe ; rendu vérifié dans le navigateur.
