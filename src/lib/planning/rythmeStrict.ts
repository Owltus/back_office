/*
 * RYTHME 5 JOURS PUIS 2 JOURS, STRICT (décision de l'utilisateur du
 * 2026-11-09 : « les repos, il faut qu'ils soient absolument sur 2 jours
 * d'affilée, donc c'est normal que pour la semaine de travail ce soit le cas
 * aussi »). Pour un contrat au rythme humain (`rythmeHumain`, 35 h et plus à
 * l'hôtel), sur la suite des jours, semaines voisines comprises :
 *   (a) un jour de repos n'est jamais seul (il touche un autre repos ou un
 *       jour neutre) ;
 *   (b) un bloc de travail fait EXACTEMENT 5 jours, sauf s'il touche un jour
 *       neutre ou un bord inconnu (alors au plus 5) ;
 *   (c) un bloc de repos entre deux blocs de travail fait EXACTEMENT 2 jours,
 *       sauf s'il touche un jour neutre.
 * Un jour NEUTRE coupe le rythme sans compter ni comme travail ni comme
 * repos : école, absence décomptée (congé, maladie, formation, jour férié
 * chômé, jour férié rattrapé), jour hors contrat (avant l'arrivée, après la
 * fin). Un repos posé (motif sans décompte) est un repos. Une semaine voisine
 * inconnue : rien n'est demandé.
 *
 * UNE définition : `fautesRythme` (vérificateur, repos obligés, « À
 * vérifier ») et `MOTIFS_INTERDITS` (générateur) disent la même chose, ce que
 * prouve `rythmeStrict.test.ts` sur des suites tirées au hasard.
 */

import { rythmeHumain } from '#/lib/planning/regles.ts'
import type { SalarieSolveur } from '#/lib/planning/modele.ts'
import type { RegleEtablissement } from '#/lib/planning/reglesEtablissement.ts'
import { REGLES_PAR_DEFAUT } from '#/lib/planning/reglesEtablissement.ts'

/** Un jour : T travaillé, r repos, n neutre, u inconnu. */
export type EtatRythme = 'T' | 'r' | 'n' | 'u'

/** Jours de travail d'un bloc. */
export const RYTHME_TRAVAIL = 5
/** Jours de repos entre deux blocs. */
export const RYTHME_REPOS = 2

export type GenreFaute =
  'repos-seul' | 'repos-long' | 'travail-court' | 'travail-long'

/** Un bloc fautif : indices de son premier et de son dernier jour. */
export interface FauteRythme {
  genre: GenreFaute
  debut: number
  fin: number
}

/** La règle s'applique-t-elle à cette personne ? Le réglage de
 * l'établissement, le rythme humain (35 h et plus, ni extra ni forfait),
 * et pas une semaine type qui fixe deux repos ou plus (elle décide seule,
 * comme pour les deux repos de suite). */
export function rythmeStrictDe(
  s: Parameters<typeof rythmeHumain>[0] & {
    reposFixes: ReadonlySet<number>
  },
  regles: RegleEtablissement = REGLES_PAR_DEFAUT,
): boolean {
  return (
    regles.repos.rythmeStrict &&
    s.reposFixes.size < 2 &&
    rythmeHumain(s, regles)
  )
}

/** Les blocs fautifs d'une suite de jours. Hors de la suite : inconnu. */
export function fautesRythme(etats: readonly EtatRythme[]): FauteRythme[] {
  const r: FauteRythme[] = []
  const lu = (i: number): EtatRythme =>
    i < 0 || i >= etats.length ? 'u' : etats[i]
  let i = 0
  while (i < etats.length) {
    const e = etats[i]
    if (e !== 'T' && e !== 'r') {
      i++
      continue
    }
    let f = i
    while (f + 1 < etats.length && etats[f + 1] === e) f++
    const n = f - i + 1
    const avant = lu(i - 1)
    const apres = lu(f + 1)
    if (e === 'T') {
      if (n > RYTHME_TRAVAIL)
        r.push({ genre: 'travail-long', debut: i, fin: f })
      else if (n < RYTHME_TRAVAIL && avant === 'r' && apres === 'r')
        r.push({ genre: 'travail-court', debut: i, fin: f })
    } else if (avant === 'T' && apres === 'T' && n !== RYTHME_REPOS) {
      r.push({ genre: n === 1 ? 'repos-seul' : 'repos-long', debut: i, fin: f })
    }
    i = f + 1
  }
  return r
}

/** Les motifs que le calcul interdit, chacun une suite de jours T ou r qui
 * ne doit apparaître nulle part (sans jour neutre ni inconnu dedans) :
 * 6 jours de travail ; un bloc de 1 à 4 jours entre deux repos ; un repos
 * seul entre deux jours de travail ; 3 repos ou plus entre deux. `longueur`
 * borne les motifs (la suite des jours du calcul). Même règle que
 * `fautesRythme`. */
export function motifsInterdits(
  longueur: number,
): Array<readonly ('T' | 'r')[]> {
  const r: Array<readonly ('T' | 'r')[]> = []
  const fois = (e: 'T' | 'r', k: number) => Array.from({ length: k }, () => e)
  if (RYTHME_TRAVAIL + 1 <= longueur) r.push(fois('T', RYTHME_TRAVAIL + 1))
  for (let k = 1; k < RYTHME_TRAVAIL && k + 2 <= longueur; k++)
    r.push(['r', ...fois('T', k), 'r'])
  for (let k = 1; k + 2 <= longueur; k++)
    if (k !== RYTHME_REPOS) r.push(['T', ...fois('r', k), 'T'])
  return r
}

const NOMS_JOURS = [
  'lundi',
  'mardi',
  'mercredi',
  'jeudi',
  'vendredi',
  'samedi',
  'dimanche',
]

/** Le nom d'un jour de la période (0 = lundi), « d'avant » ou « d'après »
 * hors de la semaine. */
export function nomJourRythme(d: number, nbJours: number): string {
  const nom = NOMS_JOURS[((d % 7) + 7) % 7]
  if (d < 0) return `${nom} d'avant`
  if (d >= nbJours) return `${nom} d'après`
  return nom
}

/** Début commun des messages (vérificateur, raisons d'une place). */
export const RYTHME_NON_TENU = 'rythme 5 et 2 non tenu'

/** Le message d'une faute, avec ses jours (indices de la période). Sans
 * `nbJours` : le message court, sans les jours (raisons d'une place : deux
 * fautes du même genre s'y confondent). */
export function messageFaute(
  f: Pick<FauteRythme, 'genre' | 'debut' | 'fin'>,
  nbJours?: number,
): string {
  const n = f.fin - f.debut + 1
  const jours =
    nbJours === undefined
      ? ''
      : n === 1
        ? ` le ${nomJourRythme(f.debut, nbJours)}`
        : ` du ${nomJourRythme(f.debut, nbJours)} au ${nomJourRythme(f.fin, nbJours)}`
  switch (f.genre) {
    case 'repos-seul':
      return `${RYTHME_NON_TENU} : repos seul${jours}`
    case 'repos-long':
      return `${RYTHME_NON_TENU} : ${nbJours === undefined ? 'plus de 2' : n} jours de repos${jours} entre deux blocs de travail (${RYTHME_REPOS} attendus)`
    case 'travail-court':
      return `${RYTHME_NON_TENU} : ${nbJours === undefined ? 'moins de 5' : n} jours de travail${jours} (${RYTHME_TRAVAIL} attendus)`
    case 'travail-long':
      return `${RYTHME_NON_TENU} : ${nbJours === undefined ? 'plus de 5' : n} jours de travail d'affilée${jours} (${RYTHME_TRAVAIL} au plus)`
  }
}

/** Une semaine voisine (7 jours) lue en états : chaîne de 7 lettres
 * T, r, n ou u, ou null si elle est inconnue. */
export function lireSemaineVoisine(
  etats: string | null | undefined,
): EtatRythme[] | null {
  if (!etats || etats.length !== 7) return null
  return [...etats].map((c) => (c === 'T' || c === 'n' || c === 'u' ? c : 'r'))
}

/** Les semaines voisines d'une personne pour le rythme : `etatsAvant` et
 * `etatsApres` quand ils sont lus (`avecSemainesVoisines`) ; sinon (données
 * de test, appelant ancien) la seule série connue (`serieAvant`,
 * `serieApres`) : ses jours travaillés, le reste inconnu. */
export function voisinesRythme(
  s: Pick<
    SalarieSolveur,
    | 'etatsAvant'
    | 'etatsApres'
    | 'joursSemainePrecedente'
    | 'joursSemaineSuivante'
    | 'serieAvant'
    | 'serieApres'
  >,
): { avant: EtatRythme[] | null; apres: EtatRythme[] | null } {
  const serie = (n: number, fin: boolean): EtatRythme[] =>
    Array.from({ length: 7 }, (_, j) =>
      (fin ? j >= 7 - n : j < n) ? 'T' : 'u',
    )
  return {
    avant:
      s.etatsAvant !== undefined
        ? lireSemaineVoisine(s.etatsAvant)
        : s.joursSemainePrecedente !== null && s.serieAvant > 0
          ? serie(s.serieAvant, true)
          : null,
    apres:
      s.etatsApres !== undefined
        ? lireSemaineVoisine(s.etatsApres)
        : s.joursSemaineSuivante !== null && s.serieApres > 0
          ? serie(s.serieApres, false)
          : null,
  }
}

/** Les jours neutres de la période d'une personne (`joursNeutres`), ou, sans
 * eux (données de test), hors contrat, école et indisponibilités qui ne sont
 * pas des repos fixes. */
export function neutresDe(
  s: Pick<
    SalarieSolveur,
    | 'joursNeutres'
    | 'horsContrat'
    | 'joursHorsSite'
    | 'indisponibilites'
    | 'reposFixes'
  >,
): ReadonlySet<number> {
  if (s.joursNeutres) return s.joursNeutres
  return new Set([
    ...s.horsContrat,
    ...s.joursHorsSite,
    ...[...s.indisponibilites].filter((j) => !s.reposFixes.has(j)),
  ])
}

/** La suite des jours d'une personne, de 7 jours avant la période à 7 jours
 * après : `etats[d + 7]` est le jour `d`. Dans la période, un jour travaillé
 * (`travaille`) est T, un jour neutre n, le reste r ; hors de la période, les
 * semaines voisines (`etatsAvant`, `etatsApres`), inconnues : u. */
export function suiteRythme(
  s: Pick<
    SalarieSolveur,
    | 'joursNeutres'
    | 'horsContrat'
    | 'joursHorsSite'
    | 'indisponibilites'
    | 'reposFixes'
    | 'etatsAvant'
    | 'etatsApres'
    | 'joursSemainePrecedente'
    | 'joursSemaineSuivante'
    | 'serieAvant'
    | 'serieApres'
  >,
  nbJours: number,
  travaille: (d: number) => boolean,
): EtatRythme[] {
  const neutres = neutresDe(s)
  const v = voisinesRythme(s)
  const avant = v.avant ?? (Array(7).fill('u') as EtatRythme[])
  const apres = v.apres ?? (Array(7).fill('u') as EtatRythme[])
  const ici: EtatRythme[] = []
  for (let d = 0; d < nbJours; d++)
    ici.push(travaille(d) ? 'T' : neutres.has(d) ? 'n' : 'r')
  return [...avant, ...ici, ...apres]
}
