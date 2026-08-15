# Étape 5 — Picker guidé : recherche + arbre, familles orientées, noms humains

## Objectif

Transformer le sélecteur d'imputation en outil **utilisable sans maîtrise comptable** :
navigation combinée (recherche par mots + arbre section → poste → cas), familles orientées
(plausibles en avant, improbables grisées mais accessibles), et comptes affichés par leur
**nom humain**, jamais par un numéro brut.

## Contexte

`CodePicker` (`CodePicker.tsx`) regroupe aujourd'hui par code, avec un filtre section
(`activeSection`) et une recherche plate (`index`/`groups`). Il affiche les comptes en
`font-mono` comme numéros (`CodePicker.tsx:232-256, 299-323`). Il reçoit déjà `detection`,
`issuer` et lit `issuerMemory` via `useFacturationModel`. On garde la recherche intacte et on
ajoute une vue arbre + l'orientation par famille (étapes 2 et 3).

## Fichier(s) impacté(s)

- `src/components/facturation/CodePicker.tsx`
- `src/components/facturation/InvoicePanel.tsx` (ImputationList : noms humains)

## Travail à réaliser

### 1. Recherche inchangée (par défaut)

Garder l'index `search` et le filtre par tokens (`CodePicker.tsx:81-125`) : quand l'utilisateur
tape, la recherche reste plate et transverse (« booking », « adyen », « ménage »). Étendre
l'index de recherche pour inclure le NOM humain du compte (`compteLabel`).

### 2. Arbre section → poste → cas (quand la recherche est vide)

- Niveau 1 : **famille** (`category`), déjà disponible.
- Niveau 2 : **poste** — regrouper par `budgetLabel` (AA4 : codes de même libellé fusionnés
  sous un poste ; le code reste l'unité technique sous-jacente).
- Niveau 3 : **cas** — les couples, présentés par le NOM humain du compte (`compteLabel`) +
  la description (`hint`) comme sous-texte. Jamais le numéro en premier plan.
- État `activePoste` en complément de `activeSection`.

### 3. Orientation par famille (étape 3)

- À l'ouverture, pré-orienter sur la (les) famille(s) `plausible(s)` : `activeSection`
  initialisée / familles réordonnées (plausibles en tête).
- Familles `improbable` : reléguées en bas, grisées, avec un libellé « rare pour cet émetteur »
  et repli/dépliage — JAMAIS masquées (AA1). Un clic les rouvre normalement.
- Émetteur non mûr / inconnu : aucune orientation, vue neutre (arbre complet à plat).
- Réutiliser `issuerFamilyPrior`/`familyTier` (calculés depuis `issuerCodes`/`issuerMemory`
  déjà disponibles dans le picker, avec `budgetCategory` comme `familyOf`).

### 4. Comptes en noms humains

- Dans la ligne d'un poste multi-comptes et dans le `Select` de compte (`CodePicker.tsx:299-323`),
  afficher `compteLabel(compte)` (+ description en sous-texte), le numéro seulement en survol
  ou en gris discret.
- Idem dans `ImputationList` (`InvoicePanel.tsx:144-174`) : le compte choisi s'affiche par son
  nom ; le garde-fou « compte à choisir » (chantier précédent) reste, mais les options du
  `Select` sont des NOMS.

## Ordre d'exécution

1. Étendre l'index de recherche au nom de compte (recherche inchangée sinon).
2. Vue arbre section → poste → cas quand `q` est vide.
3. Orientation par famille (plausible en avant, improbable grisée-accessible).
4. Comptes en noms humains (picker + ImputationList).

## Critère de validation

- `npx tsc --noEmit` propre.
- Recette : (a) recherche « adyen » trouve la commission ADYEN par son nom ; (b) recherche
  vide → arbre famille → poste → cas ; (c) émetteur « technique » → familles techniques en
  avant, « Restauration/Alcool » grisées mais toujours ouvrables ; (d) émetteur inconnu → vue
  neutre ; (e) aucun numéro de compte affiché en premier plan ; (f) le garde-fou compte reste
  effectif.
