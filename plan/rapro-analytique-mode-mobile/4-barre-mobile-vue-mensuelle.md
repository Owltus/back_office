# Étape 4 — Mode mobile du détail mensuel (`RaproMonthlyBoard`)

## Objectif

Câbler `RaproMonthlyBoard.tsx` sur `mobileIdentity` et `mobileToolbar` : le
libellé du mois (ex. "Août 2026") migré en sous-titre Navbar sous 1024px,
barre basse fixe `[Retour] [Imprimer]` sous 640px (D1/D2 de `00-INDEX.md`).

## Contexte

Le bouton retour existant (`AnalytiqueBackButton.tsx`) utilise
`router.history.back()` via `useRouter()`. Pas de pager mois-par-mois à
inventer (D1, tranché) : seule la navigation déjà présente (retour) migre vers
la barre basse.

## Fichier(s) impacté(s)

- `src/components/rapro/RaproMonthlyBoard.tsx` (modifié)

## Travail à réaliser

### 1. Passer `mobileIdentity`

```tsx
<AnalytiqueShell
  title={monthLabel}
  mobileIdentity
  actions={<AnalytiqueBackButton />}
  ...
>
```

### 2. Construire la barre basse

```tsx
const router = useRouter()
```

```tsx
mobileToolbar={(printCell) => (
  <>
    <ToolbarCell
      onClick={() => router.history.back()}
      icon={<ArrowLeft className="size-5" />}
      label="Retour"
      aria-label="Retour à l'analytique"
    />
    {printCell}
  </>
)}
```

## Ordre d'exécution

1. Importer `useRouter` (`@tanstack/react-router`) et `ArrowLeft`
   (`lucide-react`).
2. Ajouter `mobileIdentity` au `<AnalytiqueShell>`.
3. Construire et passer `mobileToolbar`.

## Critère de validation

- `npx tsc --noEmit` : aucune erreur.
- `npx vitest run` : 428 tests verts.
- Vérification visuelle (largeur < 640px) : la barre basse affiche 2 cellules
  (Retour / Imprimer), le tap sur Retour ramène à la vue annuelle, le libellé
  du mois apparaît en sous-titre de la Navbar (pas dans l'en-tête).
- Vérification à 1024px et au-dessus : comportement desktop inchangé (bouton
  retour icône seule dans l'en-tête, titre affiché normalement).
