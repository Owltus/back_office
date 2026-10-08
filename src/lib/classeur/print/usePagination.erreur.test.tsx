// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'

/*
 * Le marqueur `data-pagination="en-cours"` (d318790) bloque « Imprimer »
 * tant qu'il est là. Une pagination qui LÈVE ne doit
 * pas le laisser posé pour toujours (bouton « Préparation… » désactivé
 * sans fin, aucun message) : le document est rendu d'un seul bloc, et
 * l'erreur est dite en console.
 */

const etat = vi.hoisted(() => ({ paginate: vi.fn() }))

vi.mock('#/lib/classeur/print/paginate.ts', async (importOriginal) => {
  const vrai: Record<string, unknown> = await importOriginal()
  return { ...vrai, paginate: etat.paginate }
})

const { usePagination } = await import('#/lib/classeur/print/usePagination.ts')

function Document({ contenu }: { contenu: string }) {
  const { pages, measuring, enCours, measureRef } = usePagination(contenu)
  return (
    <div>
      <div ref={measureRef}>
        <p>{contenu}</p>
      </div>
      <output data-testid="pages">{pages.map((p) => p.html).join('|')}</output>
      <output data-testid="etat">{`${String(measuring)}/${String(enCours)}`}</output>
    </div>
  )
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  etat.paginate.mockReset()
})

describe('usePagination — pagination qui lève', () => {
  it('lève le marqueur, rend le document d’un bloc, signale en console', async () => {
    const erreur = vi.spyOn(console, 'error').mockImplementation(() => {})
    etat.paginate.mockImplementation(() => {
      throw new Error('mesure impossible')
    })
    const { getByTestId } = render(<Document contenu="Bonjour" />)
    await waitFor(() => {
      expect(etat.paginate).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(getByTestId('etat').textContent).toBe('false/false')
    })
    expect(getByTestId('pages').textContent).toContain('Bonjour')
    expect(erreur).toHaveBeenCalled()
  })

  it('pagination normale : inchangée', async () => {
    etat.paginate.mockReturnValue([{ html: '<p>A</p>' }, { html: '<p>B</p>' }])
    const { getByTestId } = render(<Document contenu="x" />)
    await waitFor(() => {
      expect(getByTestId('etat').textContent).toBe('false/false')
    })
    expect(getByTestId('pages').textContent).toBe('<p>A</p>|<p>B</p>')
  })
})
