# Étape 3 — Confiance sur base immature

## Objectif

Quand la base d'apprentissage est vide ou quasi vide, le système ne doit **pas se
prononcer avec assurance** : afficher un avertissement explicite et atténuer/annoter la
confiance affichée, pour que l'utilisateur comprenne que les suggestions sont peu fiables.

## Contexte

Diagnostic des agents :
- Il n'existe **aucune calibration explicite au volume global** de la base. `idf` et
  l'anti-hapax (`cf < 2 → 0`) atténuent mécaniquement les scores sur base pauvre, mais
  rien n'affiche « base quasi vide, méfiez-vous ».
- Un signal « base vide » existe déjà (`GalaxyCard`) mais porte sur `serverPool`
  (l'appris pur) et n'est pas exploité pour la confiance.

Décision **D2** : v1 = **métrique de maturité côté client** dérivée de `serverPool`
(aucun changement de schéma partagé). L'option DB (compteur de factures par code) est
différée.

## Fichier(s) impacté(s)

- `src/lib/facturation/wordpool.ts` (helper `maturity` pur)
- `src/components/facturation/FacturationBoard.tsx` (calcul + bandeau)
- `src/components/facturation/DetectionCard.tsx` (annotation de confiance)
- `src/components/facturation/InvoicePanel.tsx` (transport du signal si besoin)

## Travail à réaliser

### 1. Métrique de maturité (métier pur)

Ajouter dans `wordpool.ts` un helper pur qui quantifie la richesse de l'appris **serveur**
(pas la graine) :

```ts
// 0 = base vide, croît avec le vocabulaire appris. Reste une HEURISTIQUE (pas un
// nombre de factures) tant que le compteur DB (D2 option B) n'est pas en place.
export function maturity(serverPool: WordPool): {
  codes: number      // nb de codes non vides
  tokens: number     // somme des count appris
  level: 'vide' | 'faible' | 'ok'
}
```

Seuils à documenter (constantes nommées, style `wordpool.ts`). Exemple de départ :
`vide` si tokens = 0 ; `faible` en dessous d'un seuil (ex. peu de codes non vides ou
peu de tokens) ; `ok` au-delà. **À ajuster** après observation.

### 2. Bandeau d'avertissement

Dans `FacturationBoard`, calculer `maturity(serverPool)` (mémoïsé) et afficher un
**bandeau discret** dans le rail droit quand `level !== 'ok'` : « Modèle encore peu
alimenté — les suggestions sont indicatives. » Tokens du thème (`text-muted-foreground`,
`bg-muted/20`, `border-border`).

### 3. Annotation de la confiance dans `DetectionCard`

Passer le `level` (ou un booléen `immature`) à `DetectionCard`. Quand immature :
- ne pas afficher de confiance « verte » trompeuse : plafonner la teinte à ambre/gris,
  ou ajouter une mention « faible historique » à côté de la barre ;
- ne rien changer aux `codes` proposés (on continue de suggérer), seulement au **discours de confiance**.

### 4. Prudence sur le scoring (optionnel, à trancher)

Éviter de modifier `proba` dans `scoreInvoice` en v1 : cela casserait des tests à
valeurs codées en dur (`facturation.test.ts:149-160`) et pourrait faire basculer
`abstains`/`preselect`. La calibration au volume reste **présentation** (annotation),
pas scoring, sauf décision explicite.

## Ordre d'exécution

1. Helper `maturity` + seuils constants + test unitaire (vide / faible / ok).
2. Bandeau dans `FacturationBoard`.
3. Annotation dans `DetectionCard`.
4. Vérifier que le scoring et ses tests restent inchangés.

## Critère de validation

- Base vide (serverPool `{}`) → bandeau « peu alimenté » visible, confiance non « verte ».
- Base bien remplie → pas de bandeau, confiance normale.
- Aucun test existant de `wordpool` cassé (`npx vitest run`).
- `npx tsc --noEmit` passe.
