# Étape 3 — RepJour : vues analytique responsive

## Objectif

Activer `mobileIdentity`/`mobileToolbar` sur les vues analytique annuelle et
mensuelle de RepJour, déjà montées sur `AnalytiqueShell` (donc déjà prêtes à
recevoir ces deux props sans modification du shell lui-même).

## Contexte

`AnalytiqueBoard.tsx` (annuel) et `AnalytiqueMoisBoard.tsx` (mensuel) utilisent
`AnalytiqueShell` avec `actions={<YearNav .../>}` / `actions={<AnalytiqueBackButton to="/repjour/analytique" />}`
mais n'activent aucune des deux props responsive. Portage = même recette que
`RaproAnalytiqueBoard.tsx`/`RaproMonthlyBoard.tsx` (référence directe).

## Fichier(s) impacté(s)

- `src/components/repjour/boards/AnalytiqueBoard.tsx`
- `src/components/repjour/boards/AnalytiqueMoisBoard.tsx`

## Travail à réaliser

### 1. Vue annuelle

Reproduire le patron de `RaproAnalytiqueBoard.tsx` : `useYearNav` appelé
directement (pas `<YearNav>`, pour ne pas poser `useStepNavKeys` deux fois),
`mobileIdentity={`Analytique ${year}`}`, `mobileToolbar` avec pager
Préc./Suiv. + `AnalytiqueBackButton to="/repjour" label="Retour au rapport" enlargeOnNarrow={false}`
dans `actions` (RepJour n'a pas encore de bouton retour vers le board du jour
depuis l'annuel — même lacune que Rapro avant portage, cf. commit
`852c13f` de cette session).

### 2. Vue mensuelle

Reproduire le patron de `RaproMonthlyBoard.tsx` : navigation mois par mois
(`goPrev`/`goNext` bornés du plus ancien jour saisi au mois courant),
`mobileIdentity={`Analytique ${monthLabel}`}`, `mobileToolbar` avec
Préc./Retour/Imprimer/Suiv., `enlargeOnNarrow={false}` sur `AnalytiqueBackButton`
et le `StepNav` desktop, `actionsAlign` déjà géré automatiquement par
`AnalytiqueShell` (pas besoin de le passer).

## Ordre d'exécution

1. Vue annuelle.
2. Vue mensuelle.

## Critère de validation

- `npx tsc --noEmit`, `npx vitest run`, `npx pnpm build`.
- Vérification manuelle : sous-titre Navbar affiche l'année/le mois sous
  1024px ; barre basse tactile présente sur écran tactile ; desktop inchangé
  pour le reste de l'app (grep : aucune des 8 autres pages analytique non
  concernées par CE portage n'a été touchée).
