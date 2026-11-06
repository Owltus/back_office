import { describe, expect, it } from 'vitest'

import { etoileDeLaCase } from '#/components/planning/codesCase.ts'
import { verifierReglages } from '#/lib/planning/coherence.ts'
import { rubriqueEtoile } from '#/lib/planning/eligibilite.ts'
import { sommeBesoinsPresence } from '#/lib/planning/presence.ts'
import { versSolveur } from '#/lib/planning/regles.ts'
import type { Fiche } from '#/lib/planning/regles.ts'
import {
  lireRegles,
  REGLES_PAR_DEFAUT,
} from '#/lib/planning/reglesEtablissement.ts'
import type { RegleEtablissement } from '#/lib/planning/reglesEtablissement.ts'
import { lusAvec } from '#/lib/planning/test/momentsTest.ts'
import { SEMAINE_TYPE_VIDE } from '#/lib/planning/types.ts'
import type {
  Besoin,
  Horaire,
  ModeleContrat,
  Poste,
  Referentiel,
  Salarie,
} from '#/lib/planning/types.ts'

/*
 * Relecture adverse du chantier « règles de l'établissement » (2026-11-05).
 * Chaque test reproduit un défaut trouvé, puis fige son correctif.
 */

const H = 60

function horaire(
  id: number,
  debut: string,
  fin: string,
  periode: Horaire['periode'],
  pause = 45,
): Horaire {
  return {
    id,
    nom: `${debut}-${fin}`,
    debut,
    fin,
    couleur: '#888',
    pause,
    periode,
  }
}

function poste(id: number, kw: Partial<Poste> = {}): Poste {
  return {
    id,
    nom: `Poste ${id}`,
    jour_max_minutes: 720,
    couleur: '#000',
    horaires_autorises: [],
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

const modele = (
  type_contrat: ModeleContrat['type_contrat'],
  kw: Partial<ModeleContrat> = {},
): ModeleContrat => ({
  type_contrat,
  journees_imposees: true,
  journee_etoile: true,
  placement_manuel: false,
  contrat_indicatif: false,
  ferie_rattrape: true,
  feries_jour_meme: false,
  alternance: false,
  ...kw,
})

describe('1. heures indicatives : la loi du temps partiel tient', () => {
  const fiche = (kw: Partial<Fiche> = {}): Fiche => ({
    id: 'x',
    postes: new Set(['1']),
    typeContrat: 'cdi',
    minutesHebdo: 24 * H,
    ...kw,
  })
  const indicatif = (type: ModeleContrat['type_contrat']) =>
    lireRegles({
      reglages: { releve_minutes: 30 },
      modelesContrat: [modele(type, { contrat_indicatif: true })],
    })

  it('un CDI de 24 h aux heures indicatives reste sous 32 h', () => {
    const s = versSolveur(fiche({ regles: indicatif('cdi') }))
    expect(s.minutesHebdoMax).toBe(32 * H)
  })

  it('un contrat posé à la main (l’extra) garde le plafond absolu de 48 h', () => {
    const s = versSolveur(
      fiche({
        typeContrat: 'extra',
        minutesHebdo: 0,
        regles: lireRegles({
          reglages: { releve_minutes: 30 },
          modelesContrat: [
            modele('extra', {
              contrat_indicatif: true,
              placement_manuel: true,
            }),
          ],
        }),
      }),
    )
    expect(s.minutesHebdoMax).toBe(48 * H)
  })
})

describe('2. menu de la journée étoile : il suit les règles', () => {
  const HUIT = horaire(1, '08:00', '16:45', 'matin')
  const SEPT = horaire(2, '09:00', '16:45', 'middle')
  const NEUF = horaire(3, '07:00', '16:45', 'matin')
  const horaires = [HUIT, SEPT, NEUF]
  const personne = salarie(1)
  const entree = (regles?: RegleEtablissement, horaireId = HUIT.id) => ({
    personne,
    poste: poste(1),
    jour: 0,
    horaires,
    horaireId,
    regles,
  })

  it('aux défauts : 09:00 est la journée étoile de 08:00', () => {
    expect(rubriqueEtoile(entree())?.versions.map((v) => v.horaire.id)).toEqual(
      [SEPT.id],
    )
  })

  it('journée étoile décochée pour le CDI : aucune rubrique', () => {
    const regles = lireRegles({
      reglages: { releve_minutes: 30 },
      modelesContrat: [modele('cdi', { journee_etoile: false })],
    })
    expect(rubriqueEtoile(entree(regles))).toBeNull()
  })

  it('journée pleine de 9 h : la version étoile se lit sur 07:00', () => {
    const regles: RegleEtablissement = {
      ...REGLES_PAR_DEFAUT,
      contrats: { ...REGLES_PAR_DEFAUT.contrats, journeePleine: 9 * H },
    }
    // 08:00 n'est plus une journée pleine : c'est la version étoile de 07:00.
    const huit = rubriqueEtoile(entree(regles))
    expect(huit?.versions).toEqual([])
    expect(huit?.normales.map((v) => v.horaire.id)).toEqual([NEUF.id])
    expect(
      rubriqueEtoile(entree(regles, NEUF.id))?.versions.map(
        (v) => v.horaire.id,
      ),
    ).toEqual([HUIT.id, SEPT.id])
  })

  it('la case du planning lit les règles du référentiel', () => {
    const referentiel = {
      horaires,
      postes: [poste(1)],
      motifs: [],
      reglages: { releve_minutes: 30 },
      modelesContrat: [modele('cdi', { journee_etoile: false })],
    }
    expect(
      etoileDeLaCase({
        referentiel,
        personne,
        posteId: 1,
        jour: 0,
        source: { semaine: undefined },
        horaireId: HUIT.id,
      }),
    ).toBeNull()
  })
})

const M = horaire(1, '07:00', '15:00', 'matin', 0)
const S = horaire(2, '15:00', '23:00', 'soir', 0)

function propre(): Referentiel {
  const besoins: Besoin[] = []
  let id = 100
  for (let j = 0; j < 7; j++)
    for (const h of [M, S])
      besoins.push({
        id: id++,
        poste_id: 1,
        jour: j,
        horaire_id: h.id,
        debut: h.debut,
        fin: h.fin,
        effectif: 1,
        soutien: 0,
        renfort: 0,
      })
  return {
    horaires: [M, S],
    motifs: [],
    postes: [poste(1)],
    groupes: [],
    salaries: [salarie(10), salarie(11), salarie(12)],
    besoins,
    consignes: [],
    verrous: [],
  } as unknown as Referentiel
}

const ids = (r: Referentiel) =>
  verifierReglages(r)
    .map((p) => p.id)
    .filter((x) => !x.startsWith('accueil-vide:'))

describe('4. jour seul interdit avec un seul jour d’affilée conseillé', () => {
  it('« À vérifier » le dit, vers les règles des contrats', () => {
    const r = propre()
    expect(ids(r)).toEqual([])
    r.reglages = {
      releve_minutes: 30,
      jours_affiles_conseilles: 1,
      jour_isole: 'interdit',
    }
    const p = verifierReglages(r).find((x) => x.id === 'jours-affiles-un-seul')
    expect(p).toMatchObject({
      gravite: 'bloquant',
      ecran: 'equipe',
      lien: { page: '/planning/equipe', cible: 'regles' },
    })
    r.reglages.jour_isole = 'a_eviter'
    expect(ids(r)).not.toContain('jours-affiles-un-seul')
  })
})

describe('6. contrôle des heures : les heures indicatives viennent du modèle', () => {
  it('un extra aux heures dues est jugé comme un titulaire', () => {
    const r = propre()
    for (const s of r.salaries) {
      s.type_contrat = 'extra'
      s.heures_hebdo = 30
    }
    // Aux défauts, un extra n'est pas jugé.
    expect(ids(r)).not.toContain('heures:1')
    r.modelesContrat = [modele('extra', { contrat_indicatif: false })]
    expect(ids(r)).toContain('heures:1')
  })

  it('somme des besoins par moment : les limites des moments réglées', () => {
    const besoins = [
      { poste_id: 1, jour: 0, horaire_id: null, debut: '14:00', effectif: 1 },
    ]
    const postes = new Map([[1, { presence: true }]])
    const aux = sommeBesoinsPresence(besoins, postes, new Map())
    expect([...aux.keys()]).toEqual(['0:soir'])
    const moments = lusAvec({ matin: { libre_avant: 15 * H } })
    const regle = sommeBesoinsPresence(
      besoins,
      postes,
      new Map(),
      undefined,
      moments,
    )
    expect([...regle.keys()]).toEqual(['0:matin'])
  })
})
