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
 *
 * CE QUE VAUT CHAQUE JOUR (révisé le même jour, décision de l'utilisateur :
 * « les jours d'école au CFA, considère-les comme des jours de travail…
 * prends bien tout en compte pour que tout soit cohérent ») — UNE source,
 * lue par le calcul, le vérificateur, les repos obligés et « À vérifier » :
 *   TRAVAIL (T, compte dans le bloc de 5) :
 *     - un shift, proposé, validé ou d'une semaine verrouillée ;
 *     - un jour d'école (motif de nature école, CFA) : un apprenti fait 5
 *       jours d'école puis 2 repos comme 5 jours à l'hôtel
 *       (`TTTTTrr EEEEErr`) ; une école de 3 jours se complète de 2 shifts ;
 *     - un jour d'un motif qui compte TOUJOURS comme du travail
 *       (`rythme_travail`, la formation à l'hôtel ; décision de
 *       l'utilisateur du 2026-11-09 : « même une formation de deux
 *       semaines »), quelle que soit sa durée : jamais neutre ;
 *     - un jour d'ABSENCE DÉCOMPTÉE (motif au décompte : congé payé,
 *       maladie, sans solde, jour férié chômé, jour férié
 *       rattrapé pris, absence autorisée, congé décès, absence de la semaine
 *       type, et les jours fériés ajoutés au calcul pour les stagiaires et
 *       l'encadrement, `avecFeriesDuJour`) : il remplace un jour de travail
 *       (congé du lundi au vendredi = un bloc entouré de deux repos ; 3 jours
 *       de congé et 2 shifts = un bloc) — SAUF une absence longue ;
 *     - un jour férié rattrapé que le calcul propose (variable du modèle).
 *   REPOS (r, compte dans les 2) :
 *     - un repos de la semaine type ;
 *     - un repos posé ou proposé (motif de nature repos) ;
 *     - une absence SANS décompte (repos exceptionnel, récupération, repos
 *       forfait) : elle ne remplace aucun jour de travail ;
 *     - un jour sans rien, y compris un jour passé resté vide ;
 *     - un repos sur un congé en trop une fois validé (c'est alors un repos
 *       posé ; avant, il est montré dans une absence longue, neutre).
 *   NEUTRE (n, coupe le rythme sans compter) :
 *     - un jour hors contrat (avant l'arrivée, après la fin) ;
 *     - une ABSENCE LONGUE : une suite de plus de 5 jours d'absences
 *       décomptées (`ABSENCE_LONGUE` : congé de deux semaines, arrêt maladie
 *       long), semaines voisines comprises. Elle contient déjà ses repos : on
 *       n'exige pas deux repos juste après. L'école, un repos, un shift ou un
 *       jour hors contrat coupe la suite.
 *   SUITE MÊLÉE congé + formation : un jour de formation ne COUPE pas la
 *     suite d'absences et n'y COMPTE pas. La longueur est le nombre de jours
 *     d'absence décomptée (hors formation) de la suite d'absences et de
 *     formations ; s'il dépasse 5, ces jours sont neutres ; la formation,
 *     elle, reste du travail. `CCCC FF CCCC` : 8 jours de congé, neutres,
 *     2 jours de formation entre eux (`nnnn TT nnnn`, aucune faute) ;
 *     `CCC F CC` : 5 jours de congé, du travail, soit 6 jours de travail
 *     d'affilée (faute, comme 3 jours de congé, un shift et 2 jours de
 *     congé). Un congé de deux semaines coupé d'une journée de formation
 *     reste donc une absence longue.
 *   INCONNU (u) : une semaine voisine non lue, rien n'est demandé.
 * Les autres marques d'un motif ne comptent pas ici : `libre_weekend`
 * (partage des week-ends), `reserve_forfait` (cadres au forfait, jamais au
 * rythme humain), le rôle `repos_defaut` (un motif de nature repos).
 *
 * UNE définition : `fautesRythme` (vérificateur, repos obligés, « À
 * vérifier ») et `motifsInterdits` (générateur) disent la même chose, ce que
 * prouve `rythmeStrict.test.ts` sur des suites tirées au hasard ;
 * `statutAbsence` et `resoudreAbsences` rangent les jours pour tous.
 */

import { rythmeHumain } from '#/lib/planning/regles.ts'
import type { SalarieSolveur } from '#/lib/planning/modele.ts'
import type { RegleEtablissement } from '#/lib/planning/reglesEtablissement.ts'
import { REGLES_PAR_DEFAUT } from '#/lib/planning/reglesEtablissement.ts'

/** Un jour : T travaillé, r repos, n neutre, u inconnu. */
export type EtatRythme = 'T' | 'r' | 'n' | 'u'

/** Un jour avant la règle de l'absence longue : `a` une absence décomptée
 * (hors école), `f` un motif qui compte toujours comme du travail
 * (`rythme_travail`, formation), le reste comme `EtatRythme`. */
export type StatutRythme = EtatRythme | 'a' | 'f'

/** Une suite d'absences décomptées de PLUS de 5 jours est neutre ; de 1 à 5
 * jours, elle compte comme du travail. */
export const ABSENCE_LONGUE = 5

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

/** Les absences décomptées d'une suite, rangées : une suite de plus de
 * `ABSENCE_LONGUE` jours devient neutre, une plus courte du travail. Un
 * jour de formation (`f`) est du travail ; il ne coupe pas la suite et n'y
 * compte pas (suite mêlée, en tête du fichier). Le reste est rendu tel
 * quel. Une suite qui touche le bord est lue sur ce qui en est connu. */
export function resoudreAbsences(
  statuts: readonly StatutRythme[],
): EtatRythme[] {
  const r: EtatRythme[] = []
  let i = 0
  while (i < statuts.length) {
    const e = statuts[i]
    if (e !== 'a' && e !== 'f') {
      r.push(e)
      i++
      continue
    }
    let f = i
    while (
      f + 1 < statuts.length &&
      (statuts[f + 1] === 'a' || statuts[f + 1] === 'f')
    )
      f++
    let absences = 0
    for (let k = i; k <= f; k++) if (statuts[k] === 'a') absences++
    const longue = absences > ABSENCE_LONGUE
    for (let k = i; k <= f; k++)
      r.push(statuts[k] === 'f' ? 'T' : longue ? 'n' : 'T')
    i = f + 1
  }
  return r
}

/** Le statut d'un jour d'absence d'après son motif : école = travail ;
 * motif sans décompte (repos, repos exceptionnel, récupération, repos
 * forfait) = repos ; motif au décompte qui compte toujours comme du travail
 * (`rythmeTravail`, formation) = `f` ; autre motif au décompte, ou absence
 * sans motif (semaine type) = absence décomptée ; `f` et `a` rangés ensuite
 * par `resoudreAbsences`. */
export function statutAbsence(
  motif: number | null | undefined,
  ecole: ReadonlySet<number>,
  sansDecompte: ReadonlySet<number>,
  rythmeTravail: ReadonlySet<number> = new Set(),
): StatutRythme {
  if (motif !== null && motif !== undefined) {
    if (ecole.has(motif)) return 'T'
    if (sansDecompte.has(motif)) return 'r'
    if (rythmeTravail.has(motif)) return 'f'
  }
  return 'a'
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

/*
 * TRANSITION (décisions de l'utilisateur du 2026-11-09 : « oui, mais
 * vraiment si utile », puis « ne place jamais plus de deux jours de repos à
 * la suite, c'est pas possible »). Décaler les jours de repos de quelqu'un
 * demande UN bloc de 4 jours entre deux repos (les repos avancent d'un
 * jour) : c'est la seule transition. Sans elle, une équipe dont trois
 * personnes ont les mêmes repos les garde toute l'année (5 + 2 = 7), et le
 * matin de ce jour-là reste sans personne confirmée. Une transition reste
 * une faute au sens de `fautesRythme` ; `estTransition` la reconnaît, le
 * calcul la paie moins cher (au-dessus d'une place, sous une heure due,
 * `prixOrdre`, generateur.ts) et le vérificateur la dit comme un changement
 * de jours de repos, sans bloquer.
 *
 * REPOS TROP LONG : 3 repos ou plus entre deux blocs de travail
 * (`estReposTropLong`), jamais par le calcul ; quand les faits l'imposent
 * (le bloc et tous ces repos connus d'avance, `fauteScellee`), le calcul ne
 * l'écrit pas, et le vérificateur le dit quand même.
 *
 * REPOS SEUL (« possible, mais dans un cas vraiment d'urgence si manque de
 * personnel ») : un repos entre deux blocs, au plus un par personne sur
 * `FENETRE_RYTHME` jours (`estReposSeul`, `reposSeulsRecents`) ; dit
 * « repos seul (manque de personnel) », sans bloquer.
 */

/** Repos entre deux blocs à partir duquel c'est « trop long » : jamais. */
export const REPOS_TROP_LONG = RYTHME_REPOS + 1

/** La fenêtre où se comptent les transitions et les repos seuls déjà faits
 * (4 semaines, celle du partage des week-ends). */
export const FENETRE_RYTHME = 28
/** Ancien nom (transitions comptées sur 4 semaines). */
export const FENETRE_TRANSITION = FENETRE_RYTHME

/** Une faute qui décale les repos d'un jour : un bloc de 4 jours entre deux
 * repos. */
export function estTransition(
  f: Pick<FauteRythme, 'genre' | 'debut' | 'fin'>,
): boolean {
  return (
    f.genre === 'travail-court' && f.fin - f.debut + 1 === RYTHME_TRAVAIL - 1
  )
}

/** Un repos seul entre deux blocs (urgence). */
export function estReposSeul(f: Pick<FauteRythme, 'genre'>): boolean {
  return f.genre === 'repos-seul'
}

/** 3 repos ou plus entre deux blocs de travail. */
export function estReposTropLong(
  f: Pick<FauteRythme, 'genre' | 'debut' | 'fin'>,
): boolean {
  return f.genre === 'repos-long' && f.fin - f.debut + 1 >= REPOS_TROP_LONG
}

/** Ce que coûte un motif interdit au calcul (`motifsInterdits`) :
 *   - `six` : 6 jours de travail, DUR ;
 *   - `dur` : 3 repos ou plus entre deux blocs, au-dessus de tout (le
 *     modèle reste possible quand les faits l'imposent) ;
 *   - `transition` : un bloc de 4 jours ;
 *   - `urgence` : un repos seul ;
 *   - `fort` : un bloc de 1 à 3 jours. */
export type GenreMotif = 'six' | 'dur' | 'transition' | 'urgence' | 'fort'

export function genreMotif(motif: readonly ('T' | 'r')[]): GenreMotif {
  if (motif.every((e) => e === 'T')) return 'six'
  const n = motif.length - 2
  if (motif[0] === 'T') return n >= REPOS_TROP_LONG ? 'dur' : 'urgence'
  return n === RYTHME_TRAVAIL - 1 ? 'transition' : 'fort'
}

/** Les transitions faites sur une suite de jours connus (le passé d'une
 * personne) : seules celles dont les deux bords sont dans la suite. */
export function transitionsDans(etats: readonly EtatRythme[]): number {
  return fautesRythme(etats).filter(estTransition).length
}

/** Les repos seuls faits sur une suite de jours connus. */
export function reposSeulsDans(etats: readonly EtatRythme[]): number {
  return fautesRythme(etats).filter(estReposSeul).length
}

/** Repos seuls permis sur 4 semaines : un ; deux avant une semaine
 * d'école (la semaine d'avant, et celle d'encore avant si la même
 * transition l'exige), pour faire toutes les heures (décision de
 * l'utilisateur du 2026-11-09). */
export const REPOS_SEULS_MAX = 1
export const REPOS_SEULS_MAX_AVANT_ECOLE = 2

/** Les repos seuls que le calcul peut encore faire, à leur prix d'urgence,
 * d'après ceux déjà faits sur 4 semaines. */
export function reposSeulsPermis(s: {
  reposSeulsRecents?: number
  ecoleProche?: boolean
}): number {
  const max = s.ecoleProche ? REPOS_SEULS_MAX_AVANT_ECOLE : REPOS_SEULS_MAX
  return Math.max(0, max - (s.reposSeulsRecents ?? 0))
}

/** Le message d'une transition faite : un changement de jours de repos,
 * pas une faute. Sans `nbJours` : sans les jours. */
export function messageTransition(
  f: Pick<FauteRythme, 'genre' | 'debut' | 'fin'>,
  nbJours?: number,
): string {
  const jours =
    nbJours === undefined
      ? ''
      : ` du ${nomJourRythme(f.debut, nbJours)} au ${nomJourRythme(f.fin, nbJours)}`
  return `${CHANGEMENT_REPOS} : 4 jours de travail${jours}`
}

/** Début commun des messages d'une transition. */
export const CHANGEMENT_REPOS = 'changement de jours de repos'

/** Le message d'un repos seul. Sans `nbJours` : sans le jour. */
export function messageReposSeul(
  f: Pick<FauteRythme, 'debut'>,
  nbJours?: number,
): string {
  return `${REPOS_SEUL_URGENCE}${nbJours === undefined ? '' : ` le ${nomJourRythme(f.debut, nbJours)}`}`
}

/** Début commun des messages d'un repos seul. */
export const REPOS_SEUL_URGENCE = 'repos seul (manque de personnel)'

/** Un jour connu d'avance, que le planning ne décide pas : hors de la
 * période (semaine voisine), ou une indisponibilité (absence, école, repos
 * posé, jour passé au calcul), un repos fixe, un jour hors contrat. */
export function jourConnu(
  s: Pick<
    SalarieSolveur,
    'indisponibilites' | 'reposFixes' | 'horsContrat' | 'joursHorsSite'
  >,
  d: number,
  nbJours: number,
): boolean {
  return (
    d < 0 ||
    d >= nbJours ||
    s.indisponibilites.has(d) ||
    s.reposFixes.has(d) ||
    s.horsContrat.has(d) ||
    s.joursHorsSite.has(d)
  )
}

/** Une faute que les FAITS ont déjà faite : plus de 2 repos entre deux
 * blocs, quand le bloc d'un côté et TOUS ces repos sont connus d'avance
 * (`connu`, même repère que la faute, `jourConnu` ; révisé le 2026-11-09 :
 * avant, le bloc et 3 repos scellaient aussi 4, 5… repos, et rien
 * n'obligeait à reprendre au 4e jour). La reprise de l'autre côté ne peut
 * plus l'éviter qu'en ne reprenant jamais : le calcul ne l'interdit pas, le
 * vérificateur et les repos obligés ne la disent pas (relecture du
 * 2026-11-09 : une semaine d'avant finie par 3 repos bloquait toute la
 * semaine suivante). Même définition que `rythmeStrictModele`. */
export function fauteScellee(
  f: Pick<FauteRythme, 'genre' | 'debut' | 'fin'>,
  connu: (i: number) => boolean,
): boolean {
  if (f.genre !== 'repos-long') return false
  const k = f.fin - f.debut + 2
  const tous = (de: number, pas: number) => {
    for (let i = 0; i < k; i++) if (!connu(de + pas * i)) return false
    return true
  }
  return tous(f.debut - 1, 1) || tous(f.fin + 1, -1)
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

/** Les jours de la période d'une personne qui ne dépendent pas du calcul :
 * NEUTRES (hors contrat, absence longue) et TRAVAIL sans shift (école,
 * absence décomptée courte), lus par la semaine (`joursNeutres`,
 * `joursTravailRythme`, semaines voisines comprises). Sans eux (données de
 * test) : hors contrat neutre, école travail, et les indisponibilités qui
 * ne sont ni un repos fixe ni hors contrat comptées comme des absences
 * décomptées de la semaine seule. */
export function joursRythmeDe(
  s: Pick<
    SalarieSolveur,
    | 'joursNeutres'
    | 'joursTravailRythme'
    | 'horsContrat'
    | 'joursHorsSite'
    | 'indisponibilites'
    | 'reposFixes'
  >,
  nbJours = 7,
): { neutres: ReadonlySet<number>; travail: ReadonlySet<number> } {
  if (s.joursNeutres)
    return {
      neutres: s.joursNeutres,
      travail: s.joursTravailRythme ?? new Set(),
    }
  const jours = Array.from({ length: nbJours }, (_, d): StatutRythme => {
    if (s.horsContrat.has(d)) return 'n'
    if (s.joursHorsSite.has(d)) return 'T'
    if (s.indisponibilites.has(d) && !s.reposFixes.has(d)) return 'a'
    return 'r'
  })
  const etats = resoudreAbsences(jours)
  const neutres = new Set<number>()
  const travail = new Set<number>()
  etats.forEach((e, d) => {
    if (e === 'n') neutres.add(d)
    else if (e === 'T') travail.add(d)
  })
  return { neutres, travail }
}

/** La suite des jours d'une personne, de 7 jours avant la période à 7 jours
 * après : `etats[d + 7]` est le jour `d`. Dans la période, un jour travaillé
 * (`travaille`) ou de travail sans shift (école, absence courte,
 * `joursRythmeDe`) est T, un jour neutre n, le reste r ; hors de la période,
 * les semaines voisines (`etatsAvant`, `etatsApres`), inconnues : u. */
export function suiteRythme(
  s: Pick<
    SalarieSolveur,
    | 'joursNeutres'
    | 'joursTravailRythme'
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
  const { neutres, travail } = joursRythmeDe(s, nbJours)
  const v = voisinesRythme(s)
  const avant = v.avant ?? (Array(7).fill('u') as EtatRythme[])
  const apres = v.apres ?? (Array(7).fill('u') as EtatRythme[])
  const ici: EtatRythme[] = []
  for (let d = 0; d < nbJours; d++)
    ici.push(travaille(d) || travail.has(d) ? 'T' : neutres.has(d) ? 'n' : 'r')
  return [...avant, ...ici, ...apres]
}
