import type { RoomStatus } from '#/lib/rapro/types.ts'

/** Libellés lisibles des statuts. */
export const STATUS_LABEL: Record<RoomStatus, string> = {
  nettoyee: 'Nettoyée',
  // « Bloquée » = utilisée mais non nettoyée (reste due, roule). Le défaut est
  // `nettoyee` (absence de ligne), donc `non_nettoyee` est toujours explicite.
  non_nettoyee: 'Bloquée du jour',
  refus: 'Refus',
  // Rattrapage : ménage en retard fait sur une reportée non vendue. À l'écran
  // c'est une nettoyée (verte) ; le liseré « bloquée la veille » fait la nuance.
  rattrapage: 'Nettoyée',
  // Non vendue forcée : correction d'occupation inverse (PMS a compté une vente
  // qui n'existe pas). Grise, hors charge.
  non_vendue: 'Non vendue',
}

/**
 * Couleur suivante au clic gauche. `null` = AUCUNE couleur (grise si non vendue,
 * verte par défaut si vendue). TROIS cycles selon la situation de la chambre :
 *  - VENDUE (occupée aujourd'hui, toujours « active ») : vert → refus → bloquée →
 *    non vendue (gris) → vert. Le vert par défaut est `null` (pas de couleur
 *    explicite à stocker) ; « non vendue » corrige une vente comptée à tort par le
 *    PMS (la chambre sort alors des vendues et du dû, symétrique de la correction
 *    d'une non-vendue vers vendue ci-dessous).
 *  - NON VENDUE ET REPORTÉE (bloquée la veille, vidée depuis) : le clic ne sert
 *    qu'à solder le ménage en retard → gris → rattrapage (ménage fait, facturable
 *    mais PAS une vente) → bloquée (encore dû, roule) → gris. Pas de « refus » :
 *    sans client aujourd'hui, refuser le ménage n'aurait aucun sens.
 *  - NON VENDUE, NON REPORTÉE : correction d'occupation (In-House a raté une vente)
 *    → gris → nettoyée (vert) → refus → bloquée → gris. La couleur affirme que la
 *    chambre était bien vendue → elle compte alors comme vendue.
 */
export function nextFill(
  current: RoomStatus | null,
  sold: boolean,
  carried = false,
): RoomStatus | null {
  if (sold) {
    // 4 états : null (vert) → refus → non_nettoyee (bloquée) → non_vendue (gris) →
    // null (vert). La « non vendue » corrige une vente comptée à tort par le PMS.
    if (current === 'refus') return 'non_nettoyee'
    if (current === 'non_nettoyee') return 'non_vendue'
    if (current === 'non_vendue') return null
    return 'refus' // null ou nettoyee (vert) → refus
  }
  if (carried) {
    // Reportée non vendue : null (gris) → rattrapage → non_nettoyee → null (gris).
    if (current === null) return 'rattrapage'
    if (current === 'rattrapage') return 'non_nettoyee'
    return null // non_nettoyee (ou tout autre reliquat) → gris
  }
  // Non vendue, non reportée — 4 états : null (gris) → nettoyee → refus →
  // non_nettoyee → null (gris).
  if (current === null) return 'nettoyee'
  if (current === 'nettoyee') return 'refus'
  if (current === 'refus') return 'non_nettoyee'
  return null // non_nettoyee → gris
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
 * décline le ménage). `non_nettoyee` (« Bloquée ») = dû non fait → reste dans la
 * balance et roule. */
export const JUSTIFIED_STATUSES = ['refus'] as const

/**
 * État VISUEL d'une case, dérivé du statut + de l'occupation : le défaut
 * `nettoyee` se rend `clean` si la chambre est vendue, `empty` (grisée) sinon ;
 * `non_nettoyee` (à nettoyer) devient `todo` sur une chambre vendue. C'est la clé
 * du rendu couleur/libellé, côté écran comme PDF.
 */
export type CellState = 'clean' | 'todo' | 'refus' | 'empty'

export function cellState(status: RoomStatus, isEmpty: boolean): CellState {
  switch (status) {
    case 'refus':
      return 'refus'
    // Défaut : grisé si la chambre n'est pas vendue, nettoyé sinon.
    case 'nettoyee':
      return isEmpty ? 'empty' : 'clean'
    // Rattrapage : ménage fait sur une reportée → même rendu qu'une nettoyée
    // (vert). La chambre porte toujours une couleur (jamais grise ici) ; le liseré
    // « bloquée la veille » dessiné à part la distingue d'une nettoyée ordinaire.
    case 'rattrapage':
      return 'clean'
    // « Bloquée » : grisée si non vendue, rouge « à faire » sinon.
    case 'non_nettoyee':
      return isEmpty ? 'empty' : 'todo'
    // « Non vendue » forcée : TOUJOURS grise, même si le PMS la disait occupée —
    // c'est justement la correction (la vente n'a pas eu lieu).
    case 'non_vendue':
      return 'empty'
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
  todo: {
    label: 'Bloquée du jour',
    webClass: 'rapro-room-todo',
    legendMod: 'is-todo',
  },
  refus: {
    label: 'Refus',
    webClass: 'rapro-room-refus',
    legendMod: 'is-refus',
  },
  empty: {
    label: 'Non vendue',
    webClass: 'rapro-room-empty',
    legendMod: 'is-empty',
  },
}

/** Couleur d'accent par catégorie de ménage, ALIGNÉE sur la grille (rapro.css) :
 * nettoyée=vert (chart-5), bloquée=rouge, refus=ambre (chart-3). SOURCE UNIQUE
 * (theme-aware via les tokens) partagée par les cards du board, l'analytique
 * annuelle et le détail mensuel. Les couleurs web de la grille (rapro.css) et les
 * RGB du PDF (pdf.ts) en sont les miroirs par nature (autres encodages). */
export const CATEGORY_COLOR = {
  nettoyee: 'var(--chart-5)',
  bloquee: '#f87171',
  refus: 'var(--chart-3)',
  // Rattrapage : parent de la nettoyée (un ménage fait) mais distinct — teinte
  // propre (chart-2) pour le lire à part dans le tableau analytique.
  rattrapage: 'var(--chart-2)',
  // Ajoutés pour l'analytique : « vendues » (total) et « moyenne / jour ». Ce sont
  // EXACTEMENT --chart-1 et --muted-foreground (plus de hex #818cf8 / #94a3b8 en
  // dur dans les boards). Le PDF (pdf.ts) lit déjà ces tokens.
  vendues: 'var(--chart-1)',
  moyenne: 'var(--muted-foreground)',
} as const

/** Ordre d'affichage de la légende (bas de grille + PDF) : nettoyée, refus,
 * bloquée. « empty » (non vendue) n'y figure pas — le grisé des cases non vendues
 * se lit sans légende (rendu par CELL_STATES/cellState). */
export const LEGEND_ORDER: CellState[] = ['clean', 'refus', 'todo']

/** Décompte des statuts sur un ENSEMBLE de chambres (typiquement « vendues
 * effectives » = occupées ∪ marquées d'une couleur), en PARTITION (aucun
 * recouvrement) : nettoyées (défaut inclus), bloquées (`non_nettoyee`), refus.
 * Chaque chambre de l'ensemble tombe dans exactement une catégorie. */
export function countStats(
  statuses: ReadonlyMap<number, RoomStatus>,
  occupied: ReadonlySet<number>,
): {
  clean: number
  todo: number
  refus: number
} {
  let clean = 0
  let todo = 0
  let refus = 0
  for (const room of occupied) {
    // Nettoyée et rattrapage = un ménage fait → comptés ensemble (même famille).
    switch (statusOf(statuses, room)) {
      case 'nettoyee':
      case 'rattrapage':
        clean++
        break
      case 'refus':
        refus++
        break
      case 'non_nettoyee':
        todo++
        break
    }
  }
  return { clean, todo, refus }
}
