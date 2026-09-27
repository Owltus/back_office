// @vitest-environment jsdom
import { useRef, useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import {
  BarreMiseEnForme,
  useMiseEnForme,
} from '#/components/classeur/detail/BarreMiseEnForme.tsx'
import { TooltipProvider } from '#/components/ui/tooltip.tsx'

/*
 * La barre branchée sur un VRAI `textarea` contrôlé, comme dans
 * `DocumentDetail` : un clic doit modifier l'état React (pas seulement le
 * DOM), et les raccourcis clavier passer par le même chemin. jsdom n'a pas
 * `execCommand('insertText')` : c'est le repli `setRangeText` + `input` qui
 * est exercé ici.
 */

function Editeur({ initial }: { initial: string }) {
  const [contenu, setContenu] = useState(initial)
  const ref = useRef<HTMLTextAreaElement | null>(null)
  const miseEnForme = useMiseEnForme(ref)
  return (
    <TooltipProvider>
      <BarreMiseEnForme miseEnForme={miseEnForme} />
      <textarea
        ref={ref}
        aria-label="texte"
        value={contenu}
        onChange={(e) => setContenu(e.target.value)}
        {...miseEnForme.editeurProps}
      />
      <output data-testid="etat">{contenu}</output>
    </TooltipProvider>
  )
}

afterEach(cleanup)

function preparer(initial: string, debut: number, fin: number) {
  render(<Editeur initial={initial} />)
  const zone = screen.getByLabelText<HTMLTextAreaElement>('texte')
  zone.setSelectionRange(debut, fin)
  return zone
}

const etat = () => screen.getByTestId('etat').textContent

describe('BarreMiseEnForme', () => {
  it('un clic sur Gras met à jour l’état React et garde la sélection', () => {
    const zone = preparer('un mot', 3, 6)
    fireEvent.click(screen.getByRole('button', { name: /Gras/ }))
    expect(etat()).toBe('un **mot**')
    expect(zone.value.slice(zone.selectionStart, zone.selectionEnd)).toBe('mot')
  })
  it('titre de partie : la ligne devient un titre et le bouton est enfoncé', () => {
    const zone = preparer('Accueil', 2, 2)
    fireEvent.click(screen.getByRole('button', { name: 'Titre de partie' }))
    expect(etat()).toBe('## Accueil')
    fireEvent.select(zone)
    expect(
      screen
        .getByRole('button', { name: 'Titre de partie' })
        .getAttribute('aria-pressed'),
    ).toBe('true')
  })
  it('Ctrl + B au clavier', () => {
    const zone = preparer('mot', 0, 3)
    fireEvent.keyDown(zone, { key: 'b', ctrlKey: true })
    expect(etat()).toBe('**mot**')
  })
  it('Entrée continue une liste numérotée', () => {
    const zone = preparer('1. a', 4, 4)
    fireEvent.keyDown(zone, { key: 'Enter' })
    expect(etat()).toBe('1. a\n2. ')
  })
  it('Entrée hors liste : aucune intervention', () => {
    const zone = preparer('texte', 5, 5)
    const evt = fireEvent.keyDown(zone, { key: 'Enter' })
    expect(evt).toBe(true) // pas de preventDefault
    expect(etat()).toBe('texte')
  })
  it('tableau inséré sur ses propres lignes', () => {
    preparer('Intro', 5, 5)
    fireEvent.click(screen.getByRole('button', { name: 'Tableau' }))
    expect(etat()).toMatch(
      /^Intro\n\n\| Colonne 1 \| Colonne 2 \|\n\| --- \| --- \|/,
    )
  })
})
