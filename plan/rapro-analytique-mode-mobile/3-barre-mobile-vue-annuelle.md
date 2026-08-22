# Étape 3 — Mode mobile de la vue annuelle (`RaproAnalytiqueBoard`)

## Objectif

Câbler `RaproAnalytiqueBoard.tsx` sur les nouvelles props `mobileIdentity` et
`mobileToolbar` de `AnalytiqueShell` : titre "Analytique" migré en sous-titre
Navbar sous 1024px, barre basse fixe `[Année précédente] [Imprimer] [Année
suivante]` sous 640px (D1/D2 de `00-INDEX.md`).

## Contexte

Le `year`/`setYear` et la logique de bornage (`useYearNav`) existent déjà via
`YearNav.tsx` (qui expose aussi le hook `useYearNav` séparément de son rendu
`StepNav`). Réutiliser `useYearNav` directement pour obtenir `goPrev`/`goNext`/
`prevDisabled`/`nextDisabled` sans dupliquer la logique de bornage.

## Fichier(s) impacté(s)

- `src/components/rapro/RaproAnalytiqueBoard.tsx` (modifié)

## Travail à réaliser

### 1. Passer `mobileIdentity`

```tsx
<AnalytiqueShell
  title="Analytique"
  mobileIdentity
  actions={<YearNav ... />}
  ...
>
```

### 2. Construire la barre basse

```tsx
const { goPrev, goNext, prevDisabled, nextDisabled } = useYearNav({
  year, setYear, years, currentYear,
})
```

```tsx
mobileToolbar={(printCell) => (
  <>
    <ToolbarCell
      onClick={goPrev}
      disabled={prevDisabled}
      icon={<ChevronLeft className="size-5" />}
      label="Préc."
      aria-label="Année précédente"
    />
    {printCell}
    <ToolbarCell
      onClick={goNext}
      disabled={nextDisabled}
      icon={<ChevronRight className="size-5" />}
      label="Suiv."
      aria-label="Année suivante"
      className="border-l border-border"
    />
  </>
)}
```

(le composant `ToolbarCell` exact et ses props sont définis à l'étape 2, dans
`AnalytiqueShell.tsx` ou un fichier voisin exporté pour être réutilisé ici et à
l'étape 4 — ajuster les imports selon ce qui a été effectivement factorisé).

## Ordre d'exécution

1. Importer `useYearNav` (déjà exporté par `YearNav.tsx`) et les icônes
   `ChevronLeft`/`ChevronRight` de `lucide-react`.
2. Ajouter `mobileIdentity` au `<AnalytiqueShell>`.
3. Construire et passer `mobileToolbar`.

## Critère de validation

- `npx tsc --noEmit` : aucune erreur.
- `npx vitest run` : 428 tests verts.
- Vérification visuelle (navigateur, largeur < 640px) : la barre basse affiche
  bien 3 cellules, le tap sur les chevrons change l'année affichée (tableau +
  graphique se mettent à jour), le bouton Imprimer fonctionne (cf. correctif
  mobile déjà en place dans `AnalytiqueShell`/`lib/analytique/pdf.ts`).
- Vérification à 1024px et au-dessus : le titre "Analytique" reste dans
  l'en-tête (pas dans la Navbar), comportement desktop inchangé.
