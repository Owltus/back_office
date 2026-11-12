import { useState } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import { GripVertical } from 'lucide-react'

import { useEcriture } from '#/components/planning/hooks/usePlanning.ts'
import { useNotifier } from '#/components/planning/Messages.tsx'
import { Tip } from '#/components/shared/Tip.tsx'
import {
  dureeHoraire,
  familles,
  grouperHoraires,
  heures,
  libelleHoraire,
  libelleMoment,
} from '#/lib/planning/affichage.ts'
import { deplacementHoraire } from '#/lib/planning/deplacementHoraire.ts'
import { estNuit, momentPropose } from '#/lib/planning/moment.ts'
import type { Moments } from '#/lib/planning/moment.ts'
import { deplacerHoraire } from '#/lib/planning/service.ts'
import type { Horaire, Periode } from '#/lib/planning/types.ts'
import { cn } from '#/lib/utils.ts'

/*
 * Les horaires de la page Horaires, un tableau par moment, l'un sous l'autre
 * (2026-11-11). Depuis le 2026-11-12 (demande utilisateur : « déplacer les
 * horaires de matin, middle, soir et nuit avec un glisser-déposer… qu'elle
 * les déplace au bon endroit »), la gestion GLISSE une ligne dans un autre
 * moment : l'horaire y est rangé à la main (`deplacementHoraire`), sa couleur
 * et son nom suivent, et le calcul du planning le compte dans ce moment. Le
 * remettre dans le moment de ses heures retire la marque « à la main ».
 *
 * Souris : glisser dès 5 px (un clic simple ouvre toujours le réglage).
 * Doigt : appui long, comme le Classeur. Les quatre moments restent affichés
 * pendant la gestion, même vides, pour pouvoir y déposer.
 */

export function HorairesParMoment({
  horaires,
  moments,
  modifiable,
  etoile,
  onOuvrir,
}: {
  horaires: readonly Horaire[]
  moments: Moments
  modifiable: boolean
  /** Version étoile d'un autre horaire (`etoile.ts`) : dit sur la ligne. */
  etoile: (h: Horaire) => boolean
  onOuvrir: (h: Horaire) => void
}) {
  const ecrire = useEcriture()
  const notifier = useNotifier()
  // Déplacements en cours d'écriture : montrés tout de suite à leur place.
  const [enCours, setEnCours] = useState<ReadonlyMap<number, Periode>>(
    new Map(),
  )
  const [tenu, setTenu] = useState<Horaire | null>(null)
  const capteurs = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 8 },
    }),
    useSensor(KeyboardSensor),
  )

  const vus = horaires.map((h) => {
    const vers = enCours.get(h.id)
    const ch = vers === undefined ? null : deplacementHoraire(h, vers, moments)
    return ch ? { ...h, ...ch } : h
  })
  const parMoment = new Map(
    grouperHoraires(vus, moments).map((g) => [g.periode, g.horaires]),
  )
  const groupes = familles(moments)
    .map((f) => ({ ...f, horaires: parMoment.get(f.periode) ?? [] }))
    .filter((g) => g.horaires.length > 0 || (modifiable && g.periode !== null))

  const commencer = (e: DragStartEvent) => {
    const id = e.active.data.current?.id as number | undefined
    setTenu(vus.find((h) => h.id === id) ?? null)
  }

  const deposer = async (e: DragEndEvent) => {
    setTenu(null)
    const id = e.active.data.current?.id as number | undefined
    const vers = e.over?.data.current?.periode as Periode | undefined
    const h = horaires.find((x) => x.id === id)
    if (!h || !vers) return
    const ch = deplacementHoraire(h, vers, moments)
    if (!ch) return
    setEnCours((m) => new Map(m).set(h.id, vers))
    const r = await ecrire(
      () => deplacerHoraire(h.id, ch),
      "L'horaire n'a pas pu être déplacé.",
    )
    setEnCours((m) => {
      const suite = new Map(m)
      suite.delete(h.id)
      return suite
    })
    if (!r.ok) {
      notifier(r.message, 'danger')
      return
    }
    const nom = libelleMoment(vers, moments).toLowerCase()
    notifier(
      ch.moment_force
        ? `Horaire ${libelleHoraire(h)} rangé en ${nom}.`
        : `Horaire ${libelleHoraire(h)} revenu en ${nom}, le moment de ses heures.`,
    )
  }

  return (
    <DndContext
      sensors={capteurs}
      onDragStart={commencer}
      onDragEnd={(e) => void deposer(e)}
      onDragCancel={() => setTenu(null)}
    >
      {/* Les moments de jour en colonnes côte à côte, la nuit (et ce qui est
          à part) dessous sur toute la largeur (demande du 2026-11-12). */}
      <div className="flex w-full flex-col gap-6">
        <div className="grid items-start gap-6 lg:grid-cols-3">
          {groupes
            .filter((g) => g.periode !== null && !estNuit(moments, g.periode))
            .map((g) => (
              <TableauHoraires
                key={g.libelle}
                titre={g.libelle}
                periode={g.periode}
                horaires={g.horaires}
                moments={moments}
                modifiable={modifiable}
                compact
                etoile={etoile}
                onOuvrir={onOuvrir}
              />
            ))}
        </div>
        {groupes
          .filter((g) => g.periode === null || estNuit(moments, g.periode))
          .map((g) => (
            <TableauHoraires
              key={g.libelle}
              titre={g.libelle}
              periode={g.periode}
              horaires={g.horaires}
              moments={moments}
              modifiable={modifiable}
              etoile={etoile}
              onOuvrir={onOuvrir}
            />
          ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {tenu && (
          <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-medium shadow-lg tabular-nums">
            <span
              aria-hidden
              className="block size-3 rounded-full"
              style={{ background: tenu.couleur }}
            />
            {libelleHoraire(tenu)}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}

/** Les horaires d'un moment en tableau : une ligne par horaire, un clic
 * ouvre son réglage ; la gestion y dépose un horaire d'un autre moment. */
function TableauHoraires({
  titre,
  periode,
  horaires,
  moments,
  modifiable,
  compact = false,
  etoile,
  onOuvrir,
}: {
  titre: string
  periode: Periode | null
  horaires: readonly Horaire[]
  moments: Moments
  modifiable: boolean
  /** Dans une colonne étroite : la journée étoile passe sous l'horaire. */
  compact?: boolean
  etoile: (h: Horaire) => boolean
  onOuvrir: (h: Horaire) => void
}) {
  const { setNodeRef, isOver, active } = useDroppable({
    id: `moment-${periode ?? 'a-part'}`,
    data: { periode },
    disabled: !modifiable || periode === null,
  })
  // Une ligne de ce tableau tenue au-dessus de lui-même : pas de surbrillance.
  const vientDIci = horaires.some(
    (h) => h.id === (active?.data.current?.id as number | undefined),
  )
  return (
    <section aria-label={titre} className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">
        {titre}{' '}
        <span className="font-normal text-muted-foreground tabular-nums">
          ({horaires.length})
        </span>
      </h3>
      <div
        ref={setNodeRef}
        data-moment={periode ?? ''}
        className={cn(
          'overflow-x-auto rounded-xl border bg-card transition-colors',
          isOver &&
            !vientDIci &&
            'border-primary bg-primary/5 ring-2 ring-primary/40',
        )}
      >
        {horaires.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">
            Aucun horaire. Glissez-en un ici pour le ranger dans ce moment.
          </p>
        ) : (
          <table className="w-full table-fixed text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th
                  className={cn('px-3 py-2', compact ? 'w-10 pr-0' : 'w-12')}
                  aria-label="Couleur"
                />
                <th className="px-3 py-2 text-left font-medium">Horaire</th>
                <th
                  className={cn(
                    'px-3 py-2 text-left font-medium',
                    compact ? 'w-14' : 'w-28',
                  )}
                >
                  Travail
                </th>
                <th
                  className={cn(
                    'px-3 py-2 text-left font-medium',
                    compact ? 'w-20' : 'w-28',
                  )}
                >
                  Pause
                </th>
                {!compact && (
                  <th className="w-40 px-3 py-2 text-left font-medium">
                    <span className="sr-only">Journée étoile</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {horaires.map((h) => (
                <LigneHoraire
                  key={h.id}
                  horaire={h}
                  moments={moments}
                  modifiable={modifiable}
                  compact={compact}
                  etoile={etoile(h)}
                  onOuvrir={onOuvrir}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}

function LigneHoraire({
  horaire: h,
  moments,
  modifiable,
  compact,
  etoile,
  onOuvrir,
}: {
  horaire: Horaire
  moments: Moments
  modifiable: boolean
  compact: boolean
  etoile: boolean
  onOuvrir: (h: Horaire) => void
}) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: `horaire-${h.id}`,
    data: { id: h.id },
    disabled: !modifiable,
  })
  const libelle = libelleHoraire(h)
  const calcule = h.moment_force ? momentPropose(h, moments) : null
  return (
    <tr
      ref={setNodeRef}
      {...(modifiable ? attributes : {})}
      {...(modifiable ? listeners : {})}
      aria-label={modifiable ? `Horaire ${libelle}, à glisser` : undefined}
      className={cn(
        'cursor-pointer border-t hover:bg-muted/40',
        modifiable && 'touch-manipulation',
        isDragging && 'opacity-40',
      )}
      onClick={() => onOuvrir(h)}
    >
      <td className={cn('px-3 py-2', compact && 'pr-0')}>
        <span className="flex items-center gap-1">
          {modifiable && (
            <GripVertical
              aria-hidden
              className="size-3.5 cursor-grab text-muted-foreground"
            />
          )}
          <span
            aria-hidden
            className="block size-3 rounded-full"
            style={{ background: h.couleur }}
          />
        </span>
      </td>
      <td className="px-3 py-2">
        <button
          type="button"
          aria-label={`Régler l'horaire ${libelle}`}
          className="font-medium tabular-nums outline-none focus-visible:underline"
          onClick={(e) => {
            e.stopPropagation()
            onOuvrir(h)
          }}
        >
          {libelle}
        </button>
        {calcule && (
          <Tip
            label={`Rangé à la main. D'après ses heures, il serait en ${libelleMoment(calcule, moments).toLowerCase()}.`}
          >
            <span className="ml-2 inline-block rounded-full border px-1.5 py-0.5 text-[11px] whitespace-nowrap text-muted-foreground">
              à la main
            </span>
          </Tip>
        )}
        {compact && etoile && (
          <span className="block text-xs text-muted-foreground">
            journée étoile
          </span>
        )}
      </td>
      <td className="px-3 py-2 tabular-nums">
        {heures(dureeHoraire(h.debut, h.fin) - h.pause)}
      </td>
      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground tabular-nums">
        {h.pause > 0 ? `${h.pause} min` : '–'}
      </td>
      {!compact && (
        <td className="px-3 py-2 text-xs text-muted-foreground">
          {etoile ? 'journée étoile' : ''}
        </td>
      )}
    </tr>
  )
}
