# Étape 9 — Nettoyage de la dette découverte par l'audit

## Objectif

Retirer le code mort découvert par l'audit, unifier le harnais d'impression
dupliqué, et simplifier les 4 fichiers `lib/*/pdf.ts` maintenant que le
paramètre `printWindow` devient inutile (D1 : le tactile ne les appelle
plus du tout, cf. étapes 3-6).

## Contexte

- `printRaproMonthly`/`RaproMonthlyPdfData`/`renderMonthlyDocument`
  (`src/lib/rapro/pdf.ts:98-115,329-369`) ne sont référencés nulle part dans
  `src/` (la vue mensuelle réelle en prod, `RaproMonthlyBoard.tsx`, passe par
  `AnalytiqueShell`/`printAnalytique`).
- `src/lib/caisse/pdf.ts` n'utilise pas le helper `openPrintablePdf` que
  `rapro/pdf.ts`, `repjour/pdf.ts` et `parking/pdf.ts` partagent — son
  équivalent est dupliqué en ligne dans `printCaisseSheet`
  (`caisse/pdf.ts:173-200`), avec un `frameId` codé en dur.
- Aucun des 5 fichiers `lib/*/pdf.ts` n'appelle `URL.revokeObjectURL` sur le
  `blobUrl` généré — fuite mémoire mineure.
- **Nouveau depuis D1** : une fois les étapes 3-6 livrées, le paramètre
  `printWindow?: Window | null` de `printRaproSheet`/`printRepjourReport`/
  `printParkingSheets`/`printCaisseSheet` (et la branche `if (printWindow)
  { ...; return }` de leur `openPrintablePdf`) ne sera plus JAMAIS appelé
  avec une valeur non-null — le tactile appelle désormais `printWithTitle()`
  à la place. Ce paramètre devient une dette ajoutée cette session (dans un
  chantier précédent) puis rendue inutile par D1 : à retirer entièrement
  pour ne pas laisser un chemin de code mort et trompeur.

## Fichier(s) impacté(s)

- `src/lib/rapro/pdf.ts`
- `src/lib/caisse/pdf.ts`
- `src/lib/repjour/pdf.ts`
- `src/lib/parking/pdf.ts`
- `src/components/rapro/RaproBoard.tsx`, `DashboardBoard.tsx`,
  `ParkingBoard.tsx`, `CaisseBoard.tsx` (retrait des appels `window.open('',
  '_blank')`/`isTouchDeviceNow()` devenus inutiles sur le chemin
  `handleGeneratePdf`, désormais SOURIS UNIQUEMENT)

## Travail à réaliser

### 1. Code mort Rapro

Confirmer (grep) qu'aucun appelant n'existe, puis supprimer
`printRaproMonthly`, `RaproMonthlyPdfData`, `renderMonthlyDocument` et toute
fonction interne qui ne serait plus utilisée que par eux.

### 2. Retirer `printWindow` des 4 fichiers `lib/*/pdf.ts`

`openPrintablePdf(pdf, frameId, printWindow?)` → `openPrintablePdf(pdf,
frameId)`, ne garde que la branche iframe caché (devenue le seul chemin,
souris uniquement). Répercuter sur les signatures publiques
(`printRaproSheet`, `printRepjourReport`, `printParkingSheets`,
`printCaisseSheet`) et sur leurs appelants dans les 4 boards (retirer
`const printWindow = isTouchDeviceNow() ? window.open(...) : null` de
`handleGeneratePdf`, qui n'est plus appelé qu'en souris depuis les étapes
3-6 — `isTouchDeviceNow` devient probablement un import mort à retirer aussi
dans ces boards, sauf s'il sert encore ailleurs dans le même fichier).

### 3. Unifier `caisse/pdf.ts` sur `openPrintablePdf`

Une fois simplifié (sans `printWindow`), extraire la même fonction que les
3 autres fichiers plutôt que de garder la construction d'iframe dupliquée en
ligne.

### 4. `URL.revokeObjectURL`

Devient plus simple sans la branche `printWindow` : révoquer le blob après
le chargement de l'iframe (listener `load`/`error`), toujours différé, jamais
immédiat.

## Ordre d'exécution

1. Confirmer que les étapes 3-6 sont bien livrées avant de commencer (ce
   nettoyage suppose que plus aucun appelant tactile n'existe).
2. Code mort Rapro (indépendant).
3. Retrait de `printWindow` des 4 fichiers pdf.ts + de leurs appelants.
4. Unification `caisse/pdf.ts`.
5. `URL.revokeObjectURL`.

## Critère de validation

- `npx tsc --noEmit`
- `npx vitest run`
- `npx pnpm build`
- Test manuel SOURIS : chaque board imprime toujours son PDF jsPDF
  correctement après simplification.
- Grep de contrôle : plus aucune occurrence de `printWindow` dans
  `src/lib/{rapro,repjour,parking,caisse}/pdf.ts` ni dans les 4 boards.
