// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import { AideMiseEnFormeDialog } from '#/components/classeur/dialogs/AideMiseEnFormeDialog.tsx'

afterEach(cleanup)

/*
 * Le tuto montre « ce que ça donne » avec le VRAI moteur Markdown : si un
 * exemple cessait de produire l'élément annoncé, le tuto mentirait.
 */
describe('AideMiseEnFormeDialog', () => {
  it('rend les exemples en vrais titres, listes, cases, tableau et encadré', () => {
    render(<AideMiseEnFormeDialog open onOpenChange={() => {}} />)
    const dialogue = screen.getByRole('dialog')
    expect(dialogue.querySelector('.pdf-prose h2')?.textContent).toBe('Étapes')
    expect(dialogue.querySelector('.pdf-prose strong')?.textContent).toBe(
      'important',
    )
    expect(dialogue.querySelector('.pdf-prose ol ul li')).not.toBeNull()
    expect(
      dialogue.querySelector('.pdf-prose input[type="checkbox"]'),
    ).not.toBeNull()
    expect(dialogue.querySelectorAll('.pdf-prose table td')).toHaveLength(4)
    expect(
      dialogue.querySelector(
        '.pdf-prose blockquote[data-encadre="attention"] .encadre-titre',
      )?.textContent,
    ).toBe('Attention')
    // Une ligne vide sépare deux paragraphes ; un retour simple les colle.
    const paragraphes = Array.from(
      dialogue.querySelectorAll('.pdf-prose p'),
    ).map((p) => p.textContent)
    expect(paragraphes).toContain('Première ligne\ncollée à la suivante.')
  })

  it('montre les vrais blocs d’images : figure légendée, planche, étape', () => {
    render(<AideMiseEnFormeDialog open onOpenChange={() => {}} />)
    const dialogue = screen.getByRole('dialog')
    expect(
      dialogue.querySelector('.pdf-prose figure figcaption')?.textContent,
    ).toBe('Bac à sel ouvert')
    const planche = dialogue.querySelector('.pdf-prose [data-bloc="photos"]')
    expect(planche?.getAttribute('data-colonnes')).toBe('2')
    expect(planche?.querySelectorAll('figure')).toHaveLength(2)
    const etape = dialogue.querySelector('.pdf-prose [data-bloc="etape"]')
    expect(etape?.querySelector('.etape-texte ol')).not.toBeNull()
    expect(etape?.querySelector('.etape-photos figure')).not.toBeNull()
    // Emplacements à remplir : cadres gris dans une planche.
    expect(
      dialogue.querySelectorAll(
        '.pdf-prose [data-bloc="photos"] [data-a-inserer]',
      ),
    ).toHaveLength(2)
    // Plus aucune trace de l'ancienne syntaxe d'habillage.
    expect(dialogue.textContent).not.toMatch(/\+\+\+|position=/)
  })
})
