import type { RoomStatus } from '#/lib/rapro/types.ts'

/** Ordre de défilement du statut au clic
 * (défaut → nettoyée → refus → no-show → défaut). */
const STATUS_CYCLE: RoomStatus[] = ['non_nettoyee', 'nettoyee', 'refus', 'noshow']

/** Libellés lisibles des statuts stockés. */
export const STATUS_LABEL: Record<RoomStatus, string> = {
  // `non_nettoyee` = terme technique interne ; affiché « Bloquée » (usage hôtelier).
  non_nettoyee: 'Bloquée',
  nettoyee: 'Nettoyée',
  refus: 'Refus',
  noshow: 'No-show',
}

/** Statut suivant dans le cycle. */
export function nextStatus(status: RoomStatus): RoomStatus {
  return STATUS_CYCLE[(STATUS_CYCLE.indexOf(status) + 1) % STATUS_CYCLE.length]
}

/** Statut d'une chambre, avec la convention « absence de ligne = non_nettoyee ».
 * Source unique de cette règle — à utiliser partout plutôt que `?? …`. */
export function statusOf(
  statuses: ReadonlyMap<number, RoomStatus>,
  room: number,
): RoomStatus {
  return statuses.get(room) ?? 'non_nettoyee'
}

/** Statuts HORS CHARGE (aucun ménage dû) : ils sortent de la balance et NE
 * roulent PAS d'un jour à l'autre — `refus` (client en séjour qui décline) et
 * `noshow` (vendue mais client absent). Tout le reste (`non_nettoyee`, la
 * « Bloquée ») = dû non fait → reste dans la balance et roule jusqu'à résolution. */
export const JUSTIFIED_STATUSES = ['refus', 'noshow'] as const

/**
 * État VISUEL d'une case (5 valeurs), dérivé du statut + de l'occupation :
 * `non_nettoyee` se scinde en `todo` (occupée, à faire) ou `empty` (non vendue).
 * C'est la clé du rendu couleur/libellé, côté écran comme PDF.
 */
export type CellState = 'clean' | 'todo' | 'refus' | 'noshow' | 'empty'

export function cellState(status: RoomStatus, isEmpty: boolean): CellState {
  if (status === 'nettoyee') return 'clean'
  if (status === 'refus') return 'refus'
  if (status === 'noshow') return 'noshow'
  return isEmpty ? 'empty' : 'todo'
}

/** Descripteur d'affichage par état visuel : libellé, classe web, modif. de dot
 * de légende. Table unique → ajouter/renommer un état se fait ici. Les couleurs
 * web vivent dans rapro.css (tokens CSS), les couleurs PDF dans pdf.ts (RGB). */
export const CELL_STATES: Record<
  CellState,
  { label: string; webClass: string; legendMod: string }
> = {
  clean: { label: 'Nettoyée', webClass: 'rapro-room-clean', legendMod: 'is-clean' },
  todo: { label: 'Bloquée', webClass: 'rapro-room-todo', legendMod: 'is-todo' },
  refus: { label: 'Refus', webClass: 'rapro-room-refus', legendMod: 'is-refus' },
  noshow: { label: 'No-show', webClass: 'rapro-room-noshow', legendMod: 'is-noshow' },
  empty: { label: 'Non vendue', webClass: 'rapro-room-empty', legendMod: 'is-empty' },
}

/** Ordre d'affichage de la légende (bas de grille + PDF). */
export const LEGEND_ORDER: CellState[] = [
  'clean',
  'todo',
  'refus',
  'noshow',
  'empty',
]

/** Décompte d'un jour : nettoyées / refus / no-show (tous statuts), et « à faire »
 * (chambres occupées encore non nettoyées — a besoin de l'occupation). */
export function countStats(
  statuses: ReadonlyMap<number, RoomStatus>,
  occupied: ReadonlySet<number>,
): { clean: number; refus: number; noshow: number; todo: number } {
  let clean = 0
  let refus = 0
  let noshow = 0
  for (const s of statuses.values()) {
    if (s === 'nettoyee') clean++
    else if (s === 'refus') refus++
    else if (s === 'noshow') noshow++
  }
  let todo = 0
  for (const room of occupied) {
    if (statusOf(statuses, room) === 'non_nettoyee') todo++
  }
  return { clean, refus, noshow, todo }
}
