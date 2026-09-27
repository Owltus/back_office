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
    expect(dialogue.querySelector('.pdf-prose blockquote')).not.toBeNull()
    // Une ligne vide sépare deux paragraphes ; un retour simple les colle.
    const paragraphes = Array.from(
      dialogue.querySelectorAll('.pdf-prose p'),
    ).map((p) => p.textContent)
    expect(paragraphes).toContain('Première ligne\ncollée à la suivante.')
  })
})
