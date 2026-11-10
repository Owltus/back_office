import fc from 'fast-check'
import highsLoader from 'highs'
import { beforeAll, describe, expect, it } from 'vitest'

import {
  FOIS_FAUTE_RYTHME,
  generer,
  POIDS_RYTHME_BORD,
  prixFauteRythme,
} from '#/lib/planning/generateur.ts'
import type { Highs } from '#/lib/planning/generateur.ts'
import {
  creneau as creneauModele,
  jourDe,
  probleme,
  salarieSolveur,
} from '#/lib/planning/modele.ts'
import type {
  AffectationSolveur,
  Creneau,
  Probleme,
  SalarieSolveur,
  SuivantePersonne,
} from '#/lib/planning/modele.ts'
import {
  ABSENCE_LONGUE,
  fauteScellee,
  fautesRythme,
  motifsInterdits,
  resoudreAbsences,
  statutAbsence,
  suiteRythme,
} from '#/lib/planning/rythmeStrict.ts'
import type { EtatRythme, StatutRythme } from '#/lib/planning/rythmeStrict.ts'
import { rythmeAutour } from '#/lib/planning/semaine.ts'
import { MINUTES_PAR_JOUR } from '#/lib/planning/temps.ts'
import type { Salarie } from '#/lib/planning/types.ts'
import { violations } from '#/lib/planning/verificateur.ts'

/*
 * Ce que vaut chaque jour pour le rythme 5 jours puis 2 jours (révisé le
 * 2026-11-09, décision de l'utilisateur : « les jours d'école au CFA,
 * considère-les comme des jours de travail… prends bien tout en compte pour
 * que tout soit cohérent »). École et absence décomptée de 5 jours au plus :
 * du travail ; repos (posé, fixe, sans décompte, rien) : du repos ; hors
 * contrat et absence de plus de 5 jours : neutre ; semaine non lue :
 * inconnue. Accepté ET refusé pour chaque statut, sur la définition, le
 * calcul et le vérificateur.
 */

const H = 60
let highs: Highs
beforeAll(async () => {
  highs = (await highsLoader()) as unknown as Highs
})

/** Une suite écrite en lettres de l'écran : T shift, E école, C congé, M
 * maladie, F jour férié chômé, J jour férié rattrapé, O formation (motif
 * `rythme_travail`), R repos posé, r rien, n hors contrat, u inconnu. */
const lettres = (texte: string): StatutRythme[] =>
  [...texte.replace(/ /g, '')].map((c) =>
    c === 'T' || c === 'E'
      ? 'T'
      : 'CMFJ'.includes(c)
        ? 'a'
        : c === 'O'
          ? 'f'
          : c === 'R'
            ? 'r'
            : (c as EtatRythme),
  )
const resolu = (texte: string) => resoudreAbsences(lettres(texte)).join('')
const fautes = (texte: string) =>
  fautesRythme(resoudreAbsences(lettres(texte))).map((f) => f.genre)

describe('les statuts (définition)', () => {
  it('école : 5 jours de CFA puis 2 repos comme 5 jours à l’hôtel', () => {
    expect(fautes('TTTTTrr EEEEErr TTTTTrr')).toEqual([])
  })
  it('refusé : 4 jours de travail puis 5 jours de CFA (bloc de 9), 2 puis 5 (bloc de 7)', () => {
    expect(fautes('rrTTTT EEEEErr')).toEqual(['travail-long'])
    expect(fautes('rrrrrTT EEEEErr')).toEqual(['travail-long'])
  })
  it('école de 3 jours : complétée par 2 shifts ; refusé seule entre deux repos', () => {
    expect(fautes('TTTTTrr EEETTrr')).toEqual([])
    expect(fautes('TTTTTrr TTEEErr')).toEqual([])
    expect(fautes('TTTTTrr EEErrrr')).toContain('travail-court')
  })
  it('école de 6 jours (samedi au CFA) : une faute', () => {
    expect(fautes('TTTTTrr EEEEEEr')).toEqual(['travail-long'])
  })
  it('congé de 3 jours + 2 shifts : un bloc ; refusé seul entre deux repos', () => {
    expect(fautes('TTTTTrr CCCTTrr')).toEqual([])
    expect(fautes('TTTTTrr CCCrrrr')).toContain('travail-court')
  })
  it('congé du lundi au vendredi : un bloc entouré de deux repos ; refusé collé à un shift', () => {
    expect(fautes('TTTTTrr CCCCCrr TTTTTrr')).toEqual([])
    expect(fautes('TTTTTrr CCCCCTr')).toEqual(['travail-long'])
    expect(fautes('TTTTTrr TCCCCCr')).toEqual(['travail-long'])
  })
  it('congé de deux semaines, arrêt maladie long : neutres, pas de deux repos exigés autour', () => {
    expect(fautes('TTTTTr CCCCCCCCCCCCCC TTTrr')).toEqual([])
    expect(fautes('rTTTTT MMMMMMMM TTTTTrr')).toEqual([])
    // Au plus 5 : du travail.
    expect(fautes('rTTTTT MMMMM TTTTTrr')).toEqual(['travail-long'])
    expect(resoudreAbsences(lettres('C'.repeat(ABSENCE_LONGUE)))).toEqual(
      Array(ABSENCE_LONGUE).fill('T'),
    )
    expect(resoudreAbsences(lettres('C'.repeat(ABSENCE_LONGUE + 1)))).toEqual(
      Array(ABSENCE_LONGUE + 1).fill('n'),
    )
  })
  it('l’école, un repos ou un shift coupe une absence longue', () => {
    expect(resoudreAbsences(lettres('CCCECCC'))).toEqual([...'TTTTTTT'])
    expect(resoudreAbsences(lettres('CCCRCCC'))).toEqual([...'TTTrTTT'])
  })
  it('repos posé : un repos ; refusé un repos posé seul entre deux blocs', () => {
    expect(fautes('TTTTTRr TTTTTrr')).toEqual([])
    expect(fautes('TTTTTR TTTTT')).toEqual(['repos-seul'])
  })
  it('jour férié chômé, jour férié rattrapé : un jour de travail', () => {
    expect(fautes('TTTTTrr TTFTTrr')).toEqual([])
    expect(fautes('TTTTTrr TTTTJrr')).toEqual([])
    expect(fautes('TTTTTrr TTFTTTr')).toEqual(['travail-long'])
    expect(fautes('TTTTTrr JTTTrrr')).toContain('travail-court')
  })
  it('début et fin de contrat en milieu de semaine : neutres', () => {
    expect(fautes('nnnTTTT')).toEqual([])
    expect(fautes('TTTTTrr TTnnnnn')).toEqual([])
    expect(fautes('nnTTTTTT')).toEqual(['travail-long'])
  })
  it('semaine voisine inconnue : rien n’est demandé ; connue : la règle', () => {
    expect(fautes('uuuuuuu TTTrrrr')).toEqual([])
    expect(fautes('TTTTTrr TTTrrrr')).toContain('travail-court')
  })
  it('statutAbsence : école, sans décompte, au décompte, sans motif', () => {
    const ecole = new Set([2])
    const sans = new Set([12, 5])
    expect(statutAbsence(2, ecole, sans)).toBe('T')
    expect(statutAbsence(12, ecole, sans)).toBe('r')
    expect(statutAbsence(1, ecole, sans)).toBe('a')
    expect(statutAbsence(null, ecole, sans)).toBe('a')
  })
  it('statutAbsence : un motif « compte comme du travail » (formation) = f, jamais une absence', () => {
    const ecole = new Set([2])
    const sans = new Set([12])
    const travail = new Set([4])
    expect(statutAbsence(4, ecole, sans, travail)).toBe('f')
    // Sans le réglage : une absence décomptée comme avant.
    expect(statutAbsence(4, ecole, sans)).toBe('a')
    expect(statutAbsence(1, ecole, sans, travail)).toBe('a')
    expect(statutAbsence(null, ecole, sans, travail)).toBe('a')
  })
  it('formation de 10 jours : du travail, jamais neutre (décision du 2026-11-09)', () => {
    expect(resolu('OOOOOOOOOO')).toBe('TTTTTTTTTT')
    // Accepté : deux semaines de formation au rythme, 5 jours puis 2 repos.
    expect(fautes('TTTTTrr OOOOOrr OOOOOrr TTTTTrr')).toEqual([])
    // Refusé : 10 jours de formation d'affilée, un bloc de 10.
    expect(fautes('TTTTTrr OOOOOOOOOO rr')).toEqual(['travail-long'])
    // Refusé : une formation de 3 jours seule entre deux repos.
    expect(fautes('TTTTTrr OOOrrrr')).toContain('travail-court')
  })
  it('congé de 10 jours : toujours neutre', () => {
    expect(resolu('CCCCCCCCCC')).toBe('nnnnnnnnnn')
    expect(fautes('TTTTTrr CCCCCCCCCC TTTrr')).toEqual([])
    expect(resolu('MMMMMMMMMM')).toBe('nnnnnnnnnn')
  })
  it('suite mêlée : la formation ne coupe pas la suite et n’y compte pas', () => {
    // 8 jours de congé autour de 2 jours de formation : neutres, la
    // formation reste du travail.
    expect(resolu('CCCCOOCCCC')).toBe('nnnnTTnnnn')
    expect(fautes('TTTTTrr CCCCOOCCCC TTTrr')).toEqual([])
    // Deux semaines de congé avec une journée de formation au milieu :
    // toujours une absence longue.
    expect(resolu('CCCCCCOCCCCCC')).toBe('nnnnnnTnnnnnn')
    // 5 jours de congé seulement (la formation ne compte pas) : du travail,
    // 6 jours d'affilée, refusé.
    expect(resolu('CCCOCC')).toBe('TTTTTT')
    expect(fautes('TTTTTrr CCCOCCr')).toEqual(['travail-long'])
    // 6 jours de congé et 1 de formation : neutres sauf la formation.
    expect(resolu('CCCOCCC')).toBe('nnnTnnn')
    // La formation en bord de suite : du travail, le congé compté seul.
    expect(resolu('OCCCCCC')).toBe('Tnnnnnn')
    expect(resolu('OCCCCC')).toBe('TTTTTT')
    // Un repos, l'école ou un shift coupent toujours la suite.
    expect(resolu('CCCOCCRCCC')).toBe('TTTTTTrTTT')
  })
  it('une seule règle, statuts compris : les motifs du calcul disent les fautes', () => {
    const statut = fc.constantFrom<StatutRythme>('T', 'r', 'a', 'f', 'n', 'u')
    fc.assert(
      fc.property(fc.array(statut, { minLength: 1, maxLength: 28 }), (s) => {
        const etats = resoudreAbsences(s)
        // Jamais d'absence restée telle quelle ; une formation toujours du
        // travail ; le reste inchangé.
        expect(etats.length).toBe(s.length)
        etats.forEach((e, i) => {
          if (s[i] === 'f') expect(e).toBe('T')
          else if (s[i] !== 'a') expect(e).toBe(s[i])
          else expect(['T', 'n']).toContain(e)
        })
        const motifs = motifsInterdits(etats.length)
        const trouve = motifs.some((m) => {
          for (let a = 0; a + m.length <= etats.length; a++)
            if (m.every((e, i) => etats[a + i] === e)) return true
          return false
        })
        expect(fautesRythme(etats).length > 0).toBe(trouve)
      }),
      { numRuns: 3000, seed: 20261109 },
    )
  })
  it('une absence longue est exactement une suite de plus de 5 absences, formations non comptées', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom<StatutRythme>('a', 'f', 'r', 'T'), {
          maxLength: 30,
        }),
        (s) => {
          const etats = resoudreAbsences(s)
          const absence = (k: number) => s[k] === 'a' || s[k] === 'f'
          for (let i = 0; i < s.length; i++) {
            if (s[i] === 'f') expect(etats[i]).toBe('T')
            if (s[i] !== 'a') continue
            let g = i
            while (g > 0 && absence(g - 1)) g--
            let d = i
            while (d + 1 < s.length && absence(d + 1)) d++
            const conges = s.slice(g, d + 1).filter((e) => e === 'a').length
            expect(etats[i]).toBe(conges > ABSENCE_LONGUE ? 'n' : 'T')
          }
        },
      ),
      { numRuns: 1000, seed: 9 },
    )
  })
  it('une faute scellée : plus de 2 repos dont 3, avec le bloc, sont connus d’avance', () => {
    const f = fautesRythme([...'TrrrT'] as EtatRythme[])[0]
    expect(f.genre).toBe('repos-long')
    expect(fauteScellee(f, (i) => i <= 3)).toBe(true)
    expect(fauteScellee(f, (i) => i >= 1)).toBe(true)
    expect(fauteScellee(f, (i) => i !== 2)).toBe(false)
    const court = fautesRythme([...'rTr'] as EtatRythme[])[0]
    expect(fauteScellee(court, () => true)).toBe(false)
  })
})

// ------------------------------------------------- lus sur les données

const LUNDI = '2026-12-07'
const fiche = (kw: Partial<Salarie> = {}): Salarie => ({
  id: 1,
  prenom: 'A',
  nom: 'B',
  groupe_id: null,
  type_contrat: 'cdi',
  heures_hebdo: 35,
  forfait_jours: false,
  mineur: false,
  competences: [],
  semaine_type: Array.from({ length: 7 }, () => ({ mode: 'auto' as const })),
  shifts_autorises: [],
  date_entree: null,
  date_sortie: null,
  actif: true,
  suite_de: null,
  ...kw,
})
const EC = 2
const CP = 1
const FO = 4
const REPOS = 12
const ctxDe = (jours: Record<string, number>, formation = true) => ({
  ecole: new Set([EC]),
  sansDecompte: new Set([REPOS]),
  rythmeTravail: new Set(formation ? [FO] : []),
  absences: new Map([[1, new Map(Object.entries(jours))]]),
})
const jours = (de: string, n: number, motif: number) =>
  Object.fromEntries(
    Array.from({ length: n }, (_, i) => {
      const d = new Date(`${de}T12:00:00Z`)
      d.setUTCDate(d.getUTCDate() + i)
      return [d.toISOString().slice(0, 10), motif]
    }),
  )
/** Les 7 jours de la semaine `LUNDI` (+ décalage) : lettre ou « . ». */
const semaineLue = (autour: Map<number, EtatRythme>, decalage = 0) =>
  Array.from({ length: 7 }, (_, j) => autour.get(j + decalage) ?? '.').join('')

describe('les statuts lus sur les absences (rythmeAutour)', () => {
  it('école du lundi au vendredi : 5 jours de travail', () => {
    const a = rythmeAutour(fiche(), LUNDI, ctxDe(jours(LUNDI, 5, EC)))
    expect(semaineLue(a)).toBe('TTTTT..')
  })
  it('congé de 3 et de 5 jours : du travail ; de deux semaines : neutre, des deux côtés de la semaine', () => {
    expect(
      semaineLue(rythmeAutour(fiche(), LUNDI, ctxDe(jours(LUNDI, 3, CP)))),
    ).toBe('TTT....')
    expect(
      semaineLue(rythmeAutour(fiche(), LUNDI, ctxDe(jours(LUNDI, 5, CP)))),
    ).toBe('TTTTT..')
    // Du jeudi d'avant au mercredi : 2 jours cette semaine, mais une suite
    // de 7 jours.
    const long = rythmeAutour(
      fiche(),
      LUNDI,
      ctxDe(jours('2026-12-03', 12, CP)),
    )
    expect(semaineLue(long)).toBe('nnnnnnn')
    expect(semaineLue(long, -7)).toBe('...nnnn')
    expect(semaineLue(long, 7)).toBe('n......')
  })
  it('formation de deux semaines : du travail les deux semaines ; sans le réglage, neutre', () => {
    const a = rythmeAutour(fiche(), LUNDI, ctxDe(jours(LUNDI, 10, FO)))
    expect(semaineLue(a)).toBe('TTTTTTT')
    expect(semaineLue(a, 7)).toBe('TTT....')
    const sans = rythmeAutour(
      fiche(),
      LUNDI,
      ctxDe(jours(LUNDI, 10, FO), false),
    )
    expect(semaineLue(sans)).toBe('nnnnnnn')
  })
  it('suite mêlée lue sur les données : congé, formation, congé', () => {
    const a = rythmeAutour(
      fiche(),
      LUNDI,
      ctxDe({
        ...jours(LUNDI, 4, CP),
        ...jours('2026-12-11', 2, FO),
        ...jours('2026-12-13', 4, CP),
      }),
    )
    expect(semaineLue(a)).toBe('nnnnTTn')
    expect(semaineLue(a, 7)).toBe('nnn....')
  })
  it('un repos posé coupe un congé ; un repos posé est un repos', () => {
    const a = rythmeAutour(
      fiche(),
      LUNDI,
      ctxDe({ ...jours(LUNDI, 7, CP), '2026-12-10': REPOS }),
    )
    expect(semaineLue(a)).toBe('TTTrTTT')
  })
  it('hors contrat : neutre, avant l’arrivée comme après la fin', () => {
    expect(
      semaineLue(
        rythmeAutour(fiche({ date_entree: '2026-12-10' }), LUNDI, ctxDe({})),
      ),
    ).toBe('nnn....')
    expect(
      semaineLue(
        rythmeAutour(fiche({ date_sortie: '2026-12-09' }), LUNDI, ctxDe({})),
      ),
    ).toBe('...nnnn')
  })
  it('une absence de la semaine type (sans motif) : une absence décomptée', () => {
    const x = fiche({
      semaine_type: Array.from({ length: 7 }, (_, j) => ({
        mode: j === 2 ? ('absence' as const) : ('auto' as const),
      })),
    })
    expect(semaineLue(rythmeAutour(x, LUNDI, ctxDe({})))).toBe('..T....')
  })
})

// ------------------------------------------------------------ le calcul

const cr = (jour: number): Creneau =>
  creneauModele({
    id: `j${jour}`,
    poste: 'r',
    debut: jour * MINUTES_PAR_JOUR + 8 * H,
    fin: jour * MINUTES_PAR_JOUR + 15 * H,
    effectif: 1,
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
    ...kw,
  })
/** Une semaine d'école, de congé…, les jours `jours` : indisponibles et du
 * travail pour le rythme (`ecole` : aussi hors de l'hôtel). */
const travailSansShift = (jours: number[], ecole = false) => ({
  indisponibilites: new Set(jours),
  joursNeutres: new Set<number>(),
  joursTravailRythme: new Set(jours),
  ...(ecole ? { joursHorsSite: new Set(jours) } : {}),
})
const SEMAINE = [0, 1, 2, 3, 4, 5, 6]
const resoudre = (s: SalarieSolveur, kw: Partial<Probleme> = {}) => {
  const p = probleme({
    salaries: [s],
    creneaux: SEMAINE.filter((j) => !s.indisponibilites.has(j)).map(cr),
    graine: 1,
    ...kw,
  })
  return { p, r: generer(p, highs) }
}
const tenus = (r: { affectations: AffectationSolveur[] }) =>
  r.affectations.map((a) => Number(a.creneauId.slice(1))).sort((a, b) => a - b)
const rythmeDit = (p: Probleme, affs: AffectationSolveur[]) =>
  violations(p, affs)
    .filter((v) => v.regle === 'RYTHME-5-2')
    .map((v) => v.message)
/** La suite lue par le vérificateur, en lettres. */
const lue = (p: Probleme, affs: AffectationSolveur[]) => {
  const j = new Set(
    affs.map((a) => jourDe(p.creneaux.find((c) => c.id === a.creneauId)!)),
  )
  return suiteRythme(p.salaries[0], p.nbJours, (d) => j.has(d))
    .slice(7, 14)
    .join('')
}
const AVANT = { etatsAvant: 'TTTTTrr', joursSemainePrecedente: 5 }

describe('le calcul et le vérificateur', () => {
  it('refusé : 4 jours de travail puis une semaine de CFA ; le calcul fait 5 jours puis 2 repos', () => {
    const s = personne({ ...AVANT, etatsApres: 'TTTTTrr' })
    const { p, r } = resoudre(s)
    expect(tenus(r)).toEqual([0, 1, 2, 3, 4])
    expect(rythmeDit(p, r.affectations)).toEqual([])
    // Le planning d'avant le 2026-11-09 : jeudi au dimanche, puis le CFA.
    const affs = [3, 4, 5, 6].map((j) => ({
      salarieId: 'a',
      creneauId: `j${j}`,
    }))
    // Et, avant, 5 repos du samedi d'avant au mercredi.
    expect(rythmeDit(p, affs)).toEqual([
      "rythme 5 et 2 non tenu : 5 jours de repos du samedi d'avant au mercredi entre deux blocs de travail (2 attendus)",
      "rythme 5 et 2 non tenu : 9 jours de travail d'affilée du jeudi au vendredi d'après (5 au plus)",
    ])
  })
  it('refusé : 2 jours de travail puis une semaine de CFA (bloc de 7)', () => {
    const s = personne({
      etatsAvant: 'rTTTTTr',
      joursSemainePrecedente: 5,
      etatsApres: 'TTTTTrr',
    })
    const p = probleme({ salaries: [s], creneaux: SEMAINE.map(cr) })
    const affs = [0, 1, 2, 5, 6].map((j) => ({
      salarieId: 'a',
      creneauId: `j${j}`,
    }))
    expect(rythmeDit(p, affs)).toContain(
      "rythme 5 et 2 non tenu : 7 jours de travail d'affilée du samedi au vendredi d'après (5 au plus)",
    )
    // Hors du rythme (un seul repos le dimanche d'avant) : aucune semaine
    // sans faute. Les heures dues passent avant un repos seul (décision de
    // l'utilisateur du 2026-11-09) : 5 jours, et UN repos seul le dimanche
    // avant le CFA, dit « changement de jours de repos », plutôt que 7 h perdues.
    const { r } = resoudre(s)
    expect(tenus(r)).toEqual([1, 2, 3, 4, 5])
    expect(rythmeDit(p, r.affectations)).toEqual([])
    expect(
      violations(p, r.affectations)
        .filter((v) => v.regle === 'RYTHME-REPOS-SEUL')
        .map((v) => v.message),
    ).toEqual(['changement de jours de repos : repos seul le dimanche'])
    // Dans le rythme : 5 jours puis les 2 repos avant le CFA, sans faute.
    const dans = resoudre(personne({ ...AVANT, etatsApres: 'TTTTTrr' }))
    expect(tenus(dans.r)).toEqual([0, 1, 2, 3, 4])
    expect(rythmeDit(dans.p, dans.r.affectations)).toEqual([])
  })
  it('des faits hors du rythme puis une semaine de CFA : une faute, pas une semaine vide', () => {
    // Le cas du banc de décembre : la semaine d'avant finit par 2 jours
    // travaillés (validés), la semaine d'après est une semaine de CFA du
    // lundi au vendredi. Aucune suite sans faute n'existe ; avant, le
    // calcul laissait toute la semaine vide (en faute quand même).
    const s = personne({
      etatsAvant: 'TTTrrTT',
      joursSemainePrecedente: 5,
      etatsApres: 'TTTTTrr',
    })
    const { p, r } = resoudre(s)
    expect(tenus(r).length).toBeGreaterThanOrEqual(3)
    // Jamais 4 repos (2026-11-09) : un repos seul et un bloc court, et la
    // transition du bloc de 4 qui finit la semaine d'avant, plutôt.
    const dits = rythmeDit(p, r.affectations)
    expect(dits.some((m) => /jours de repos/.test(m))).toBe(false)
    expect(dits.length).toBeGreaterThanOrEqual(1)
    expect(dits.length).toBeLessThanOrEqual(2)
  })
  it('CFA du lundi au vendredi : le week-end en repos ; refusé : le samedi travaillé', () => {
    // Heures dues de la semaine, école retirée (2026-11-09 : les heures
    // passent avant un repos seul, un contrat plein ferait venir le dimanche).
    const s = personne({
      ...AVANT,
      ...travailSansShift([0, 1, 2, 3, 4], true),
      minutesHebdoContrat: 0 * H,
      minutesContrat: 35 * H,
    })
    const { p, r } = resoudre(s)
    expect(r.statut).not.toBe('inconnu')
    expect(tenus(r)).toEqual([])
    expect(lue(p, r.affectations)).toBe('TTTTTrr')
    expect(rythmeDit(p, [{ salarieId: 'a', creneauId: 'j5' }])).toHaveLength(1)
  })
  it('CFA de 3 jours : complété par 2 shifts ; refusé : 3 jours seuls', () => {
    const s = personne({
      ...AVANT,
      ...travailSansShift([0, 1, 2], true),
      minutesHebdoContrat: 14 * H,
      minutesContrat: 35 * H,
    })
    const { p, r } = resoudre(s)
    expect(tenus(r)).toEqual([3, 4])
    expect(rythmeDit(p, r.affectations)).toEqual([])
    // Un bloc de 4 (CFA et un shift) : un changement de jours de repos
    // (transition, 2026-11-09), dit sans bloquer.
    const un = [{ salarieId: 'a', creneauId: 'j3' }]
    expect(rythmeDit(p, un)).toEqual([])
    expect(
      violations(p, un)
        .filter((v) => v.regle === 'RYTHME-TRANSITION')
        .map((v) => v.message),
    ).toEqual([
      'changement de jours de repos : 4 jours de travail du lundi au jeudi',
    ])
  })
  it('CFA de 6 jours : une faute des faits, le modèle reste possible, rien le dimanche', () => {
    const s = personne({
      ...AVANT,
      ...travailSansShift([0, 1, 2, 3, 4, 5], true),
    })
    const { r } = resoudre(s)
    expect(r.statut).not.toBe('inconnu')
    expect(tenus(r)).toEqual([])
  })
  it('congé de 3 jours : 2 shifts ; de 5 jours : rien ; de deux semaines : neutre', () => {
    // Les heures dues de la semaine, congé retiré (14 h, puis 0).
    const trois = resoudre(
      personne({
        ...AVANT,
        ...travailSansShift([0, 1, 2]),
        minutesHebdoContrat: 14 * H,
        minutesContrat: 35 * H,
      }),
    )
    expect(tenus(trois.r)).toEqual([3, 4])
    const cinq = resoudre(
      personne({
        ...AVANT,
        ...travailSansShift([0, 1, 2, 3, 4]),
        minutesHebdoContrat: 0,
        minutesContrat: 35 * H,
      }),
    )
    expect(tenus(cinq.r)).toEqual([])
    // Retour d'un congé de deux semaines le jeudi (la semaine d'avant et
    // lundi-mercredi : neutres) : 4 jours, pas de 2 repos exigés avant.
    const long = personne({
      etatsAvant: 'nnnnnnn',
      joursSemainePrecedente: 0,
      indisponibilites: new Set([0, 1, 2]),
      joursNeutres: new Set([0, 1, 2]),
      minutesHebdoContrat: 28 * H,
      minutesContrat: 35 * H,
    })
    const l = resoudre(long)
    expect(tenus(l.r)).toEqual([3, 4, 5, 6])
    expect(rythmeDit(l.p, l.r.affectations)).toEqual([])
  })
  it('maladie longue : neutre ; refusé, la même lue comme 2 jours de travail', () => {
    // Malade du mercredi au dimanche, et la semaine d'après : neutre. Lundi
    // et mardi suivent les 2 repos.
    const malade = personne({
      ...AVANT,
      indisponibilites: new Set([2, 3, 4, 5, 6]),
      joursNeutres: new Set([2, 3, 4, 5, 6]),
    })
    const m = resoudre(malade)
    expect(tenus(m.r)).toEqual([0, 1])
    expect(rythmeDit(m.p, m.r.affectations)).toEqual([])
  })
  it('repos posé : la faute des 3 repos est déjà faite, la personne reprend', () => {
    // Samedi, dimanche d'avant et repos posé le lundi : 3 repos connus. Le
    // calcul ne l'enferme pas pour la semaine (relecture du 2026-11-09).
    const repos = {
      indisponibilites: new Set([0]),
      joursNeutres: new Set<number>(),
      joursTravailRythme: new Set<number>(),
    }
    const s = personne({ ...AVANT, ...repos })
    const { p, r } = resoudre(s)
    const t = tenus(r)
    expect(t).toHaveLength(5)
    expect(t[4] - t[0]).toBe(4)
    // Reprise le mardi : les 3 repos des faits sont dits (jamais de 3 repos
    // par le calcul, mais ceux-là sont imposés), pas un 4e.
    expect(rythmeDit(p, r.affectations)).toEqual([
      "rythme 5 et 2 non tenu : 3 jours de repos du samedi d'avant au lundi entre deux blocs de travail (2 attendus)",
    ])
    // Refusé : un repos posé SEUL entre deux blocs.
    const seul = personne({
      etatsAvant: 'rrTTTTT',
      joursSemainePrecedente: 5,
      ...repos,
    })
    const q = probleme({ salaries: [seul], creneaux: SEMAINE.map(cr) })
    const affs = [1, 2, 3, 4, 5].map((j) => ({
      salarieId: 'a',
      creneauId: `j${j}`,
    }))
    // Dit comme un repos seul (permis en urgence, 2026-11-09), pas comme
    // une faute qui bloque.
    expect(
      violations(q, affs)
        .filter((v) => v.regle === 'RYTHME-REPOS-SEUL')
        .map((v) => v.message),
    ).toEqual(['changement de jours de repos : repos seul le lundi'])
  })
  it('jour férié chômé : un jour de travail ; refusé : 5 shifts autour', () => {
    const s = personne({
      ...AVANT,
      ...travailSansShift([2]),
      minutesHebdoContrat: 28 * H,
      minutesContrat: 35 * H,
    })
    const { p, r } = resoudre(s)
    expect(tenus(r)).toEqual([0, 1, 3, 4])
    expect(rythmeDit(p, r.affectations)).toEqual([])
    const affs = [0, 1, 3, 4, 5].map((j) => ({
      salarieId: 'a',
      creneauId: `j${j}`,
    }))
    expect(rythmeDit(p, affs)).toEqual([
      "rythme 5 et 2 non tenu : 6 jours de travail d'affilée du lundi au samedi (5 au plus)",
    ])
  })
  it('jour férié rattrapé proposé : il compte dans le bloc de 5', () => {
    // Aucune place le lundi : le JFR y va, et 4 shifts font le bloc ; pas
    // un 5e shift le samedi (6 jours).
    const s = personne({
      ...AVANT,
      jfr: { jours: new Set([0]), reduction: 7 * H },
    })
    const p = probleme({
      salaries: [s],
      creneaux: [1, 2, 3, 4, 5, 6].map(cr),
      graine: 1,
    })
    const r = generer(p, highs)
    expect((r.jfr ?? []).map((x) => x.jour)).toEqual([0])
    expect(tenus(r)).toEqual([1, 2, 3, 4])
  })
  it('début de contrat le mercredi : 3 jours contre l’arrivée ; refusé : 5 jours collés à la semaine d’après', () => {
    const s = personne({
      horsContrat: new Set([0, 1]),
      indisponibilites: new Set([0, 1]),
      joursNeutres: new Set([0, 1]),
      etatsApres: 'TTTTTrr',
      minutesHebdoContrat: 21 * H,
      minutesContrat: 35 * H,
    })
    const { p, r } = resoudre(s)
    expect(tenus(r)).toEqual([2, 3, 4])
    expect(rythmeDit(p, r.affectations)).toEqual([])
    const affs = [2, 3, 4, 5, 6].map((j) => ({
      salarieId: 'a',
      creneauId: `j${j}`,
    }))
    expect(rythmeDit(p, affs)).toHaveLength(1)
  })
  it('fin de contrat le jeudi soir : un bloc de 4 contre la fin, accepté', () => {
    const s = personne({
      ...AVANT,
      horsContrat: new Set([4, 5, 6]),
      indisponibilites: new Set([4, 5, 6]),
      joursNeutres: new Set([4, 5, 6]),
    })
    const { p, r } = resoudre(s)
    expect(tenus(r)).toEqual([0, 1, 2, 3])
    expect(rythmeDit(p, r.affectations)).toEqual([])
  })
  it('semaine voisine inconnue ou connue : 3 jours en début de semaine', () => {
    const creneaux = [0, 1, 2].map(cr)
    const inconnue = generer(
      probleme({ salaries: [personne()], creneaux, graine: 1 }),
      highs,
    )
    expect(tenus(inconnue)).toEqual([0, 1, 2])
    const connue = generer(
      probleme({ salaries: [personne(AVANT)], creneaux, graine: 1 }),
      highs,
    )
    // Connue (deux repos avant) : un bloc de 3 plutôt que 9 repos de suite
    // (3 repos ou plus, la pire faute, 2026-11-10).
    expect(tenus(connue)).toEqual([0, 1, 2])
  })
  it('horizon glissant : un congé de 2 jours la semaine d’après compte dans le bloc', () => {
    // Lundi et mardi d'après en congé (du travail) : jeudi au dimanche
    // ferait un bloc de 6.
    const suivante = {
      personnes: new Map<string, SuivantePersonne>([
        [
          'a',
          {
            fixes: new Map<number, 0 | 1>([
              [0, 0],
              [1, 0],
            ]),
            travailRythme: new Set([0, 1]),
            horsSite: new Set(),
            postesGardes: new Map(),
            nonLibres: new Set(),
            nonLibresIci: new Set(),
            attendus: 0,
            weekendLibreAvant: null,
          },
        ],
      ]),
      groupes: [],
    }
    const { r } = resoudre(personne(AVANT), { suivante })
    const t = tenus(r)
    // Le dimanche et le samedi ne peuvent pas être tous deux travaillés
    // avec jeudi et vendredi : le bloc reste à 5 au plus.
    let serie = 2
    for (let j = 6; j >= 0 && t.includes(j); j--) serie++
    expect(serie <= 5 || !t.includes(6)).toBe(true)
    expect(t).toEqual([0, 1, 2, 3, 4])
  })
})

describe('le prix d’une faute', () => {
  it('plus que tout ce qu’une faute pourrait racheter, jamais sous le plancher', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: -1e8, max: 1e8 })), (couts) => {
        const prix = prixFauteRythme(couts)
        expect(prix).toBeGreaterThanOrEqual(POIDS_RYTHME_BORD)
        for (const c of couts)
          expect(prix).toBeGreaterThan(FOIS_FAUTE_RYTHME * Math.abs(c))
      }),
      { numRuns: 200, seed: 3 },
    )
    // La place la plus chère du banc de décembre (20 736 967) : 10 000 000
    // fixe valait moins qu'elle.
    expect(prixFauteRythme([20_736_967])).toBeGreaterThan(7 * 20_736_967)
  })
})
