# Étape 3 — Hook d'année partagé

## Objectif

Remplacer le `useEffect` de recalage d'année dupliqué verbatim dans 4 parents par un hook
partagé, colocalisé avec `YearNav`. C'est une factorisation nette que l'utilisateur
apprécie (composant/hook réutilisable pour la maintenance).

## Contexte

L'audit (couche câblage §2) a trouvé le même bloc « si l'année courante n'est plus dans la
liste, retomber sur la dernière » recopié dans `AnalytiqueBoard.tsx:69-73` (repjour),
`PdjAnalytiqueBoard.tsx:55-59`, `ParkingAnalytiqueBoard.tsx:67-71`, `CaisseAnalytiqueBoard`.
rapro n'en a pas besoin (plage d'années contiguë). Le socle a déjà `YearNav` + `useYearNav`
(rendu/clavier) ; il manque la gestion du STATE année.

## Fichier(s) impacté(s)

- `src/components/analytique/useAnnualYear.ts` (nouveau)
- `src/components/repjour/boards/AnalytiqueBoard.tsx`
- `src/components/pdj/PdjAnalytiqueBoard.tsx`
- `src/components/parking/ParkingAnalytiqueBoard.tsx`
- `src/components/caisse/CaisseAnalytiqueBoard.tsx`

## Travail à réaliser

### 1. Créer `useAnnualYear`

```ts
// Gère l'année sélectionnée : état + recalage si l'année n'est plus dans `years`.
// `years` peut arriver de façon asynchrone (liste dérivée d'un fetch).
export function useAnnualYear(years: number[]) {
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  useEffect(() => {
    if (years.length > 0 && !years.includes(year)) {
      setYear(years[years.length - 1])
    }
  }, [years, year])
  return { year, setYear, currentYear }
}
```

Le rendu reste `YearNav` (chevrons + clavier), inchangé ; le hook ne gère que le state et le
clamp. Vérifier la sémantique exacte du clamp actuel de chaque board avant de remplacer
(certains retombent sur `years[years.length-1]`, confirmer qu'aucun n'a une règle différente).

### 2. Brancher les 4 parents

Remplacer dans chaque parent la triade `const [year,setYear]=useState(...)` +
`currentYear` + `useEffect(...)` par `const { year, setYear, currentYear } = useAnnualYear(years)`.
`YearNav` reçoit toujours `year/setYear/years/currentYear`.

## Ordre d'exécution

1. Créer le hook.
2. Migrer repjour, pdj, parking, caisse (un par un, vérifier le clamp de chacun).

## Critère de validation

- `npx tsc --noEmit` sans erreur.
- Le sélecteur d'année fonctionne comme avant sur les 4 pages (chevrons, clavier, recalage
  quand la liste d'années arrive).
- Plus aucun `useEffect` de recalage d'année dupliqué dans les boards.
