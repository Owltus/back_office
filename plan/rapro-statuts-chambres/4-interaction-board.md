# Étape 4 — Interaction : toggle gauche + menu contextuel droit

## Objectif

Remplacer, sur chaque chambre du board, le cycle de couleurs par les deux gestes
voulus : un **clic gauche** qui bascule `nettoyee` ↔ `refus`, et un **clic droit**
qui ouvre un **menu contextuel** offrant les statuts d'exception (`bloque`,
`noshow`, `faux_noshow`) plus un retour à `nettoyee`.

## Contexte

`src/components/rapro/RaproBoard.tsx` (~879 lignes) est monolithique : la grille,
les cards de chambre et la légende y sont rendues inline. Le bouton de chambre
(l.716-737) porte aujourd'hui `onClick={() => cycle(room)}` (l.725) et aucun
`onContextMenu`. `cycle` (l.333-335) passe par `applyStatuses` (l.306-330), le
chemin unique de mise à jour optimiste + rollback (convention l.313 :
`non_nettoyee` = suppression de ligne). Le gating d'édition est `canEditFields`
(l.150 = `isWriter && !isValidated`) : le menu ne doit ni s'ouvrir ni agir en
lecture seule ou sur un jour clôturé.

La primitive shadcn `src/components/ui/context-menu.tsx` existe déjà (jamais
retouchée). Le patron d'usage exact à copier est
`src/components/parking/ParkingBoard.tsx` : `onContextMenu` pour capturer la
cellule ciblée, puis
`<ContextMenu><ContextMenuTrigger asChild>…</ContextMenuTrigger><ContextMenuContent>…</ContextMenuContent></ContextMenu>`
avec `ContextMenuRadioGroup`/`ContextMenuRadioItem` pour choisir un statut.

## Fichier(s) impacté(s)

- `src/components/rapro/RaproBoard.tsx` (modifié)
- `src/components/ui/context-menu.tsx` (réutilisé, non modifié)
- `src/components/parking/ParkingBoard.tsx` (référence de patron)

## Travail à réaliser

### 1. Clic gauche → toggle

Remplacer `cycle(room)` par un appel au helper `toggleClean` (étape 2) :

```tsx
const toggle = (room: number) =>
  applyStatuses([[room, toggleClean(statusOf(statuses, room))]])
```

Le `onClick` du bouton de chambre appelle `toggle(room)`. Conserver le passage
par `applyStatuses` (mise à jour optimiste + rollback) — ne pas court-circuiter.

### 2. Clic droit → menu contextuel

Suivre le patron `ParkingBoard`. Sur le bouton de chambre :

```tsx
<ContextMenu>
  <ContextMenuTrigger asChild>
    <button className={cn('rapro-room', cls, …)} onClick={() => toggle(room)}>
      {room}
    </button>
  </ContextMenuTrigger>
  <ContextMenuContent>
    <ContextMenuRadioGroup
      value={statusOf(statuses, room)}
      onValueChange={(v) => applyStatuses([[room, v as RoomStatus]])}
    >
      <ContextMenuRadioItem value="nettoyee">Nettoyée</ContextMenuRadioItem>
      <ContextMenuRadioItem value="bloque">Bloquée</ContextMenuRadioItem>
      <ContextMenuRadioItem value="noshow">No-show</ContextMenuRadioItem>
      <ContextMenuRadioItem value="faux_noshow">Faux no-show</ContextMenuRadioItem>
    </ContextMenuRadioGroup>
  </ContextMenuContent>
</ContextMenu>
```

Icônes `lucide-react` déjà disponibles : `Ban` (bloqué), `UserX` (no-show) ;
choisir une icône pour « faux no-show ».

### 3. Gating lecture seule / jour clôturé

Quand `!canEditFields`, le clic gauche et le menu contextuel ne doivent pas
modifier de statut (désactiver les items, ou ne pas monter le `ContextMenu`).
S'aligner sur le comportement actuel de `cycle`/`toggleFloor`.

### 4. Extraction `RoomCard` (optionnel)

Le bouton de chambre gagne en complexité (trigger + menu). Une extraction en
sous-composant `RoomCard` local peut être envisagée pour la lisibilité, sans
changer l'architecture de données. Non obligatoire.

## Ordre d'exécution

1. Câbler le clic gauche sur `toggleClean` via `applyStatuses`.
2. Envelopper le bouton dans `ContextMenu` (patron `ParkingBoard`).
3. Brancher chaque item sur `applyStatuses`.
4. Vérifier le gating `canEditFields`.
5. `npx tsc --noEmit`.

## Critère de validation

- Clic gauche sur une chambre nettoyée → passe à `refus` ; re-clic → revient à
  `nettoyee` (jamais les statuts d'exception).
- Clic droit → menu listant `nettoyee`/`bloque`/`noshow`/`faux_noshow`, sélection
  appliquée et persistée.
- Sur un jour clôturé ou en lecture seule, aucun statut n'est modifiable.
- La mise à jour optimiste + rollback fonctionne (pas de désynchro visuelle en cas
  d'échec réseau).
- `npx tsc --noEmit` vert.
