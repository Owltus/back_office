/*
 * Génération d'un planning (prototype `solveur/generateur.py`, OR-Tools
 * CP-SAT) traduite en programme linéaire en nombres entiers, résolu par
 * HiGHS (WebAssembly, `highs`). Même modèle, mêmes poids : une variable
 * booléenne par couple (salarié, créneau), 1 si le salarié le tient. Les
 * règles légales sont des contraintes dures ; la couverture est souple (s'il
 * manque du monde, le meilleur planning légal et la liste des trous).
 *
 * Traduction des primitives CP-SAT (toutes linéaires sur des booléens) :
 *   add_implication(a, b)          a - b <= 0
 *   add_implication(a, ¬b)         a + b <= 1
 *   add_bool_or([¬a, ¬b])          a + b <= 1
 *   add_bool_or([l1 … ln])         l1 + … + ln >= 1
 *   add_bool_or([¬l, ¬a, ¬b])      l + a + b <= 2
 *   add_max_equality(t, [x…])      t - x_i >= 0 pour tout i ; t - Σx <= 0
 * Les constantes d'objectif (POIDS × (1 - v)) sont retirées : elles ne
 * changent pas l'optimum.
 *
 * Les affectations épinglées (`imposees`) sont des faits : gardées même si
 * elles enfreignent une règle (le vérificateur le signale) ; d'où les
 * `max(plafond, fige)` qui évitent un modèle impossible.
 */

import {
  cle,
  cleAEviter,
  dansLeContrat,
  duree,
  jourDe,
  presenceMax,
  role,
  toucheLaNuit,
  travail,
  type AffectationSolveur,
  type Creneau,
  type Manque,
  type Probleme,
  type Resultat,
  type SalarieSolveur,
} from '#/lib/planning/modele.ts'

export const POIDS_MANQUE = 100
export const POIDS_JOUR_FIXE = 20_000
export const POIDS_OCCASIONNEL = 3_000
export const POIDS_SOUS_CONTRAT = 400
export const POIDS_REPOS_SEPARES = 1_000
export const POIDS_SUR_CONTRAT = 50
export const POIDS_SIXIEME_JOUR = 15_000
export const POIDS_DEJA_PROPOSE = 5

/** Le solveur HiGHS tel que le rend `highs` (API historique). */
export interface Highs {
  solve(
    lp: string,
    options?: Record<string, string | number | boolean>,
  ): {
    Status: string
    Columns: Record<string, { Primal?: number }>
  }
}

export function courtOblige(s: SalarieSolveur, c: Creneau): boolean {
  return duree(c) > presenceMax(s, c) && c.raccourci > 0
}

export function reposAvecVoisins(s: SalarieSolveur, c: Creneau): boolean {
  const avant = s.finServicePrecedent
  const apres = s.debutServiceSuivant
  return (
    (avant === null || c.debut - avant >= s.reposQuotidienMin) &&
    (apres === null || apres - c.fin >= s.reposQuotidienMin)
  )
}

export function compatible(s: SalarieSolveur, c: Creneau): boolean {
  const j = jourDe(c)
  const impose = new Set(
    s.shiftImpose.filter(([jour]) => jour === j).map(([, code]) => code),
  )
  const r = role(s, c.poste)
  return (
    !s.placementManuel &&
    r !== null &&
    (r !== 'soutien' || c.soutien > 0) &&
    !s.indisponibilites.has(j) &&
    !s.horsContrat.has(j) &&
    dansLeContrat(s, c) &&
    !s.reposFixes.has(j) &&
    duree(c) - (courtOblige(s, c) ? c.raccourci : 0) <= presenceMax(s, c) &&
    !(s.nuitInterdite && toucheLaNuit(c)) &&
    (s.shiftsAutorises.size === 0 ||
      s.shiftsAutorises.has(c.typeShift ?? '')) &&
    (impose.size === 0 || impose.has(c.typeShift ?? '')) &&
    reposAvecVoisins(s, c)
  )
}

/** R-REPOS-HEBDO-35H possible avec ces seuls services ? */
export function reposHebdoPossible(
  s: SalarieSolveur,
  services: Creneau[],
  jours: number[],
): boolean {
  for (const d of jours) {
    if (s.joursHorsSite.has(d) || services.some((c) => jourDe(c) === d))
      continue
    const avant = services.filter((c) => jourDe(c) < d).map((c) => c.fin)
    const apres = services.filter((c) => jourDe(c) > d).map((c) => c.debut)
    const fin = avant.length ? Math.max(...avant) : s.finServicePrecedent
    const debut = apres.length ? Math.min(...apres) : s.debutServiceSuivant
    if (fin === null || debut === null || debut - fin >= s.reposHebdoMin)
      return true
  }
  return false
}

/** Petit générateur pseudo-aléatoire déterministe (mulberry32). */
function alea(graine: number): () => number {
  let a = graine >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Terme = readonly [number, string]

/** Un modèle linéaire en construction, écrit au format LP de HiGHS. */
class Modele {
  private n = 0
  readonly binaires: string[] = []
  readonly entiers: Array<[string, number, number]> = []
  readonly continues: Array<[string, number, number]> = []
  readonly contraintes: string[] = []
  readonly objectif = new Map<string, number>()
  impossible = false

  bool(): string {
    const v = `b${this.n++}`
    this.binaires.push(v)
    return v
  }

  entier(min: number, max: number): string {
    const v = `i${this.n++}`
    this.entiers.push([v, min, max])
    return v
  }

  continu(min: number, max: number): string {
    const v = `r${this.n++}`
    this.continues.push([v, min, max])
    return v
  }

  /** Σ termes (op) rhs ; une contrainte sans variable est vérifiée ici. */
  ajoute(termes: Terme[], op: '<=' | '>=' | '=', rhs: number): void {
    const somme = new Map<string, number>()
    for (const [coef, v] of termes) somme.set(v, (somme.get(v) ?? 0) + coef)
    const utiles = [...somme].filter(([, coef]) => coef !== 0)
    if (utiles.length === 0) {
      const ok = op === '<=' ? 0 <= rhs : op === '>=' ? 0 >= rhs : rhs === 0
      if (!ok) this.impossible = true
      return
    }
    this.contraintes.push(
      `${ligne(utiles.map(([v, c]) => [c, v]))} ${op} ${rhs}`,
    )
  }

  cout(coef: number, v: string): void {
    if (coef === 0) return
    this.objectif.set(v, (this.objectif.get(v) ?? 0) + coef)
  }

  lp(): string {
    const obj = [...this.objectif].map(([v, c]) => [c, v] as Terme)
    const toutes = [
      ...this.binaires,
      ...this.entiers.map((e) => e[0]),
      ...this.continues.map((e) => e[0]),
    ]
    const parts = [
      'Minimize',
      ` obj: ${obj.length ? ligne(obj) : `0 ${toutes[0]}`}`,
      'Subject To',
    ]
    this.contraintes.forEach((c, i) => parts.push(` c${i}: ${c}`))
    parts.push('Bounds')
    for (const [v, min, max] of [...this.entiers, ...this.continues]) {
      parts.push(` ${min} <= ${v} <= ${max}`)
    }
    if (this.entiers.length) {
      parts.push('General', ...enLignes(this.entiers.map((e) => e[0])))
    }
    if (this.binaires.length) parts.push('Binary', ...enLignes(this.binaires))
    parts.push('End')
    return parts.join('\n')
  }
}

function ligne(termes: Terme[]): string {
  const morceaux: string[] = []
  termes.forEach(([coef, v], i) => {
    const signe = coef < 0 ? '-' : '+'
    const abs = Math.abs(coef)
    const t = `${abs === 1 ? '' : `${abs} `}${v}`
    morceaux.push(i === 0 ? (coef < 0 ? `- ${t}` : t) : `${signe} ${t}`)
  })
  // Lignes courtes : une continuation commence par une espace.
  const lignes: string[] = []
  for (let i = 0; i < morceaux.length; i += 12) {
    lignes.push(morceaux.slice(i, i + 12).join(' '))
  }
  return lignes.join('\n  ')
}

function enLignes(noms: string[]): string[] {
  const r: string[] = []
  for (let i = 0; i < noms.length; i += 20)
    r.push(` ${noms.slice(i, i + 20).join(' ')}`)
  return r
}

function intervalle(debut: number, fin: number): number[] {
  const r: number[] = []
  for (let i = debut; i < fin; i++) r.push(i)
  return r
}

interface Construit {
  modele: Modele
  x: Map<string, string>
  court: Map<string, string>
  manque: Map<string, string>
  ecarts: Array<[string, string]>
}

export function construire(p: Probleme): Construit {
  const m = new Modele()
  const nbSemaines = Math.ceil(p.nbJours / 7)
  const hasard = alea(p.graine)
  const imposees = p.imposees
  const creneaux = new Map(p.creneaux.map((c) => [c.id, c]))
  const salaries = new Map(p.salaries.map((s) => [s.id, s]))

  const x = new Map<string, string>()
  for (const s of p.salaries) {
    for (const c of p.creneaux) {
      const k = cle(s.id, c.id)
      if (imposees.has(k) || (!c.ferme && compatible(s, c))) x.set(k, m.bool())
    }
  }
  for (const k of imposees) {
    const v = x.get(k)
    if (v) m.ajoute([[1, v]], '=', 1)
  }

  const court = new Map<string, string>()
  for (const [k, v] of x) {
    const [sId, cId] = scinder(k)
    const c = creneaux.get(cId)
    const s = salaries.get(sId)
    if (!c || !s || !c.raccourci) continue
    const vc = m.bool()
    court.set(k, vc)
    if (imposees.has(k)) {
      m.ajoute([[1, vc]], '=', p.courtes.has(k) ? 1 : 0)
    } else {
      m.ajoute(
        [
          [1, vc],
          [-1, v],
        ],
        '<=',
        0,
      )
      if (s.etoileFixe.has(jourDe(c)) || courtOblige(s, c)) {
        m.ajoute(
          [
            [1, vc],
            [-1, v],
          ],
          '=',
          0,
        )
      }
    }
  }

  const ecarts: Array<[string, string]> = []
  const manque = new Map<string, string>()

  // Couverture.
  for (const c of p.creneaux) {
    if (c.ferme) continue
    const autonomes: string[] = []
    const soutiens: Array<[SalarieSolveur, string]> = []
    for (const s of p.salaries) {
      const v = x.get(cle(s.id, c.id))
      if (!v) continue
      const r = role(s, c.poste)
      if (r === 'soutien') soutiens.push([s, v])
      else autonomes.push(v)
      if (r === 'occasionnel') m.cout(POIDS_OCCASIONNEL, v)
    }
    const vm = m.entier(0, c.effectif)
    manque.set(c.id, vm)
    m.ajoute(
      [...autonomes.map((v) => [1, v] as Terme), [1, vm]],
      '>=',
      c.effectif,
    )
    m.ajoute(
      autonomes.map((v) => [1, v] as Terme),
      '<=',
      c.effectif + c.facultatif,
    )
    m.cout(POIDS_MANQUE * duree(c), vm)
    if (soutiens.length) {
      const nbImposes = p.salaries.filter(
        (s) => imposees.has(cle(s.id, c.id)) && role(s, c.poste) === 'soutien',
      ).length
      m.ajoute(
        soutiens.map(([, v]) => [1, v] as Terme),
        '<=',
        Math.max(c.soutien, nbImposes),
      )
      for (const [s, v] of soutiens) {
        if (!imposees.has(cle(s.id, c.id))) {
          m.ajoute([[1, v], ...autonomes.map((a) => [-1, a] as Terme)], '<=', 0)
        }
      }
    }
  }

  // Une « expression » : termes + constante.
  type Expr = { termes: Terme[]; constante: number }
  const semainesJours = new Map<string, Expr>()
  const figes = new Map<string, number>()

  for (const s of p.salaries) {
    const siens = p.creneaux.filter((c) => x.has(cle(s.id, c.id)))
    const fixes = siens.filter((c) => imposees.has(cle(s.id, c.id)))
    const xv = (c: Creneau) => x.get(cle(s.id, c.id)) as string

    const parJour = new Map<number, Creneau[]>()
    for (const c of siens) {
      const j = jourDe(c)
      parJour.set(j, [...(parJour.get(j) ?? []), c])
    }
    const travaille = new Map<number, string>()
    for (const [jour, liste] of parJour) {
      const nbFixes = fixes.filter((c) => jourDe(c) === jour).length
      m.ajoute(
        liste.map((c) => [1, xv(c)] as Terme),
        '<=',
        Math.max(1, nbFixes),
      )
      const t = m.bool()
      travaille.set(jour, t)
      for (const c of liste)
        m.ajoute(
          [
            [1, t],
            [-1, xv(c)],
          ],
          '>=',
          0,
        )
      m.ajoute([[1, t], ...liste.map((c) => [-1, xv(c)] as Terme)], '<=', 0)
    }

    // Chevauchement et repos quotidien : paires interdites.
    for (let i = 0; i < siens.length; i++) {
      for (let k = i + 1; k < siens.length; k++) {
        const a = siens[i]
        const b = siens[k]
        if (fixes.includes(a) && fixes.includes(b)) continue
        const [premier, second] = a.debut <= b.debut ? [a, b] : [b, a]
        if (second.debut - premier.fin < s.reposQuotidienMin) {
          m.ajoute(
            [
              [1, xv(a)],
              [1, xv(b)],
            ],
            '<=',
            1,
          )
        }
      }
    }

    for (let k = 0; k < nbSemaines; k++) {
      const jours = intervalle(7 * k, Math.min(7 * k + 7, p.nbJours))
      const dans = (j: number) => jours.includes(j)
      const fixesSemaine = fixes.filter((c) => dans(jourDe(c)))
      const joursFixes = new Set(fixesSemaine.map(jourDe))
      const ecole = new Set(jours.filter((j) => s.joursHorsSite.has(j)))
      const fige = new Set([...joursFixes, ...ecole]).size
      figes.set(`${k}|${s.id}`, fige)

      const nbJours: Expr = {
        termes: jours
          .filter((j) => travaille.has(j) && !ecole.has(j))
          .map((j) => [1, travaille.get(j) as string] as Terme),
        constante: ecole.size,
      }
      const borne = (e: Expr, op: '<=' | '>=', rhs: number) =>
        m.ajoute(e.termes, op, rhs - e.constante)

      // R-SIX-JOURS-MAX.
      borne(nbJours, '<=', Math.max(s.joursTravaillesMaxSemaine, fige))
      // R-REPOS-HEBDO-HCR : un 6e jour coûte.
      if (s.joursPreferesSemaine < s.joursTravaillesMaxSemaine) {
        const six = m.entier(0, 7)
        // six >= nb_jours - préférés
        m.ajoute(
          [[1, six], ...nbJours.termes.map(([c, v]) => [-c, v] as Terme)],
          '>=',
          nbJours.constante - s.joursPreferesSemaine,
        )
        m.cout(POIDS_SIXIEME_JOUR, six)
      }
      if (s.reposDeuxSemaines) {
        const plafondDeux = 14 - s.reposDeuxSemaines
        const voisines: number[] = []
        if (k === 0 && s.joursSemainePrecedente !== null)
          voisines.push(s.joursSemainePrecedente)
        if (k === nbSemaines - 1 && s.joursSemaineSuivante !== null)
          voisines.push(s.joursSemaineSuivante)
        for (const autre of voisines)
          borne(nbJours, '<=', Math.max(plafondDeux - autre, fige))
        const prec = semainesJours.get(`${k - 1}|${s.id}`)
        if (k > 0 && prec) {
          m.ajoute(
            [...nbJours.termes, ...prec.termes],
            '<=',
            Math.max(plafondDeux, fige + (figes.get(`${k - 1}|${s.id}`) ?? 0)) -
              nbJours.constante -
              prec.constante,
          )
        }
        semainesJours.set(`${k}|${s.id}`, nbJours)
      }

      const minutes: Terme[] = []
      for (const c of siens) {
        if (!dans(jourDe(c))) continue
        minutes.push([travail(c), xv(c)])
        const vc = court.get(cle(s.id, c.id))
        if (vc) minutes.push([-c.raccourci, vc])
      }
      m.ajoute(
        minutes,
        '<=',
        Math.max(
          s.minutesHebdoMax,
          fixesSemaine.reduce((t, c) => t + travail(c), 0),
        ),
      )

      if (s.reposConsecutifs) {
        const paires: string[] = []
        for (const j of jours.slice(0, -1)) {
          if (
            joursFixes.has(j) ||
            joursFixes.has(j + 1) ||
            ecole.has(j) ||
            ecole.has(j + 1)
          )
            continue
          const libre = m.bool()
          for (const d of [j, j + 1]) {
            const t = travaille.get(d)
            if (t)
              m.ajoute(
                [
                  [1, libre],
                  [1, t],
                ],
                '<=',
                1,
              )
          }
          paires.push(libre)
        }
        if (paires.length)
          m.ajoute(
            paires.map((v) => [1, v] as Terme),
            '>=',
            1,
          )
      }

      if (s.reposHebdoMin && siens.length) {
        reposHebdo(m, s, siens, xv, travaille, jours, fixes)
      }

      if (!s.reposConsecutifs) {
        const accoles: string[] = []
        for (const j of jours.slice(0, -1)) {
          if (ecole.has(j) || ecole.has(j + 1)) continue
          const libre = m.bool()
          for (const d of [j, j + 1]) {
            const t = travaille.get(d)
            if (t)
              m.ajoute(
                [
                  [1, libre],
                  [1, t],
                ],
                '<=',
                1,
              )
          }
          accoles.push(libre)
        }
        if (accoles.length) {
          const deux = m.bool()
          for (const a of accoles)
            m.ajoute(
              [
                [1, deux],
                [-1, a],
              ],
              '>=',
              0,
            )
          m.ajoute(
            [[1, deux], ...accoles.map((a) => [-1, a] as Terme)],
            '<=',
            0,
          )
          m.cout(-POIDS_REPOS_SEPARES, deux)
        }
      }

      for (const j of s.travailFixe) {
        const t = travaille.get(j)
        if (dans(j) && t) m.cout(-POIDS_JOUR_FIXE, t)
      }

      if (s.journeesCourtesMax !== null) {
        const courtes: string[] = []
        let courtesFixes = 0
        for (const c of siens) {
          if (!dans(jourDe(c))) continue
          const k2 = cle(s.id, c.id)
          if (travail(c) < s.journeePleine) {
            courtes.push(xv(c))
            if (imposees.has(k2)) courtesFixes++
          } else if (
            court.has(k2) &&
            travail(c) - c.raccourci < s.journeePleine
          ) {
            courtes.push(court.get(k2) as string)
            if (p.courtes.has(k2)) courtesFixes++
          }
        }
        m.ajoute(
          courtes.map((v) => [1, v] as Terme),
          '<=',
          Math.max(s.journeesCourtesMax, courtesFixes),
        )
      }

      // Coller au contrat : minutes - contrat = plus - moins.
      const moins = m.continu(0, 7 * 24 * 60)
      const plus = m.continu(0, 7 * 24 * 60)
      m.ajoute([...minutes, [-1, plus], [1, moins]], '=', s.minutesHebdoContrat)
      ecarts.push([plus, moins])
      if (s.contratIndicatif) {
        m.cout(1, moins)
        m.cout(1, plus)
      } else {
        m.cout(POIDS_SOUS_CONTRAT, moins)
        m.cout(POIDS_SUR_CONTRAT, plus)
      }
    }
  }

  // Même personne sur deux fiches.
  const parPersonne = new Map<string, SalarieSolveur[]>()
  for (const s of p.salaries) {
    if (s.personne !== null)
      parPersonne.set(s.personne, [...(parPersonne.get(s.personne) ?? []), s])
  }
  for (const fiches of parPersonne.values()) {
    for (let i = 0; i < fiches.length; i++) {
      for (let k = i + 1; k < fiches.length; k++) {
        const s1 = fiches[i]
        const s2 = fiches[k]
        const repos = Math.max(s1.reposQuotidienMin, s2.reposQuotidienMin)
        for (const c1 of p.creneaux) {
          const v1 = x.get(cle(s1.id, c1.id))
          if (!v1) continue
          for (const c2 of p.creneaux) {
            const v2 = x.get(cle(s2.id, c2.id))
            if (!v2) continue
            if (
              imposees.has(cle(s1.id, c1.id)) &&
              imposees.has(cle(s2.id, c2.id))
            )
              continue
            const [premier, second] = c1.debut <= c2.debut ? [c1, c2] : [c2, c1]
            if (second.debut - premier.fin < repos)
              m.ajoute(
                [
                  [1, v1],
                  [1, v2],
                ],
                '<=',
                1,
              )
          }
        }
      }
    }
  }

  // Rebattre : refaire la même proposition coûte un peu.
  if (p.aEviter.size) {
    for (const [k, v] of x) {
      const [sId, cId] = scinder(k)
      const c = creneaux.get(cId)
      if (!c || imposees.has(k)) continue
      if (p.aEviter.has(cleAEviter(sId, jourDe(c), c.poste, c.typeShift))) {
        m.cout(POIDS_DEJA_PROPOSE, v)
      }
    }
  }
  // Petit bruit : à qualité égale, chaque graine donne une autre simulation.
  if (p.graine) {
    for (const v of x.values()) m.cout(Math.floor(hasard() * 4), v)
  }

  return { modele: m, x, court, manque, ecarts }
}

function reposHebdo(
  m: Modele,
  s: SalarieSolveur,
  siens: Creneau[],
  xv: (c: Creneau) => string,
  travaille: Map<number, string>,
  jours: number[],
  fixes: Creneau[],
): void {
  if (!reposHebdoPossible(s, fixes, jours)) return
  const minimum = s.reposHebdoMin
  const longs: string[] = []
  for (const d of jours) {
    if (s.joursHorsSite.has(d)) continue
    if (
      s.finServicePrecedent !== null &&
      s.debutServiceSuivant !== null &&
      s.debutServiceSuivant - s.finServicePrecedent < minimum
    ) {
      continue
    }
    const long = m.bool()
    const t = travaille.get(d)
    if (t)
      m.ajoute(
        [
          [1, long],
          [1, t],
        ],
        '<=',
        1,
      )
    const avant = siens.filter((c) => jourDe(c) < d)
    const apres = siens.filter((c) => jourDe(c) > d)
    for (const b of apres) {
      if (
        s.finServicePrecedent !== null &&
        b.debut - s.finServicePrecedent < minimum
      ) {
        m.ajoute(
          [
            [1, long],
            [1, xv(b)],
          ],
          '<=',
          1,
        )
      }
    }
    for (const a of avant) {
      if (
        s.debutServiceSuivant !== null &&
        s.debutServiceSuivant - a.fin < minimum
      ) {
        m.ajoute(
          [
            [1, long],
            [1, xv(a)],
          ],
          '<=',
          1,
        )
      }
    }
    for (const a of avant) {
      for (const b of apres) {
        if (b.debut - a.fin < minimum) {
          m.ajoute(
            [
              [1, long],
              [1, xv(a)],
              [1, xv(b)],
            ],
            '<=',
            2,
          )
        }
      }
    }
    longs.push(long)
  }
  if (longs.length)
    m.ajoute(
      longs.map((v) => [1, v] as Terme),
      '>=',
      1,
    )
}

function scinder(k: string): [string, string] {
  const i = k.indexOf('|')
  return [k.slice(0, i), k.slice(i + 1)]
}

/** Résout le problème avec HiGHS (chargé par l'appelant : worker ou test). */
export function generer(p: Probleme, highs: Highs): Resultat {
  const { modele, x, court, manque, ecarts } = construire(p)
  if (modele.impossible) {
    return {
      statut: 'inconnu',
      affectations: [],
      manques: [],
      ecartTotalMinutes: null,
    }
  }
  if (x.size === 0 && manque.size === 0) {
    return {
      statut: 'optimal',
      affectations: [],
      manques: [],
      ecartTotalMinutes: 0,
    }
  }
  const solution = highs.solve(modele.lp(), {
    time_limit: p.tempsMaxSecondes,
    mip_rel_gap: 0,
    mip_abs_gap: 0.5,
    random_seed: Math.abs(p.graine) % 2_147_483_647,
    output_flag: false,
  })
  const valeur = (v: string) => Math.round(solution.Columns[v]?.Primal ?? 0)
  const aSolution = Object.keys(solution.Columns).length > 0
  const statut =
    solution.Status === 'Optimal'
      ? 'optimal'
      : aSolution &&
          /time limit|iteration limit|interrupt/i.test(solution.Status)
        ? 'realisable'
        : 'inconnu'
  if (statut === 'inconnu') {
    return { statut, affectations: [], manques: [], ecartTotalMinutes: null }
  }
  const affectations: AffectationSolveur[] = []
  for (const [k, v] of x) {
    if (valeur(v) !== 1) continue
    const [salarieId, creneauId] = scinder(k)
    const vc = court.get(k)
    affectations.push({
      salarieId,
      creneauId,
      court: vc ? valeur(vc) === 1 : false,
    })
  }
  const manques: Manque[] = []
  for (const [creneauId, v] of manque) {
    const n = valeur(v)
    if (n) manques.push({ creneauId, manquant: n })
  }
  return {
    statut,
    affectations,
    manques,
    ecartTotalMinutes: ecarts.reduce(
      (t, [plus, moins]) => t + valeur(plus) + valeur(moins),
      0,
    ),
  }
}
