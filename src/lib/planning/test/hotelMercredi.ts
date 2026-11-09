/*
 * Le cas du mercredi (2026-11-09), FICTIF : trois salariés confirmés du
 * matin (39 h) ont tous leur repos le mercredi (deux le mercredi et le
 * jeudi, un le mardi et le mercredi, comme la copie de décembre) ; deux salariés
 * du soir seulement (35 h) ; une apprentie et une stagiaire (35 h), jamais
 * sans un salarié confirmé. Les deux semaines d'avant sont faites et
 * validées. Pseudonymes seulement.
 */

import { reglagesCategorie } from '#/lib/planning/test/codesTest.ts'
import type {
  Affectation,
  Consigne,
  Horaire,
  Referentiel,
  Salarie,
  TypeContrat,
} from '#/lib/planning/types.ts'

const HORAIRES: Array<[string, string, string, number, string]> = [
  ['M8', '07:00', '15:45', 45, 'matin'],
  ['M7', '07:00', '14:30', 30, 'matin'],
  ['S8', '14:30', '23:15', 45, 'soir'],
  ['S7', '15:45', '23:15', 30, 'soir'],
]
// (prénom, contrat, heures, horaires, jours de repos des semaines d'avant)
const EQUIPE: Array<[string, TypeContrat, number, string[], number[]]> = [
  ['Anna', 'cdi', 39, ['M8', 'M7'], [2, 3]],
  ['Bruno', 'cdi', 39, ['M8', 'M7'], [2, 3]],
  ['Cyril', 'cdi', 39, ['M8', 'M7'], [1, 2]],
  ['Daphné', 'cdi', 35, ['S7'], [6, 0]],
  ['Elias', 'cdi', 35, ['S7'], [1, 2]],
  ['Flora', 'apprenti', 35, ['M7', 'S7'], [5, 6]],
  ['Gael', 'stagiaire', 35, ['M7', 'S7'], [5, 6]],
]

export function hotelMercredi(): {
  referentiel: Referentiel
  avant: Affectation[]
} {
  const horaires: Horaire[] = HORAIRES.map(
    ([nom, debut, fin, pause, periode], i) => ({
      id: i + 1,
      nom,
      debut,
      fin,
      couleur: '#000000',
      pause,
      periode,
    }),
  )
  const idH = (n: string) => horaires.find((h) => h.nom === n)!.id
  const consignes: Consigne[] = []
  for (let jour = 0; jour < 7; jour++)
    for (const periode of ['matin', 'soir'])
      consignes.push({
        id: consignes.length + 1,
        jour,
        periode,
        minimum: 2,
        maximum: 2,
      })
  const salaries: Salarie[] = EQUIPE.map(
    ([prenom, contrat, heures, codes], i) => ({
      id: i + 1,
      prenom,
      nom: 'Essai',
      groupe_id: null,
      type_contrat: contrat,
      heures_hebdo: heures,
      forfait_jours: false,
      mineur: false,
      competences: [{ poste_id: 1, niveau: 'titulaire' }],
      semaine_type: Array.from({ length: 7 }, () => ({
        mode: 'auto' as const,
      })),
      shifts_autorises: codes.map(idH),
      date_entree: null,
      date_sortie: null,
      actif: true,
      suite_de: null,
    }),
  )
  // Les semaines d'avant, faites et validées : chacun sur ses jours.
  const avant: Affectation[] = []
  for (const lundi of ['2026-11-23', '2026-11-30'])
    EQUIPE.forEach(([, , heures, codes, repos], i) => {
      let courte = heures > 35
      for (let jour = 0; jour < 7; jour++) {
        if (repos.includes(jour)) continue
        const code = heures > 35 && !courte ? codes[0] : codes.at(-1)!
        courte = false
        const h = horaires.find((x) => x.nom === code)!
        avant.push({
          id: avant.length + 1,
          lundi,
          salarie_id: i + 1,
          poste_id: 1,
          jour,
          horaire_id: h.id,
          debut: h.debut,
          fin: h.fin,
          pause: h.pause,
          epinglee: true,
        })
      }
    })
  return {
    referentiel: {
      horaires,
      motifs: [],
      postes: [
        {
          id: 1,
          nom: 'Réception',
          ...reglagesCategorie('reception'),
          couleur: '#000000',
          horaires_autorises: horaires.map((h) => h.id),
          zone_id: 1,
        },
      ] as Referentiel['postes'],
      groupes: [],
      salaries,
      besoins: [],
      consignes,
      verrous: [],
    },
    avant,
  }
}
