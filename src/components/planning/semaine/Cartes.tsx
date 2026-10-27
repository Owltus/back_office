/*
 * Cartes d'une case du planning (prototype `CarteShift.tsx`) : le shift, à la
 * couleur de son code horaire, et le jour non travaillé (repos, absence,
 * école, hors contrat), teinté. Les versions déplaçables enveloppent la
 * carte dans un `useDraggable`.
 */

import { memo } from 'react'
import type { CSSProperties } from 'react'
import { useDraggable } from '@dnd-kit/core'
import {
  ArrowRight,
  BadgeCheck,
  CalendarOff,
  Coffee,
  GraduationCap,
  LifeBuoy,
  Lock,
  Star,
  TriangleAlert,
  UserX,
} from 'lucide-react'

import { iconeMotif } from '#/components/planning/iconeMotif.ts'
import { Tip } from '#/components/shared/Tip.tsx'
import { couleurShift, heures, ROUGE_CODE } from '#/lib/planning/affichage.ts'
import type { AlerteOut } from '#/lib/planning/semaine.ts'
import { heureAffichee } from '#/lib/planning/temps.ts'
import type { Horaire, Poste } from '#/lib/planning/types.ts'
import { cn } from '#/lib/utils.ts'
import { NEUTRE } from '#/components/planning/semaine/edition.ts'
import type { ContenuStatut } from '#/components/planning/semaine/edition.ts'

export interface ContenuCarte {
  debut: string
  fin: string
  /** Minutes travaillées, pause déduite ; absent au forfait jours. */
  duree?: number
  poste?: Poste
  horaire?: Horaire
  epinglee: boolean
  etoile: boolean
  role: string | null
  alertes: AlerteOut[]
}

export function texteCarte(c: ContenuCarte): string[] {
  return [
    `${c.horaire ? `${c.horaire.code} · ${c.horaire.nom}` : 'Horaire spécifique'} · ${heureAffichee(c.debut)}-${heureAffichee(c.fin)}`,
    c.poste?.nom,
    c.etoile && 'Journée étoile : une heure de moins',
    c.role === 'soutien' && 'En soutien (jamais seul)',
    c.role === 'occasionnel' && 'En dépannage sur ce poste',
    c.epinglee
      ? 'Validé : gardé lors des générations'
      : 'Proposition : recalculée à la prochaine génération (clic droit pour valider)',
    ...c.alertes.map((a) => `⚠ ${a.message}`),
  ].filter((x): x is string => typeof x === 'string' && x.length > 0)
}

function Infobulle({ lignes }: { lignes: string[] }) {
  return (
    <div className="max-w-72 space-y-0.5 text-left">
      {lignes.map((l, i) => (
        <div key={i} className={i === 0 ? 'font-semibold' : undefined}>
          {l}
        </div>
      ))}
    </div>
  )
}

/** La carte d'un shift. `enVol` : le fantôme qui suit la souris. */
export function CarteShift({ c, enVol }: { c: ContenuCarte; enVol?: boolean }) {
  const loi = c.alertes.some((a) => a.nature === 'loi')
  // Code « écrit en rouge » (petit shift à part) : ses heures en rouge.
  const rouge = c.horaire?.code_rouge ? { color: ROUGE_CODE } : undefined
  return (
    <div
      className={cn('planning-carte', enVol && 'planning-carte-vol')}
      data-proposition={c.epinglee ? undefined : ''}
      style={
        {
          '--couleur': couleurShift(c.horaire, c.poste, NEUTRE),
        } as CSSProperties
      }
    >
      <span className="planning-carte-debut" style={rouge}>
        {heureAffichee(c.debut)}
      </span>
      {c.duree !== undefined && (
        <span
          className="planning-carte-duree"
          aria-label="Heures travaillées, pause déduite"
        >
          {heures(c.duree)}
        </span>
      )}
      <span className="planning-carte-fin" style={rouge}>
        <ArrowRight className="size-2.5" aria-hidden />
        {heureAffichee(c.fin)}
      </span>
      {c.etoile && (
        // Pastille au coin haut droit : l'étoile dit « une heure de moins ».
        <span className="planning-etoile-badge" aria-label="Journée étoile">
          <Star aria-hidden />
        </span>
      )}
      <span className="planning-carte-icones">
        {c.epinglee && (
          <BadgeCheck
            className="size-3.5 text-emerald-500"
            aria-label="Validé"
          />
        )}
        {c.role === 'occasionnel' && (
          <LifeBuoy className="size-3" aria-label="Dépannage" />
        )}
        {c.alertes.length > 0 && (
          <TriangleAlert
            className={cn(
              'size-3.5',
              loi ? 'text-destructive' : 'text-amber-500',
            )}
            aria-label={`${c.alertes.length} alerte(s)`}
          />
        )}
      </span>
    </div>
  )
}

export const CarteShiftDeplacable = memo(function CarteShiftDeplacable({
  id,
  c,
  actif,
  cliquable,
  onOuvrir,
}: {
  id: string
  c: ContenuCarte
  /** Gestes permis (droit d'écriture, semaine ouverte). */
  actif: boolean
  /** Clic permis (droit d'écriture) : en semaine verrouillée, il explique pourquoi rien ne bouge. */
  cliquable: boolean
  onOuvrir: () => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    disabled: !actif,
  })
  const libelle = texteCarte(c)
  return (
    <Tip label={<Infobulle lignes={libelle} />} side="top">
      <div
        ref={setNodeRef}
        className={cn(
          'planning-deplacable grid min-h-0 rounded-[7px] outline-none focus-visible:ring-2 focus-visible:ring-ring',
          actif
            ? 'cursor-grab'
            : cliquable
              ? 'cursor-pointer'
              : 'cursor-default',
          isDragging && 'opacity-35',
        )}
        {...attributes}
        {...listeners}
        role="button"
        tabIndex={cliquable ? 0 : -1}
        aria-label={libelle.join(', ')}
        aria-disabled={!cliquable}
        onClick={cliquable ? onOuvrir : undefined}
        onKeyDown={(e) => {
          if (cliquable && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            onOuvrir()
          }
        }}
      >
        <CarteShift c={c} />
      </div>
    </Tip>
  )
})

const ICONES = {
  repos: Coffee,
  ecole: GraduationCap,
  absence: CalendarOff,
  hors: UserX,
}

export function texteStatut(s: ContenuStatut, actif: boolean): string {
  if (s.genre === 'hors')
    return 'Hors contrat ce jour-là (arrivée ou fin de contrat) : voir sa fiche'
  if (s.genre === 'repos' && s.fixe)
    return 'Repos de la semaine type : à changer dans la fiche'
  if (s.fixe)
    return `${s.nom} : jour fixe de la semaine type, à changer dans la fiche`
  return actif
    ? `${s.nom} : glisser pour déplacer, cliquer pour changer`
    : s.nom
}

export function CarteStatut({
  s,
  enVol,
}: {
  s: ContenuStatut
  enVol?: boolean
}) {
  // Une absence prend l'icône de son motif (palmier pour les congés…).
  const Icone =
    s.genre === 'absence'
      ? iconeMotif({ code: '', nom: s.nom })
      : ICONES[s.genre]
  return (
    <div
      className={cn('planning-statut', enVol && 'planning-carte-vol')}
      data-repos={s.repos ? '' : undefined}
      style={{ '--couleur': s.couleur } as CSSProperties}
    >
      <span className="planning-statut-nom">
        <Icone className="size-3.5" aria-hidden />
        <span className="truncate">{s.nom}</span>
      </span>
      {/* Le repos fixe ressemble à tout repos : pas de cadenas. */}
      {s.fixe && s.genre !== 'repos' && (
        <Lock
          className="absolute top-1 right-1.5 size-2.5 text-muted-foreground"
          aria-hidden
        />
      )}
    </div>
  )
}

export const CarteStatutDeplacable = memo(function CarteStatutDeplacable({
  id,
  s,
  actif,
  cliquable,
  onOuvrir,
}: {
  id: string
  s: ContenuStatut
  actif: boolean
  cliquable: boolean
  onOuvrir: () => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    disabled: !actif || s.fixe,
  })
  const texte = texteStatut(s, actif)
  return (
    <Tip label={texte} side="top">
      <div
        ref={setNodeRef}
        className={cn(
          'grid min-h-0 rounded-[7px] outline-none focus-visible:ring-2 focus-visible:ring-ring',
          actif && !s.fixe
            ? 'cursor-grab'
            : actif && s.genre !== 'hors'
              ? 'cursor-pointer'
              : 'cursor-default',
          isDragging && 'opacity-35',
        )}
        {...attributes}
        {...listeners}
        role="button"
        tabIndex={cliquable ? 0 : -1}
        aria-label={texte}
        aria-disabled={!cliquable}
        onClick={cliquable ? onOuvrir : undefined}
        onKeyDown={(e) => {
          if (cliquable && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            onOuvrir()
          }
        }}
      >
        <CarteStatut s={s} />
      </div>
    </Tip>
  )
})
