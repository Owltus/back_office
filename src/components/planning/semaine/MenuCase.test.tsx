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
  ContextMenu,
  ContextMenuTrigger,
} from '#/components/ui/context-menu.tsx'
import {
  codesUniques,
  etoileDeLaCase,
  rubriquesDeLaCase,
} from '#/components/planning/codesCase.ts'
import { MenuCase } from '#/components/planning/semaine/MenuCase.tsx'
import { analyser } from '#/lib/planning/semaine.ts'
import { hotelDemo } from '#/lib/planning/test/hotelDemo.ts'
import { horaireTest } from '#/lib/planning/test/codesTest.ts'
import type { Affectation, Referentiel } from '#/lib/planning/types.ts'

/*
 * Clic droit d'une case de la vue semaine : la rubrique « Journée étoile »
 * (décision utilisateur du 2026-11-02) remplace le bouton qui retirait une
 * heure. Oracles : elle liste les horaires de 7 h contenus dans celui du
 * shift (ou l'horaire de 8 h dont il est la version), ils ne sont pas
 * répétés dans la liste, un clic les pose sur le poste du shift ; une autre
 * journée étoile de la semaine est rappelée ; rien pour un contrat de 35 h.
 */

const LUNDI = '2026-11-02'
const { referentiel, absences } = hotelDemo(LUNDI)
const id = (code: string) => horaireTest(referentiel.horaires, code).id

const shift = (a: Partial<Affectation>): Affectation => ({
  id: 7,
  lundi: LUNDI,
  salarie_id: 3,
  poste_id: 2,
  jour: 2,
  horaire_id: id('M'),
  debut: '07:00',
  fin: '15:45',
  epinglee: true,
  pause: 45,
  ...a,
})

function ouvrir(ref: Referentiel, affectations: Affectation[]) {
  const semaine = analyser({
    lundi: LUNDI,
    referentiel: ref,
    absences,
    affectations,
    avant: [],
    apres: [],
  })
  const s = semaine.affectations.find((a) => a.id === 7)!
  const p = ref.salaries.find((x) => x.id === s.salarie_id)!
  const source = { semaine }
  const onHoraire = vi.fn()
  render(
    <ContextMenu>
      <ContextMenuTrigger>
        <div>case</div>
      </ContextMenuTrigger>
      <MenuCase
        ouverture={{
          salarie_id: s.salarie_id,
          jour: s.jour,
          nom: 'Essai',
          actuel: s.type_shift_id,
          actuelPoste: s.poste_id,
          codes: codesUniques(
            rubriquesDeLaCase({
              referentiel: ref,
              personne: p,
              jour: s.jour,
              source,
              shift: s,
            }),
            p,
            ref.postes,
            s.poste_id,
          ),
          etoile:
            etoileDeLaCase({
              referentiel: ref,
              personne: p,
              posteId: s.poste_id,
              jour: s.jour,
              source,
              sauf: s.id,
              horaireId: s.type_shift_id,
            }) ?? undefined,
        }}
        onHoraire={onHoraire}
      />
    </ContextMenu>,
  )
  fireEvent.contextMenu(screen.getByText('case'))
  return { onHoraire }
}

afterEach(cleanup)

describe('MenuCase : journée étoile', () => {
  it("l'horaire de 7 h à part, pas répété, posé sur le poste du shift", () => {
    const { onHoraire } = ouvrir(referentiel, [shift({ poste_id: 3 })])
    const groupe = screen.getByRole('group', { name: 'Journée étoile' })
    expect(
      screen.queryAllByRole('menuitem', { name: /^07:00–14:45/ }),
    ).toHaveLength(0)
    fireEvent.click(
      within(groupe).getByRole('menuitem', {
        name: 'Journée étoile, 07:00–14:45, 7h00',
      }),
    )
    expect(onHoraire).toHaveBeenCalledWith(
      expect.objectContaining({ id: id('M7') }),
      3,
    )
  })

  it('un shift de 7 h revient à sa journée normale ; une autre étoile est rappelée', () => {
    const { onHoraire } = ouvrir(referentiel, [
      shift({ horaire_id: id('M7'), fin: '14:45' }),
    ])
    const groupe = screen.getByRole('group', { name: 'Journée étoile' })
    fireEvent.click(
      within(groupe).getByRole('menuitem', {
        name: 'Journée normale, 07:00–15:45, 8h00',
      }),
    )
    expect(onHoraire).toHaveBeenCalledWith(
      expect.objectContaining({ id: id('M') }),
      2,
    )
    cleanup()
    ouvrir(referentiel, [
      shift({}),
      shift({ id: 9, jour: 0, horaire_id: id('M7'), fin: '14:45' }),
    ])
    expect(
      within(screen.getByRole('group', { name: 'Journée étoile' })).getByText(
        'Déjà une journée étoile le lundi.',
      ),
    ).toBeTruthy()
  })

  it('rien pour un contrat de 35 h : le 7 h reste dans la liste', () => {
    ouvrir(
      {
        ...referentiel,
        salaries: referentiel.salaries.map((s) =>
          s.id === 3 ? { ...s, heures_hebdo: 35 } : s,
        ),
      },
      [shift({})],
    )
    expect(screen.queryByRole('group', { name: 'Journée étoile' })).toBeNull()
    expect(
      screen.getByRole('menuitem', { name: '07:00–14:45, 7h00' }),
    ).toBeTruthy()
  })
})
