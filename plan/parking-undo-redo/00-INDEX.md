# Plan — Undo / Redo (Ctrl+Z / Ctrl+Y) du planning parking

## Contexte

Le planning parking (`src/components/parking/ParkingBoard.tsx`) est une grille au
drag : on crée, déplace, redimensionne, renomme, change le statut et commente des
réservations à la souris. Un geste malheureux (mauvaise place, durée étirée d'un
cran de trop) n'a aujourd'hui aucun rattrapage : il faut refaire l'inverse à la
main. Un `Ctrl+Z` / `Ctrl+Y` comblerait ce manque.

La difficulté n'est pas l'undo lui-même mais le **collaboratif** : la page est
synchronisée en temps réel (`postgres_changes`), plusieurs postes peuvent la
modifier en même temps. Un undo naïf « restaure l'ancien instantané complet »
écraserait le travail d'un collègue fait entre-temps.

Trois propriétés de l'existant rendent le chantier sûr et localisé :

- toutes MES mutations passent par une poignée de fonctions du board
  (`addReservation`/`pasteReservation`, `remove`, `setStatus`, `rename`,
  `saveComment`, et le `onUp` du drag) ; c'est le seul endroit où j'écris ;
- le canal realtime patche l'état local `reservations` **séparément** (il ne
  passe pas par ces fonctions) ; si l'historique n'est alimenté que par MES
  handlers, il ne contiendra jamais l'action d'un collègue ;
- les mutations sont déjà optimistes (état local puis `create/update/delete`
  Supabase) : l'undo n'est « qu'une écriture de plus », même canal, même realtime.

Décisions déjà tranchées avec l'utilisateur (via questions ciblées) :

| Décision | Choix retenu |
|----------|--------------|
| Portée des actions annulables | **Tout** : création, suppression, déplacement, redimension, renommage, statut, commentaire |
| Sécurité collaborative | **Patch par champ** : l'undo ne réécrit que les champs que J'AI touchés (préserve le travail des autres sur les autres champs) |

Modèle retenu : **command pattern**. Chaque action produit une commande
`{ before, after }` limitée aux champs modifiés. L'undo applique la commande
inverse ; le redo la ré-applique. La pile vit **en mémoire, par session** (un
rafraîchissement la vide) ; aucun historique n'est persisté en base.

Contrainte projet respectée : **aucune écriture Supabase nouvelle**. L'undo
réutilise `createReservation` / `updateReservation` / `deleteReservation`
existants ; les gardes temporelles (`canEditReservation`, `canCreateReservation`)
et l'anti-chevauchement (`hasOverlap`) s'appliquent aussi à l'undo.

## Angles à clarifier

- **D1 — Feedback quand une annulation est impossible** (entrée périmée : la
  réservation a été supprimée par un collègue, la place a été reprise, ou la
  cible est tombée dans le passé verrouillé). **Option « silencieux » retenue
  (recommandée)** : `Ctrl+Z` saute l'entrée périmée et passe à la suivante, sans
  message. Raison : l'app n'a **aucun système de toast** (vérifié : ni `sonner`,
  ni `Toaster`, seulement des bannières `Alert` persistantes), et en monter un
  pour ce seul cas serait disproportionné ; cohérent aussi avec la règle « messages
  d'anomalie seulement, pas de bruit ». À rouvrir seulement si l'utilisateur veut
  un retour visuel discret (un `Alert` transitoire monté à la volée).
- **D2 — Granularité création + nommage.** Créer une réservation vide puis taper
  son nom = **deux** entrées d'historique (create, puis rename). Un premier
  `Ctrl+Z` efface le nom, un second supprime la réservation. **Comportement
  accepté (recommandé)** : c'est la sémantique standard d'un éditeur ; pas de
  coalescence prévue. À signaler seulement si l'utilisateur préfère une fusion.

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-history-model.md](./1-history-model.md) | Modèle de commandes pur + tests | — | P0 | 1h | `history.ts` + `history.test.ts` |  |
| 2 | [2-use-parking-history.md](./2-use-parking-history.md) | Hook piles undo/redo | 1 | P0 | 1h30 | `useParkingHistory.ts` |  |
| 3 | [3-refactor-apply-primitives.md](./3-refactor-apply-primitives.md) | Primitives `applyCreate/Delete/Update` (refactor iso-comportement) | — | P0 | 2h | `ParkingBoard.tsx` refactoré |  |
| 4 | [4-wiring-record-shortcuts.md](./4-wiring-record-shortcuts.md) | Branchement `record`, hook, raccourcis clavier | 1, 2, 3 | P0 | 2h30 | Feature visible |  |
| 5 | [5-validation-globale.md](./5-validation-globale.md) | Validation + scénarios collaboratifs | 4 | P0 | 1h | Chantier vérifié | ⚠ |

## Ordre d'exécution

- Séquentiel pour l'essentiel. L'étape 3 (refactor des primitives) est
  **indépendante** de 1 et 2 : elle peut être menée en parallèle du modèle et du
  hook, ou avant. L'étape 4 est le point de convergence (a besoin de 1, 2, 3).
- L'étape 5 clôt le chantier (validation globale + revue des scénarios
  concurrents) ; marquée critique car dernière étape.

## Architecture cible

```
src/lib/parking/
  history.ts              [nouveau]  type ParkingCommand (create|delete|update) + invert()
  history.test.ts         [nouveau]  tests de invert()
src/components/parking/
  useParkingHistory.ts    [nouveau]  piles undo/redo (refs), record / undo / redo, canUndo / canRedo
  ParkingBoard.tsx        [modifie]  applyCreate/applyDelete/applyUpdate (local+DB+gardes),
                                     record(...) dans chaque handler, raccourcis Ctrl+Z / Y
src/components/shared/
  useUndoRedoShortcut.ts  [nouveau]  detection Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z, garde INPUT/TEXTAREA
```

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|-------------------|-------------------|
| Métier pur (`src/lib/parking`) | — | `history.ts`, `history.test.ts` |
| Composants parking (`src/components/parking`) | `ParkingBoard.tsx` | `useParkingHistory.ts` |
| Composants partagés (`src/components/shared`) | — | `useUndoRedoShortcut.ts` |
| **Total** | **1 modifié** | **4 nouveaux** |
