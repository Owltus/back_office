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
import {
  dureeHoraire,
  grouperHoraires,
  heures,
  libelleHoraire,
} from '#/lib/planning/affichage.ts'
import {
  EXTRA,
  deplacementHoraire,
  groupeHoraire,
} from '#/lib/planning/deplacementHoraire.ts'
import type { Groupe } from '#/lib/planning/deplacementHoraire.ts'
import { estNuit } from '#/lib/planning/moment.ts'
import type { Moments } from '#/lib/planning/moment.ts'
import { deplacerHoraire } from '#/lib/planning/service.ts'
import type { Horaire } from '#/lib/planning/types.ts'
import { cn } from '#/lib/utils.ts'

/*
 * Les horaires de la page Horaires, un tableau par moment (2026-11-11) :
 * matin, middle, soir en colonnes, la nuit dessous avec, à sa droite, le
 * tableau Extra des horaires de moins de 6 h de travail (2026-11-12).
 *
 * La gestion GLISSE une ligne dans un autre tableau (`deplacementHoraire`) :
 * sa couleur et son nom suivent, sans autre message (demande utilisateur :
 * « on déplace et c'est ok »). Souris : dès 5 px (un clic ouvre le
 * réglage). Doigt : appui long. Les tableaux restent affichés, même vides,
 * pour pouvoir y déposer.
 */

type Tableau = {
  cle: string
  titre: string
  groupe: Groupe
  horaires: Horaire[]
}

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
  /** Version étoile d'un autre horaire (`etoile.ts`) : ★ sur la ligne. */
  etoile: (h: Horaire) => boolean
  onOuvrir: (h: Horaire) => void
}) {
  const ecrire = useEcriture()
  const notifier = useNotifier()
  // Déplacements en cours d'écriture : montrés tout de suite à leur place.
  const [enCours, setEnCours] = useState<ReadonlyMap<number, Groupe>>(new Map())
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
  // Ordre de lecture des moments, puis répartition par tableau affiché.
  const ranges = grouperHoraires(vus, moments).flatMap((g) => g.horaires)
  // Le moment est toujours connu à la lecture (`avecMomentCalcule`).
  const dans = (g: Groupe) =>
    ranges.filter((h) => groupeHoraire(h, moments) === g)
  const tableaux: Tableau[] = moments.liste.map((m) => ({
    cle: m.id,
    titre: m.nom,
    groupe: m.id,
    horaires: dans(m.id),
  }))
  const visible = (t: Tableau) => t.horaires.length > 0 || modifiable
  const deJour = tableaux.filter(
    (t) => !estNuit(moments, t.groupe) && visible(t),
  )
  const nuits = tableaux.filter((t) => estNuit(moments, t.groupe) && visible(t))
  const extra: Tableau = {
    cle: EXTRA,
    titre: 'Extra',
    groupe: EXTRA,
    horaires: dans(EXTRA),
  }

  const commencer = (e: DragStartEvent) => {
    const id = e.active.data.current?.id as number | undefined
    setTenu(vus.find((h) => h.id === id) ?? null)
  }

  const deposer = async (e: DragEndEvent) => {
    setTenu(null)
    const id = e.active.data.current?.id as number | undefined
    const vers = e.over?.data.current?.groupe as Groupe | undefined
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
    if (!r.ok) notifier(r.message, 'danger')
  }

  const rendre = (t: Tableau) => (
    <TableauHoraires
      key={t.cle}
      tableau={t}
      modifiable={modifiable}
      etoile={etoile}
      onOuvrir={onOuvrir}
    />
  )

  return (
    <DndContext
      sensors={capteurs}
      onDragStart={commencer}
      onDragEnd={(e) => void deposer(e)}
      onDragCancel={() => setTenu(null)}
    >
      <div className="flex w-full flex-col gap-6">
        <div className="grid items-start gap-6 lg:grid-cols-3">
          {deJour.map(rendre)}
        </div>
        <div className="grid items-start gap-6 lg:grid-cols-2">
          {nuits.map(rendre)}
          {(extra.horaires.length > 0 || modifiable) && rendre(extra)}
        </div>
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

/** Les horaires d'un tableau : une ligne par horaire, un clic ouvre son
 * réglage ; la gestion y dépose un horaire d'un autre tableau. */
function TableauHoraires({
  tableau: { cle, titre, groupe, horaires },
  modifiable,
  etoile,
  onOuvrir,
}: {
  tableau: Tableau
  modifiable: boolean
  etoile: (h: Horaire) => boolean
  onOuvrir: (h: Horaire) => void
}) {
  const { setNodeRef, isOver, active } = useDroppable({
    id: `tableau-${cle}`,
    data: { groupe },
    disabled: !modifiable,
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
        data-moment={groupe}
        className={cn(
          'overflow-x-auto rounded-xl border bg-card transition-colors',
          isOver &&
            !vientDIci &&
            'border-primary bg-primary/5 ring-2 ring-primary/40',
        )}
      >
        {horaires.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">
            Aucun horaire.
          </p>
        ) : (
          <table className="w-full table-fixed text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="w-10 px-3 py-2 pr-0" aria-label="Couleur" />
                <th className="px-3 py-2 text-left font-medium">Horaire</th>
                <th className="w-14 px-3 py-2 text-left font-medium">
                  Travail
                </th>
                <th className="w-20 px-3 py-2 text-left font-medium">Pause</th>
              </tr>
            </thead>
            <tbody>
              {horaires.map((h) => (
                <LigneHoraire
                  key={h.id}
                  horaire={h}
                  modifiable={modifiable}
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
  modifiable,
  etoile,
  onOuvrir,
}: {
  horaire: Horaire
  modifiable: boolean
  etoile: boolean
  onOuvrir: (h: Horaire) => void
}) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: `horaire-${h.id}`,
    data: { id: h.id },
    disabled: !modifiable,
  })
  const libelle = libelleHoraire(h)
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
      <td className="px-3 py-2 pr-0">
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
      <td className="px-3 py-2 whitespace-nowrap">
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
          {etoile && (
            <span title="Journée étoile" className="ml-1 text-muted-foreground">
              ★
            </span>
          )}
        </button>
      </td>
      <td className="px-3 py-2 tabular-nums">
        {heures(dureeHoraire(h.debut, h.fin) - h.pause)}
      </td>
      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground tabular-nums">
        {h.pause > 0 ? `${h.pause} min` : '–'}
      </td>
    </tr>
  )
}
