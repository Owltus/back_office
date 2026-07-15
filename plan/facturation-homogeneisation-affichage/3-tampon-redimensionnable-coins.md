# Étape 3 — Tampon redimensionnable par les coins (échelle uniforme)

## Objectif

Permettre de redimensionner le tampon en tirant ses coins, avec un **facteur d'échelle uniforme** (D1, option A) : la taille par défaut reste celle d'aujourd'hui, l'utilisateur peut l'agrandir ou la réduire, et le rendu sur le PDF reste net (dessin vectoriel pdf-lib → « résolution stable » à toute taille). Le facteur d'échelle est persisté par facture, comme la position.

## Contexte

La géométrie du cartouche est centralisée dans `src/lib/facturation/stampLayout.ts` (source unique partagée par l'aperçu HTML `StampPreview` et le rendu pdf-lib `stamp.ts`). La hauteur du cartouche est DÉRIVÉE du contenu ; le redimensionnement se modélise donc comme un multiplicateur `scale` appliqué à toutes les dimensions (largeur de boîte, tailles de police, marges internes). Aujourd'hui la position est `{ page, x, y }` ; on ajoute une échelle `stampScale` (défaut `1`).

## Fichier(s) impacté(s)

- `src/lib/facturation/types.ts` (modification : ajout d'un champ d'échelle du tampon)
- `src/lib/facturation/stampLayout.ts` (modification : les fonctions de géométrie prennent en compte l'échelle)
- `src/lib/facturation/stamp.ts` (modification : appliquer l'échelle au dessin)
- `src/components/facturation/StampPreview.tsx` (modification : poignées de coin + logique de redimensionnement)
- `src/components/facturation/FacturationBoard.tsx` (modification : porter `stampScale` dans le record + `stampDataOf`)
- `src/lib/facturation/facturation.test.ts` (modification : tests de géométrie à l'échelle)

## Travail à réaliser

### 1. Modèle de données

Ajouter l'échelle du tampon. Le plus simple : la faire porter par `StampData` (déjà passée à toute la géométrie et à `stamp.ts`).

```ts
// types.ts
export interface StampData {
  code: string
  label: string
  comment: string
  invoiceDate: string
  processedDate: string
  scale: number // 1 = taille par défaut
}
```

Ajouter `stampScale: number` (défaut `1`) à `InvoiceRecord` (dans `FacturationBoard.tsx`) et le reporter dans `stampDataOf` (`scale: record.stampScale`). Init à `1` à la création du record.

### 2. Géométrie à l'échelle (`stampLayout.ts`)

Multiplier par `data.scale` les tailles de ligne et les constantes de boîte :

```ts
export function stampBoxSize(data: StampData): { width: number; height: number } {
  const s = data.scale || 1
  const height =
    stampLines(data).reduce((h, l) => h + l.size * s + STAMP_LINE_GAP * s, 0) +
    STAMP_PAD * 2 * s -
    STAMP_LINE_GAP * s
  return { width: STAMP_BOX_W * s, height }
}
```

Les tailles de police restent portées par `stampLines` (valeurs de base) mais l'affichage/dessin multiplient par `s` là où elles sont posées. Conserver `defaultStampPosition`/`clampStampPosition` mais bornées avec la boîte à l'échelle. `STAMP_MIN_SCALE = 0.6`, `STAMP_MAX_SCALE = 2.5` (constantes exportées).

### 3. Rendu pdf-lib (`stamp.ts`)

Appliquer `s = data.scale` aux tailles dessinées : `size: line.size * s`, `padding` interne `STAMP_PAD * s`, `STAMP_LINE_GAP * s`, largeur/hauteur de la boîte via `stampBoxSize(data)` (déjà à l'échelle). Le dessin restant vectoriel, le tampon est net à toute échelle (« résolution stable »).

### 4. Poignées de redimensionnement (`StampPreview.tsx`)

Sur le cartouche déplaçable, ajouter 4 petites poignées aux coins (carrés ~10px, `bg-primary`, `cursor-nwse-resize`/`nesw-resize`). Interaction :

- `onPointerDown` sur une poignée : mémoriser le coin saisi, l'ancre = coin opposé (en points, dans la page courante), l'échelle de départ.
- `onPointerMove` : calculer la largeur voulue depuis la distance au coin d'ancre (en points), `nextScale = clamp(desiredWidth / STAMP_BOX_W, MIN, MAX)`. Recalculer la position pour que le **coin d'ancre reste fixe** (ajuster `x`/`y` selon la nouvelle boîte). Appeler `onScaleChange(nextScale)` + `onPositionChange(newPos)`.
- Empêcher la propagation vers le drag du cartouche (les poignées captent le pointeur, `stopPropagation`).

L'échelle d'affichage existante (`scale` de la grille responsive) multiplie déjà tout à l'écran ; le `stampScale` s'y compose (taille écran du tampon = dimensions de boîte à l'échelle × échelle d'aperçu). Vérifier que la réplique HTML (polices, padding) applique bien `stampScale` pour rester fidèle au PDF.

### 5. Câblage board

`FacturationBoard` passe `stampScale` à `stampDataOf` et fournit `onScaleChange={(sc) => patch(id, { stampScale: sc })}` à `StampPreview`.

## Ordre d'exécution

1. `types.ts` : `scale` dans `StampData` ; `stampScale` dans `InvoiceRecord`.
2. `stampLayout.ts` : géométrie à l'échelle + bornes min/max.
3. `stamp.ts` : dessin à l'échelle.
4. `StampPreview.tsx` : poignées de coin + calcul d'échelle avec ancre au coin opposé.
5. `FacturationBoard.tsx` : câblage `stampScale`.
6. `facturation.test.ts` : cas `scale: 1` (inchangé) et `scale: 2` (boîte ~2×, PDF valide).
7. `npx tsc --noEmit` + `npx vitest run src/lib/facturation`.

## Critère de validation

- Tirer un coin agrandit/réduit le tampon, coin opposé fixe, dans les bornes 0,6×–2,5×.
- La taille par défaut (`scale: 1`) est identique à l'actuelle.
- L'aperçu HTML et le PDF tamponné coïncident à toute échelle ; le tampon reste net.
- Le tampon redimensionné se replace correctement (drag + multi-pages toujours fonctionnels).
- `npx tsc --noEmit` et `npx vitest run src/lib/facturation` verts.
