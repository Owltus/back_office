// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { AlertesRelecture } from '#/components/classeur/detail/AlertesRelecture.tsx'
import { MESSAGE_IA } from '#/lib/classeur/relecture.ts'

/*
 * Relecture dans l'éditeur (étape 7 du plan `classeur-echange-ia-2026-10-19`) :
 * une phrase sur l'IA dans le TITRE ou la DESCRIPTION s'affiche sous ce nom
 * et ouvre leur dialogue ; une alerte de ligne amène toujours à sa ligne.
 */

afterEach(cleanup)

describe('AlertesRelecture — champs', () => {
  it('« Titre » ouvre le dialogue du titre ; « Ligne 3 » va à la ligne', () => {
    const onAller = vi.fn()
    const onChamp = vi.fn()
    render(
      <AlertesRelecture
        alertes={[
          { ligne: 1, champ: 'titre', message: MESSAGE_IA },
          { ligne: 3, message: MESSAGE_IA },
        ]}
        onAller={onAller}
        onChamp={onChamp}
      />,
    )
    fireEvent.click(screen.getByText('2 points à vérifier'))
    fireEvent.click(screen.getByText('Titre'))
    expect(onChamp).toHaveBeenCalledTimes(1)
    expect(onAller).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Ligne 3'))
    expect(onAller).toHaveBeenCalledWith(3)
  })

  it('sans dialogue de titre : l’alerte d’un champ va en tête du texte', () => {
    const onAller = vi.fn()
    render(
      <AlertesRelecture
        alertes={[{ ligne: 1, champ: 'description', message: MESSAGE_IA }]}
        onAller={onAller}
      />,
    )
    fireEvent.click(screen.getByText('1 point à vérifier'))
    fireEvent.click(screen.getByText('Description'))
    expect(onAller).toHaveBeenCalledWith(1)
  })
})
