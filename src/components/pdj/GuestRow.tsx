import { memo } from 'react'
import { ArrowDown, ArrowUp, Star } from 'lucide-react'

import { isOffertBox, roomFinance } from '#/lib/pdj/breakdown.ts'
import { stayKind } from '#/lib/pdj/csv.ts'
import type { ManualKind } from '#/lib/pdj/csv.ts'
import { fmtEur } from '#/lib/pdj/format.ts'
import type { PdjDayRow } from '#/lib/pdj/service.ts'
import { cn } from '#/lib/utils.ts'

/*
 * Une LIGNE de chambre du tableau des étages (page Petit-déjeuner).
 *
 * Extrait de `BreakfastBoard` pour être la SOURCE UNIQUE du rendu d'une ligne :
 * le board l'utilise pour les 80 chambres du jour, et le panneau d'aide
 * (`PdjHelpPanel`) pour ses exemples illustrés — une légende dessinée à la main
 * finirait par mentir sur ce que la page fait vraiment.
 */

// Mémoïsé : sur un clic « servi », seule la chambre modifiée reçoit un nouvel
// objet `row` (maj optimiste par référence) — les 79 autres lignes gardent leur
// référence et ne se re-rendent pas (avec `onServe` stable, cf. useCallback).
export const GuestRow = memo(function GuestRow({
  room,
  row,
  tarifs,
  canEdit,
  onServe,
  onManual,
  onOffert,
}: {
  room: number
  row?: PdjDayRow
  tarifs: Map<string, number>
  canEdit: boolean
  onServe: (room: number, n: number) => void
  onManual: (room: number, n: number, kind: ManualKind) => void
  onOffert: (room: number, n: number) => void
}) {
  // Détail financier de la chambre (OTA · code PDJ · prix HT) — calculé pour toutes
  // les lignes ; l'affichage écran/impression est piloté par CSS (classe pdj-finance
  // sur le conteneur), les valeurs restant DANS le DOM en permanence.
  const fin = row ? roomFinance(row, tarifs) : null
  // Type de saisie manuelle (day-use/no-show) : calculé d'abord car il conditionne
  // le sens des cases « attendues » ci-dessous.
  const manualKind = row?.manual_kind ?? null
  const isManual = manualKind != null
  // Cases en GRAS = petits-déjeuners ATTENDUS de la chambre. Pour une chambre à
  // PDJ inclus, c'est le DÛ facturé (`breakfasts_included`, qui compte l'enfant
  // payant d'un tarif « N PAX » — cf. csv.ts). Pour une chambre occupée SANS PDJ
  // inclus, on montre ses clients présents (`min(adults, 2)`) afin de pouvoir lui
  // servir un PDJ EXTRA. La distinction « PDJ inclus » reste aussi lisible via le
  // FOND VERT de la ligne (.pdj-included). Une ligne MANUELLE garde son nombre
  // saisi ; chambre vide → 0. (Les MONTANTS et les extras restent calculés depuis
  // `breakfasts_included` : servir au-delà des inclus = extra facturé.)
  const numExpected = isManual
    ? (row?.breakfasts_included ?? 0)
    : row
      ? row.breakfasts_included > 0
        ? row.breakfasts_included
        : Math.min(row.adults, 2)
      : 0
  const served = row?.breakfasts_served ?? 0
  // Minimum 2 cases pour une grille régulière ; on élargit si un PDJ « en plus »
  // a déjà été servi au-delà des attendus (pour ne pas masquer une case cochée).
  const numBoxes = Math.max(2, numExpected, served)
  // Flèche selon la nature du séjour (source unique `stayKind`) : départ vs recouche.
  const stay = row ? stayKind(row.status) : null
  const departing = stay === 'departing'
  const staying = stay === 'staying'
  // Saisie MANUELLE : une chambre VIDE (non check-in) ou déjà manuelle accepte un
  // PDJ à la main (day-use, no-show revenu…). `mKind` = son type inclus/extra
  // (défaut extra). `doServe` route le clic vers le bon canal (manuel vs normal).
  const canManual = !row || isManual
  const mKind: ManualKind = manualKind ?? 'extra'
  const doServe = (n: number) =>
    canManual ? onManual(room, n, mKind) : onServe(room, n)
  // « Offert » (gratuit, clic droit) : la POSE reste réservée aux chambres
  // occupées SANS PDJ inclus (une chambre à PDJ inclus n'a pas d'extra « offert »
  // à proposer, son dû est déjà facturé).
  const canOffertToggle =
    canEdit && !isManual && !!row && row.breakfasts_included === 0
  const offertCount = row?.breakfasts_offert ?? 0
  // Case violette : règle PURE et PARTAGÉE (`isOffertBox`, breakdown.ts), tenue
  // avec le comptage de la tuile « Gratuités » — le nombre de cases violettes
  // d'une ligne VAUT sa contribution à `ca.offertNb`. C'est ce qui manquait :
  // la position d'une case n'est le rang d'un extra que tant que
  // `breakfasts_included` vaut 0, et cette colonne peut monter APRÈS la pose
  // (réimport, trigger `pdj_breakfasts_clamp_included`).
  const isOffertAt = (i: number) => isOffertBox(row, i)
  // Cases interactives : TOUTE chambre OCCUPÉE (client présent), qu'elle ait du PDJ
  // inclus OU NON — sinon on ne pouvait pas servir un PDJ EXTRA à un client d'une
  // chambre sans PDJ inclus (le clic passe alors par `onServe` : breakfasts_served
  // sur la ligne, comptés en extras puisque breakfasts_included = 0). PLUS la chambre
  // vide éditable (1re coche → ligne manuelle day-use). Une chambre occupée affiche
  // ses cases même en lecture seule (pour montrer l'état « servi »).
  const showInteractive = !!row || (!row && canEdit)
  // Double-clic « tout servir / annuler » : réservé aux lignes à couverts attendus.
  const canServe = canEdit && numExpected > 0

  return (
    <tr
      onDoubleClick={
        canServe
          ? () => doServe(served >= numExpected ? 0 : numExpected)
          : undefined
      }
      title={canServe ? 'Double-clic : tout servir / annuler' : undefined}
      className={cn(
        row && row.breakfasts_included > 0 && 'pdj-included',
        !row && 'pdj-empty',
        canServe && 'cursor-pointer select-none',
      )}
    >
      <td className="pdj-room">{room}</td>
      {isManual ? (
        // Saisie manuelle : la bande Nom / Statut / Visites (vides ici) est
        // fusionnée via colSpan — entre Chambre et Clients (cases), inchangées.
        // Par défaut, on n'affiche QUE le type en toutes lettres, centré ; le
        // toggle (compact, Extra en 1er) n'apparaît qu'au SURVOL de la bande.
        <td className="pdj-name" colSpan={3}>
          <div className="group relative flex w-full items-center justify-center">
            {/* Type en toutes lettres : reste dans le flux → fixe la hauteur de la
                ligne (identique aux autres). Juste masqué (invisible) au survol. */}
            <span
              className={cn(
                'text-xs font-medium capitalize group-hover:invisible',
                mKind === 'offert'
                  ? 'text-purple-400'
                  : 'text-muted-foreground',
              )}
            >
              {mKind}
            </span>
            {/* Toggle SUPERPOSÉ (absolute) → n'affecte JAMAIS la hauteur : aucun
                saut au survol. Compact, centré, Extra en 1er, écran seul. Offert
                en dernier, teinté violet quand actif (case gratuite, cf. droite). */}
            <span className="absolute inset-0 hidden items-center justify-center group-hover:flex print:hidden">
              <span className="inline-flex overflow-hidden rounded-md border border-border bg-card text-xs leading-none">
                {(['extra', 'inclus', 'offert'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    disabled={!canEdit}
                    onClick={() => onManual(room, served, k)}
                    className={cn(
                      'px-2 py-0.5 font-medium capitalize transition-colors',
                      mKind === k
                        ? k === 'offert'
                          ? 'bg-purple-500 text-white'
                          : 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent',
                    )}
                  >
                    {k}
                  </button>
                ))}
              </span>
            </span>
          </div>
        </td>
      ) : (
        <>
          <td className={cn('pdj-name', row?.vip && 'pdj-vip')}>
            {/* Normal : nom du client. Financier : origine (OTA). */}
            <span className="pdj-name-inner pdj-val-normal">
              {row?.vip && (
                <Star className="pdj-name-star size-3" fill="currentColor" />
              )}
              {row ? (row.guest_name ?? '—') : ''}
            </span>
            <span
              className="pdj-name-inner pdj-val-finance"
              title={fin?.origin}
            >
              {fin ? fin.origin : ''}
            </span>
          </td>
          <td className="pdj-c pdj-status">
            {/* Normal : flèche statut. Financier : code PDJ. */}
            <span className="pdj-val-normal">
              {departing ? (
                <ArrowUp
                  className="pdj-status-icon"
                  style={{ color: '#EF5350' }}
                />
              ) : staying ? (
                <ArrowDown
                  className="pdj-status-icon"
                  style={{ color: '#2196F3' }}
                />
              ) : null}
            </span>
            <span className="pdj-val-finance pdj-code">{fin?.code ?? '—'}</span>
          </td>
          <td className="pdj-c pdj-stay-count">
            {/* Normal : nombre de visites. Financier : prix HT facturé. */}
            <span className="pdj-val-normal">
              {row && row.stay_count > 1 ? row.stay_count : ' '}
            </span>
            <span className="pdj-val-finance pdj-price">
              {/* `— ` = aucun PDJ (code null) ; sinon TOUJOURS un montant, y
                  compris « 0,00 € » pour un offert (gratuit mais bien un PDJ,
                  à distinguer visuellement d'une chambre sans petit-déjeuner). */}
              {fin && fin.code != null ? fmtEur(fin.htCa, 2) : '—'}
            </span>
          </td>
        </>
      )}
      <td className="pdj-c">
        {/* Impression : cases à cocher. Celles marquées « servi » à l'écran
            (i < served) sont pré-remplies (miroir du DOM) ; le reste est à
            cocher au stylo. */}
        <span className="pdj-checkboxes">
          {Array.from({ length: numBoxes }, (_, i) => {
            const checkedIdx = i < served
            // Inclus vs extra = compte FACTURÉ (`row.breakfasts_included`),
            // même base que les cases interactives à l'écran (pas `numExpected`,
            // qui peut inclure des places sans PDJ inclus — cf. plus haut).
            const includedIdx = i < (row?.breakfasts_included ?? 0)
            // `isOffertAt` (= isOffertBox) borne déjà au servi et à l'inclus.
            const offertIdx = isOffertAt(i)
            return (
              <span
                key={i}
                className={cn(
                  'pdj-checkbox',
                  i < numExpected && 'pdj-expected',
                  checkedIdx &&
                    (offertIdx
                      ? 'pdj-checked-offert'
                      : includedIdx
                        ? 'pdj-checked'
                        : 'pdj-checked-extra'),
                )}
              />
            )
          })}
        </span>
        {/* Écran : contrôle interactif « servi / attendu » (persisté), calqué
            sur les cases du PDF — toujours 2 cases mini. Bordure pleine en gras
            = client attendu (1 ou 2) ; bordure fine en pointillés = place
            supplémentaire (cochable à la main pour un PDJ « en plus », mais JAMAIS
            remplie par le double-clic de la ligne) ; case pleine = servi. */}
        {showInteractive && (
          <span className="inline-flex items-center gap-1 print:hidden">
            {Array.from({ length: numBoxes }, (_, i) => {
              const expected = i < numExpected
              const isServed = i < served
              // Inclus vs extra = compte FACTURÉ (`row.breakfasts_included`),
              // PAS `numExpected` (qui, pour une chambre SANS PDJ inclus, vaut
              // `min(adults, 2)` juste pour proposer des cases à cocher — tout
              // servi là-dedans reste un extra facturé, cf. commentaire
              // `numExpected` ci-dessus : « breakfasts_included = 0 »).
              const isIncluded = i < (row?.breakfasts_included ?? 0)
              const isOffert = isOffertAt(i)
              return (
                <button
                  key={i}
                  type="button"
                  disabled={!canEdit}
                  onClick={() => doServe(served === i + 1 ? i : i + 1)}
                  onDoubleClick={(e) => e.stopPropagation()}
                  onContextMenu={
                    canOffertToggle
                      ? (e) => {
                          e.preventDefault()
                          onOffert(room, offertCount === i + 1 ? i : i + 1)
                        }
                      : undefined
                  }
                  aria-label={
                    expected
                      ? `Servi ${i + 1} sur ${numExpected}`
                      : `Servi ${i + 1} (supplémentaire)`
                  }
                  title={
                    canOffertToggle
                      ? 'Clic : servi/annulé. Clic droit : offert (gratuit).'
                      : expected
                        ? `${served} / ${numExpected} servis`
                        : 'PDJ supplémentaire (au-delà des clients attendus)'
                  }
                  className={cn(
                    'size-3.5 rounded-[3px] transition-colors',
                    isServed
                      ? isOffert
                        ? 'border-2 border-purple-400 bg-purple-400' // gratuit, cf. tuile « Gratuités »
                        : isIncluded
                          ? 'border-2 border-emerald-500 bg-emerald-500'
                          : 'border-2 border-amber-400 bg-amber-400' // même teinte que la carte « PDJ Extra »
                      : expected
                        ? 'border-2 border-foreground/70 bg-transparent'
                        : 'border border-dashed border-muted-foreground/40 bg-transparent',
                    canEdit &&
                      (isOffert
                        ? 'cursor-pointer hover:border-purple-300'
                        : isIncluded
                          ? 'cursor-pointer hover:border-emerald-400'
                          : 'cursor-pointer hover:border-amber-400'),
                    !canEdit && 'cursor-default',
                  )}
                />
              )
            })}
          </span>
        )}
      </td>
    </tr>
  )
})
