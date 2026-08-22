# Étape 1 — Extraction du socle responsive réutilisable

## Objectif

Factoriser la duplication exacte identifiée entre `RaproBoard.tsx` et
`AnalytiqueShell.tsx` (calcul combiné des deux media queries, gating navbar,
structure de la barre basse tactile) en un socle partagé consommable par les
4 nouveaux domaines, **sans toucher `RaproBoard.tsx`** (cf. `00-INDEX.md`,
section « Remise en question »).

## Contexte

`RaproBoard.tsx` et `AnalytiqueShell.tsx` recalculent chacun de leur côté :
```ts
const isNavbarMobile = useMatchMedia('(max-width: 1023.98px)')
const isTouchDevice = useMatchMedia('(hover: none) and (pointer: coarse)')
```
et posent chacun le même pattern de gating navbar (`useNavbarSubtitle(isNavbarMobile ? x : null)`).
`AnalytiqueShell.tsx` possède déjà `ToolbarCell` (exporté) et le conteneur
`<nav>` de la barre basse — mais `RaproBoard.tsx` réécrit la même chose à la
main dans son propre JSX plutôt que de le réutiliser. C'est cette
généralisation (déjà à moitié faite dans `AnalytiqueShell.tsx`) qu'il faut
finir et déplacer vers un module partagé, pour que les 4 nouveaux domaines
n'aient RIEN à réécrire.

## Fichier(s) impacté(s)

- `src/components/shared/useResponsiveShell.ts` (nouveau)
- `src/components/shared/MobileToolbar.tsx` (nouveau)
- `src/lib/navbarSubtitle.ts` (modifié : gating factorisé)
- `src/components/analytique/AnalytiqueShell.tsx` (modifié : consomme le nouveau socle)

## Travail à réaliser

### 1. `useResponsiveShell.ts` — hook combiné

```ts
import { useMatchMedia } from '#/components/shared/useMatchMedia.ts'

/** Les deux media queries structurantes du mode tactile de l'app, réunies en
 * un seul hook pour ne plus les recalculer séparément à chaque board :
 *  - `isNavbarMobile` : la Navbar globale est en mode hamburger (identité de
 *    page dans la Navbar plutôt que dans l'en-tête de page). Seuil FIXE pour
 *    toute l'app (1024px), à ne jamais faire dériver par board.
 *  - `isTouchDevice` : détection tactile RÉELLE `(hover:none) and
 *    (pointer:coarse)`, PAS une largeur — un ordinateur en fenêtre étroite
 *    garde la barre du haut, une tablette tactile large a la barre basse. */
export function useResponsiveShell() {
  const isNavbarMobile = useMatchMedia('(max-width: 1023.98px)')
  const isTouchDevice = useMatchMedia('(hover: none) and (pointer: coarse)')
  return { isNavbarMobile, isTouchDevice }
}

/** Même détection que `isTouchDevice`, mais synchrone (pas un Hook) — pour les
 * handlers qui doivent ouvrir un `window.open()` dans le même tick que le
 * geste utilisateur (contournement du bloqueur de popups à l'impression). */
export function isTouchDeviceNow(): boolean {
  return window.matchMedia('(hover: none) and (pointer: coarse)').matches
}
```

### 2. `MobileToolbar.tsx` — barre basse fixe générique

Déplacer `ToolbarCell` ici (garder un ré-export depuis `AnalytiqueShell.tsx`
pour ne pas casser les imports existants de Rapro), et ajouter le conteneur :

```tsx
import type { ReactNode } from 'react'
import { cn } from '#/lib/utils.ts'

export function ToolbarCell({ icon, label, onClick, disabled = false, ariaLabel, bordered = true }: {
  icon: ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
  ariaLabel: string
  bordered?: boolean
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={ariaLabel}
      className={cn(
        'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-muted-foreground transition-colors active:bg-accent active:text-foreground disabled:pointer-events-none disabled:opacity-40',
        bordered && 'border-l border-border',
      )}>
      {icon}
      <span className="text-[11px] font-medium">{label}</span>
    </button>
  )
}

/** Barre d'outils basse fixe sur écran tactile — le conteneur `<nav>` seul
 * (fixed, safe-area, fond flouté), les cellules sont fournies par l'appelant
 * via `children` (des `ToolbarCell`). Ne se rend QUE si `visible` est vrai —
 * l'appelant décide (`isTouchDevice`), ce composant ne fait pas la détection
 * lui-même pour rester composable avec `useResponsiveShell` déjà calculé une
 * fois par board. */
export function MobileToolbar({ visible, children }: { visible: boolean; children: ReactNode }) {
  if (!visible) return null
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t border-border bg-card/95 backdrop-blur-md"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {children}
    </nav>
  )
}
```

### 3. `AnalytiqueShell.tsx` — migrer sur le socle

Remplacer les deux `useMatchMedia` locaux par `useResponsiveShell()`, le
`window.matchMedia(...)` synchrone du handler d'impression par
`isTouchDeviceNow()`, et le JSX `<nav>` local par `<MobileToolbar visible={...}>`.
Garder `export { ToolbarCell } from '#/components/shared/MobileToolbar.tsx'`
en tête de fichier pour que les imports existants (`RaproAnalytiqueBoard.tsx`,
`RaproMonthlyBoard.tsx`) continuent de fonctionner sans modification.

Comportement à préserver EXACTEMENT (aucun changement visible) : `mobileIdentity`,
`mobileToolbar`, `actionsAlign`, le `pb-20` conditionnel, tout reste identique
— seule la source des deux booléens et le rendu de la `<nav>` changent
d'implémentation.

### 4. `navbarSubtitle.ts` — gating factorisé (optionnel, à évaluer)

Le pattern `useNavbarSubtitle(isNavbarMobile ? x : null)` est actuellement
répété tel quel dans `RaproBoard.tsx` (hors périmètre, non touché) et dans
`AnalytiqueShell.tsx`. Pour les 4 nouveaux domaines, ce même pattern sera
réécrit à chaque board — soit tel quel (2 lignes, pas une vraie duplication
gênante), soit via un helper :

```ts
export function useNavbarIdentity(isMobile: boolean, subtitle: ReactNode, badge?: ReactNode): void {
  useNavbarSubtitle(isMobile ? subtitle : null)
  useNavbarBadge(isMobile ? (badge ?? null) : null)
}
```

Décision laissée à l'exécution de cette étape : si les 4 boards suivants
appellent ce pattern de façon suffisamment homogène, ajouter `useNavbarIdentity`
; sinon garder les deux hooks séparés (un board sans badge n'a pas besoin
d'appeler `useNavbarBadge` du tout). Ne pas sur-factoriser un pattern de 2
lignes si ça complique la lecture pour un gain marginal.

## Ordre d'exécution

1. Créer `useResponsiveShell.ts`.
2. Créer `MobileToolbar.tsx` (avec `ToolbarCell` déplacé).
3. Migrer `AnalytiqueShell.tsx` sur les deux nouveaux modules, en gardant le
   ré-export de `ToolbarCell` pour compatibilité.
4. Évaluer et, si pertinent, ajouter `useNavbarIdentity` à `navbarSubtitle.ts`
   une fois le premier board (étape 2, RepJour) écrit — pas avant, pour juger
   sur un cas réel plutôt que dans l'abstrait.

## Critère de validation

- `npx tsc --noEmit` : aucune erreur.
- `npx vitest run` : 428 tests toujours verts.
- `npx pnpm build` : succès, chunk `rapro` et `analytique` inchangés ou
  légèrement réduits (dédup), jamais élargis de façon suspecte.
- Vérification manuelle (navigateur) : `/rapro/analytique` et
  `/rapro/analytique/$year/$month` se comportent EXACTEMENT comme avant
  (aucun changement visible), à toutes les tailles déjà validées cette
  session (mobile, tablette 768-1024px, desktop).
- `RaproBoard.tsx` n'apparaît dans AUCUN diff de cette étape.

## Contrôle qualité (revue)

Étape marquée critique : c'est la fondation dont dépendent les 4 domaines
suivants — une régression ici se propage partout. `/borg` n'étant pas
installé, revue manuelle ciblée :

- Relire le diff de `AnalytiqueShell.tsx` ligne à ligne : confirmer que
  `isNavbarMobile`/`isTouchDevice` produisent des valeurs identiques à avant
  (même chaînes de media query), que `MobileToolbar` rend exactement le même
  DOM que l'ancien `<nav>` inline (mêmes classes, même structure).
  - Confirmer que `ToolbarCell` reste importable depuis
  `#/components/analytique/AnalytiqueShell.tsx` (les deux boards Rapro
  analytique ne doivent PAS avoir besoin d'un changement d'import).
