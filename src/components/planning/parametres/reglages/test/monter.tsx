/*
 * Montage des écrans de réglages pour les tests : client TanStack, fil de
 * messages, infobulles. Les hooks du planning et le service sont simulés par
 * chaque fichier de test (`vi.mock`), avec l'hôtel fictif `hotelDemo`.
 */

import type { ReactElement } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'

import { FilMessages } from '#/components/planning/Messages.tsx'
import { TooltipProvider } from '#/components/ui/tooltip.tsx'
import { hotelDemo } from '#/lib/planning/test/hotelDemo.ts'
import type { Referentiel } from '#/lib/planning/types.ts'

export function referentielDemo(): Referentiel {
  return hotelDemo('2026-11-02').referentiel
}

export function monter(ecran: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <FilMessages>{ecran}</FilMessages>
      </TooltipProvider>
    </QueryClientProvider>,
  )
}
