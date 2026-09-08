import { CELL_STATES, cellState } from '#/lib/rapro/constants.ts'
import type { RoomStatus } from '#/lib/rapro/types.ts'
import { cn } from '#/lib/utils.ts'

/*
 * Une CASE de chambre de la grille du rapprochement.
 *
 * Extraite de `RaproBoard` pour être la SOURCE UNIQUE du rendu d'une case : la
 * grille du jour l'utilise pour les 80 chambres, et le panneau d'aide
 * (`RaproHelpPanel`) pour ses exemples illustrés — une légende dessinée à la
 * main finirait par mentir sur ce que la grille montre vraiment.
 *
 * Le composant ne décide rien : il reçoit les deux faits dont dépend l'état
 * visuel (`status` stocké, `sold`) et le sur-statut `carried`, puis délègue à
 * `cellState` / `CELL_STATES` (lib/rapro/constants.ts), partagés avec le PDF.
 *
 * Sans état : le minuteur d'appui long vit dans le board (un seul pour toute la
 * grille — un hook ne peut pas s'appeler dans une boucle `.map()`), qui rend la
 * case « pressée » via `pressing`.
 */
export function RoomCell({
  room,
  status,
  sold,
  carried = false,
  pressing = false,
  disabled = false,
  onTap,
  onContext,
  onPointerDown,
  onPointerEnd,
}: {
  room: number
  /** Statut STOCKÉ de la chambre : `null` = aucune ligne (cf. `statusOf`). */
  status: RoomStatus | null
  /** La chambre est-elle vendue ce jour (In-House) ? */
  sold: boolean
  /** Bloquée un jour précédent, pas encore soldée : liseré rouge ORTHOGONAL
   *  (il s'ajoute par-dessus la couleur, il ne la remplace jamais). */
  carried?: boolean
  /** Appui long en cours (tactile) : anime la case pendant les 500 ms. */
  pressing?: boolean
  disabled?: boolean
  onTap?: (room: number) => void
  onContext?: (room: number) => void
  onPointerDown?: (room: number, pointerType: string) => void
  onPointerEnd?: () => void
}) {
  // Grise si AUCUNE couleur explicite ET non vendue — que la chambre soit
  // reportée (liseré) ou non : le liseré est ORTHOGONAL, il ne colore pas le
  // fond. Une couleur posée (même sur une non vendue) montre sa couleur.
  const isEmpty = status === null && !sold
  // `statusOf` en une ligne : absence de ligne = nettoyée (cf. constants.ts).
  const visual = cellState(status ?? 'nettoyee', isEmpty)
  // Libellé = état VISUEL (une grise dit « Non vendue », pas « Nettoyée » par
  // défaut) + mention du liseré reporté.
  const roomLabel = `Chambre ${room} — ${CELL_STATES[visual].label}${carried ? ' — bloquée de la veille' : ''}`
  return (
    <button
      type="button"
      onClick={onTap ? () => onTap(room) : undefined}
      onContextMenu={
        onContext
          ? (e) => {
              e.preventDefault()
              onContext(room)
            }
          : undefined
      }
      onPointerDown={
        onPointerDown ? (e) => onPointerDown(room, e.pointerType) : undefined
      }
      onPointerUp={onPointerEnd}
      onPointerLeave={onPointerEnd}
      onPointerCancel={onPointerEnd}
      disabled={disabled}
      aria-label={roomLabel}
      title={roomLabel}
      className={cn(
        'rapro-room',
        CELL_STATES[visual].webClass,
        carried && 'rapro-room-carried',
        pressing && 'rapro-room-pressing',
      )}
    >
      {room}
    </button>
  )
}
