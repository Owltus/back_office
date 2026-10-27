/*
 * Outils des tests de rendu de l'écran Équipe : enveloppe (requêtes,
 * infobulles, fil de messages) et choix dans une liste Radix sous jsdom.
 */

import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, screen } from '@testing-library/react'

import { FilMessages } from '#/components/planning/Messages.tsx'
import { TooltipProvider } from '#/components/ui/tooltip.tsx'

export function Enveloppe({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <FilMessages>{children}</FilMessages>
      </TooltipProvider>
    </QueryClientProvider>
  )
}

/** Radix Select dans jsdom : capture du pointeur et défilement absents. */
export function preparerJsdom() {
  Object.assign(Element.prototype, {
    hasPointerCapture: () => false,
    releasePointerCapture: () => {},
    scrollIntoView: () => {},
  })
}

/** Ouvre une liste par son libellé et choisit une option. */
export function choisir(libelle: string | RegExp, option: string | RegExp) {
  fireEvent.keyDown(screen.getByLabelText(libelle), { key: 'Enter' })
  fireEvent.click(screen.getByRole('option', { name: option }))
}
