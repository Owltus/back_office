// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TooltipProvider } from '#/components/ui/tooltip.tsx'

vi.mock('#/lib/supabase.ts', () => ({ supabase: {} }))
vi.mock('#/components/planning/EnTeteParametres.tsx', () => ({
  MenuParametres: () => null,
}))

const { resumeCycles, resumePoints } =
  await import('#/components/planning/attention.ts')
const { EnTeteSemaine } =
  await import('#/components/planning/semaine/EnTeteSemaine.tsx')

/*
 * Correctifs d'écran du chantier planning-cycles-2026-10-30 (agent « V4
 * Correctifs ») : textes du résumé, pastille À vérifier face à la boîte de
 * génération, état visible pendant le calcul. Oracles écrits à la main.
 */

afterEach(cleanup)

describe('5. résumé des points : le vocabulaire de « Personnes par cycle »', () => {
  const e = (ecart: number) => ({ ecart })
  it('manques seuls, surplus seuls, mélange', () => {
    expect(resumeCycles([e(-1), e(-2)])).toBe(
      "2 moments de l'accueil à compléter",
    )
    expect(resumeCycles([e(1)])).toBe(
      "1 moment de l'accueil avec du monde en plus",
    )
    expect(resumeCycles([e(-1), e(1)])).toBe("2 écarts à l'accueil")
  })
  it('plus aucun « hors consigne » dans la phrase', () => {
    const texte = resumePoints({
      total: 1,
      infractions: [],
      aPourvoir: [],
      presence: [
        {
          cle: 'x',
          date: '2026-11-02',
          jour: 0,
          periode: 'matin',
          compte: 0,
          minimum: 1,
          maximum: null,
          ecart: -1,
        },
      ],
      trous: [],
      aRegarder: [],
    } as unknown as Parameters<typeof resumePoints>[0])
    expect(texte).toBe("1 point : 1 moment de l'accueil à compléter.")
  })
})

describe('7. Compléter : le calcul se voit', () => {
  const actions = {
    onMois: vi.fn(),
    onPrecedente: vi.fn(),
    onSuivante: vi.fn(),
    onCetteSemaine: vi.fn(),
    onDate: vi.fn(),
    aujourdhui: '2026-10-30',
    onVerrou: vi.fn(),
    onAlertes: vi.fn(),
    onInfractions: vi.fn(),
    onCompleter: vi.fn(),
    onFullAuto: vi.fn(),
    onValiderSemaine: vi.fn(),
    onEffacerPropositions: vi.fn(),
    onVider: vi.fn(),
  }
  const dates = Array.from({ length: 7 }, (_, i) => `2026-11-0${i + 2}`)
  const entete = (enGeneration: boolean) =>
    render(
      <TooltipProvider>
        <EnTeteSemaine
          numero={45}
          dates={dates}
          semaine={null}
          nbAlertes={0}
          pret
          ecrire
          gerer={false}
          occupe={enGeneration}
          enGeneration={enGeneration}
          passee={false}
          enCours={false}
          actions={actions}
        />
      </TooltipProvider>,
    )
  it('pendant le calcul : le bouton actif « Arrêter » (2026-11-02)', () => {
    entete(true)
    const b = screen.getByRole<HTMLButtonElement>('button', {
      name: 'Arrêter le calcul',
    })
    expect(b.disabled).toBe(false)
    expect(b.textContent).toContain('Arrêter')
    expect(b.getAttribute('aria-busy')).toBe('true')
    b.click()
    expect(actions.onCompleter).toHaveBeenCalled()
  })
  it('au repos : « Compléter »', () => {
    entete(false)
    const b = screen.getByRole('button', { name: 'Compléter le planning' })
    expect(b.textContent).toBe('Compléter')
    expect(b.getAttribute('aria-busy')).toBeNull()
  })
})
