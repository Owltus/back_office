import { ChevronDown, ChevronUp } from 'lucide-react'

import { Button } from '#/components/ui/button.tsx'
import type { PageDef } from '#/lib/permissions/pages.ts'
import { cn } from '#/lib/utils.ts'

/*
 * Liste ordonnable des pages d'un compte.
 *
 * Partagée par la gestion des comptes (l'admin règle n'importe quel compte) et
 * la page de profil (chacun règle le sien) — deux écrans, une seule règle
 * d'affichage.
 *
 * Le geste est une paire de boutons plutôt qu'un glisser-déposer : le projet
 * n'a AUCUNE dépendance de ce type (le seul déplacement à la souris est le
 * planning parking, écrit à la main pour un besoin autrement plus riche), et
 * des boutons restent utilisables au clavier comme au doigt.
 *
 * La première ligne porte la mention « page d'accueil » : monter une page en
 * tête change l'écran d'arrivée du compte, ce qui n'est pas devinable. C'est la
 * contrepartie assumée du couplage ordre / accueil.
 */
export function PageOrderList({
  pages,
  onMove,
  disabled = false,
}: {
  /** Pages du compte, dans son ordre effectif (déjà filtrées sur ses droits). */
  pages: PageDef[]
  /** Déplace la page d'un rang : `-1` vers le haut, `+1` vers le bas. */
  onMove: (index: number, delta: -1 | 1) => void
  disabled?: boolean
}) {
  if (pages.length === 0) {
    return (
      <p className="rounded-lg border border-border p-3 text-sm text-muted-foreground">
        Aucune page accordée : il n'y a rien à ordonner.
      </p>
    )
  }
  return (
    <ul className="space-y-1.5 rounded-lg border border-border p-3">
      {pages.map((page, i) => {
        const Icon = page.icon
        return (
          <li
            key={page.key}
            className="flex items-center gap-2.5 rounded-md bg-muted/30 px-2.5 py-1.5"
          >
            <Icon className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-sm">
              {page.label}
              {i === 0 && (
                <span className="ml-2 text-xs text-muted-foreground">
                  page d'accueil
                </span>
              )}
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                disabled={disabled || i === 0}
                onClick={() => onMove(i, -1)}
                aria-label={`Monter ${page.label}`}
              >
                <ChevronUp className={cn('size-4')} />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                disabled={disabled || i === pages.length - 1}
                onClick={() => onMove(i, 1)}
                aria-label={`Descendre ${page.label}`}
              >
                <ChevronDown className="size-4" />
              </Button>
            </span>
          </li>
        )
      })}
    </ul>
  )
}

/** Déplace un élément d'un rang dans un tableau, sans le muter. Rend le tableau
 *  d'origine si le mouvement sort des bornes. */
export function movedBy<T>(items: readonly T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) {
    return [...items]
  }
  const next = [...items]
  const [moved] = next.splice(index, 1)
  next.splice(target, 0, moved)
  return next
}
