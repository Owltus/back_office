// @vitest-environment jsdom
import { useState } from 'react'
import { flushSync } from 'react-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

import { useSelection } from '#/components/classeur/hooks/useSelection.ts'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '#/components/ui/dialog.tsx'

/*
 * Échap et sélection (audit du 2026-10-04, B3) : Échap dans le dialogue de
 * transfert vidait AUSSI la sélection du chapitre. Radix ferme le dialogue
 * depuis un écouteur en capture sur `document` ; dans le navigateur, la
 * mise à jour React est appliquée (microtâche) AVANT que l'écouteur en
 * bouillonnement de `window` ne s'exécute, qui ne trouvait donc plus de
 * dialogue ouvert. jsdom ne fait pas ce point de microtâches entre deux
 * écouteurs : `flushSync` dans `onOpenChange` le reproduit fidèlement
 * (fermeture appliquée tout de suite, comme dans Chrome).
 */

function Banc() {
  const selection = useSelection()
  const [ouvert, setOuvert] = useState(false)
  return (
    <div>
      <button type="button" onClick={() => selection.toggle('document:1')}>
        cocher
      </button>
      <button type="button" onClick={() => setOuvert(true)}>
        ouvrir
      </button>
      <output data-testid="compte">{selection.count}</output>
      <Dialog
        open={ouvert}
        onOpenChange={(o) => flushSync(() => setOuvert(o))}
      >
        <DialogContent>
          <DialogTitle>Vers un autre classeur</DialogTitle>
          <DialogDescription>Banc</DialogDescription>
          <input aria-label="champ" />
        </DialogContent>
      </Dialog>
    </div>
  )
}

afterEach(cleanup)

const compte = () => screen.getByTestId('compte').textContent

describe('useSelection et Échap', () => {
  it('Échap sans dialogue : vide la sélection', () => {
    render(<Banc />)
    fireEvent.click(screen.getByRole('button', { name: 'cocher' }))
    expect(compte()).toBe('1')
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(compte()).toBe('0')
  })

  it('Échap dans un VRAI dialogue Radix : ferme le dialogue, garde la sélection', async () => {
    render(<Banc />)
    fireEvent.click(screen.getByRole('button', { name: 'cocher' }))
    fireEvent.click(screen.getByRole('button', { name: 'ouvrir' }))
    const champ = await screen.findByLabelText('champ')
    await act(async () => {
      champ.focus()
      await Promise.resolve()
    })
    fireEvent.keyDown(champ, { key: 'Escape' })
    // Le dialogue s'est bien fermé…
    expect(screen.queryByRole('dialog')).toBeNull()
    // … et la sélection est intacte.
    expect(compte()).toBe('1')
    // Un second Échap, dialogue fermé, la vide.
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(compte()).toBe('0')
  })
})
