// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'

import { TooltipProvider } from '#/components/ui/tooltip.tsx'
import { analyser } from '#/lib/planning/semaine.ts'
import { hotelDemo } from '#/lib/planning/test/hotelDemo.ts'
import {
  DESARMEMENT_MS,
  EditeurShift,
  dateEnLettres,
} from '#/components/planning/semaine/EditeurShift.tsx'
import type { Edition } from '#/components/planning/semaine/EditeurShift.tsx'
import type { SourceCase } from '#/components/planning/codesCase.ts'
import type { JourType, Referentiel, Salarie } from '#/lib/planning/types.ts'

/*
 * Éditeur d'un shift, seul. Oracles : la suppression en deux temps se
 * désarme au bout de 4 s sans confirmation ; la vue mois y lit la date en
 * toutes lettres, la vue semaine le jour de la semaine.
 */

const LUNDI = '2026-11-02'
const { referentiel, absences } = hotelDemo(LUNDI)
const SHIFT = analyser({
  lundi: LUNDI,
  referentiel,
  absences,
  affectations: [
    {
      id: 7,
      lundi: LUNDI,
      salarie_id: 3,
      poste_id: 2,
      jour: 2,
      horaire_id: 1,
      debut: '07:00',
      fin: '15:45',
      epinglee: true,
      court: false,
      pause: 45,
    },
  ],
  avant: [],
  apres: [],
}).affectations[0]

function rendre(enLettres = false) {
  const onSupprimer = vi.fn()
  render(
    <TooltipProvider>
      <EditeurShift
        edition={{ mode: 'modification', shift: SHIFT }}
        lundi={LUNDI}
        referentiel={referentiel}
        absence={null}
        source={{ semaine: null }}
        dateEnLettres={enLettres}
        onFermer={vi.fn()}
        onCreer={vi.fn()}
        onModifier={vi.fn()}
        onSupprimer={onSupprimer}
        onPoserAbsence={vi.fn()}
        onRetirerAbsence={vi.fn()}
      />
    </TooltipProvider>,
  )
  return { onSupprimer }
}

beforeEach(() => {
  Element.prototype.scrollIntoView = () => {}
  Element.prototype.hasPointerCapture = () => false
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('EditeurShift', () => {
  it('« Non attribué » vide la case', () => {
    const { onSupprimer } = rendre()
    fireEvent.click(screen.getByRole('button', { name: /Non attribué/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Vider la case' }))
    expect(onSupprimer).toHaveBeenCalledWith(7)
  })

  it('« Non attribué » retire une absence posée, pas celle de la semaine type', () => {
    const rendreAbsence = (fixe: boolean) => {
      const onRetirerAbsence = vi.fn()
      render(
        <TooltipProvider>
          <EditeurShift
            edition={{ mode: 'creation', salarie_id: 3, jour: 2 }}
            lundi={LUNDI}
            referentiel={referentiel}
            absence={{ motif_id: referentiel.motifs[0].id, fixe }}
            source={{ semaine: null }}
            onFermer={vi.fn()}
            onCreer={vi.fn()}
            onModifier={vi.fn()}
            onSupprimer={vi.fn()}
            onPoserAbsence={vi.fn()}
            onRetirerAbsence={onRetirerAbsence}
          />
        </TooltipProvider>,
      )
      return onRetirerAbsence
    }
    const retirer = rendreAbsence(false)
    fireEvent.click(screen.getByRole('button', { name: /Non attribué/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Vider la case' }))
    expect(retirer).toHaveBeenCalledWith(3, 2)
    cleanup()
    rendreAbsence(true)
    expect(screen.queryByRole('button', { name: /Non attribué/ })).toBeNull()
  })

  it('jour d’école : « Ou l’école » n’est pas reproposé', () => {
    const ecole = referentiel.motifs.find((m) => m.nature === 'ecole')!
    const rendreJour = (motif: number) =>
      render(
        <TooltipProvider>
          <EditeurShift
            edition={{ mode: 'creation', salarie_id: 3, jour: 2 }}
            lundi={LUNDI}
            referentiel={referentiel}
            absence={{ motif_id: motif, fixe: false }}
            source={{ semaine: null }}
            onFermer={vi.fn()}
            onCreer={vi.fn()}
            onModifier={vi.fn()}
            onSupprimer={vi.fn()}
            onPoserAbsence={vi.fn()}
            onRetirerAbsence={vi.fn()}
          />
        </TooltipProvider>,
      )
    rendreJour(ecole.id)
    expect(screen.getByText("Jour d'école")).toBeTruthy()
    expect(screen.queryByText("Ou l'école")).toBeNull()
    cleanup()
    const autre = referentiel.motifs.find((m) => m.nature !== 'ecole')!
    rendreJour(autre.id)
    expect(screen.getByText("Ou l'école")).toBeTruthy()
  })

  it('jour de repos : le titre et une ligne le disent', () => {
    const rendreRepos = (repos: { fixe: boolean } | null) =>
      render(
        <TooltipProvider>
          <EditeurShift
            edition={{ mode: 'creation', salarie_id: 3, jour: 2 }}
            lundi={LUNDI}
            referentiel={referentiel}
            absence={null}
            repos={repos}
            source={{ semaine: null }}
            onFermer={vi.fn()}
            onCreer={vi.fn()}
            onModifier={vi.fn()}
            onSupprimer={vi.fn()}
            onPoserAbsence={vi.fn()}
            onRetirerAbsence={vi.fn()}
          />
        </TooltipProvider>,
      )
    rendreRepos({ fixe: false })
    expect(screen.getByText('Jour de repos')).toBeTruthy()
    expect(screen.getByText('un shift posé ici remplace ce repos')).toBeTruthy()
    cleanup()
    rendreRepos({ fixe: true })
    expect(
      screen.getByText('vient de la semaine type : à changer dans sa fiche'),
    ).toBeTruthy()
    cleanup()
    rendreRepos(null)
    expect(screen.getByText('Planifier le jour')).toBeTruthy()
    expect(screen.queryByText('Jour de repos')).toBeNull()
  })

  it('seulement les postes que la personne tient', () => {
    rendre()
    const tenus = referentiel.salaries
      .find((x) => x.id === 3)!
      .competences.map((c) => c.poste_id)
    // Codes : une rubrique par poste de sa fiche, sans choisir de poste.
    expect(screen.queryByRole('heading', { name: 'Poste' })).toBeNull()
    for (const p of referentiel.postes) {
      expect(!!screen.queryByRole('group', { name: p.nom })).toBe(
        tenus.includes(p.id) || p.id === SHIFT.poste_id,
      )
    }
    // Horaire spécifique : le choix du poste revient, mêmes postes.
    fireEvent.click(screen.getByRole('button', { name: /Horaire spécifique/ }))
    expect(screen.getByRole('heading', { name: 'Poste' })).toBeTruthy()
    expect(screen.queryByText('non tenu')).toBeNull()
    for (const p of referentiel.postes) {
      const bouton = screen.queryByRole('button', {
        name: new RegExp(`^${p.nom}`),
      })
      expect(!!bouton).toBe(tenus.includes(p.id) || p.id === SHIFT.poste_id)
    }
  })

  it('la suppression en deux temps se désarme après 4 s', () => {
    vi.useFakeTimers()
    const { onSupprimer } = rendre()
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    expect(
      screen.getByRole('button', { name: 'Confirmer la suppression' }),
    ).toBeTruthy()
    act(() => vi.advanceTimersByTime(DESARMEMENT_MS - 100))
    expect(
      screen.getByRole('button', { name: 'Confirmer la suppression' }),
    ).toBeTruthy()
    act(() => vi.advanceTimersByTime(200))
    expect(
      screen.queryByRole('button', { name: 'Confirmer la suppression' }),
    ).toBeNull()
    expect(onSupprimer).not.toHaveBeenCalled()
    // Réarmée, elle supprime.
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirmer la suppression' }),
    )
    expect(onSupprimer).toHaveBeenCalledWith(7)
  })

  it('date en toutes lettres (vue mois) ou jour de la semaine (vue semaine)', () => {
    rendre(true)
    expect(screen.getByText(/mercredi 4 novembre 2026/)).toBeTruthy()
    cleanup()
    rendre(false)
    expect(screen.queryByText(/novembre/)).toBeNull()
    expect(screen.getByText(/· Mercredi/)).toBeTruthy()
    expect(dateEnLettres('2026-11-18')).toBe('mercredi 18 novembre 2026')
  })
})

// ------------------------------------- règle des codes dans l'éditeur

/** Le même hôtel, la personne 3 retouchée. */
function referentielAvec(champs: Partial<Salarie>): Referentiel {
  return {
    ...referentiel,
    salaries: referentiel.salaries.map((s) =>
      s.id === 3 ? { ...s, ...champs } : s,
    ),
  }
}
const reposLe = (jour: number): JourType[] =>
  Array.from({ length: 7 }, (_, j) =>
    j === jour ? { mode: 'repos' } : { mode: 'auto' },
  )
const idCode = (code: string) =>
  referentiel.horaires.find((h) => h.code === code)!.id

function rendreAvec(
  ref: Referentiel,
  edition: Edition,
  source: SourceCase = { semaine: null },
): {
  onCreer: ReturnType<typeof vi.fn>
  onModifier: ReturnType<typeof vi.fn>
} {
  const onCreer = vi.fn()
  const onModifier = vi.fn()
  render(
    <TooltipProvider>
      <EditeurShift
        edition={edition}
        lundi={LUNDI}
        referentiel={ref}
        absence={null}
        source={source}
        onFermer={vi.fn()}
        onCreer={onCreer}
        onModifier={onModifier}
        onSupprimer={vi.fn()}
        onPoserAbsence={vi.fn()}
        onRetirerAbsence={vi.fn()}
      />
    </TooltipProvider>,
  )
  return { onCreer, onModifier }
}

const libreBouton = () =>
  screen.getByRole('button', { name: /Horaire spécifique/ })
const presse = () =>
  screen.queryAllByRole('button', { pressed: true }).map((x) => x.textContent)
const principal = (nom: string) =>
  screen.getByRole<HTMLButtonElement>('button', { name: nom })

function choisirJour(nom: string) {
  const declencheur = screen.getByRole('combobox', { name: 'Jour' })
  fireEvent.pointerDown(declencheur, {
    button: 0,
    ctrlKey: false,
    pointerType: 'mouse',
  })
  fireEvent.click(screen.getByRole('option', { name: nom }))
}

describe('EditeurShift : règle des codes', () => {
  it('jour fermé : rien de choisi, horaire spécifique grisé avec la raison', () => {
    const { onCreer } = rendreAvec(
      referentielAvec({ semaine_type: reposLe(4) }),
      { mode: 'creation', salarie_id: 3, jour: 4 },
    )
    expect(
      screen.getAllByText('Repos fixé par sa semaine type').length,
    ).toBeGreaterThan(0)
    expect(libreBouton().hasAttribute('disabled')).toBe(true)
    expect(presse().filter((t) => /Horaire spécifique/.test(t))).toEqual([])
    expect(principal('Ajouter le shift').disabled).toBe(true)
    fireEvent.click(libreBouton())
    fireEvent.click(principal('Ajouter le shift'))
    expect(onCreer).not.toHaveBeenCalled()
  })

  it('aucun code commun : horaire spécifique possible, jamais choisi d’office', () => {
    const { onCreer } = rendreAvec(
      // Fiche réduite à la nuit, poste Réception : rien en commun.
      referentielAvec({ shifts_autorises: [idCode('N')] }),
      { mode: 'creation', salarie_id: 3, jour: 2 },
    )
    expect(
      screen.getByText('Aucun horaire commun entre sa fiche et ses postes'),
    ).toBeTruthy()
    expect(libreBouton().hasAttribute('disabled')).toBe(false)
    expect(libreBouton().getAttribute('aria-pressed')).toBe('false')
    expect(principal('Ajouter le shift').disabled).toBe(true)
    fireEvent.click(libreBouton())
    expect(principal('Ajouter le shift').disabled).toBe(false)
    fireEvent.click(principal('Ajouter le shift'))
    expect(onCreer).toHaveBeenCalledWith(
      expect.objectContaining({ horaire_id: null, jour: 2 }),
    )
  })

  it('place à pourvoir : son poste et son code choisis d’office', () => {
    const pressees = () => presse().map((t) => t.trim())
    const choisiDans = (poste: string) =>
      within(screen.getByRole('group', { name: poste }))
        .queryAllByRole('button', { pressed: true })
        .map((x) => x.textContent.trim())
    // Personne 3 : titulaire Réception (2) et Club (3), Réception d'office.
    rendreAvec(referentiel, { mode: 'creation', salarie_id: 3, jour: 2 })
    expect(choisiDans('Réception').some((t) => /^M\s*Matin/.test(t))).toBe(true)
    expect(choisiDans('Club')).toEqual([])
    cleanup()
    const { onCreer } = rendreAvec(referentiel, {
      mode: 'creation',
      salarie_id: 3,
      jour: 2,
      poste_id: 3,
      horaire_id: idCode('AM'),
    })
    expect(choisiDans('Club').some((t) => /^AM/.test(t))).toBe(true)
    expect(choisiDans('Réception')).toEqual([])
    expect(pressees().filter((t) => /^AM/.test(t))).toHaveLength(1)
    fireEvent.click(principal('Ajouter le shift'))
    expect(onCreer).toHaveBeenCalledWith(
      expect.objectContaining({ poste_id: 3, horaire_id: idCode('AM') }),
    )
  })

  it('place à pourvoir : un code qui n’est pas permis n’est pas forcé', () => {
    rendreAvec(referentiel, {
      mode: 'creation',
      salarie_id: 3,
      jour: 2,
      poste_id: 3,
      horaire_id: idCode('N'),
    })
    expect(presse().some((t) => /Nuit/.test(t))).toBe(false)
    // Le premier code permis, sur le poste de la place.
    expect(
      within(screen.getByRole('group', { name: 'Club' }))
        .getAllByRole('button', { pressed: true })
        .some((t) => /^M\s*Matin/.test(t.textContent.trim())),
    ).toBe(true)
  })

  it('changer de jour revalide le code ; revenir rend le code d’origine', () => {
    rendreAvec(referentielAvec({ semaine_type: reposLe(4) }), {
      mode: 'modification',
      shift: SHIFT,
    })
    const matin = () =>
      within(screen.getByRole('group', { name: 'Réception' }))
        .getByRole('button', { name: /^M\s*Matin/ })
        .getAttribute('aria-pressed')
    expect(matin()).toBe('true')
    choisirJour('Vendredi')
    // Vendredi en repos fixe : le Matin n'est plus proposé, rien n'est choisi.
    expect(screen.queryByRole('button', { name: /^M\s*Matin/ })).toBeNull()
    expect(presse().filter((t) => /Matin|Horaire spécifique/.test(t))).toEqual(
      [],
    )
    expect(principal('Enregistrer').disabled).toBe(true)
    choisirJour('Mercredi')
    expect(matin()).toBe('true')
    expect(principal('Enregistrer').disabled).toBe(false)
  })

  it('un code d’une autre casquette change aussi le poste, sans choix de poste', () => {
    const { onModifier } = rendreAvec(referentiel, {
      mode: 'modification',
      shift: SHIFT,
    })
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Club' })).getByRole('button', {
        name: /^M\s*Matin/,
      }),
    )
    fireEvent.click(principal('Enregistrer'))
    expect(onModifier).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ poste_id: 3, horaire_id: idCode('M') }),
    )
  })

  it('coupure de 11 h : choisissable avec son alerte, jamais choisie d’office', () => {
    // Après-midi le mardi (fin 23:45) : le Matin du mercredi casse les 11 h.
    const semaine = analyser({
      lundi: LUNDI,
      referentiel,
      absences,
      affectations: [
        {
          id: 8,
          lundi: LUNDI,
          salarie_id: 3,
          poste_id: 2,
          jour: 1,
          horaire_id: idCode('AM'),
          debut: '15:00',
          fin: '23:45',
          epinglee: true,
          court: false,
          pause: 45,
        },
      ],
      avant: [],
      apres: [],
    })
    const { onCreer } = rendreAvec(
      referentiel,
      { mode: 'creation', salarie_id: 3, jour: 2 },
      { semaine },
    )
    const reception = within(screen.getByRole('group', { name: 'Réception' }))
    const matin = reception.getByRole('button', { name: /^M\s*Matin/ })
    expect(matin.textContent).toMatch(
      /Coupure de 11 h non respectée avec la veille/,
    )
    expect(matin.hasAttribute('disabled')).toBe(false)
    // Rien d'office qui casse la coupure : l'après-midi est proposé.
    expect(matin.getAttribute('aria-pressed')).toBe('false')
    expect(
      reception
        .getByRole('button', { name: /^AM/ })
        .getAttribute('aria-pressed'),
    ).toBe('true')
    fireEvent.click(matin)
    fireEvent.click(principal('Ajouter le shift'))
    expect(onCreer).toHaveBeenCalledWith(
      expect.objectContaining({ poste_id: 2, horaire_id: idCode('M') }),
    )
  })
})
