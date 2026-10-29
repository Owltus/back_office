// @vitest-environment jsdom
import { cleanup, render, renderHook, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { FilMessages } from '#/components/planning/Messages.tsx'
import {
  MESSAGE_CIBLE_ABSENTE,
  idCible,
  partieCible,
  useOuvrirCible,
} from '#/components/planning/parametres/reglages/ouvrirCible.ts'

afterEach(cleanup)

/*
 * `?ouvrir=` : la cible est appliquée une fois les données lues, puis la
 * route retire le paramètre ; le même lien, cliqué de nouveau, rouvre. Une
 * cible qui n'existe plus le dit dans le fil de messages.
 */

const enveloppe = ({ children }: { children: ReactNode }) => (
  <FilMessages>{children}</FilMessages>
)

describe('useOuvrirCible', () => {
  it('attend les données, applique, puis rouvre par le même lien', () => {
    const appliquer = vi.fn(() => true)
    const onOuvert = vi.fn()
    const { rerender } = renderHook(
      ({ ouvrir, pret }: { ouvrir?: string; pret: boolean }) =>
        useOuvrirCible(ouvrir, pret, appliquer, onOuvert),
      {
        wrapper: enveloppe,
        initialProps: { ouvrir: 'poste-3' as string | undefined, pret: false },
      },
    )
    expect(appliquer).not.toHaveBeenCalled()
    rerender({ ouvrir: 'poste-3', pret: true })
    expect(appliquer).toHaveBeenCalledTimes(1)
    expect(appliquer).toHaveBeenLastCalledWith('poste-3')
    expect(onOuvert).toHaveBeenCalledTimes(1)
    // La route retire le paramètre : rien de plus.
    rerender({ ouvrir: undefined, pret: true })
    expect(appliquer).toHaveBeenCalledTimes(1)
    // Le même lien, cliqué de nouveau.
    rerender({ ouvrir: 'poste-3', pret: true })
    expect(appliquer).toHaveBeenCalledTimes(2)
    expect(onOuvert).toHaveBeenCalledTimes(2)
  })

  it('cible absente : message dans le fil, paramètre retiré quand même', () => {
    const onOuvert = vi.fn()
    function Ecran({ ouvrir }: { ouvrir: string }) {
      useOuvrirCible(ouvrir, true, () => false, onOuvert)
      return null
    }
    render(
      <FilMessages>
        <Ecran ouvrir="poste-99" />
      </FilMessages>,
    )
    expect(screen.getByText(MESSAGE_CIBLE_ABSENTE)).toBeTruthy()
    expect(onOuvert).toHaveBeenCalledTimes(1)
  })

  it('cible trouvée : aucun message', () => {
    function Ecran() {
      useOuvrirCible('poste-1', true, () => true)
      return null
    }
    render(
      <FilMessages>
        <Ecran />
      </FilMessages>,
    )
    expect(screen.queryByText(MESSAGE_CIBLE_ABSENTE)).toBeNull()
  })
})

describe('idCible', () => {
  it('lit le type et l id, refuse le reste', () => {
    expect(idCible('poste-12', 'poste')).toBe(12)
    expect(idCible('poste-12', 'salarie')).toBeUndefined()
    expect(idCible('poste-x', 'poste')).toBeUndefined()
    expect(idCible(undefined, 'poste')).toBeUndefined()
  })

  it('une partie de la fiche après l id : id et partie lus à part', () => {
    expect(idCible('salarie-3.semaine', 'salarie')).toBe(3)
    expect(partieCible('salarie-3.semaine')).toBe('semaine')
    expect(partieCible('salarie-3')).toBeUndefined()
    expect(idCible('salarie-3.', 'salarie')).toBeUndefined()
    expect(partieCible(undefined)).toBeUndefined()
  })
})
