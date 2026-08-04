# Étape 4 — Branchement record, hook et raccourcis clavier

## Objectif

Rendre la feature visible : enregistrer chaque action dans l'historique
(`record`), monter le hook `useParkingHistory` avec les primitives de l'étape 3,
et câbler les raccourcis `Ctrl+Z` / `Ctrl+Y` / `Ctrl+Shift+Z`.

## Contexte

Le `record` doit être appelé UNIQUEMENT depuis mes handlers (jamais dans le canal
realtime), et seulement si l'action a bien été appliquée. Pour chaque commande on
capture `before`/`after` limités aux champs touchés.

Cas subtils :

- **Statut « Non payé » (`checkout`)** : `setStatus` n'écrit rien, il ouvre la
  modale ; l'écriture réelle (statut + commentaire) part de `saveComment`. Le
  `record` doit donc se faire **dans `saveComment`** pour ce cas (une seule
  entrée portant les deux champs), pas dans `setStatus`.
- **Drag** : l'état local est déjà à jour (déplacement optimiste) ; `onUp`
  persiste et doit `record` une commande `update` `{spot, startDay, nights}` avec
  `before` = valeurs `orig` (capturées au début du geste) et `after` = valeurs
  finales, seulement si elles ont changé.
- **Création puis nommage** = deux entrées (cf. D2, accepté).

Le raccourci doit être **inerte** pendant un drag ou un placement (presse-papier
accroché au curseur), et ne pas se déclencher quand on tape dans le champ nom ou
le textarea commentaire (l'undo natif du texte reste au navigateur).

## Fichier(s) impacté(s)

- `src/components/shared/useUndoRedoShortcut.ts` (nouveau : détection clavier)
- `src/components/parking/ParkingBoard.tsx` (modification : `record`, montage du
  hook, garde d'inertie)

## Travail à réaliser

### 1. Hook clavier partagé (calqué sur `usePrintShortcut.ts`)

```ts
import { useEffect, useRef } from 'react'

// Ctrl+Z = undo ; Ctrl+Y ou Ctrl/Cmd+Shift+Z = redo. Sur Mac, Cmd tient lieu de
// Ctrl. Ignoré dans un champ de saisie (l'undo texte natif y reste actif).
export function useUndoRedoShortcut(onUndo: () => void, onRedo: () => void): void {
  const undo = useRef(onUndo)
  undo.current = onUndo
  const redo = useRef(onRedo)
  redo.current = onRedo

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (!(e.ctrlKey || e.metaKey)) return
      const key = e.key.toLowerCase()
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo.current()
      } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
        e.preventDefault()
        redo.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
```

### 2. Montage du hook dans le board + garde d'inertie

```ts
// Vrai pendant un drag/redimension (posé au pointerdown de startInteraction,
// retiré au pointerup) : neutralise Ctrl+Z le temps du geste.
const interactingRef = useRef(false)

const { record, undo, redo, canUndo, canRedo } = useParkingHistory({
  applyCreate, applyDelete, applyUpdate,
})

useUndoRedoShortcut(
  () => {
    if (interactingRef.current || clipboard) return // inerte pendant geste/placement
    undo()
  },
  () => {
    if (interactingRef.current || clipboard) return
    redo()
  },
)
```

Poser `interactingRef.current = true` au début de `startInteraction` (après les
gardes) et `= false` dans le `onUp`.

### 3. record dans chaque handler

- `addReservation` / `pasteReservation` : après `applyCreate(res)` réussi,
  `record({ kind: 'create', snapshot: res })`.
- `remove` : capturer `const snap = { ...target }` AVANT suppression, puis après
  `applyDelete(id)` réussi, `record({ kind: 'delete', snapshot: snap })`.
- `rename` : si `client` change, `before = { client: target.client }`,
  `after = { client }` ; après `applyUpdate` réussi, `record({ kind: 'update', id, before, after })`.
- `setStatus` (hors checkout) : `before = { status: current.status }`,
  `after = { status }` ; record après succès.
- `saveComment` : construire `after` = `status ? { comment, status } : { comment }`
  et `before` = les mêmes clés lues sur `target` (`{ comment: target.comment }`,
  plus `{ status: target.status }` si un statut part). Record après succès. C'est
  ici que le cas `checkout` est historisé.
- drag `onUp` : si `spot`/`startDay`/`nights` diffèrent de `orig`,
  `record({ kind: 'update', id: res.id, before: { spot: orig.spot, startDay: orig.startDay, nights: orig.nights }, after: { spot: r.spot, startDay: r.startDay, nights: r.nights } })`.

### 4. (Optionnel) exposer l'état des piles

`canUndo`/`canRedo` sont disponibles si l'on veut, plus tard, des boutons
Annuler/Rétablir dans la barre d'actions. Non requis pour cette feature (clavier
seul). Ne pas ajouter de bouton sans demande.

## Ordre d'exécution

1. Créer `src/components/shared/useUndoRedoShortcut.ts`.
2. Monter `useParkingHistory` + `useUndoRedoShortcut` dans `ParkingBoard.tsx`.
3. Ajouter `interactingRef` (pose/dépose dans `startInteraction`/`onUp`).
4. Ajouter les `record(...)` dans les sept points de mutation.
5. `npx tsc --noEmit` puis `pnpm build`.

## Critère de validation

- `npx tsc --noEmit` propre, `pnpm lint` propre, `pnpm build` OK.
- `Ctrl+Z` annule la dernière action ; `Ctrl+Y` / `Ctrl+Shift+Z` la rétablit.
- Une action neuve après des annulations vide bien la pile redo.
- `Ctrl+Z` sans effet quand le focus est dans le champ nom ou le textarea
  commentaire (undo texte natif préservé), et pendant un drag/placement.
- L'historique ne contient jamais l'action reçue par realtime d'un autre poste.
- Aucune écriture Supabase nouvelle.
