import { describe, expect, it } from 'vitest'

import { momentPropose } from '#/lib/planning/moment.ts'
import { periodeLibre } from '#/lib/planning/presence.ts'
import {
  CHANGEMENTS_MOMENT_MAX,
  CONGE_LONG,
  CONTRAT_35H,
  CONTRAT_39H,
  ECOLE_LENDEMAIN_DEBUT,
  ECOLE_VEILLE_FIN,
  EQUIPE_TOLERANCE,
  JOURNEE_COURTE,
  JOURNEE_ETOILE_MIN,
  JOURNEE_PLEINE,
  JOURNEES_COURTES_MAX,
  JOURS_AFFILES_CONSEILLES,
  JOURS_AFFILES_MAX,
  MOMENT_ARRIERE_JOURS,
  NUITS_AFFILEES_MAX,
  RELEVE_MINUTES,
  REPOS_APRES_NUITS,
  REPOS_CONFORT,
  RYTHME_CONTRAT_MIN,
  SEMAINES_EN_PLUS_ALERTE,
} from '#/lib/planning/regles.ts'
import {
  journeesDuContrat,
  joursDuContrat,
  lireRegles,
  modeleDe,
  REGLES_PAR_DEFAUT,
} from '#/lib/planning/reglesEtablissement.ts'
import type { ModeleContrat, Reglages } from '#/lib/planning/types.ts'

const H = 60

describe('REGLES_PAR_DEFAUT : l’hôtel d’aujourd’hui, chiffre pour chiffre', () => {
  // Valeurs écrites EN DUR : celles des constantes avant l'étape 2. Un
  // défaut changé doit faire échouer ce test.
  it.each([
    ['JOURS_AFFILES_MAX', JOURS_AFFILES_MAX, 6],
    ['JOURS_AFFILES_CONSEILLES', JOURS_AFFILES_CONSEILLES, 5],
    ['RYTHME_CONTRAT_MIN', RYTHME_CONTRAT_MIN, 35 * H],
    ['REPOS_CONFORT', REPOS_CONFORT, 12 * H],
    ['EQUIPE_TOLERANCE', EQUIPE_TOLERANCE, 30],
    ['RELEVE_MINUTES', RELEVE_MINUTES, 30],
    ['CHANGEMENTS_MOMENT_MAX', CHANGEMENTS_MOMENT_MAX, 1],
    ['MOMENT_ARRIERE_JOURS', MOMENT_ARRIERE_JOURS, 2],
    ['NUITS_AFFILEES_MAX', NUITS_AFFILEES_MAX, 5],
    ['REPOS_APRES_NUITS', REPOS_APRES_NUITS, 2],
    ['CONGE_LONG', CONGE_LONG, 5],
    ['ECOLE_VEILLE_FIN', ECOLE_VEILLE_FIN, 21 * H],
    ['ECOLE_LENDEMAIN_DEBUT', ECOLE_LENDEMAIN_DEBUT, 8 * H],
    ['SEMAINES_EN_PLUS_ALERTE', SEMAINES_EN_PLUS_ALERTE, 3],
    ['JOURNEE_PLEINE', JOURNEE_PLEINE, 8 * H],
    ['JOURNEES_COURTES_MAX', JOURNEES_COURTES_MAX, 1],
    ['JOURNEE_ETOILE_MIN', JOURNEE_ETOILE_MIN, 7 * H],
    ['JOURNEE_COURTE', JOURNEE_COURTE, 7 * H],
    ['CONTRAT_35H', CONTRAT_35H, 35 * H],
    ['CONTRAT_39H', CONTRAT_39H, 39 * H],
  ])('%s', (_nom, valeur, attendu) => {
    expect(valeur).toBe(attendu)
  })

  it('règles sans constante jusqu’ici', () => {
    const r = REGLES_PAR_DEFAUT
    expect(r.repos.deuxReposDeSuite).toBe('obligatoire')
    expect(r.repos.jourIsole).toBe('interdit')
    // Passation entre les équipes fixe (2026-11-06) : plus dans les règles.
    expect(r.passations).toEqual({ dureeOuverture: 60 })
    expect(r.zones).toEqual([{ id: '1', nom: 'Accueil', continue: true }])
    expect(r.accueil.personnesNuit).toBe(1)
    expect(r.contrats.journees).toEqual([
      { minutesHebdo: 35 * H, durees: [7 * H], courtesMax: 0 },
      { minutesHebdo: 39 * H, durees: [8 * H, 7 * H], courtesMax: 1 },
    ])
  })

  it('limites des moments : celles de momentPropose et periodeLibre', () => {
    // Les moments de l'hôtel (2026-11-06 : une liste, mêmes limites).
    const lim = Object.fromEntries(
      REGLES_PAR_DEFAUT.moments.liste.map((x) => [
        x.id,
        [x.debut_de, x.debut_a, x.fin_de, x.fin_a, x.toutes, x.libre_avant],
      ]),
    )
    expect(lim).toEqual({
      nuit: [21 * H, 5 * H, null, null, false, null],
      soir: [15 * H, null, 21 * H, null, false, null],
      matin: [null, 9 * H, null, 17 * H + 45, true, 12 * H + 30],
      middle: [null, null, null, null, true, null],
    })
    const m = (debut: string, fin: string) =>
      momentPropose({ debut, fin, pause: 0 })
    expect(m('21:00', '07:00')).toBe('nuit')
    expect(m('20:59', '23:00')).toBe('soir')
    expect(m('04:59', '12:00')).toBe('nuit')
    expect(m('05:00', '12:00')).toBe('matin')
    expect(m('08:59', '17:45')).toBe('matin')
    expect(m('08:59', '17:46')).toBe('middle')
    expect(m('09:00', '16:00')).toBe('middle')
    expect(m('15:00', '20:00')).toBe('soir')
    // Une seule limite de nuit pour un horaire et un horaire libre.
    expect(periodeLibre('20:59')).toBe('soir')
    expect(periodeLibre('21:00')).toBe('nuit')
    expect(periodeLibre('04:59')).toBe('nuit')
    expect(periodeLibre('05:00')).toBe('matin')
    expect(periodeLibre('12:29')).toBe('matin')
    expect(periodeLibre('12:30')).toBe('soir')
  })
})

describe('lireRegles', () => {
  it('sans référentiel ni réglages : les défauts', () => {
    expect(lireRegles()).toEqual(REGLES_PAR_DEFAUT)
    expect(lireRegles(null)).toEqual(REGLES_PAR_DEFAUT)
    expect(lireRegles({})).toEqual(REGLES_PAR_DEFAUT)
  })

  it('passation fixe (2026-11-06) : ses colonnes de la base ne sont plus lues', () => {
    // Des valeurs que la base garde encore : sans effet.
    const reglages = {
      releve_minutes: 0,
      continuite_obligatoire: false,
      passation_veilleur: false,
      equipe_tolerance: 60,
    } as Reglages
    expect(lireRegles({ reglages })).toEqual(REGLES_PAR_DEFAUT)
    const zones = [
      {
        id: 1,
        nom: 'Accueil',
        ordre: 0,
        continue: true,
        releve_minutes: 0,
        passation_nuit: false,
        equipe_tolerance: 60,
      },
    ]
    expect(lireRegles({ zones }).zones).toEqual([
      { id: '1', nom: 'Accueil', continue: true },
    ])
  })

  it('les défauts de la base (migration 20261105100000) = REGLES_PAR_DEFAUT', () => {
    // Recopiés À LA MAIN de la migration : un défaut changé d'un seul côté
    // fait échouer ce test.
    // La passation entre les équipes (relève, continuité, nuit, tolérance)
    // n'est plus lue depuis le 2026-11-06 : ses colonnes sont absentes.
    const reglages: Reglages = {
      deux_repos_de_suite: 'obligatoire',
      jours_affiles_max: 6,
      jours_affiles_conseilles: 5,
      jour_isole: 'interdit',
      rythme_contrat_min: 2100,
      repos_confort: 720,
      changements_moment_max: 1,
      moment_arriere_jours: 2,
      nuits_affilees_max: 5,
      repos_apres_nuits: 2,
      duree_ouverture: 60,
      personnes_nuit: 1,
      ecole_veille_fin: 1260,
      ecole_lendemain_debut: 480,
      conge_long: 5,
      semaines_en_plus_alerte: 3,
      journees_contrats: [
        { minutes_hebdo: 2100, durees: [420], courtes_max: 0 },
        { minutes_hebdo: 2340, durees: [480, 420], courtes_max: 1 },
      ],
      journee_pleine: 480,
      journee_courte: 420,
      journee_etoile_min: 420,
      journees_courtes_max: 1,
    }
    const ligne = (
      type_contrat: ModeleContrat['type_contrat'],
      v: [boolean, boolean, boolean, boolean, boolean, boolean, boolean],
    ): ModeleContrat => ({
      type_contrat,
      journees_imposees: v[0],
      journee_etoile: v[1],
      placement_manuel: v[2],
      contrat_indicatif: v[3],
      ferie_rattrape: v[4],
      feries_jour_meme: v[5],
      alternance: v[6],
    })
    const modelesContrat = [
      ligne('cdi', [true, true, false, false, true, false, false]),
      ligne('cdd', [true, true, false, false, true, false, false]),
      ligne('extra', [false, false, true, true, false, false, false]),
      ligne('stagiaire', [true, true, false, false, false, true, true]),
      ligne('apprenti', [true, true, false, false, true, false, true]),
    ]
    expect(lireRegles({ reglages, modelesContrat })).toEqual(REGLES_PAR_DEFAUT)
  })

  it('une règle réglée en base est lue, les autres gardent leur défaut', () => {
    const r = lireRegles({
      reglages: { personnes_nuit: 2, jour_isole: 'aucune' },
      modelesContrat: [
        {
          type_contrat: 'cdd',
          journees_imposees: false,
          journee_etoile: true,
          placement_manuel: true,
          contrat_indicatif: false,
          ferie_rattrape: true,
          feries_jour_meme: false,
          alternance: false,
        },
      ],
    })
    expect(r.accueil.personnesNuit).toBe(2)
    expect(r.repos.jourIsole).toBe('aucune')
    expect(r.repos.joursAffilesMax).toBe(6)
    expect(r.modeles.cdd.placementManuel).toBe(true)
    // La base porte LA liste : le CDI n'y est pas, `modeleDe` reprend son
    // défaut (une fiche n'en a jamais : clé étrangère).
    expect(Object.keys(r.modeles)).toEqual(['cdd'])
    expect(modeleDe(r, 'cdi')).toEqual(REGLES_PAR_DEFAUT.modeles.cdi)
    expect(REGLES_PAR_DEFAUT.modeles.cdd.placementManuel).toBe(false)
  })

  it('modèles par défaut : le comportement codé aujourd’hui', () => {
    const m = REGLES_PAR_DEFAUT.modeles
    expect(m.extra.placementManuel).toBe(true)
    expect(m.extra.contratIndicatif).toBe(true)
    expect(m.extra.ferieRattrape).toBe(false)
    expect(m.stagiaire.ferieRattrape).toBe(false)
    expect(m.stagiaire.feriesJourMeme).toBe(true)
    expect(m.apprenti.alternance && m.stagiaire.alternance).toBe(true)
    expect(m.cdi.ferieRattrape && m.cdd.ferieRattrape).toBe(true)
  })

  it('ne modifie jamais les défauts', () => {
    lireRegles({ reglages: { duree_ouverture: 45 } })
    expect(REGLES_PAR_DEFAUT.passations.dureeOuverture).toBe(60)
  })
})

describe('règles déduites', () => {
  it('jours d’un contrat = ses heures ÷ ses journées', () => {
    expect(joursDuContrat(REGLES_PAR_DEFAUT, 35 * H)).toBe(5)
    expect(joursDuContrat(REGLES_PAR_DEFAUT, 39 * H)).toBe(5)
    expect(joursDuContrat(REGLES_PAR_DEFAUT, 24 * H)).toBeNull()
    expect(journeesDuContrat(REGLES_PAR_DEFAUT, 39 * H)?.courtesMax).toBe(1)
  })
})
