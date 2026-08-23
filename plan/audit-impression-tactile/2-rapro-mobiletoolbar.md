# Étape 2 — Rapro : migration vers `MobileToolbar`/`ToolbarCell` partagés

## Objectif

Remplacer la barre d'outils basse tactile codée à la main dans
`RaproBoard.tsx` (`~lignes 1279-1332`) par les composants partagés
`MobileToolbar`/`ToolbarCell` (`src/components/shared/MobileToolbar.tsx`),
déjà utilisés par RepJour/PDJ/Parking/Caisse.

## Contexte

`RaproBoard.tsx` est le SEUL des 5 boards à ne pas importer
`MobileToolbar`/`ToolbarCell` — sa barre basse est un `<nav>` recodé à la
main avec les mêmes classes Tailwind. Conséquence directe : elle n'a jamais
reçu le correctif `print:hidden` posé sur le composant partagé suite au bug
PDJ (la barre s'imprimant elle-même). Tant que l'impression Rapro reste
jsPDF (pas de `window.print()` sur le DOM courant), ce n'est pas un bug actif
— mais c'est une dette qui a déjà raté un correctif transversal, et qui en
ratera d'autres. Rapro duplique aussi sa propre détection tactile
(`window.matchMedia('(hover: none) and (pointer: coarse)').matches` en
inline, `RaproBoard.tsx:685-687`) au lieu de réutiliser `isTouchDeviceNow()`
de `useResponsiveShell.ts`.

Rapro est le board de RÉFÉRENCE historique du pattern tactile (cf.
commentaires de `AnalytiqueShell.tsx`) — cette migration ne doit RIEN changer
au comportement visible, seulement remplacer l'implémentation par le socle
partagé.

## Fichier(s) impacté(s)

- `src/components/rapro/RaproBoard.tsx`

## Travail à réaliser

### 1. Remplacer le `<nav>` maison par `<MobileToolbar>`

Lire précisément les cellules actuelles (`~RaproBoard.tsx:1279-1332`) et les
reconstruire avec `<ToolbarCell>`, dans le même ordre, avec les mêmes
`onClick`/`disabled`/labels/icônes. Porter une attention particulière au
bouton Imprimer (`~ligne 1311-1320`, `disabled={!isValidated || pdfBusy}`,
`onClick={handleGeneratePdf}`) : la cellule migrée doit garder EXACTEMENT la
même condition `disabled` et le même handler.

### 2. Remplacer la détection tactile inline par `isTouchDeviceNow()`

`RaproBoard.tsx:685-687` :
```ts
const isTouchDevice = window.matchMedia(
  '(hover: none) and (pointer: coarse)',
).matches
```
→
```ts
import { isTouchDeviceNow } from '#/components/shared/useResponsiveShell.ts'
// ...
const printWindow = isTouchDeviceNow() ? window.open('', '_blank') : null
```
Attention : la variable locale s'appelait `isTouchDevice` et pourrait
masquer une autre variable du même nom issue de `useResponsiveShell()` déjà
utilisée ailleurs dans le fichier pour le rendu (`isNavbarMobile`,
`isTouchDevice` du hook) — vérifier qu'il n'y a pas de collision de nom une
fois le doublon supprimé.

## Ordre d'exécution

1. Lire l'intégralité du bloc `<nav>` actuel et la liste exacte de ses
   cellules.
2. Remplacer par `<MobileToolbar>`/`<ToolbarCell>`, cellule par cellule.
3. Remplacer la détection tactile dupliquée par `isTouchDeviceNow()`.
4. Retirer les classes/styles devenus inutiles (le `<nav>` maison et ses
   classes Tailwind copiées).

## Critère de validation

- `npx tsc --noEmit`
- `npx vitest run`
- `npx pnpm build`
- Revue manuelle du diff : le rendu visuel de la barre basse Rapro ne doit
  RIEN changer (même cellules, même ordre, même comportement `disabled`) —
  seule l'implémentation change. `print:hidden` doit apparaître dans le DOM
  généré (hérité de `MobileToolbar`).

## Contrôle qualité (revue)

Cette étape touche le board le plus ancien et le plus éprouvé de l'app
(référence historique du pattern tactile). Avant de considérer l'étape
terminée, relire le diff complet en comparant chaque cellule migrée à son
équivalent d'origine (handler, condition `disabled`, libellé, icône, ordre)
pour garantir une migration à l'identique, sans régression fonctionnelle ni
visuelle.
