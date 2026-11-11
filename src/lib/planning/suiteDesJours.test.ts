import highsLoader from 'highs'
import { beforeAll, describe, expect, it } from 'vitest'

import {
  construire,
  generer,
  POIDS_DIMANCHE_SEUL,
  POIDS_JOUR_MANQUANT,
} from '#/lib/planning/generateur.ts'
import type { Highs } from '#/lib/planning/generateur.ts'
import {
  creneau as creneauModele,
  probleme,
  salarieSolveur,
} from '#/lib/planning/modele.ts'
import type {
  Creneau,
  Probleme,
  SalarieSolveur,
} from '#/lib/planning/modele.ts'
import { regimeRythme } from '#/lib/planning/regles.ts'
import {
  fautesRythme,
  genreMotif,
  motifsInterdits,
} from '#/lib/planning/rythmeStrict.ts'
import type { EtatRythme } from '#/lib/planning/rythmeStrict.ts'
import { MINUTES_PAR_JOUR } from '#/lib/planning/temps.ts'
import { SANS_RYTHME_STRICT } from '#/lib/planning/test/reglesTest.ts'

/*
 * UNE SEULE SUITE DES JOURS (chantier B du 2026-11-11) : au rythme 5 et 2,
 * le rythme dit tout de la suite des jours ; une règle du régime humain qui
 * paie un cas que le rythme paie déjà n'est pas écrite une seconde fois.
 * Données fictives.
 */

const H = 60
let highs: Highs
beforeAll(async () => {
  highs = (await highsLoader()) as unknown as Highs
})

const cr = (jour: number, kw: Partial<Creneau> = {}): Creneau =>
  creneauModele({
    id: `j${jour}`,
    poste: 'r',
    debut: jour * MINUTES_PAR_JOUR + 8 * H,
    fin: jour * MINUTES_PAR_JOUR + 15 * H,
    effectif: 1,
    ...kw,
  })

const personne = (kw: Partial<SalarieSolveur> = {}): SalarieSolveur =>
  salarieSolveur({
    id: 'a',
    postes: new Set(['r']),
    minutesHebdoContrat: 35 * H,
    minutesHebdoMax: 48 * H,
    minutesJourMax: 10 * H,
    joursTravaillesMaxSemaine: 6,
    joursPreferesSemaine: 5,
    reposQuotidienMin: 11 * H,
    journeesCalcul: new Set([7 * H]),
    ...kw,
  })

describe('le dimanche d’avant seul : payé une seule fois, par le rythme 5 et 2', () => {
  // Samedi d'avant libre, dimanche d'avant travaillé : sans le lundi, ce
  // dimanche resterait seul entre deux repos.
  const avant = {
    etatsAvant: 'TTTTrrT',
    joursSemainePrecedente: 5,
    serieAvant: 1,
  }
  it('le cas est le motif « r T r » du rythme, un bloc court au prix fort', () => {
    expect(regimeRythme(personne(avant))).toBe('strict')
    // Samedi d'avant, dimanche d'avant, lundi : un motif interdit du calcul.
    expect(motifsInterdits(21).map((m) => m.join(''))).toContain('rTr')
    expect(genreMotif(['r', 'T', 'r'])).toBe('fort')
    expect(
      fautesRythme([...'TTTTrrTr'] as EtatRythme[]).map((f) => [
        f.genre,
        f.debut,
        f.fin,
      ]),
    ).toEqual([['travail-court', 6, 6]])
    // Le bloc court est au niveau du rythme, au-dessus de tout le confort
    // où vit la prime (ORDRE DE DÉCISION).
    const noms = construire(
      probleme({
        salaries: [personne(avant)],
        creneaux: [0, 1, 2, 3, 4, 5, 6].map((j) => cr(j)),
        graine: 1,
      }),
    )
      .modele.niveaux()
      .map(([nom]) => nom)
    expect(noms[0]).toBe('rythme')
    expect(noms.at(-1)).toBe('confort')
  })
  it('accepté : sans la prime, le rythme seul fait travailler le lundi', () => {
    // Deux places chaque jour, une seconde personne sans passé qui pourrait
    // prendre le lundi : la personne reprend lundi, ses 5 jours vont jusqu'au
    // jeudi, puis vendredi et samedi de repos, et le dimanche reprend.
    for (const graine of [1, 2, 3]) {
      const p = probleme({
        salaries: [personne(avant), personne({ id: 'b' })],
        creneaux: [0, 1, 2, 3, 4, 5, 6].flatMap((j) => [
          cr(j),
          cr(j, { id: `k${j}` }),
        ]),
        graine,
      })
      const r = generer(p, highs)
      const jours = r.affectations
        .filter((a) => a.salarieId === 'a')
        .map((a) => Number(a.creneauId.slice(1)))
        .sort((x, y) => x - y)
      expect(jours).toEqual([0, 1, 2, 3, 6])
    }
  })
  it('la prime n’est écrite qu’au régime humain', () => {
    const primes = (regles?: Probleme['regles']) =>
      [
        ...construire(
          probleme({
            salaries: [personne(avant)],
            creneaux: [0, 1, 2, 3, 4, 5, 6].map((j) => cr(j)),
            graine: 1,
            regles,
          }),
        ).modele.objectif.values(),
      ].filter((c) => c === -POIDS_DIMANCHE_SEUL).length
    expect(primes()).toBe(0)
    expect(regimeRythme(personne(avant), SANS_RYTHME_STRICT)).toBe('humain')
    expect(primes(SANS_RYTHME_STRICT)).toBe(1)
  })
})

describe('le jour manquant du rythme de 5 jours : gardé au rythme 5 et 2', () => {
  it('le rythme ne couvre pas tout : une semaine de 4 jours entre deux semaines inconnues n’a aucune faute', () => {
    // Semaines voisines non lues : rien n'est demandé au rythme 5 et 2 ;
    // seul le jour manquant dit qu'il manque un jour.
    const u = 'uuuuuuu'
    expect(fautesRythme([...`${u}TTTTrrr${u}`] as EtatRythme[])).toEqual([])
    const manquants = [
      ...construire(
        probleme({
          salaries: [personne()],
          creneaux: [0, 1, 2, 3, 4, 5, 6].map((j) => cr(j)),
          graine: 1,
        }),
      ).modele.objectif.values(),
    ].filter((c) => c === POIDS_JOUR_MANQUANT).length
    expect(regimeRythme(personne())).toBe('strict')
    expect(manquants).toBe(1)
  })
})
