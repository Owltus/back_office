import { describe, expect, it } from 'vitest'

import { DUREE_OUVERTURE } from '#/lib/planning/semaine.ts'
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
  REPOS_APRES_NUITS,
  REPOS_CONFORT,
  RYTHME_CONTRAT_MIN,
  SEMAINES_EN_PLUS_ALERTE,
} from '#/lib/planning/regles.ts'
import {
  journeesDuContrat,
  joursDuContrat,
  lireRegles,
  passationVeilleurActive,
  REGLES_PAR_DEFAUT,
} from '#/lib/planning/reglesEtablissement.ts'

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
    ['DUREE_OUVERTURE', DUREE_OUVERTURE, 60],
  ])('%s', (_nom, valeur, attendu) => {
    expect(valeur).toBe(attendu)
  })

  it('règles sans constante jusqu’ici', () => {
    const r = REGLES_PAR_DEFAUT
    expect(r.repos.deuxReposDeSuite).toBe('obligatoire')
    expect(r.repos.jourIsole).toBe('interdit')
    expect(r.passations.releveMinutes).toBe(30)
    expect(r.passations.passationVeilleur).toBe(true)
    expect(r.passations.continuiteObligatoire).toBe(false)
    expect(r.accueil.personnesNuit).toBe(1)
    expect(r.contrats.journees).toEqual([
      { minutesHebdo: 35 * H, durees: [7 * H], courtesMax: 0 },
      { minutesHebdo: 39 * H, durees: [8 * H, 7 * H], courtesMax: 1 },
    ])
  })

  it('limites des moments : celles de momentPropose et periodeLibre', () => {
    expect(REGLES_PAR_DEFAUT.moments).toEqual({
      nuitDebut: 21 * H,
      nuitFin: 5 * H,
      soirFin: 21 * H,
      soirDebut: 15 * H,
      matinDebutAvant: 9 * H,
      matinFinMax: 17 * H + 45,
      libreMatinAvant: 12 * H + 30,
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

  it('relève lue dans les réglages, 0 compris', () => {
    expect(
      lireRegles({ reglages: { releve_minutes: 45 } }).passations.releveMinutes,
    ).toBe(45)
    expect(
      lireRegles({ reglages: { releve_minutes: 0 } }).passations.releveMinutes,
    ).toBe(0)
  })

  it('ne modifie jamais les défauts', () => {
    lireRegles({ reglages: { releve_minutes: 45 } })
    expect(REGLES_PAR_DEFAUT.passations.releveMinutes).toBe(30)
  })
})

describe('règles déduites', () => {
  it('jours d’un contrat = ses heures ÷ ses journées', () => {
    expect(joursDuContrat(REGLES_PAR_DEFAUT, 35 * H)).toBe(5)
    expect(joursDuContrat(REGLES_PAR_DEFAUT, 39 * H)).toBe(5)
    expect(joursDuContrat(REGLES_PAR_DEFAUT, 24 * H)).toBeNull()
    expect(journeesDuContrat(REGLES_PAR_DEFAUT, 39 * H)?.courtesMax).toBe(1)
  })

  it('passation avec le veilleur seulement si un poste tient la nuit', () => {
    expect(passationVeilleurActive(REGLES_PAR_DEFAUT, true)).toBe(true)
    expect(passationVeilleurActive(REGLES_PAR_DEFAUT, false)).toBe(false)
    const sans = {
      ...REGLES_PAR_DEFAUT,
      passations: { ...REGLES_PAR_DEFAUT.passations, passationVeilleur: false },
    }
    expect(passationVeilleurActive(sans, true)).toBe(false)
  })
})
