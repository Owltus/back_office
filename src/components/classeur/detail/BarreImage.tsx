import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Crop, SlidersHorizontal, X } from 'lucide-react'

import { Tip } from '#/components/shared/Tip.tsx'
import type { Disposition } from '#/lib/classeur/disposition.ts'
import type { AjustementImage, TailleImage } from '#/lib/classeur/images.ts'
import { cn } from '#/lib/utils.ts'

/*
 * BARRE FLOTTANTE d'une image (2026-10-01, d'après Google Docs, Confluence,
 * WordPress et Medium) : un clic sur une image de l'aperçu fait apparaître,
 * collée à elle, une barre des réglages FRÉQUENTS — disposition (au centre /
 * à gauche du texte / à droite du texte) et taille en paliers — qui
 * s'appliquent d'un clic, plus « Recadrer » et « Mise en page… » (le
 * dialogue complet). Dans une planche : remplir la case ou image entière.
 *
 * La barre suit l'image (remesurée pendant qu'elle est ouverte : la page se
 * repagine après chaque réglage), se ferme par Échap, la croix ou un clic
 * ailleurs. Icônes avec infobulle et `aria-label` ; cibles de 32 px.
 */

export interface CibleBarre {
  chemin: string
  ligne?: number
  contexte: 'page' | 'planche'
}

const TAILLES_CENTRE: { key: TailleImage; court: string; long: string }[] = [
  { key: 'auto', court: 'Auto', long: 'Taille automatique' },
  { key: 'petite', court: 'P', long: 'Petite' },
  { key: 'moyenne', court: 'M', long: 'Moyenne' },
  { key: 'grande', court: 'G', long: 'Grande' },
  { key: 'pleine', court: 'Pleine', long: 'Pleine largeur' },
]
const TAILLES_COTE = TAILLES_CENTRE.filter((t) =>
  ['petite', 'moyenne', 'grande'].includes(t.key),
)

/** Petit dessin de disposition (mêmes conventions que le dialogue). */
function IconeDisposition({ d }: { d: Disposition }) {
  return (
    <svg viewBox="0 0 20 16" className="size-5" aria-hidden="true">
      {d === 'centre' ? (
        <>
          <rect
            x="2"
            y="1"
            width="16"
            height="1.6"
            rx=".8"
            className="fill-current opacity-40"
          />
          <rect
            x="6"
            y="4"
            width="8"
            height="7"
            rx="1"
            className="fill-current"
          />
          <rect
            x="2"
            y="13"
            width="16"
            height="1.6"
            rx=".8"
            className="fill-current opacity-40"
          />
        </>
      ) : (
        <>
          <rect
            x={d === 'gauche' ? 2 : 11}
            y="2"
            width="7"
            height="7"
            rx="1"
            className="fill-current"
          />
          {[2, 5, 8].map((y) => (
            <rect
              key={y}
              x={d === 'gauche' ? 11 : 2}
              y={y}
              width="7"
              height="1.6"
              rx=".8"
              className="fill-current opacity-40"
            />
          ))}
          <rect
            x="2"
            y="12"
            width="16"
            height="1.6"
            rx=".8"
            className="fill-current opacity-40"
          />
        </>
      )}
    </svg>
  )
}

function Bouton({
  label,
  actif,
  onClick,
  children,
  className,
}: {
  label: string
  actif?: boolean
  onClick: () => void
  children: ReactNode
  className?: string
}) {
  return (
    <Tip label={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={actif}
        onClick={onClick}
        className={cn(
          'inline-flex h-8 min-w-8 items-center justify-center rounded-md px-1.5 text-xs font-medium transition-colors',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          actif
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground',
          className,
        )}
      >
        {children}
      </button>
    </Tip>
  )
}

const Separateur = () => (
  <span className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden="true" />
)

export function BarreImage({
  cible,
  disposition,
  taille,
  ajustement,
  onAjuster,
  onRecadrer,
  onReglages,
  onFermer,
}: {
  cible: CibleBarre
  disposition: Disposition
  taille: TailleImage
  ajustement: AjustementImage
  onAjuster: (changement: {
    disposition?: Disposition
    taille?: TailleImage
    ajustement?: AjustementImage
  }) => void
  onRecadrer: () => void
  onReglages: () => void
  onFermer: () => void
}) {
  const barreRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  // Suit l'image : la page se repagine après chaque réglage.
  useLayoutEffect(() => {
    const mesurer = () => {
      const img = document.querySelector<HTMLElement>(
        `.a4-page img[data-chemin="${CSS.escape(cible.chemin)}"]`,
      )
      const boite = (img?.closest('.classeur-image-cadre') ?? img) as
        HTMLElement | null | undefined
      if (!boite) return
      const r = boite.getBoundingClientRect()
      const hauteur = barreRef.current?.offsetHeight ?? 40
      const largeur = barreRef.current?.offsetWidth ?? 360
      const dessus = r.top - hauteur - 8
      setPos({
        top: dessus > 64 ? dessus : r.bottom + 8,
        left: Math.min(
          Math.max(8, r.left + r.width / 2 - largeur / 2),
          window.innerWidth - largeur - 8,
        ),
      })
    }
    mesurer()
    const minuterie = window.setInterval(mesurer, 200)
    window.addEventListener('scroll', mesurer, true)
    window.addEventListener('resize', mesurer)
    return () => {
      window.clearInterval(minuterie)
      window.removeEventListener('scroll', mesurer, true)
      window.removeEventListener('resize', mesurer)
    }
  }, [cible.chemin])

  // Échap ou clic ailleurs (hors barre, hors image) : fermeture.
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFermer()
    }
    const clic = (e: PointerEvent) => {
      const t = e.target as Element | null
      if (!t) return
      if (barreRef.current?.contains(t)) return
      if (t.closest('.a4-page img[data-chemin]')) return
      if (t.closest('[role="dialog"], [data-radix-popper-content-wrapper]'))
        return
      onFermer()
    }
    document.addEventListener('keydown', touche)
    document.addEventListener('pointerdown', clic, true)
    return () => {
      document.removeEventListener('keydown', touche)
      document.removeEventListener('pointerdown', clic, true)
    }
  }, [onFermer])

  const aCote = disposition !== 'centre'
  const tailles = aCote ? TAILLES_COTE : TAILLES_CENTRE

  return createPortal(
    <div
      ref={barreRef}
      role="toolbar"
      aria-label="Mise en page de l'image"
      className={cn(
        'fixed z-50 flex items-center gap-0.5 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg',
        'animate-in fade-in-0 zoom-in-95',
        pos === null && 'invisible',
      )}
      style={pos ? { top: pos.top, left: pos.left } : undefined}
      // Le clic dans la barre ne doit pas déplacer le curseur de l'éditeur.
      onMouseDown={(e) => e.preventDefault()}
    >
      {cible.contexte === 'page' ? (
        <>
          {(
            [
              ['centre', 'Au centre'],
              ['gauche', 'À gauche, texte à droite'],
              ['droite', 'À droite, texte à gauche'],
            ] as const
          ).map(([d, label]) => (
            <Bouton
              key={d}
              label={label}
              actif={disposition === d}
              onClick={() => onAjuster({ disposition: d })}
            >
              <IconeDisposition d={d} />
            </Bouton>
          ))}
          <Separateur />
          {tailles.map((t) => (
            <Bouton
              key={t.key}
              label={aCote ? `Colonne ${t.long.toLowerCase()}` : t.long}
              actif={
                taille === t.key ||
                (aCote && t.key === 'moyenne' && taille === 'auto')
              }
              onClick={() => onAjuster({ taille: t.key })}
            >
              {t.court}
            </Bouton>
          ))}
        </>
      ) : (
        <>
          <Bouton
            label="Remplir la case (ce qui dépasse est masqué)"
            actif={ajustement === 'remplir'}
            onClick={() => onAjuster({ ajustement: 'remplir' })}
          >
            Remplir
          </Bouton>
          <Bouton
            label="Image entière dans la case"
            actif={ajustement === 'entiere'}
            onClick={() => onAjuster({ ajustement: 'entiere' })}
          >
            Entière
          </Bouton>
        </>
      )}
      <Separateur />
      <Bouton label="Recadrer" onClick={onRecadrer}>
        <Crop className="size-4" />
      </Bouton>
      <Bouton
        label="Mise en page… (légende, taille, recadrage)"
        onClick={onReglages}
      >
        <SlidersHorizontal className="size-4" />
      </Bouton>
      <Bouton label="Fermer" onClick={onFermer}>
        <X className="size-4" />
      </Bouton>
    </div>,
    document.body,
  )
}
