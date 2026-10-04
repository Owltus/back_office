import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import { cn } from '#/lib/utils.ts'

/**
 * En-tête COLLÉ en haut de la page qui défile (demande utilisateur du
 * 2026-10-04 : « si je déroule la page, ils disparaissent ») — titre,
 * sous-titre, recherche et boutons d'une page de chapitre ou de détail.
 *
 * Le défileur est le `<main class="app-scroll">` (`AppAuthGate`) ; la page
 * est dans un `PageContainer` à marge `p-4 md:p-6`. L'en-tête mange cette
 * marge (`-mx`/`-mt` + même rembourrage) et se colle à `top` NÉGATIF égal à
 * la marge : collé, la marge haute sort de l'écran et le titre arrive au
 * ras de la Navbar ; au repos, la mise en page est inchangée. Fond plein de
 * la page (le contenu ne transparaît pas dessous), filet et ombre légère
 * SEULEMENT quand la page a défilé, `z-20` sous les dialogues, menus et la
 * barre flottante d'une image (`z-50`). `print:static` par prudence.
 *
 * L'en-tête est toujours le PREMIER bloc de sa page : « collé » équivaut à
 * « le défileur n'est plus tout en haut » — une simple lecture de
 * `scrollTop` (écouteur passif), sans sentinelle qui s'intercalerait dans
 * l'espacement de la colonne.
 */
export function EnTeteCollant({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [colle, setColle] = useState(false)

  useEffect(() => {
    const defileur = ref.current?.closest<HTMLElement>('.app-scroll')
    if (!defileur) return
    const lire = () => setColle(defileur.scrollTop > 0)
    lire()
    defileur.addEventListener('scroll', lire, { passive: true })
    return () => defileur.removeEventListener('scroll', lire)
  }, [])

  return (
    <div
      ref={ref}
      data-en-tete-colle={colle ? '' : undefined}
      className={cn(
        'sticky -top-4 z-20 -mx-4 -mt-4 flex flex-col gap-3 bg-background px-4 pt-4 pb-3 md:-top-6 md:-mx-6 md:-mt-6 md:px-6 md:pt-6',
        'border-b border-transparent transition-[border-color,box-shadow] duration-150',
        'data-[en-tete-colle]:border-border data-[en-tete-colle]:shadow-sm',
        'print:static',
        className,
      )}
    >
      {children}
    </div>
  )
}
