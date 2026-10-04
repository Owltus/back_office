// @vitest-environment jsdom
import fc from 'fast-check'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { DiffTexte } from '#/components/classeur/detail/DiffTexte.tsx'
import { comparerLignes } from '#/lib/classeur/diff.ts'

/*
 * Loi (e) de l'étape 1 : ce que `DiffTexte` AFFICHE reconstitue les deux
 * textes — les lignes sans « + » donnent l'ancien, les lignes sans « − » le
 * nouveau. L'oracle est la loi elle-même (aucune valeur recopiée).
 */

afterEach(cleanup)

/** Lit les lignes rendues : [signe, texte] (une ligne vide s'affiche « »). */
function lignesRendues(racine: HTMLElement): Array<[string, string]> {
  return Array.from(racine.querySelectorAll('.grid')).map((ligne) => {
    const spans = ligne.querySelectorAll('span')
    const texte = spans[3].textContent
    return [spans[2].textContent, texte.trim() === '' ? '' : texte]
  })
}

const texteArb = fc
  .array(fc.constantFrom('a', 'b', 'c', 'Titre', '- [ ] case', ''), {
    maxLength: 12,
  })
  .map((l) => l.join('\n'))

describe('DiffTexte', () => {
  it('(e) reconstitue l’ancien et le nouveau texte', () => {
    fc.assert(
      fc.property(texteArb, texteArb, (ancien, nouveau) => {
        const { container, unmount } = render(
          <DiffTexte
            lignes={comparerLignes(ancien, nouveau)}
            ouvertParDefaut
          />,
        )
        const lignes = lignesRendues(container)
        unmount()
        const avant = lignes.filter(([s]) => s !== '+').map(([, t]) => t)
        const apres = lignes.filter(([s]) => s !== '−').map(([, t]) => t)
        expect(avant.join('\n')).toBe(ancien)
        expect(apres.join('\n')).toBe(nouveau)
      }),
      { numRuns: 500, seed: 20261012 },
    )
  })

  it('replie les longues parties inchangées, et les déplie au clic', () => {
    const ancien = Array.from({ length: 20 }, (_, i) => `l${String(i)}`).join(
      '\n',
    )
    const nouveau = `${ancien}\najout`
    const { container, getByRole } = render(
      <DiffTexte
        lignes={comparerLignes(ancien, nouveau)}
        ouvertParDefaut={false}
        className="max-h-80"
      />,
    )
    // 20 lignes égales, 3 gardées en contexte : 17 repliées.
    expect(lignesRendues(container)).toHaveLength(4)
    fireEvent.click(getByRole('button', { name: /17 lignes inchangées/ }))
    expect(lignesRendues(container)).toHaveLength(21)
    expect((container.firstChild as HTMLElement).className).toMatch(
      /^max-h-80 rounded-md/,
    )
  })
})
