/*
 * Un hôtel FICTIF tiré d'une graine (2026-11-10, CALCUL PAR PRIORITÉS) :
 * le générateur du banc de scénarios, gardé pour les tests. Réception et
 * Club (zone de l'accueil), parfois une veille de nuit ; une équipe de CDI
 * de 35 h et 39 h, parfois des apprentis ou stagiaires (CFA), quelques
 * congés ; les deux semaines d'avant faites et validées, chacun avec sa
 * paire de repos ; quelques jours déjà validés dans la semaine calculée.
 * Pseudonymes seulement (P1, P2…), aucune donnée réelle.
 */

import { ajouterJours } from '#/lib/planning/temps.ts'
import type {
  Absence,
  Affectation,
  Consigne,
  Horaire,
  JourType,
  Referentiel,
  Salarie,
} from '#/lib/planning/types.ts'
import type { DonneesSemaine } from '#/lib/planning/semaine.ts'

function alea(graine: number) {
  let a = graine >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Le lundi calculé et le jour du calcul. */
export const LUNDI_GENERE = '2026-12-07'
export const AUJOURDHUI_GENERE = '2026-11-10'
const LUNDI = LUNDI_GENERE

export function hotelGenere(graine: number) {
  const r = alea(graine * 7919 + 13)
  const tire = (n: number) => Math.floor(r() * n)
  const H: Array<[string, string, string, number, string]> = [
    ['M8', '07:00', '15:45', 45, 'matin'],
    ['M7', '07:00', '14:30', 30, 'matin'],
    ['MI', '11:00', '19:45', 45, 'middle'],
    ['S8', '14:30', '23:15', 45, 'soir'],
    ['S7', '15:45', '23:15', 30, 'soir'],
    ['N', '23:00', '07:00', 0, 'nuit'],
  ]
  const horaires: Horaire[] = H.map(([nom, debut, fin, pause, periode], i) => ({
    id: i + 1,
    nom,
    debut,
    fin,
    couleur: '#000000',
    pause,
    periode,
  }))
  const id = (n: string) => horaires.find((h) => h.nom === n)!.id
  const nuit = r() < 0.5
  const postes = [
    {
      id: 1,
      nom: 'Réception',
      couleur: '#000',
      horaires_autorises: ['M8', 'M7', 'MI', 'S8', 'S7'].map(id),
      jour_max_minutes: 720,
      zone_id: 1,
      indispensable: true,
    },
    {
      id: 2,
      nom: 'Club',
      couleur: '#000',
      horaires_autorises: ['M8', 'M7', 'S8', 'S7'].map(id),
      jour_max_minutes: 690,
      zone_id: 1,
      indispensable: true,
    },
    ...(nuit
      ? [
          {
            id: 3,
            nom: 'Veille',
            couleur: '#000',
            horaires_autorises: [id('N')],
            jour_max_minutes: 720,
            zone_id: 1,
            indispensable: true,
          },
        ]
      : []),
  ] as Referentiel['postes']
  const consignes: Consigne[] = []
  const matin = 2 + tire(2)
  const soir = 2 + tire(2)
  for (let jour = 0; jour < 7; jour++) {
    const we = jour >= 5 && r() < 0.5 ? 1 : 0
    consignes.push({
      id: consignes.length + 1,
      jour,
      periode: 'matin',
      minimum: matin + we,
      maximum: matin + we,
    })
    consignes.push({
      id: consignes.length + 1,
      jour,
      periode: 'soir',
      minimum: soir,
      maximum: soir,
    })
    if (nuit)
      consignes.push({
        id: consignes.length + 1,
        jour,
        periode: 'nuit',
        minimum: 1,
        maximum: 1,
      })
  }
  const motifs = [
    {
      id: 1,
      code: 'EC',
      nom: 'École',
      couleur: '#000',
      decompte: true,
      nature: 'ecole' as const,
    },
    {
      id: 2,
      code: 'CP',
      nom: 'Congé payé',
      couleur: '#000',
      decompte: true,
      nature: 'absence' as const,
    },
    {
      id: 3,
      code: 'R',
      nom: 'Repos',
      couleur: '#000',
      decompte: false,
      nature: 'repos' as const,
      role: 'repos_defaut' as const,
    },
  ]
  const salaries: Salarie[] = []
  const pairesRepos: number[][] = []
  const codesDe: string[][] = []
  const ajoute = (
    contrat: Salarie['type_contrat'],
    heures: number,
    comp: Salarie['competences'],
    codes: string[],
    fixes = false,
  ) => {
    const d = tire(7)
    const paire = [d, (d + 1) % 7]
    const semaine: JourType[] = Array.from({ length: 7 }, (_, j) => ({
      mode: fixes && paire.includes(j) ? ('repos' as const) : ('auto' as const),
    }))
    salaries.push({
      id: salaries.length + 1,
      prenom: `P${salaries.length + 1}`,
      nom: 'Essai',
      groupe_id: null,
      type_contrat: contrat,
      heures_hebdo: heures,
      forfait_jours: false,
      mineur: false,
      competences: comp,
      semaine_type: semaine,
      shifts_autorises: codes.map(id),
      date_entree: '2025-01-01',
      date_sortie:
        contrat === 'apprenti' || contrat === 'stagiaire' ? '2027-08-31' : null,
      actif: true,
      suite_de: null,
    } as Salarie)
    pairesRepos.push(paire)
    codesDe.push(codes)
  }
  const nbTit = matin + soir + 1 + tire(3)
  for (let k = 0; k < nbTit; k++) {
    const h = r() < 0.5 ? 35 : 39
    const club = r() < 0.6
    const comp: Salarie['competences'] = [{ poste_id: 1, niveau: 'titulaire' }]
    if (club)
      comp.push({
        poste_id: 2,
        niveau: r() < 0.6 ? 'titulaire' : 'occasionnel',
      })
    const u = r()
    const codes =
      u < 0.35
        ? ['M8', 'M7']
        : u < 0.7
          ? ['S8', 'S7']
          : u < 0.85
            ? ['M8', 'M7', 'S8', 'S7']
            : ['M8', 'M7', 'MI', 'S8', 'S7']
    ajoute('cdi', h, comp, codes, r() < 0.2)
  }
  if (nuit) {
    ajoute('cdi', 39, [{ poste_id: 3, niveau: 'titulaire' }], ['N'], r() < 0.5)
    ajoute(
      'cdi',
      35,
      [
        { poste_id: 3, niveau: 'titulaire' },
        { poste_id: 1, niveau: 'occasionnel' },
      ],
      ['N', 'M8', 'S8'],
    )
  }
  const nbApp = tire(3)
  for (let k = 0; k < nbApp; k++)
    ajoute(
      r() < 0.6 ? 'apprenti' : 'stagiaire',
      35,
      [{ poste_id: 1, niveau: r() < 0.5 ? 'titulaire' : 'soutien' }],
      ['M7', 'S7'],
    )

  // Absences : CFA (apprentis), congés.
  const absences: Absence[] = []
  const absent = (sid: number, du: string, n: number, motif: number) => {
    for (let j = 0; j < n; j++)
      absences.push({
        id: absences.length + 1,
        salarie_id: sid,
        jour: ajouterJours(du, j),
        motif_id: motif,
      })
  }
  for (const s of salaries) {
    if (s.type_contrat === 'apprenti' && r() < 0.7) {
      const semaine = [ajouterJours(LUNDI, -7), LUNDI, ajouterJours(LUNDI, 7)][
        tire(3)
      ]
      absent(s.id, semaine, 5, 1)
    }
    if (s.type_contrat === 'cdi' && r() < 0.15)
      absent(s.id, ajouterJours(LUNDI, tire(10) - 3), 2 + tire(6), 2)
  }
  const absentLe = new Set(absences.map((a) => `${a.salarie_id}|${a.jour}`))

  // Deux semaines d'avant faites et validées, chacun avec sa paire de repos.
  const affectations: Affectation[] = []
  let n = 0
  const poser = (
    lundi: string,
    s: Salarie,
    jour: number,
    epinglee: boolean,
  ) => {
    if (absentLe.has(`${s.id}|${ajouterJours(lundi, jour)}`)) return
    const codes = codesDe[s.id - 1]
    const code = codes[tire(codes.length)]
    const h = horaires[id(code) - 1]
    const poste =
      code === 'N'
        ? 3
        : s.competences.some((c) => c.poste_id === 2) && r() < 0.4
          ? 2
          : 1
    affectations.push({
      id: ++n,
      lundi,
      salarie_id: s.id,
      poste_id: poste,
      jour,
      horaire_id: h.id,
      debut: h.debut,
      fin: h.fin,
      pause: h.pause,
      epinglee,
    })
  }
  for (const lundi of [ajouterJours(LUNDI, -14), ajouterJours(LUNDI, -7)])
    for (const s of salaries) {
      const paire = pairesRepos[s.id - 1]
      for (let j = 0; j < 7; j++)
        if (!paire.includes(j)) poser(lundi, s, j, true)
    }
  // Quelques jours déjà validés dans la semaine calculée.
  for (const s of salaries) {
    if (r() < 0.2) {
      const paire = pairesRepos[s.id - 1]
      const j = tire(7)
      if (!paire.includes(j)) poser(LUNDI, s, j, true)
    }
  }
  const referentiel: Referentiel = {
    horaires,
    motifs,
    postes,
    groupes: [],
    salaries,
    besoins: [],
    consignes,
    verrous: [],
  }
  return { referentiel, absences, affectations }
}

/** Les données de la semaine calculée de l'hôtel tiré par `graine`. */
export function semaineGeneree(graine: number): DonneesSemaine {
  const { referentiel, absences, affectations } = hotelGenere(graine)
  const de = (l: string) => affectations.filter((a) => a.lundi === l)
  return {
    lundi: LUNDI,
    referentiel,
    absences,
    affectations: de(LUNDI),
    avant: de(ajouterJours(LUNDI, -7)),
    apres: [],
    avantAvant: de(ajouterJours(LUNDI, -14)),
    historique: affectations.filter((a) => a.lundi < LUNDI),
    anterieures: affectations.filter((a) => a.lundi < LUNDI),
  }
}
