/*
 * Clic droit sur le nom d'une personne (demande utilisateur du 2026-11-18) :
 * valider ou invalider d'un coup tous ses shifts de la période affichée (la
 * semaine en vue semaine, le mois en vue mois). Chaque ligne dit combien de
 * shifts elle change (`shiftsAChanger`) ; pas de fenêtre de confirmation.
 *
 * Deux habillages du même contenu : le `ContextMenu` de shadcn pour la vue
 * semaine (sa grille en est le déclencheur), un menu flottant pour la vue
 * mois (comme `MenuJour`).
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { BadgeCheck, Undo2 } from 'lucide-react'

import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
} from '#/components/ui/context-menu.tsx'
import {
  libelleValidationPeriode,
  texteRienAChanger,
} from '#/components/planning/saisieRapide.ts'

export interface OuvertureMenuNom {
  nom: string
  /** « cette semaine », « en novembre » : la période, pour le titre. */
  periode: string
  /** Shifts que chaque action changera. */
  aValider: number
  aInvalider: number
  onValider: (epinglee: boolean) => void
}

function Ligne({ epinglee, n }: { epinglee: boolean; n: number }) {
  return (
    <>
      {epinglee ? (
        <BadgeCheck className="size-4 shrink-0 text-emerald-500" />
      ) : (
        <Undo2 className="size-4 shrink-0" />
      )}
      <span className="grid flex-1">
        <span className="text-sm font-medium">
          {libelleValidationPeriode(n, epinglee)}
        </span>
        {n === 0 && (
          <span className="text-xs text-muted-foreground">
            {texteRienAChanger(epinglee)}
          </span>
        )}
      </span>
    </>
  )
}

/** Vue semaine : contenu du `ContextMenu` de la grille. */
export function MenuNomContexte({
  ouverture,
}: {
  ouverture: OuvertureMenuNom
}) {
  return (
    <ContextMenuContent className="w-60">
      <ContextMenuLabel className="text-xs text-muted-foreground">
        {ouverture.nom} · {ouverture.periode}
      </ContextMenuLabel>
      {([true, false] as const).map((epinglee) => {
        const n = epinglee ? ouverture.aValider : ouverture.aInvalider
        return (
          <ContextMenuItem
            key={String(epinglee)}
            disabled={n === 0}
            onSelect={() => ouverture.onValider(epinglee)}
          >
            <Ligne epinglee={epinglee} n={n} />
          </ContextMenuItem>
        )
      })}
    </ContextMenuContent>
  )
}

const ITEM =
  'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent disabled:pointer-events-none disabled:opacity-50'

/** Vue mois : menu flottant au curseur, fermé par Échap ou un clic ailleurs. */
export function MenuNomFlottant({
  ouverture,
  x,
  y,
  onFermer,
}: {
  ouverture: OuvertureMenuNom
  x: number
  y: number
  onFermer: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })
  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    setPos({
      left: Math.max(8, Math.min(x, window.innerWidth - r.width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - r.height - 8)),
    })
  }, [x, y])
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFermer()
    }
    window.addEventListener('keydown', touche)
    window.addEventListener('resize', onFermer)
    ref.current
      ?.querySelector<HTMLElement>('[role=menuitem]:not([disabled])')
      ?.focus()
    return () => {
      window.removeEventListener('keydown', touche)
      window.removeEventListener('resize', onFermer)
    }
  }, [onFermer])
  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={onFermer}
        onContextMenu={(e) => {
          e.preventDefault()
          onFermer()
        }}
      />
      <div
        ref={ref}
        role="menu"
        aria-label={`${ouverture.nom} · ${ouverture.periode}`}
        style={pos}
        className="fixed z-50 w-60 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      >
        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
          {ouverture.nom} · {ouverture.periode}
        </div>
        {([true, false] as const).map((epinglee) => {
          const n = epinglee ? ouverture.aValider : ouverture.aInvalider
          return (
            <button
              key={String(epinglee)}
              type="button"
              role="menuitem"
              disabled={n === 0}
              className={ITEM}
              onClick={() => {
                onFermer()
                ouverture.onValider(epinglee)
              }}
            >
              <Ligne epinglee={epinglee} n={n} />
            </button>
          )
        })}
      </div>
    </>
  )
}
