// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  pointsAttention,
  regrouperPlaces,
} from '#/components/planning/attention.ts'
import { PanneauAlertes } from '#/components/planning/semaine/PanneauAlertes.tsx'
import { PlacesAPourvoir } from '#/components/planning/semaine/PlacesAPourvoir.tsx'
import type { DemandePlacement } from '#/components/planning/semaine/PlacesAPourvoir.tsx'
import type { SemaineOut } from '#/lib/planning/semaine.ts'
import type { Poste, Salarie } from '#/lib/planning/types.ts'

/*
 * Étape 8 : le panneau dit pourquoi chaque place reste vide, mène au
 * réglage, et « Placer quelqu'un » propose les personnes libres.
 * Pseudonymes.
 */

afterEach(cleanup)

const salarie = (
  id: number,
  prenom: string,
  niveau = 'titulaire',
  type_contrat = 'cdi',
) =>
  ({
    id,
    prenom,
    type_contrat,
    competences: [{ poste_id: 9, niveau }],
  }) as unknown as Salarie
const SALARIES = [
  salarie(1, 'Alba'),
  salarie(2, 'Bruno', 'occasionnel'),
  salarie(3, 'Céleste'),
  salarie(4, 'Dario', 'titulaire', 'extra'),
]
const POSTES = [{ id: 9, nom: 'Club', couleur: '#000' }] as Poste[]

const place = (
  besoin_id: number,
  jour: number,
  raisons: SemaineOut['a_pourvoir'][number]['raisons'],
) => ({
  besoin_id,
  poste_id: 9,
  jour,
  type_shift_id: 41,
  debut: '07:00',
  fin: '15:00',
  duree: 450,
  manquant: 1,
  raisons,
})

const SEM = {
  lundi: '2026-11-02',
  a_pourvoir: [
    place(1, 0, [
      { salarie_id: 2, messages: ['x'], regles: ['REPOS-FIXE'] },
      {
        salarie_id: 1,
        messages: ['50 h dans la semaine, maximum 48 h'],
        regles: ['R-SEMAINE-MAX'],
      },
      { salarie_id: 3, messages: [], regles: [] },
      { salarie_id: 4, messages: ['extra disponible'], regles: ['EXTRA'] },
    ]),
    place(2, 1, [
      { salarie_id: 2, messages: ['x'], regles: ['REPOS-FIXE'] },
      {
        salarie_id: 1,
        messages: ['50 h dans la semaine, maximum 48 h'],
        regles: ['R-SEMAINE-MAX'],
      },
      {
        salarie_id: 3,
        messages: ['a déjà un service ce jour-là'],
        regles: ['UN-SERVICE-PAR-JOUR'],
      },
    ]),
    { ...place(3, 3, []), poste_id: 9, type_shift_id: 99 },
  ],
  presence: [],
  bilan: [],
} as unknown as SemaineOut

function monter(onPlacer?: (d: DemandePlacement) => void) {
  const onAller = vi.fn()
  const groupes = regrouperPlaces(
    pointsAttention([SEM], SALARIES, POSTES).aPourvoir.flatMap((j) => j.shifts),
    [
      { id: 41, code: 'M1' },
      { id: 99, code: 'S9' },
    ],
  )
  render(
    <ul>
      <PlacesAPourvoir
        groupes={groupes}
        onAller={onAller}
        onPlacer={onPlacer}
      />
    </ul>,
  )
  return { onAller }
}

describe('PlacesAPourvoir', () => {
  it('une ligne par groupe ; raisons en clair, titulaires d’abord', () => {
    monter()
    expect(screen.getByText('Club, M1', { selector: 'strong' })).toBeTruthy()
    expect(screen.getByText(/: lundi et mardi/)).toBeTruthy()
    const raisons = screen.getAllByRole('list', {
      name: 'Pourquoi personne',
    })[0]
    const lignes = within(raisons).getAllByRole('listitem')
    expect(lignes.map((l) => l.querySelector('strong')?.textContent)).toEqual([
      'Alba',
      'Céleste',
      'Bruno',
      'Dario',
    ])
    expect(
      within(lignes[0]).getByText('48 h atteintes dans la semaine'),
    ).toBeTruthy()
    expect(within(lignes[0]).getByText('limite légale')).toBeTruthy()
    // Raison d'un seul des deux jours : le jour est dit.
    expect(
      within(lignes[1]).getByText('A déjà un shift ce jour-là (mardi)'),
    ).toBeTruthy()
    expect(within(lignes[2]).getByText('dépannage')).toBeTruthy()
    expect(within(lignes[3]).getByText('à appeler')).toBeTruthy()
    // Lecture seule : pas de bouton pour placer.
    expect(
      screen.queryByRole('button', { name: /Placer quelqu'un/ }),
    ).toBeNull()
  })

  it('le lien mène au réglage qui débloque', () => {
    const { onAller } = monter()
    fireEvent.click(screen.getAllByRole('button', { name: 'Semaine type' })[0])
    expect(onAller).toHaveBeenCalledWith({
      page: '/planning/equipe',
      cible: 'salarie-2.semaine',
    })
  })

  it('personne ne tient le poste : Équipe et Besoins', () => {
    const { onAller } = monter()
    expect(screen.getByText(/Personne ne tient ce poste seul/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Besoins' }))
    expect(onAller).toHaveBeenCalledWith({
      page: '/planning/besoins',
      cible: 'poste-9',
    })
  })

  it('Placer quelqu’un : les personnes libres de CE jour', () => {
    const onPlacer = vi.fn()
    monter(onPlacer)
    const [lundi, mardi] = screen.getAllByRole('button', {
      name: /^Placer quelqu'un le/,
    })
    fireEvent.click(mardi)
    expect(screen.getByText("Personne n'est libre ce jour-là.")).toBeTruthy()
    fireEvent.click(lundi)
    // Céleste (libre ce jour-là) puis l'extra ; jamais Alba
    // (limite légale) ni Bruno (repos fixe).
    const choix = screen
      .getAllByRole('button')
      .filter((b) => /^(Alba|Bruno|Céleste|Dario)/.test(b.textContent))
    expect(choix.map((b) => b.textContent)).toEqual(['Céleste', 'Darioextra'])
    fireEvent.click(choix[0])
    expect(onPlacer).toHaveBeenCalledWith(
      expect.objectContaining({
        salarieId: 3,
        date: '2026-11-02',
        jour: 0,
        posteId: 9,
        horaireId: 41,
      }),
    )
  })
})

describe('place que rien ne remplit', () => {
  const bloque = (id: number) => ({
    salarie_id: id,
    messages: ['repos de 11 h non respecté'],
    regles: ['R-REPOS-QUOTIDIEN'],
  })
  const S = {
    lundi: '2026-11-02',
    a_pourvoir: [
      {
        ...place(1, 1, [bloque(1), bloque(3)]),
        remplacants: [{ type_shift_id: 42, raisons: [bloque(1), bloque(3)] }],
        raison_commune: 'R-REPOS-QUOTIDIEN',
      },
      {
        ...place(2, 2, [bloque(1), bloque(3)]),
        remplacants: [
          {
            type_shift_id: 42,
            raisons: [{ salarie_id: 3, messages: [], regles: [] }],
          },
        ],
        raison_commune: null,
      },
    ],
    presence: [],
    bilan: [],
  } as unknown as SemaineOut
  const monterCommune = (onPlacer?: (d: DemandePlacement) => void) =>
    render(
      <ul>
        <PlacesAPourvoir
          groupes={regrouperPlaces(
            pointsAttention([S], SALARIES, POSTES).aPourvoir.flatMap(
              (j) => j.shifts,
            ),
            [
              { id: 41, code: 'M3' },
              { id: 42, code: 'M6' },
            ],
          )}
          onAller={vi.fn()}
          onPlacer={onPlacer}
        />
      </ul>,
    )

  it('je ne peux pas, la raison, la solution ; Placer reste', () => {
    monterCommune(vi.fn())
    const mardi = screen.getByText('Je ne peux pas remplir ce M3.')
    const bloc = mardi.parentElement!
    expect(bloc.textContent).toBe(
      "Je ne peux pas remplir ce M3.Personne n'a assez de repos avec ses autres shifts.Prenez un extra ou changez un shift.",
    )
    // Une seule place dit « je ne peux pas » : celle de mercredi garde les
    // raisons par personne, et le code voisin possible.
    expect(screen.getAllByText(/Je ne peux pas/)).toHaveLength(1)
    expect(
      screen.getAllByRole('list', { name: 'Pourquoi personne' }),
    ).toHaveLength(1)
    expect(screen.getByText('Possible en M6 : Céleste.')).toBeTruthy()
    expect(
      screen.getAllByRole('button', { name: /^Placer quelqu'un le/ }),
    ).toHaveLength(2)
  })
})

describe('panneau : personnes par cycle et trous entre équipes', () => {
  it('deux familles, une phrase par point, comptées au résumé', () => {
    const S = {
      lundi: '2026-11-02',
      a_pourvoir: [],
      presence: [
        {
          jour: 1,
          periode: 'nuit',
          compte: 0,
          minimum: 1,
          maximum: null,
          ecart: -1,
        },
        {
          jour: 1,
          periode: 'matin',
          compte: 4,
          minimum: 2,
          maximum: 3,
          ecart: 1,
        },
      ],
      trous: [{ poste_id: 9, jour: 1, debut: '15:00', fin: '16:00' }],
      bilan: [],
    } as unknown as SemaineOut
    render(
      <PanneauAlertes
        ouvert
        onFermer={vi.fn()}
        semaines={[S]}
        salaries={SALARIES}
        postes={POSTES}
        periode="Cette semaine"
      />,
    )
    expect(
      screen.getByText(
        '3 points : 2 écarts de personnes par cycle, 1 trou entre équipes.',
      ),
    ).toBeTruthy()
    expect(screen.getByText('Personnes par cycle')).toBeTruthy()
    expect(screen.getByText('Trous entre équipes')).toBeTruthy()
    const phrases = [
      '1 personne de trop le matin mardi',
      'Il manque 1 personne la nuit mardi',
      'Club mardi : personne de 15 h à 16 h',
    ]
    for (const t of phrases) expect(screen.getByText(t)).toBeTruthy()
    // Matin avant nuit.
    const texte = document.body.textContent
    expect(texte.indexOf(phrases[0])).toBeLessThan(texte.indexOf(phrases[1]))
  })
})
