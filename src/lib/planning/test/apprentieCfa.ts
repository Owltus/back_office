/*
 * Le cas de l'apprentie avant son CFA (2026-11-09), FICTIF : une apprentie
 * de 35 h, ses deux semaines d'avant faites et validées avec ses repos le
 * mercredi et le jeudi, et une semaine de CFA du lundi 14 au vendredi 18
 * décembre. Une place à la Réception chaque jour (07:00 à 14:30, 7 h).
 * Pseudonyme seulement. La règle « jamais sans un salarié confirmé » est
 * retirée de son contrat (`sansAccompagne`) : le cas ne regarde que le
 * rythme et les heures.
 */

import { sansAccompagne } from '#/lib/planning/test/reglesTest.ts'
import { reglagesCategorie } from '#/lib/planning/test/codesTest.ts'
import { ajouterJours } from '#/lib/planning/temps.ts'
import type {
  Absence,
  Affectation,
  Besoin,
  Referentiel,
} from '#/lib/planning/types.ts'

export const ECOLE = 1

export function apprentieCfa(): {
  referentiel: Referentiel
  absences: Absence[]
  avant: Affectation[]
} {
  const horaire = {
    id: 1,
    nom: 'M7',
    debut: '07:00',
    fin: '14:30',
    couleur: '#000000',
    pause: 30,
    periode: 'matin',
  }
  const besoins: Besoin[] = Array.from({ length: 7 }, (_, jour) => ({
    id: jour + 1,
    poste_id: 1,
    jour,
    horaire_id: 1,
    debut: '07:00',
    fin: '14:30',
    effectif: 1,
    soutien: 0,
    renfort: 0,
  }))
  const avant: Affectation[] = []
  for (const lundi of ['2026-11-16', '2026-11-23'])
    for (const jour of [0, 1, 4, 5, 6])
      avant.push({
        id: avant.length + 1,
        lundi,
        salarie_id: 1,
        poste_id: 1,
        jour,
        horaire_id: 1,
        debut: '07:00',
        fin: '14:30',
        pause: 30,
        epinglee: true,
      })
  const absences: Absence[] = [0, 1, 2, 3, 4].map((j) => ({
    id: j + 1,
    salarie_id: 1,
    jour: ajouterJours('2026-12-14', j),
    motif_id: ECOLE,
  }))
  const base: Referentiel = {
    horaires: [horaire],
    motifs: [
      {
        id: ECOLE,
        code: 'EC',
        nom: 'École',
        couleur: '#000000',
        decompte: true,
        nature: 'ecole',
      },
    ],
    postes: [
      {
        id: 1,
        nom: 'Réception',
        ...reglagesCategorie('reception'),
        couleur: '#000000',
        horaires_autorises: [1],
        zone_id: null,
      },
    ] as Referentiel['postes'],
    groupes: [],
    salaries: [
      {
        id: 1,
        prenom: 'Zélie',
        nom: 'Essai',
        groupe_id: null,
        type_contrat: 'apprenti',
        heures_hebdo: 35,
        forfait_jours: false,
        mineur: false,
        competences: [{ poste_id: 1, niveau: 'titulaire' }],
        semaine_type: Array.from({ length: 7 }, () => ({
          mode: 'auto' as const,
        })),
        shifts_autorises: [],
        date_entree: '2026-09-01',
        date_sortie: '2027-08-31',
        actif: true,
        suite_de: null,
      },
    ],
    besoins,
    consignes: [],
    verrous: [],
  }
  return { referentiel: sansAccompagne(base), absences, avant }
}
