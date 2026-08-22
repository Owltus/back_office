# Étape 2 — Étendre `AnalytiqueShell` avec `mobileIdentity` et `mobileToolbar`

## Objectif

Ajouter au socle partagé `AnalytiqueShell.tsx` deux props strictement
optionnelles qui reproduisent, à la demande d'un board, le mécanisme déjà
validé sur `/rapro` : titre déplacé dans la Navbar sous 1024px, actions
remplacées par une barre basse fixe sous 640px avec cellule Imprimer intégrée.

## Contexte

Voir `00-INDEX.md`, décisions D1/D2/D3 : le shell est utilisé par 10 pages
analytique (RepJour/PDJ/Parking/Rapro/Caisse × annuel+mensuel) — les 8 pages qui
ne passeront pas ces nouvelles props doivent se comporter EXACTEMENT comme
aujourd'hui (aucune régression silencieuse).

Le bouton Imprimer (`handlePrint`, état `disabled`/`loading`) est déjà interne
au shell — il doit être le seul propriétaire de sa propre cellule dans la barre
basse ; les boards ne fournissent que leurs cellules de navigation propres.

## Fichier(s) impacté(s)

- `src/components/analytique/AnalytiqueShell.tsx` (modifié)

## Travail à réaliser

### 1. Nouvelles props

```tsx
export function AnalytiqueShell({
  title,
  actions,
  loading = false,
  skeleton,
  printTitle,
  /** Sous 1024px, déplace `title` dans la Navbar globale (sous-titre de page)
   *  au lieu de l'en-tête — même mécanisme que /rapro. Par défaut false :
   *  aucun changement pour les pages qui n'activent pas ce prop. */
  mobileIdentity = false,
  /** Cellules PROPRES au board (navigation temporelle / retour), à afficher
   *  dans la barre d'outils basse fixe sous 640px. Le shell y ajoute lui-même
   *  sa cellule Imprimer (si `printTitle` est fourni) entre les cellules
   *  fournies ici. Absent → pas de barre basse, `actions` reste dans l'en-tête
   *  à toutes les tailles (comportement actuel, inchangé).
   */
  mobileToolbar,
  children,
}: {
  title: ReactNode
  actions?: ReactNode
  loading?: boolean
  skeleton?: { /* inchangé */ }
  printTitle?: string
  mobileIdentity?: boolean
  mobileToolbar?: ReactNode
  children: ReactNode
}) {
```

### 2. Bascule de l'identité de page (si `mobileIdentity`)

```tsx
const isNavbarMobile = useMatchMedia('(max-width: 1023.98px)')
useNavbarSubtitle(mobileIdentity ? title : null)
```

Dans le rendu du `PageHeader` :

```tsx
<PageHeader
  title={mobileIdentity && isNavbarMobile ? undefined : title}
  actions={headerActions}
/>
```

Ne PAS appeler `useNavbarBadge` : aucune des deux vues analytique n'a de statut
à afficher (D2) — pas de prop `badge` à ajouter ici tant qu'aucun board n'en a
besoin (`AnalytiqueShell` n'a d'ailleurs aujourd'hui aucune prop `badge` du
tout — hors périmètre de ce chantier).

### 3. Barre basse fixe (si `mobileToolbar`)

```tsx
const showTopToolbar = useMatchMedia('(min-width: 640px)')

const headerActions = printTitle != null
  ? <>{printCell(/* icon-sm variant, en-tête */)}{actions}</>
  : actions

// actions de l'en-tête, MASQUÉES sous 640px si une barre basse existe :
const desktopActions = !mobileToolbar || showTopToolbar ? headerActions : undefined
```

La cellule Imprimer de la barre BASSE doit être un rendu ALTERNATIF (icône +
libellé empilés, `flex-1`, `py-2`, `text-[11px]`) — pas le même `PrintButton`
icône seule utilisé en en-tête. Factoriser un petit composant interne
`ToolbarCell` (bouton ou `Link`, icône `size-5` + libellé `text-[11px]
font-medium`, `flex flex-1 flex-col items-center justify-center gap-0.5 py-2
text-muted-foreground transition-colors active:bg-accent active:text-foreground
disabled:pointer-events-none disabled:opacity-40`, `border-l border-border`
sauf sur la 1re cellule) pour ne pas dupliquer ces classes 3 fois (en-tête +
2 boards). Voir `RaproBoard.tsx` lignes 1216-1286 pour le gabarit exact à
reproduire (safe-area, `sm:hidden`, `fixed inset-x-0 bottom-0 z-30`).

Rendu de la barre, insérée après `children`, dans le shell :

```tsx
{mobileToolbar && (
  <nav
    className="fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t border-border bg-card/95 backdrop-blur-md sm:hidden"
    style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
  >
    {mobileToolbar}
  </nav>
)}
```

`mobileToolbar` est donc un `ReactNode` COMPOSÉ par le board (ses propres
`ToolbarCell`) avec la cellule Imprimer du shell insérée au bon endroit — le
plus simple est que `mobileToolbar` soit une **fonction** recevant la cellule
Imprimer déjà construite :

```tsx
mobileToolbar?: (printCell: ReactNode | null) => ReactNode
```

Le shell appelle `mobileToolbar(printTitle != null ? <ToolbarCell .../> : null)`
et le board place ce nœud où il veut dans sa propre liste de cellules (au milieu
pour la vue annuelle, en 2e position pour la vue mensuelle — voir étapes 3/4).

### 4. Réserve d'espace bas

Sur le conteneur racine (actuellement `className="mx-auto flex w-full max-w-5xl
flex-1 flex-col gap-6 lg:min-h-0"`), ajouter `max-sm:pb-20` UNIQUEMENT si
`mobileToolbar` est fourni :

```tsx
className={cn(
  'mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 lg:min-h-0',
  mobileToolbar && 'max-sm:pb-20',
)}
```

(nécessite d'importer `cn` depuis `#/lib/utils.ts`, déjà utilisé ailleurs dans
le projet).

## Ordre d'exécution

1. Ajouter les 2 nouvelles props (signature + defaults).
2. Câbler `mobileIdentity` (useMatchMedia + useNavbarSubtitle + title conditionnel).
3. Factoriser `ToolbarCell` et câbler `mobileToolbar` (barre fixe + cellule
   Imprimer injectée + masquage des `actions` d'en-tête sous 640px).
4. Ajouter la réserve `max-sm:pb-20` conditionnelle.
5. Vérifier par lecture que les 8 pages qui n'utilisent PAS ces props (aucun
   changement d'appel dans leurs boards à ce stade) ont un rendu strictement
   identique — `mobileIdentity`/`mobileToolbar` valent `false`/`undefined` chez
   elles, donc toutes les branches nouvelles sont inactives.

## Critère de validation

- `npx tsc --noEmit` : aucune erreur (types stricts sur les nouvelles props).
- `npx vitest run` : 428 tests toujours verts, notamment ceux touchant
  RepJour/PDJ/Parking/Caisse analytique (aucune régression sur les 8 pages non
  concernées par ce chantier).
- Grep de contrôle : `mobileIdentity`/`mobileToolbar` n'apparaissent QUE dans
  `AnalytiqueShell.tsx` à ce stade (les boards les consommeront aux étapes 3/4).

## Contrôle qualité (revue)

Étape marquée critique : `AnalytiqueShell.tsx` est le socle de 10 pages, une
régression ici serait invisible tant qu'on ne teste que Rapro. `/borg` n'étant
pas installé sur ce projet, remplacer par une revue manuelle ciblée après
implémentation :

- Ouvrir manuellement (ou lire le rendu attendu) d'au moins une page NON rapro
  utilisant `AnalytiqueShell` (ex. `/repjour/analytique` ou `/pdj/analytique`)
  et confirmer visuellement qu'aucun changement de layout, de largeur de bouton
  Imprimer, ou de comportement n'est apparu sous 640px/1024px.
- Relire le diff de `AnalytiqueShell.tsx` : chaque nouvelle branche doit être
  gated par `mobileIdentity`/`mobileToolbar`, sans `if` implicite qui
  s'activerait par défaut.
