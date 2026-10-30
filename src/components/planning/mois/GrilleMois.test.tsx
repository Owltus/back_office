// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { TooltipProvider } from '#/components/ui/tooltip.tsx'
import { GrilleMois } from '#/components/planning/mois/GrilleMois.tsx'
import {
  etatSemaine,
  joursDuMois,
  lundisDe,
} from '#/components/planning/mois/mois.ts'
import { analyser } from '#/lib/planning/semaine.ts'
import type { SemaineOut } from '#/lib/planning/semaine.ts'
import { hotelDemo } from '#/lib/planning/test/hotelDemo.ts'
import type { Affectation } from '#/lib/planning/types.ts'

/*
 * Survol d'un shift dans la grille du mois : la ligne « N au lieu de M » vient
 * de `ShiftOut.code_demande` (code imposé par la place tenue), lu dans le
 * référentiel. Hôtel fictif, semaine du 2 novembre 2026 analysée pour de vrai,
 * puis `code_demande` posé à la main : seul l'affichage est en jeu.
 */

const MOIS = '2026-11'
const LUNDI = '2026-11-02'
const { referentiel, absences } = hotelDemo(LUNDI)
const horaire = (code: string) =>
  referentiel.horaires.find((h) => h.code === code)!
const nuit = horaire('N')
const poste = referentiel.postes.find((p) => p.nom === 'Veille de nuit')!
const shift: Affectation = {
  id: 1,
  lundi: LUNDI,
  salarie_id: 2,
  poste_id: poste.id,
  jour: 0,
  horaire_id: nuit.id,
  debut: nuit.debut,
  fin: nuit.fin,
  epinglee: false,
  court: false,
  pause: nuit.pause,
}
const SEMAINE = analyser({
  lundi: LUNDI,
  referentiel,
  absences,
  affectations: [shift],
  avant: [],
  apres: [],
})

function rendre(codeDemande: number | null) {
  const semaine: SemaineOut = {
    ...SEMAINE,
    affectations: SEMAINE.affectations.map((a) => ({
      ...a,
      code_demande: codeDemande,
    })),
  }
  const jours = joursDuMois(MOIS)
  const lundis = lundisDe(jours)
  return render(
    <TooltipProvider>
      <GrilleMois
        mois={MOIS}
        jours={jours}
        lundis={lundis}
        semaines={new Map([[LUNDI, semaine]])}
        etats={
          new Map(lundis.map((l) => [l, etatSemaine(l, [], '2026-10-27')]))
        }
        referentiel={referentiel}
        presents={referentiel.salaries.filter((s) => s.id === 2)}
        aujourdhui="2026-10-27"
        glisser={false}
        onSemaine={vi.fn()}
        onFiche={vi.fn()}
        onJour={vi.fn()}
        onDeposer={vi.fn()}
      />
    </TooltipProvider>,
  )
}

/** La pastille du shift du lundi 2 : on la survole, l'infobulle s'ouvre. */
async function survoler() {
  const pastille = screen.getByRole('button', { name: /N · Nuit/ })
  fireEvent.pointerMove(pastille, { pointerType: 'mouse' })
  await screen.findAllByText(
    /N · Nuit/,
    { selector: 'span' },
    { timeout: 3000 },
  )
  return pastille
}

beforeEach(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})
afterEach(cleanup)

describe('GrilleMois : survol d’un remplaçant', () => {
  it('code_demande différent : « N au lieu de M » dans l’infobulle, rien sur la case', async () => {
    rendre(horaire('M').id)
    const pastille = await survoler()
    const bulles = screen.getAllByText(/N au lieu de M/, { selector: 'span' })
    expect(bulles.length).toBeGreaterThan(0)
    // Une ligne à elle, juste après le résumé.
    expect(bulles[0].textContent).toMatch(/proposition\nN au lieu de M\n/)
    expect(pastille.getAttribute('aria-label')).toMatch(/, N au lieu de M/)
    expect(pastille.textContent).not.toMatch(/au lieu de/)
  })

  it('code_demande null : aucune ligne « au lieu de »', async () => {
    rendre(null)
    const pastille = await survoler()
    expect(screen.queryByText(/au lieu de/)).toBeNull()
    expect(pastille.getAttribute('aria-label')).not.toMatch(/au lieu de/)
  })

  it('code_demande égal au code du shift : aucune ligne', async () => {
    rendre(nuit.id)
    await survoler()
    expect(screen.queryByText(/au lieu de/)).toBeNull()
  })
})
