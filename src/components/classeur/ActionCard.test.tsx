// @vitest-environment jsdom
import { FileText } from 'lucide-react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import { ActionCard } from '#/components/classeur/ActionCard.tsx'

afterEach(cleanup)

describe('ActionCard', () => {
  it('description sur deux lignes à toute largeur, jamais tronquée sur une (B5)', () => {
    render(
      <ActionCard
        icon={FileText}
        title="Points de restauration"
        subtitle="Sauvegarde éditable du classeur, à reprendre plus tard"
      />,
    )
    const sous = screen.getByTestId('action-card-sous-titre')
    expect(sous.textContent).toBe(
      'Sauvegarde éditable du classeur, à reprendre plus tard',
    )
    const classes = sous.className.split(/\s+/)
    expect(classes).toContain('line-clamp-2')
    // Ni troncature d'une ligne, ni retour limité au téléphone.
    expect(classes).not.toContain('truncate')
    expect(classes.some((c) => c.startsWith('max-sm:'))).toBe(false)
  })
})
