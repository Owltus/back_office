// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TooltipProvider } from '#/components/ui/tooltip.tsx'
import type { PointReglage } from '#/lib/planning/coherence.ts'

vi.mock('#/lib/supabase.ts', () => ({ supabase: {} }))
vi.mock('#/components/planning/EnTeteParametres.tsx', () => ({
  MenuParametres: () => null,
}))

const { resumeCycles, resumePoints } =
  await import('#/components/planning/attention.ts')
const { etiquetteAVerifier } =
  await import('#/components/planning/parametres/ControleReglages.tsx')
const { ConfirmationGeneration } =
  await import('#/components/planning/PretAGenerer.tsx')
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
    expect(resumeCycles([e(-1), e(-2)])).toBe('2 cycles à compléter')
    expect(resumeCycles([e(1)])).toBe('1 cycle avec du monde en trop')
    expect(resumeCycles([e(-1), e(1)])).toBe('2 écarts de personnes par cycle')
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
    expect(texte).toBe('1 point : 1 cycle à compléter.')
  })
})

describe('6. À vérifier : la pastille dit sa part de données à ranger', () => {
  it('29 = 13 points des réglages + 16 données à ranger', () => {
    expect(etiquetteAVerifier(13, 16)).toBe(
      'À vérifier : 29 points, dont 16 données à ranger',
    )
    expect(etiquetteAVerifier(13, 0)).toBe('À vérifier : 13 points')
    expect(etiquetteAVerifier(0, 1)).toBe(
      'À vérifier : 1 point, dont 1 donnée à ranger',
    )
    expect(etiquetteAVerifier(0, 0)).toBe(
      'Réglages cohérents : rien à vérifier',
    )
  })
  it('la boîte de génération dit que les données à ranger n’y sont pas', () => {
    const points: PointReglage[] = Array.from({ length: 13 }, (_, i) => ({
      id: `p${i}`,
      gravite: 'a-voir',
      ecran: 'besoins',
      texte: `Point ${i}`,
      lien: { page: '/planning/besoins' },
    }))
    render(
      <ConfirmationGeneration
        ouvert
        points={points}
        onFermer={vi.fn()}
        onGenerer={vi.fn()}
        onAller={vi.fn()}
      />,
    )
    expect(
      screen.getByText(/13 points à vérifier dans les réglages/),
    ).toBeTruthy()
    expect(
      screen.getByText(
        /Les données à ranger, des shifts déjà posés, ne sont pas comptées ici/,
      ),
    ).toBeTruthy()
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
  it('pendant le calcul : « Calcul en cours… » sur le bouton grisé', () => {
    entete(true)
    const b = screen.getByRole<HTMLButtonElement>('button', {
      name: 'Compléter le planning',
    })
    expect(b.disabled).toBe(true)
    expect(b.textContent).toContain('Calcul en cours…')
    expect(b.getAttribute('aria-busy')).toBe('true')
  })
  it('au repos : « Compléter »', () => {
    entete(false)
    const b = screen.getByRole('button', { name: 'Compléter le planning' })
    expect(b.textContent).toBe('Compléter')
    expect(b.getAttribute('aria-busy')).toBeNull()
  })
})
