# Étape 2 — Hook des piles undo / redo

## Objectif

Fournir un hook `useParkingHistory` qui tient les piles undo et redo, expose
`record` (enregistrer une action déjà appliquée), `undo`, `redo`, et les drapeaux
`canUndo` / `canRedo`. Le hook ne connaît PAS Supabase : il délègue l'application
concrète à des primitives injectées par le board (étape 3).

## Contexte

Séparation des responsabilités :

- le **hook** décide QUOI faire (dépiler, inverser, réempiler) ;
- le **board** sait COMMENT l'appliquer (état local + `create/update/delete` +
  gardes temporelles + anti-chevauchement), via trois primitives injectées.

Chaque primitive renvoie un **booléen** : `true` si l'action a pu s'appliquer,
`false` si elle est **périmée** (réservation disparue, place reprise, cible dans
le passé verrouillé). Sur `false`, l'undo **saute** l'entrée et tente la suivante
dans la même frappe — Ctrl+Z ne reste jamais coincé sur une entrée morte (cf. D1,
option silencieuse retenue).

Piles en `useRef` (pas de re-render à chaque push/pop) ; `canUndo`/`canRedo` en
`useState` pour piloter d'éventuels boutons. L'`apply` injecté change d'identité à
chaque render : on le garde dans une ref (même motif que `usePrintShortcut.ts`)
pour que `undo`/`redo` appellent toujours la dernière closure sans se réabonner.

## Fichier(s) impacté(s)

- `src/components/parking/useParkingHistory.ts` (nouveau : hook)

## Travail à réaliser

### 1. Interface d'injection et hook

```ts
import { useCallback, useRef, useState } from 'react'

import { invert } from '#/lib/parking/history.ts'
import type { ParkingCommand, ReservationPatch } from '#/lib/parking/history.ts'
import type { Reservation } from '#/lib/parking/model.ts'

// Primitives fournies par le board. Chacune applique localement + persiste, et
// renvoie false si l'action est périmée (à sauter silencieusement).
export interface ParkingHistoryApply {
  applyCreate: (snapshot: Reservation) => boolean
  applyDelete: (id: string) => boolean
  applyUpdate: (id: string, patch: ReservationPatch) => boolean
}

const LIMIT = 50 // profondeur d'historique (borne mémoire)

export function useParkingHistory(apply: ParkingHistoryApply) {
  const applyRef = useRef(apply)
  applyRef.current = apply

  const undoStack = useRef<ParkingCommand[]>([])
  const redoStack = useRef<ParkingCommand[]>([])
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  const sync = () => {
    setCanUndo(undoStack.current.length > 0)
    setCanRedo(redoStack.current.length > 0)
  }

  // Applique une commande DANS SON SENS DIRECT (create→insert, delete→delete,
  // update→after). L'undo appelle applyCommand(invert(cmd)), le redo applyCommand(cmd).
  const applyCommand = (cmd: ParkingCommand): boolean => {
    const a = applyRef.current
    switch (cmd.kind) {
      case 'create':
        return a.applyCreate(cmd.snapshot)
      case 'delete':
        return a.applyDelete(cmd.snapshot.id)
      case 'update':
        return a.applyUpdate(cmd.id, cmd.after)
    }
  }

  // Enregistre une action DÉJÀ appliquée par le board. Toute nouvelle action
  // vide la pile redo (sémantique standard).
  const record = useCallback((cmd: ParkingCommand) => {
    undoStack.current.push(cmd)
    if (undoStack.current.length > LIMIT) undoStack.current.shift()
    redoStack.current = []
    sync()
  }, [])

  const undo = useCallback(() => {
    while (undoStack.current.length) {
      const cmd = undoStack.current.pop() as ParkingCommand
      if (applyCommand(invert(cmd))) {
        redoStack.current.push(cmd)
        sync()
        return
      }
      // périmée → jetée, on tente la précédente
    }
    sync()
  }, [])

  const redo = useCallback(() => {
    while (redoStack.current.length) {
      const cmd = redoStack.current.pop() as ParkingCommand
      if (applyCommand(cmd)) {
        undoStack.current.push(cmd)
        sync()
        return
      }
    }
    sync()
  }, [])

  return { record, undo, redo, canUndo, canRedo }
}
```

### 2. Notes de conception à respecter

- `record` stocke la commande **directe** (celle que le board vient d'appliquer).
  L'undo applique `invert(cmd)` ; le redo réapplique `cmd`. Un seul `applyCommand`
  sert les deux sens.
- Ne PAS enregistrer dans le canal realtime : `record` n'est appelé que depuis
  les handlers de MON action (étape 4). C'est ce qui garde la pile « mes actions
  seulement ».

## Ordre d'exécution

1. Créer `src/components/parking/useParkingHistory.ts`.
2. `npx tsc --noEmit`.

## Critère de validation

- `npx tsc --noEmit` propre.
- `pnpm lint` propre sur le fichier.
- Export nommé (`export function useParkingHistory`), pas de default.
- Aucune écriture Supabase dans le hook (il délègue au board).
