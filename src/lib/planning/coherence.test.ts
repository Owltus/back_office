import { describe, expect, it } from 'vitest'

import {
  aDesBloquants,
  grouperPoints,
  listeJours,
  verifierReglages,
} from '#/lib/planning/coherence.ts'
import type { PointReglage } from '#/lib/planning/coherence.ts'
import { hotelReel } from '#/lib/planning/test/hotelReel.ts'
import { SEMAINE_TYPE_VIDE } from '#/lib/planning/types.ts'
import type {
  Besoin,
  Horaire,
  Poste,
  Referentiel,
  Salarie,
} from '#/lib/planning/types.ts'

/*
 * Oracle : un référentiel PROPRE écrit à la main (aucun point), puis, pour
 * chaque point prévu, UNE retouche qui le fait apparaître. Les identifiants
 * et liens attendus sont écrits ici, sans relire le code testé.
 */

const M = 1
const S = 2
const N = 3
const J = 4
const D = 5

function horaire(
  id: number,
  code: string,
  debut: string,
  fin: string,
  periode: Horaire['periode'],
): Horaire {
  return {
    id,
    code,
    nom: code,
    debut,
    fin,
    couleur: '#888888',
    pause: 0,
    raccourci: 0,
    raccourci_debut: 0,
    periode,
    code_rouge: false,
  }
}

function poste(id: number, nom: string, kw: Partial<Poste> = {}): Poste {
  return {
    id,
    nom,
    categorie: 'reception',
    couleur: '#000000',
    horaires_autorises: [],
    a_part: false,
    presence: false,
    ...kw,
  }
}

function salarie(id: number, kw: Partial<Salarie> = {}): Salarie {
  return {
    id,
    prenom: `Personne${id}`,
    nom: 'Essai',
    groupe_id: null,
    type_contrat: 'cdi',
    heures_hebdo: 39,
    forfait_jours: false,
    mineur: false,
    competences: [{ poste_id: 1, niveau: 'titulaire' }],
    semaine_type: SEMAINE_TYPE_VIDE.map((e) => ({ ...e })),
    shifts_autorises: [],
    date_entree: null,
    date_sortie: null,
    actif: true,
    suite_de: null,
    ...kw,
  }
}

let prochainBesoin = 100
function besoin(
  posteId: number,
  jour: number,
  h: Horaire | null,
  kw: Partial<Besoin> = {},
): Besoin {
  return {
    id: prochainBesoin++,
    poste_id: posteId,
    jour,
    horaire_id: h ? h.id : null,
    debut: h ? h.debut : '07:00',
    fin: h ? h.fin : '15:00',
    effectif: 1,
    soutien: 0,
    renfort: 0,
    ...kw,
  }
}

const HORAIRES = [
  horaire(M, 'M', '07:00', '15:00', 'matin'),
  horaire(S, 'S', '15:00', '23:00', 'soir'),
  horaire(N, 'N', '23:00', '07:00', 'nuit'),
  horaire(J, 'J', '09:00', '17:00', 'matin'),
  horaire(D, 'D', '09:00', '17:00', null),
]
const [hM, hS] = HORAIRES

/** Réception (compte dans la présence), trois titulaires à 39 h ; un matin
 * et un soir chaque jour (112 h), consignes du lundi tenues. */
function propre(): Referentiel {
  const besoins: Besoin[] = []
  for (let j = 0; j < 7; j++) {
    besoins.push(besoin(1, j, hM), besoin(1, j, hS))
  }
  return {
    horaires: HORAIRES.map((h) => ({ ...h })),
    motifs: [],
    postes: [poste(1, 'Réception', { presence: true })],
    groupes: [],
    salaries: [salarie(10), salarie(11), salarie(12)],
    besoins,
    consignes: [
      { id: 1, jour: 0, periode: 'matin', minimum: 1, maximum: 1 },
      { id: 2, jour: 0, periode: 'soir', minimum: 1, maximum: null },
    ],
    verrous: [],
  }
}

const ids = (p: PointReglage[]) => p.map((x) => x.id)
const seul = (r: Referentiel): PointReglage => {
  const p = verifierReglages(r)
  expect(p).toHaveLength(1)
  return p[0]
}

describe('verifierReglages', () => {
  it('un référentiel propre ne produit aucun point', () => {
    expect(verifierReglages(propre())).toEqual([])
  })

  it('besoin sur un code que le poste ne permet plus', () => {
    const r = propre()
    r.postes[0].horaires_autorises = [M, J]
    // Les besoins ignorés ne comptent plus : le lundi soir tombe sous sa
    // consigne, ce qui est vrai.
    const tous = verifierReglages(r)
    expect(ids(tous)).toEqual([`besoin-code:1:${S}`, 'presence:0:soir'])
    const p = tous[0]
    expect(p).toMatchObject({
      id: `besoin-code:1:${S}`,
      gravite: 'a-voir',
      ecran: 'postes',
      lien: { page: '/planning/postes', cible: 'poste-1' },
    })
    expect(p.texte).toContain('S')
    expect(p.texte).toContain(
      'lundi, mardi, mercredi, jeudi, vendredi, samedi et dimanche',
    )
  })

  it('besoin plus long que le service HCR de la catégorie', () => {
    const r = propre()
    r.besoins.push(
      besoin(1, 2, null, {
        debut: '06:00',
        fin: '20:00',
        effectif: 0,
        renfort: 1,
      }),
    )
    expect(seul(r)).toMatchObject({
      id: 'besoin-duree:1:06:00-20:00',
      ecran: 'besoins',
      lien: { page: '/planning/besoins', cible: 'poste-1' },
    })
  })

  it('besoin sur un poste sans personne autonome', () => {
    const r = propre()
    r.postes.push(poste(2, 'Bar'))
    r.besoins.push(besoin(2, 0, hM, { effectif: 0, renfort: 0, soutien: 0 }))
    r.besoins.push(besoin(2, 1, hM))
    expect(seul(r)).toMatchObject({
      id: 'sans-autonome:2',
      ecran: 'equipe',
      lien: { page: '/planning/postes', cible: 'poste-2' },
    })
  })

  it('un dépannage suffit : pas de point « sans autonome »', () => {
    const r = propre()
    r.postes.push(poste(2, 'Bar'))
    r.besoins.push(besoin(2, 1, hM))
    r.salaries[0].competences.push({ poste_id: 2, niveau: 'occasionnel' })
    expect(ids(verifierReglages(r))).toEqual([])
  })

  it('matin sous la consigne « au moins »', () => {
    const r = propre()
    r.consignes[0] = { ...r.consignes[0], minimum: 2, maximum: null }
    expect(seul(r)).toMatchObject({
      id: 'presence:0:matin',
      ecran: 'besoins',
      lien: { page: '/planning/besoins', cible: 'presence' },
    })
  })

  it('matin au-dessus de la consigne « au plus »', () => {
    const r = propre()
    r.besoins.push(besoin(1, 0, HORAIRES[3]))
    const p = seul(r)
    expect(p.id).toBe('presence:0:matin')
    expect(p.texte).toContain('au plus 1')
  })

  it('un poste hors présence ne compte pas dans le matin et le soir', () => {
    const r = propre()
    r.postes.push(poste(2, 'Bar'))
    r.salaries[0].competences.push({ poste_id: 2, niveau: 'titulaire' })
    r.besoins.push(besoin(2, 0, hM))
    expect(ids(verifierReglages(r))).toEqual([])
  })

  it('personne sans code utilisable sur un de ses postes', () => {
    const r = propre()
    r.postes.push(poste(2, 'Bar', { horaires_autorises: [M] }))
    r.salaries[0].competences.push({ poste_id: 2, niveau: 'titulaire' })
    r.salaries[0].shifts_autorises = [S]
    expect(seul(r)).toMatchObject({
      id: 'sans-code:10:2',
      ecran: 'equipe',
      lien: { page: '/planning/equipe', cible: 'salarie-10' },
    })
  })

  it('personne en « Seulement » dont tous les codes cochés sont morts', () => {
    const r = propre()
    r.postes[0].horaires_autorises = [M, S]
    r.salaries[1].shifts_autorises = [N]
    expect(seul(r)).toMatchObject({
      id: 'codes-morts:11',
      lien: { page: '/planning/equipe', cible: 'salarie-11' },
    })
  })

  it('code fixé hors des codes permis', () => {
    const r = propre()
    r.postes[0].horaires_autorises = [M, S]
    r.salaries[2].semaine_type[0] = { mode: 'travail', type_shift_id: N }
    const p = seul(r)
    expect(p).toMatchObject({
      id: 'code-fixe:12:0',
      lien: { page: '/planning/equipe', cible: 'salarie-12' },
    })
    expect(p.texte).toContain("n'est permis sur aucun de ses postes")
  })

  it('code fixé sans besoin de ce code ce jour-là (D12)', () => {
    const r = propre()
    r.salaries[2].semaine_type[3] = { mode: 'auto', type_shift_id: J }
    const p = seul(r)
    expect(p.id).toBe('code-fixe:12:3')
    expect(p.texte).toContain('aucun besoin')
    expect(p.texte).toContain('jeudi')
  })

  it('code fixé avec son besoin ce jour-là : rien', () => {
    const r = propre()
    r.salaries[2].semaine_type[3] = { mode: 'travail', type_shift_id: M }
    expect(verifierReglages(r)).toEqual([])
  })

  it('heures de contrat des titulaires très sous les besoins', () => {
    const r = propre()
    for (const s of r.salaries) s.heures_hebdo = 30
    const p = seul(r)
    expect(p).toMatchObject({
      id: 'heures:1',
      ecran: 'besoins',
      lien: { page: '/planning/besoins', cible: 'poste-1' },
    })
    expect(p.texte).toContain('112 h')
    expect(p.texte).toContain('90 h')
    expect(p.texte).toContain('22 h')
  })

  it('écart sous 10 % : rien (seuil documenté)', () => {
    const r = propre()
    // 3 × 34 h = 102 h pour 112 h demandées : 10 h d'écart, moins de 11,2 h.
    for (const s of r.salaries) s.heures_hebdo = 34
    expect(verifierReglages(r)).toEqual([])
  })

  it('heures : un point global quand aucun poste ne l’est', () => {
    const r = propre()
    // Le Bar est tenu par les mêmes titulaires : par poste, la borne haute
    // passe ; sur l'hôtel, 117 h pour 168 h.
    r.postes.push(poste(2, 'Bar'))
    for (const s of r.salaries) {
      s.competences.push({ poste_id: 2, niveau: 'titulaire' })
    }
    for (let j = 0; j < 7; j++) r.besoins.push(besoin(2, j, hM))
    expect(seul(r)).toMatchObject({
      id: 'heures:total',
      lien: { page: '/planning/besoins' },
    })
  })

  it('poste qui compte dans la présence sans titulaire', () => {
    const r = propre()
    r.postes.push(poste(2, 'Club', { presence: true }))
    expect(seul(r)).toMatchObject({
      id: 'presence-sans-titulaire:2',
      ecran: 'equipe',
      lien: { page: '/planning/postes', cible: 'poste-2' },
    })
  })

  it('code sans période sur un poste qui compte dans la présence', () => {
    const r = propre()
    r.postes[0].horaires_autorises = [M, S, D]
    expect(seul(r)).toMatchObject({
      id: `periode:${D}`,
      ecran: 'horaires',
      lien: { page: '/planning/horaires', cible: `horaire-${D}` },
    })
  })

  it('code sans période demandé par un besoin du poste', () => {
    const r = propre()
    r.besoins.push(besoin(1, 4, HORAIRES[4], { effectif: 0, renfort: 1 }))
    expect(seul(r).id).toBe(`periode:${D}`)
  })

  it('soutien demandé où personne n’est apprenti ou stagiaire', () => {
    const r = propre()
    r.besoins[0] = { ...r.besoins[0], soutien: 1 }
    expect(seul(r)).toMatchObject({
      id: 'soutien:1',
      ecran: 'besoins',
      lien: { page: '/planning/besoins', cible: 'soutien-1' },
    })
    r.salaries.push(
      salarie(13, {
        type_contrat: 'apprenti',
        heures_hebdo: 35,
        competences: [{ poste_id: 1, niveau: 'soutien' }],
      }),
    )
    expect(verifierReglages(r)).toEqual([])
  })

  it('une fiche désactivée ou partie ne compte pas', () => {
    const r = propre()
    r.postes.push(poste(2, 'Club', { presence: true }))
    r.salaries.push(
      salarie(14, {
        actif: false,
        competences: [{ poste_id: 2, niveau: 'titulaire' }],
      }),
      salarie(15, {
        date_sortie: '2026-01-31',
        competences: [{ poste_id: 2, niveau: 'titulaire' }],
      }),
    )
    expect(ids(verifierReglages(r))).toEqual([])
    expect(ids(verifierReglages(r, { aujourdhui: '2026-03-01' }))).toEqual([
      'presence-sans-titulaire:2',
    ])
  })

  it('bloquants : aucun code, aucun poste', () => {
    const r: Referentiel = {
      ...propre(),
      horaires: [],
      postes: [],
      salaries: [],
      besoins: [],
      consignes: [],
    }
    const p = verifierReglages(r)
    expect(ids(p)).toEqual(['bloquant:horaires', 'bloquant:postes'])
    expect(p.every((x) => x.gravite === 'bloquant')).toBe(true)
    expect(aDesBloquants(p)).toBe(true)
  })

  it('bloquants : personne sur un poste, aucun besoin', () => {
    const r = propre()
    r.besoins = []
    r.consignes = []
    for (const s of r.salaries) s.competences = []
    r.postes[0].presence = false
    expect(ids(verifierReglages(r))).toEqual([
      'bloquant:equipe',
      'bloquant:besoins',
    ])
  })

  it('un besoin à zéro personne nécessaire ne suffit pas', () => {
    const r = propre()
    r.besoins = r.besoins.map((b) => ({ ...b, effectif: 0, renfort: 1 }))
    r.consignes = []
    expect(ids(verifierReglages(r))).toEqual(['bloquant:besoins'])
  })

  it('besoins tous écartés : bloquant distinct de « aucun besoin »', () => {
    const r = propre()
    r.postes[0].horaires_autorises = [J]
    r.consignes = []
    const p = verifierReglages(r)
    expect(ids(p)).toContain('bloquant:besoins-ignores')
    expect(ids(p)).not.toContain('bloquant:besoins')
    const b = p.find((x) => x.id === 'bloquant:besoins-ignores')!
    expect(b).toMatchObject({
      gravite: 'bloquant',
      lien: { page: '/planning/besoins' },
    })
    expect(b.texte).toContain(
      'Les 14 besoins sont ignorés : leurs horaires ne sont plus prévus pour leur poste.',
    )
  })

  it('un seul besoin, écarté : phrase au singulier', () => {
    const r = propre()
    r.besoins = [besoin(1, 0, hS)]
    r.postes[0].horaires_autorises = [M]
    r.consignes = []
    const b = verifierReglages(r).find((x) => x.gravite === 'bloquant')!
    expect(b.id).toBe('bloquant:besoins-ignores')
    expect(b.texte).toMatch(/^Le seul besoin est ignoré : son horaire/)
  })

  it('besoin que personne ne peut tenir : fiches toutes restreintes', () => {
    const r = propre()
    for (const s of r.salaries) s.shifts_autorises = [M]
    const p = seul(r)
    expect(p).toMatchObject({
      id: `besoin-sans-personne:1:${S}`,
      gravite: 'a-voir',
      ecran: 'equipe',
      lien: { page: '/planning/equipe' },
    })
    expect(p.texte).toContain("l'horaire S")
    expect(p.texte).toContain('lundi, mardi')
  })

  it('une seule personne garde le code : aucun point', () => {
    const r = propre()
    r.salaries[0].shifts_autorises = [M]
    r.salaries[1].shifts_autorises = [M]
    expect(verifierReglages(r)).toEqual([])
  })

  it('besoin que personne ne peut tenir : repos fixe de tous ce jour-là', () => {
    const r = propre()
    for (const s of r.salaries) s.semaine_type[6] = { mode: 'repos' }
    expect(ids(verifierReglages(r))).toEqual([
      `besoin-sans-personne:1:${M}`,
      `besoin-sans-personne:1:${S}`,
    ])
  })

  it('besoin sans code face à une fiche restreinte, seule personne : sa fiche', () => {
    const r = propre()
    r.postes.push(poste(2, 'Bar'))
    r.salaries.push(
      salarie(13, {
        heures_hebdo: 35,
        competences: [{ poste_id: 2, niveau: 'titulaire' }],
        shifts_autorises: [M],
      }),
    )
    r.besoins.push(besoin(2, 2, null, { debut: '10:00', fin: '14:00' }))
    expect(seul(r)).toMatchObject({
      id: 'besoin-sans-personne:2:10:00-14:00',
      lien: { page: '/planning/equipe', cible: 'salarie-13' },
    })
    r.salaries[3].shifts_autorises = []
    expect(verifierReglages(r)).toEqual([])
  })

  it('aucun code horaire : pas de point « aucun horaire utilisable »', () => {
    const r = propre()
    r.horaires = []
    r.besoins = []
    r.consignes = []
    r.postes[0].presence = false
    r.salaries[0].shifts_autorises = [M]
    expect(ids(verifierReglages(r))).toEqual([
      'bloquant:horaires',
      'bloquant:besoins',
    ])
  })

  it('heures : un extra, un forfait jours ou un contrat à 0 h ne font pas juger le poste', () => {
    for (const retouche of [
      (s: Salarie) => (s.type_contrat = 'extra'),
      (s: Salarie) => (s.forfait_jours = true),
      (s: Salarie) => (s.heures_hebdo = 0),
    ]) {
      const r = propre()
      for (const s of r.salaries) s.heures_hebdo = 30
      expect(ids(verifierReglages(r))).toEqual(['heures:1'])
      retouche(r.salaries[0])
      expect(ids(verifierReglages(r))).toEqual([])
    }
  })

  it('personne sans aucun poste, code fixé : un seul point qui le dit', () => {
    const r = propre()
    const st = SEMAINE_TYPE_VIDE.map((e) => ({ ...e }))
    st[0] = { mode: 'travail', type_shift_id: M }
    st[2] = { mode: 'auto', type_shift_id: S }
    r.salaries.push(salarie(13, { competences: [], semaine_type: st }))
    const p = seul(r)
    expect(p).toMatchObject({
      id: 'sans-poste-code-fixe:13',
      lien: { page: '/planning/equipe', cible: 'salarie-13' },
    })
    expect(p.texte).toContain("n'a aucun poste")
    expect(p.texte).toContain('lundi et mercredi')
  })

  it('ids stables et uniques sur un hôtel complet', () => {
    const { referentiel } = hotelReel()
    const a = verifierReglages(referentiel)
    const b = verifierReglages(structuredClone(referentiel))
    expect(ids(a)).toEqual(ids(b))
    expect(new Set(ids(a)).size).toBe(a.length)
    for (const p of a) {
      expect(p.texte).not.toMatch(/R-|«|»|—/)
    }
  })
})

describe('grouperPoints', () => {
  it("groupe par écran dans l'ordre de réglage, bloquants en tête", () => {
    const r = propre()
    r.besoins = []
    r.consignes = []
    r.postes[0].horaires_autorises = [M, S, D]
    r.salaries[0].shifts_autorises = [N]
    const g = grouperPoints(verifierReglages(r))
    expect(g.map((x) => x.ecran)).toEqual(['besoins', 'horaires', 'equipe'])
    expect(g[0].bloquants).toBe(1)
    expect(g[2].points.map((p) => p.id)).toEqual(['codes-morts:10'])
  })
})

describe('listeJours', () => {
  it('écrit les jours en clair', () => {
    expect(listeJours([])).toBe('')
    expect(listeJours([2])).toBe('mercredi')
    expect(listeJours([1, 0, 1])).toBe('lundi et mardi')
    expect(listeJours([4, 0, 2])).toBe('lundi, mercredi et vendredi')
  })
})
