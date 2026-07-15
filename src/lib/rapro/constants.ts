import type { RoomStatus } from '#/lib/rapro/types.ts'

/** Libellés lisibles des statuts. */
export const STATUS_LABEL: Record<RoomStatus, string> = {
  nettoyee: 'Nettoyée',
  // « Bloquée » = utilisée mais non nettoyée (reste due, roule). Le défaut est
  // `nettoyee` (absence de ligne), donc `non_nettoyee` est toujours explicite.
  non_nettoyee: 'Bloquée',
  refus: 'Refus',
  noshow: 'No-show',
}

/** Cycle du CLIC sur une chambre due : nettoyée (défaut) → refus → no-show →
 * bloquée → nettoyée. Le défaut (absence de ligne) est `nettoyee`. */
export const CLICK_CYCLE: readonly RoomStatus[] = [
  'nettoyee',
  'refus',
  'noshow',
  'non_nettoyee',
]

/** Statut suivant dans le cycle du clic (cf. `CLICK_CYCLE`). */
export function nextStatus(status: RoomStatus): RoomStatus {
  const i = CLICK_CYCLE.indexOf(status)
  return CLICK_CYCLE[(i + 1) % CLICK_CYCLE.length]
}

/** Statut d'une chambre, avec la convention « absence de ligne = nettoyee ».
 * Postulat : tout est nettoyé par défaut ; seules les exceptions sont stockées.
 * Source unique de cette règle — à utiliser partout plutôt que `?? …`. */
export function statusOf(
  statuses: ReadonlyMap<number, RoomStatus>,
  room: number,
): RoomStatus {
  return statuses.get(room) ?? 'nettoyee'
}

/** Statuts hors charge (aucun ménage dû, NON facturables) : ils sortent de la
 * balance et NE roulent PAS d'un jour à l'autre — `refus` (client en séjour qui
 * décline) et `noshow` (vendue mais client absent). `non_nettoyee` (« Bloquée »)
 * = dû non fait → reste dans la balance et roule. */
export const JUSTIFIED_STATUSES = ['refus', 'noshow'] as const

/**
 * État VISUEL d'une case, dérivé du statut + de l'occupation : le défaut
 * `nettoyee` se rend `clean` si la chambre est vendue, `empty` (grisée) sinon ;
 * `non_nettoyee` (à nettoyer) devient `todo` sur une chambre vendue. C'est la clé
 * du rendu couleur/libellé, côté écran comme PDF.
 */
export type CellState = 'clean' | 'todo' | 'refus' | 'noshow' | 'empty'

export function cellState(status: RoomStatus, isEmpty: boolean): CellState {
  switch (status) {
    case 'refus':
      return 'refus'
    case 'noshow':
      return 'noshow'
    // Défaut : grisé si la chambre n'est pas vendue, nettoyé sinon.
    case 'nettoyee':
      return isEmpty ? 'empty' : 'clean'
    // « Bloquée » : grisée si non vendue, rouge « à faire » sinon.
    case 'non_nettoyee':
      return isEmpty ? 'empty' : 'todo'
    default: {
      // Garde d'exhaustivité : un nouveau RoomStatus non traité casse la compilation.
      const _exhaustive: never = status
      return _exhaustive
    }
  }
}

/** Descripteur d'affichage par état visuel : libellé, classe web, modif. de dot
 * de légende. Table unique → ajouter/renommer un état se fait ici. Les couleurs
 * web vivent dans rapro.css (tokens CSS), les couleurs PDF dans pdf.ts (RGB). */
export const CELL_STATES: Record<
  CellState,
  { label: string; webClass: string; legendMod: string }
> = {
  clean: {
    label: 'Nettoyée',
    webClass: 'rapro-room-clean',
    legendMod: 'is-clean',
  },
  todo: { label: 'Bloquée', webClass: 'rapro-room-todo', legendMod: 'is-todo' },
  refus: {
    label: 'Refus',
    webClass: 'rapro-room-refus',
    legendMod: 'is-refus',
  },
  noshow: {
    label: 'No-show',
    webClass: 'rapro-room-noshow',
    legendMod: 'is-noshow',
  },
  empty: {
    label: 'Non vendue',
    webClass: 'rapro-room-empty',
    legendMod: 'is-empty',
  },
}

/** Couleur d'accent par catégorie de ménage, ALIGNÉE sur la grille (rapro.css) :
 * nettoyée=vert (chart-5), bloquée=rouge, refus=ambre (chart-3), no-show=violet.
 * SOURCE UNIQUE (theme-aware via les tokens) partagée par les cards du board,
 * l'analytique annuelle et le détail mensuel. Les couleurs web de la grille
 * (rapro.css) et les RGB du PDF (pdf.ts) en sont les miroirs par nature (autres
 * encodages). */
export const CATEGORY_COLOR = {
  nettoyee: 'var(--chart-5)',
  bloquee: '#f87171',
  refus: 'var(--chart-3)',
  noshow: '#a78bfa',
} as const

/** Ordre d'affichage de la légende (bas de grille + PDF) : nettoyée, refus,
 * no-show, bloquée. « empty » (non vendue) n'y figure pas — le grisé des cases
 * non vendues se lit sans légende (rendu par CELL_STATES/cellState). */
export const LEGEND_ORDER: CellState[] = ['clean', 'refus', 'noshow', 'todo']

/** Décompte des statuts sur les chambres DUES (occupées), en PARTITION (aucun
 * recouvrement) : nettoyées, bloquées (`non_nettoyee`), refus, no-show. Chaque
 * chambre due tombe dans exactement une catégorie. */
export function countStats(
  statuses: ReadonlyMap<number, RoomStatus>,
  occupied: ReadonlySet<number>,
): {
  clean: number
  todo: number
  refus: number
  noshow: number
} {
  let clean = 0
  let todo = 0
  let refus = 0
  let noshow = 0
  for (const room of occupied) {
    switch (statusOf(statuses, room)) {
      case 'nettoyee':
        clean++
        break
      case 'refus':
        refus++
        break
      case 'noshow':
        noshow++
        break
      case 'non_nettoyee':
        todo++
        break
    }
  }
  return { clean, todo, refus, noshow }
}
