// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'

import {
  AvertissementsImport,
  LIGNE_RESTAURATION,
  PiedImport,
  compteursImport,
  etatBoutonImport,
} from '#/components/classeur/dialogs/EtatImport.tsx'
import type { PlanFusion } from '#/lib/classeur/merge/merge.ts'

vi.mock('#/lib/supabase.ts', () => ({ supabase: {} }))

/*
 * Briques de l'aperçu d'un import (refonte du 2026-10-20) : compteurs du
 * résumé, avertissements regroupés, bouton Importer au libellé stable.
 */

afterEach(cleanup)

function plan(r: Partial<PlanFusion['resultat']>): PlanFusion {
  return {
    actions: [],
    apercu: [],
    warnings: [],
    resultat: {
      inserted: 0,
      updated: 0,
      unchanged: 0,
      skipped: 0,
      deleted: 0,
      ...r,
    },
  }
}

describe('compteursImport', () => {
  it('ce que fera l’import RETENU, l’inchangé du brut, les écartés ; zéros masqués', () => {
    const brut = plan({ inserted: 2, updated: 3, unchanged: 1, deleted: 1 })
    const retenu = plan({ inserted: 1, updated: 3, unchanged: 1, skipped: 1 })
    expect(
      compteursImport(brut, retenu, 2).map((c) => `${c.nombre} ${c.libelle}`),
    ).toEqual(['1 ajouté', '3 modifiés', '1 inchangé', '2 non importés'])
  })

  it('la corbeille et les ignorés du fichier', () => {
    const brut = plan({ deleted: 2, skipped: 1 })
    expect(
      compteursImport(brut, brut, 0).map((c) => `${c.nombre} ${c.libelle}`),
    ).toEqual(['2 à la corbeille', '1 ignoré'])
  })
})

describe('AvertissementsImport', () => {
  it('aucun : rien', () => {
    const { container } = render(<AvertissementsImport avertissements={[]} />)
    expect(container.textContent).toBe('')
  })

  it('un : en clair', () => {
    render(<AvertissementsImport avertissements={['Un seul.']} />)
    expect(screen.getByText('Un seul.').closest('details')).toBeNull()
  })

  it('plusieurs : regroupés sous un titre, repliés', () => {
    render(<AvertissementsImport avertissements={['Un.', 'Deux.', 'Trois.']} />)
    const groupe = screen.getByText('3 points à savoir').closest('details')
    expect(groupe).not.toBeNull()
    expect(groupe?.open).toBe(false)
    expect(
      within(groupe as HTMLElement)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Un.', 'Deux.', 'Trois.'])
  })
})

describe('etatBoutonImport', () => {
  const base = {
    pret: true,
    aDesChangements: true,
    nbLignes: 3,
    retenus: 3,
    nom: 'document',
    noms: 'documents',
    libelleSansElement: 'Importer les chapitres',
  }

  it('pas prêt : neutre, sans badge ni ligne', () => {
    expect(etatBoutonImport({ ...base, pret: false })).toEqual({
      badge: null,
      nomAccessible: 'Importer',
      ligne: null,
    })
  })

  it('des changements : badge, nom complet, point de restauration', () => {
    expect(etatBoutonImport(base)).toEqual({
      badge: 3,
      nomAccessible: 'Importer 3 documents',
      ligne: LIGNE_RESTAURATION,
    })
    expect(etatBoutonImport({ ...base, retenus: 1 }).nomAccessible).toBe(
      'Importer 1 document',
    )
  })

  it('seuls des chapitres : pas de badge, le nom le dit', () => {
    expect(etatBoutonImport({ ...base, retenus: 0 })).toEqual({
      badge: null,
      nomAccessible: 'Importer les chapitres',
      ligne: LIGNE_RESTAURATION,
    })
  })

  it('tout ignoré : la raison ; rien du tout : aucune ligne', () => {
    expect(
      etatBoutonImport({ ...base, aDesChangements: false, retenus: 0 }).ligne,
    ).toBe('Rien à importer : tout est ignoré.')
    expect(
      etatBoutonImport({
        ...base,
        aDesChangements: false,
        retenus: 0,
        nbLignes: 0,
      }).ligne,
    ).toBeNull()
  })
})

describe('PiedImport', () => {
  it('libellé visible stable, badge masqué aux lecteurs d’écran, cibles de 40 px', () => {
    const importer = vi.fn()
    render(
      <PiedImport
        onFermer={() => {}}
        fermerDesactive={false}
        onImporter={importer}
        importerActif
        enCours={false}
        badge={4}
        nomAccessible="Importer 4 documents"
        ligne={LIGNE_RESTAURATION}
      />,
    )
    const b = screen.getByRole('button', { name: 'Importer 4 documents' })
    expect(b.textContent).toBe('Importer4')
    expect(within(b).getByText('4').getAttribute('aria-hidden')).toBe('true')
    expect(b.className).toContain('h-10')
    expect(screen.getByRole('button', { name: 'Annuler' }).className).toContain(
      'h-10',
    )
    fireEvent.click(b)
    expect(importer).toHaveBeenCalledTimes(1)
    expect(screen.getByText(LIGNE_RESTAURATION)).toBeTruthy()
  })

  it('désactivé tant que rien n’est à importer', () => {
    render(
      <PiedImport
        onFermer={() => {}}
        fermerDesactive={false}
        onImporter={() => {}}
        importerActif={false}
        enCours={false}
        badge={null}
        nomAccessible="Importer"
        ligne={null}
      />,
    )
    const b = screen.getByRole<HTMLButtonElement>('button', {
      name: 'Importer',
    })
    expect(b.disabled).toBe(true)
    expect(b.textContent).toBe('Importer')
  })
})
