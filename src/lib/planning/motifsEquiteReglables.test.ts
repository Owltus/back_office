import highsLoader from 'highs'
import { beforeAll, describe, expect, it } from 'vitest'

import {
  feriesARattraper,
  feriesEntre,
  ferieDe,
  estJfr,
  joursFeries,
  motifReposDefaut,
} from '#/lib/planning/feries.ts'
import { generer } from '#/lib/planning/generateur.ts'
import type { Highs } from '#/lib/planning/generateur.ts'
import {
  creneau as creneauModele,
  probleme,
  salarieSolveur,
} from '#/lib/planning/modele.ts'
import type {
  Creneau,
  Probleme,
  Resultat,
  SalarieSolveur,
} from '#/lib/planning/modele.ts'
import {
  estJourWeekend,
  jourVeilleWeekend,
  lireRegles,
  REGLES_PAR_DEFAUT,
} from '#/lib/planning/reglesEtablissement.ts'
import type { RegleEtablissement } from '#/lib/planning/reglesEtablissement.ts'
import { absenceLibre, weekendLibreAvantDe } from '#/lib/planning/semaine.ts'
import { MINUTES_PAR_JOUR } from '#/lib/planning/temps.ts'
import type { Affectation, Motif, Salarie } from '#/lib/planning/types.ts'
import { violations } from '#/lib/planning/verificateur.ts'

/*
 * Lot 1b du plan `planning-moteur-configurable-2026-11-05` (2026-11-06,
 * « qu'aucun paramètre ne soit en dur ») : les motifs se lisent par leurs
 * cases et leur rôle, jamais par leur code ; le week-end et le partage sont
 * des règles de l'établissement, lues par le générateur ET le vérificateur ;
 * les jours fériés ajoutés sont des jours fériés comme les autres.
 */

const H = 60
let highs: Highs
beforeAll(async () => {
  highs = (await highsLoader()) as unknown as Highs
})

const motif = (m: Partial<Motif>): Motif => ({
  id: 1,
  code: 'ZZ',
  nom: 'Motif',
  couleur: '#000000',
  decompte: true,
  nature: 'absence',
  ...m,
})

describe('motifs : la case et le rôle, jamais le code', () => {
  it('un congé payé renommé « CA » garde son rôle : il laisse le week-end libre', () => {
    const ca = motif({ code: 'CA', nom: 'Congés annuels', libre_weekend: true })
    expect(absenceLibre(ca)).toBe(true)
    // Le code CP sans la case ne libère rien : seule la case compte.
    expect(absenceLibre(motif({ code: 'CP', libre_weekend: false }))).toBe(
      false,
    )
    // Jamais l'école, même cochée par erreur.
    expect(absenceLibre(motif({ nature: 'ecole', libre_weekend: true }))).toBe(
      false,
    )
  })

  it('le week-end avec un « CA » est un week-end libre (règle 4)', () => {
    const ca = motif({ id: 9, code: 'CA', libre_weekend: true })
    const ma = motif({ id: 10, code: 'MA', libre_weekend: false })
    const x = {
      id: 1,
      semaine_type: Array.from({ length: 7 }, () => ({ mode: 'auto' })),
      date_entree: null,
      date_sortie: null,
    } as unknown as Salarie
    const lundi = '2026-11-16'
    // Une semaine d'avant faite (un shift d'un autre), samedi et dimanche
    // absents avec le motif donné.
    const autre = { salarie_id: 2, lundi: '2026-11-09', jour: 0 } as Affectation
    const avec = (m: Motif) =>
      weekendLibreAvantDe(
        x,
        lundi,
        {
          absences: new Map([
            [
              1,
              new Map([
                ['2026-11-14', m.id],
                ['2026-11-15', m.id],
              ]),
            ],
          ]),
          ecole: new Set(),
        },
        (k) => (k === 1 ? [autre] : []),
        new Map([
          [ca.id, ca],
          [ma.id, ma],
        ]),
        () => false,
        1,
      )
    expect(avec(ca)).toBe(true)
    expect(avec(ma)).toBe(false)
  })

  it('le jour férié rattrapé et le repos du planning : leur rôle', () => {
    expect(estJfr(motif({ code: 'QQ', role: 'ferie_rattrape' }))).toBe(true)
    expect(estJfr(motif({ code: 'JFR', role: null }))).toBe(false)
    const motifs = [
      motif({ id: 3, nature: 'repos', code: 'R' }),
      motif({ id: 5, nature: 'repos', code: 'RX', role: 'repos_defaut' }),
    ]
    expect(motifReposDefaut(motifs)?.id).toBe(5)
    // Sans rôle : le premier repos, comme la base.
    expect(motifReposDefaut([motifs[0]])?.id).toBe(3)
  })
})

// ------------------------------------------------------------- week-end

function cr(id: string, jour: number, debutH: number, finH: number): Creneau {
  return creneauModele({
    id,
    poste: 'r',
    debut: jour * MINUTES_PAR_JOUR + debutH * H,
    fin: jour * MINUTES_PAR_JOUR + finH * H,
  })
}

function personne(
  id: string,
  contratH: number,
  kw: Partial<SalarieSolveur> = {},
): SalarieSolveur {
  return salarieSolveur({
    id,
    postes: new Set(['r']),
    minutesHebdoContrat: contratH * H,
    minutesHebdoMax: 48 * H,
    minutesJourMax: 12 * H,
    joursTravaillesMaxSemaine: 6,
    joursPreferesSemaine: 5,
    reposQuotidienMin: 11 * H,
    ...kw,
  })
}

const VENDREDI_SAMEDI: RegleEtablissement = {
  ...REGLES_PAR_DEFAUT,
  equite: { ...REGLES_PAR_DEFAUT.equite, weekendJours: [4, 5] },
}
const de = (r: Resultat, id: string) =>
  r.affectations
    .filter((a) => a.salarieId === id)
    .map((a) => a.creneauId)
    .sort()
const alertes = (p: Probleme, affs: Resultat['affectations'], regle: string) =>
  violations(p, affs).filter((v) => v.regle === regle)

describe('week-end réglé au vendredi et samedi', () => {
  it('lu des règles : jours, veille, défauts de l’hôtel', () => {
    expect(REGLES_PAR_DEFAUT.equite.weekendJours).toEqual([5, 6])
    expect(jourVeilleWeekend(REGLES_PAR_DEFAUT)).toBe(4)
    expect(jourVeilleWeekend(VENDREDI_SAMEDI)).toBe(3)
    expect(estJourWeekend(VENDREDI_SAMEDI, 4)).toBe(true)
    expect(estJourWeekend(VENDREDI_SAMEDI, 6)).toBe(false)
    expect(estJourWeekend(VENDREDI_SAMEDI, 11)).toBe(true)
    const r = lireRegles({
      reglages: {
        releve_minutes: 30,
        weekend_jours: [5, 4],
        weekend_nuit_veille: false,
        equite_criteres: ['nuits'],
        equite_semaines: 6,
      },
    })
    expect(r.equite).toEqual({
      weekendJours: [4, 5],
      nuitVeille: false,
      criteres: ['nuits'],
      semaines: 6,
    })
    expect(jourVeilleWeekend(r)).toBeNull()
  })

  // Règle 4 : qui n'a pas eu de week-end libre ne travaille pas celui-ci.
  // a (une place, sans week-end libre depuis 3 semaines, jamais le lundi)
  // choisit entre le vendredi et le dimanche ; b prend les deux autres.
  const places = [cr('lun', 0, 9, 17), cr('ven', 4, 9, 17), cr('dim', 6, 9, 17)]
  const pb = (regles: RegleEtablissement, graine: number) =>
    probleme({
      salaries: [
        personne('a', 8, {
          weekendLibreAvant: false,
          indisponibilites: new Set([0]),
        }),
        personne('b', 16, { weekendLibreAvant: true }),
      ],
      creneaux: places,
      graine,
      regles,
    })

  it('générateur : le vendredi devient un jour du week-end à libérer', () => {
    for (const graine of [0, 1, 7]) {
      // Aux défauts, le dimanche est le week-end : a prend le vendredi.
      const hotel = generer(pb(REGLES_PAR_DEFAUT, graine), highs)
      expect(hotel.manques).toEqual([])
      expect(de(hotel, 'a')).toEqual(['ven'])
      // Vendredi et samedi : le vendredi est le week-end, a prend dimanche.
      const r = generer(pb(VENDREDI_SAMEDI, graine), highs)
      expect(r.manques).toEqual([])
      expect(de(r, 'a')).toEqual(['dim'])
    }
  })

  it('vérificateur : un vendredi travaillé est un week-end travaillé', () => {
    const affs = [
      { salarieId: 'a', creneauId: 'ven' },
      { salarieId: 'b', creneauId: 'lun' },
      { salarieId: 'b', creneauId: 'dim' },
    ]
    expect(alertes(pb(REGLES_PAR_DEFAUT, 0), affs, 'WEEKEND-LIBRE')).toEqual([])
    expect(
      alertes(pb(VENDREDI_SAMEDI, 0), affs, 'WEEKEND-LIBRE').map(
        (v) => v.message,
      ),
    ).toEqual(['aucun week-end complet libre depuis 4 semaines'])
  })

  it('partage : le week-end va à qui en a fait le moins, sur les jours réglés', () => {
    // a a déjà fait 3 week-ends, b aucun ; une place le vendredi, une le
    // dimanche, une chacun.
    const partage = (regles: RegleEtablissement) =>
      generer(
        probleme({
          salaries: [
            personne('a', 8, {
              groupeEquite: 'g',
              equiteAvant: { weekends: 3, soirs: 0, matinsTot: 0 },
            }),
            personne('b', 8, {
              groupeEquite: 'g',
              equiteAvant: { weekends: 0, soirs: 0, matinsTot: 0 },
            }),
          ],
          creneaux: [cr('ven', 4, 9, 17), cr('dim', 6, 9, 17)],
          graine: 1,
          regles,
        }),
        highs,
      )
    // Aux défauts : le dimanche est le week-end, il va à b.
    expect(de(partage(REGLES_PAR_DEFAUT), 'b')).toEqual(['dim'])
    // Vendredi et samedi : le vendredi est le week-end, il va à b.
    expect(de(partage(VENDREDI_SAMEDI), 'b')).toEqual(['ven'])
    // Partage des week-ends décoché : plus de préférence de partage.
    const sans: RegleEtablissement = {
      ...REGLES_PAR_DEFAUT,
      equite: { ...REGLES_PAR_DEFAUT.equite, criteres: ['soirs'] },
    }
    expect(partage(sans).manques).toEqual([])
  })
})

// --------------------------------------------------- jours fériés en plus

describe('un jour férié ajouté est traité comme les autres', () => {
  const fete = {
    id: 1,
    jour: '2026-06-24',
    nom: 'Fête locale',
    recurrent: true,
  }
  const unique = {
    id: 2,
    jour: '2027-03-02',
    nom: 'Jour chômé',
    recurrent: false,
  }

  it('dans la liste de l’année, chaque année s’il est récurrent', () => {
    expect(joursFeries(2026, [fete]).map((f) => f.date)).toContain('2026-06-24')
    expect(joursFeries(2030, [fete]).map((f) => f.date)).toContain('2030-06-24')
    expect(joursFeries(2026, [unique]).map((f) => f.date)).not.toContain(
      '2026-03-02',
    )
    expect(ferieDe('2027-03-02', [unique])).toBe('Jour chômé')
    expect(ferieDe('2027-03-02')).toBeNull()
    expect(joursFeries(2026, [fete])).toHaveLength(12)
    // Une date déjà fériée garde son nom légal.
    expect(
      ferieDe('2026-07-14', [
        { jour: '2026-07-14', nom: 'Doublon', recurrent: true },
      ]),
    ).toBe('Fête nationale')
    expect(
      feriesEntre('2026-06-01', '2026-06-30', [fete]).map((f) => f.nom),
    ).toEqual(['Fête locale'])
  })

  it('travaillé, il ouvre un jour férié rattrapé (comme le 11 novembre)', () => {
    const regles: RegleEtablissement = {
      ...REGLES_PAR_DEFAUT,
      feries: { ...REGLES_PAR_DEFAUT.feries, ajoutes: [fete] },
    }
    const x = { type_contrat: 'cdi', date_entree: '2020-01-01' }
    const args = {
      salarie: x,
      du: '2026-06-22',
      au: '2026-06-28',
      travailles: new Set(['2026-06-24']),
      jfrPoses: [],
    }
    expect(feriesARattraper({ ...args, regles }).map((f) => f.nom)).toEqual([
      'Fête locale',
    ])
    expect(feriesARattraper(args)).toEqual([])
  })
})
