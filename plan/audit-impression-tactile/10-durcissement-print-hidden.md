# Étape 10 — Durcissement transverse `print:hidden` (D2, retenue)

## Objectif

Protéger les éléments `fixed`/`sticky` restants de l'app contre une
impression accidentelle — pertinence accrue depuis D1 : 5 surfaces
supplémentaires (Rapro/RepJour/Parking/Caisse + Analytique) impriment
désormais nativement le DOM sur tactile (étapes 3-7), donc chaque élément
flottant de l'app doit être `print:hidden` pour ne jamais polluer un de ces
nouveaux documents — pas seulement le cas d'une impression native déclenchée
en dehors du bouton applicatif (menu partage iOS, Ctrl+P physique).

## Contexte

L'app n'a pas de reset CSS global à l'impression (pas de
`body * { visibility: hidden }` ou équivalent) : chaque écran dépend de
`print:hidden` posé explicitement. L'audit infra a trouvé plusieurs éléments
sans cette protection :

- `src/components/ui/dialog.tsx` — `DialogOverlay`/`DialogContent`
  (primitif Radix partagé par toute l'app, y compris `PrintBlockedDialog`).
- `src/components/ui/sheet.tsx` — `SheetOverlay`/`SheetContent` (tiroir
  Navbar mobile et tout board qui ouvre un `Sheet`).
- `src/components/repjour/ImportSection.tsx` — modale de confirmation
  d'import maison (`~lignes 463-467`), pas construite sur `ui/dialog.tsx`.
- `src/components/shared/EffectOverlay.tsx` — canvas plein écran des easter
  eggs, monté globalement, déclenchable au tap.
- `src/components/analytique/AnalytiqueTable.tsx` — `<thead sticky>`.
- `src/components/auth/AppAuthGate.tsx` — header `sticky` de `BootSkeleton`
  (état transitoire, risque faible mais incohérent avec le header réel de
  `Navbar.tsx`, qui a déjà `print:hidden`).

## Fichier(s) impacté(s)

- `src/components/ui/dialog.tsx`
- `src/components/ui/sheet.tsx`
- `src/components/repjour/ImportSection.tsx`
- `src/components/shared/EffectOverlay.tsx`
- `src/components/analytique/AnalytiqueTable.tsx`
- `src/components/auth/AppAuthGate.tsx`

## Travail à réaliser

### 1. `dialog.tsx`/`sheet.tsx` — exception D3 accordée

Ajouter `print:hidden` aux classes de `DialogOverlay`, `DialogContent`,
`SheetOverlay`, `SheetContent`. Exception ponctuelle accordée par
l'utilisateur (D3, cf. 00-INDEX.md) à la règle « primitives shadcn jamais
retouchées à la main » (CLAUDE.md) — STRICTEMENT limitée à l'ajout de cette
classe additive, aucune autre modification de ces deux fichiers.

### 2. Les autres fichiers (composants applicatifs, pas de restriction)

Ajouter `print:hidden` directement aux classes `fixed`/`sticky` concernées
dans `ImportSection.tsx`, `EffectOverlay.tsx`, `AnalytiqueTable.tsx`,
`AppAuthGate.tsx` (header de `BootSkeleton`).

## Ordre d'exécution

1. Traiter les fichiers applicatifs (aucune restriction).
2. Traiter `dialog.tsx`/`sheet.tsx` (exception D3).

## Critère de validation

- `npx tsc --noEmit`
- `npx vitest run`
- `npx pnpm build`
- Test manuel : ouvrir une modale/un tiroir/l'overlay d'effet, déclencher
  Ctrl+P (raccourci clavier natif du navigateur, pas celui de l'app) —
  l'élément ne doit plus apparaître dans l'aperçu d'impression.
