/*
 * Jours fériés et jours fériés rattrapés (JFR), décisions utilisateur du
 * 2026-11-02 : « lors de la première année, nous n'avons droit à aucun jour
 * férié. Après cette année passée, chaque jour férié travaillé est un jour
 * récupéré », « essaye de faire en sorte que les JFR soient rattrapés dans
 * les semaines ou jours qui suivent un jour férié », « si pas d'informations,
 * pars du principe que ça fait moins d'un an qu'ils sont là ».
 *
 * Pur : dates AAAA-MM-JJ, aucun fuseau (un jour férié est une date du
 * calendrier). Les 11 jours fériés de France métropolitaine, calculés ici
 * (Pâques par l'algorithme de Meeus, Jones et Butcher) ; l'établissement en
 * ajoute (`planning_feries`, 2026-11-06 : fête locale, jour chômé), traités
 * exactement comme eux.
 *
 * Le droit (`droitAuRattrapage`) et la fenêtre de rattrapage sont des règles
 * du contrat : elles vivent dans `regles.ts`.
 */

import {
  FERIE_RATTRAPAGE_JOURS,
  droitAuRattrapage,
} from '#/lib/planning/regles.ts'
import { lireRegles } from '#/lib/planning/reglesEtablissement.ts'
import type { RegleEtablissement } from '#/lib/planning/reglesEtablissement.ts'
import { ajouterJours, lundiDe } from '#/lib/planning/temps.ts'
import type {
  FerieAjoute,
  Motif,
  Referentiel,
  Salarie,
} from '#/lib/planning/types.ts'

export interface JourFerie {
  date: string // AAAA-MM-JJ
  nom: string
}

const deux = (n: number) => String(n).padStart(2, '0')

/** Dimanche de Pâques (calendrier grégorien), algorithme de Meeus, Jones et
 * Butcher. */
export function paques(annee: number): string {
  const a = annee % 19
  const b = Math.floor(annee / 100)
  const c = annee % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mois = Math.floor((h + l - 7 * m + 114) / 31)
  const jour = ((h + l - 7 * m + 114) % 31) + 1
  return `${annee}-${deux(mois)}-${deux(jour)}`
}

const cache = new Map<number, JourFerie[]>()

/** Les jours fériés de l'année, dans l'ordre du calendrier : les 11 calculés,
 * plus ceux que l'établissement ajoute (`ajoutes` : une date, ou chaque
 * année au même jour et au même mois). Une date déjà fériée garde son nom. */
export function joursFeries(
  annee: number,
  ajoutes: readonly Pick<FerieAjoute, 'jour' | 'nom' | 'recurrent'>[] = [],
): JourFerie[] {
  const base = joursFeriesLegaux(annee)
  if (!ajoutes.length) return base
  const pris = new Set(base.map((f) => f.date))
  const plus: JourFerie[] = []
  for (const a of ajoutes) {
    const date = a.recurrent ? `${annee}${a.jour.slice(4, 10)}` : a.jour
    if (date.slice(0, 4) !== String(annee) || pris.has(date)) continue
    // Un 29 février récurrent n'existe pas les autres années.
    if (a.recurrent && date.endsWith('-02-29') && !bissextile(annee)) continue
    pris.add(date)
    plus.push({ date, nom: a.nom })
  }
  return [...base, ...plus].sort((x, y) =>
    x.date < y.date ? -1 : x.date > y.date ? 1 : 0,
  )
}

const bissextile = (a: number) =>
  (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0

/** Les 11 jours fériés de la loi, dans l'ordre du calendrier. */
function joursFeriesLegaux(annee: number): JourFerie[] {
  const deja = cache.get(annee)
  if (deja) return deja
  const p = paques(annee)
  const fixe = (mois: number, jour: number, nom: string): JourFerie => ({
    date: `${annee}-${deux(mois)}-${deux(jour)}`,
    nom,
  })
  const liste: JourFerie[] = [
    fixe(1, 1, "Jour de l'an"),
    { date: ajouterJours(p, 1), nom: 'Lundi de Pâques' },
    fixe(5, 1, 'Fête du travail'),
    fixe(5, 8, 'Victoire 1945'),
    { date: ajouterJours(p, 39), nom: 'Ascension' },
    { date: ajouterJours(p, 50), nom: 'Lundi de Pentecôte' },
    fixe(7, 14, 'Fête nationale'),
    fixe(8, 15, 'Assomption'),
    fixe(11, 1, 'Toussaint'),
    fixe(11, 11, 'Armistice 1918'),
    fixe(12, 25, 'Noël'),
  ].sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0))
  cache.set(annee, liste)
  return liste
}

/** Le nom du jour férié de cette date, ou null. */
export function ferieDe(
  date: string,
  ajoutes?: Parameters<typeof joursFeries>[1],
): string | null {
  const annee = Number(date.slice(0, 4))
  return joursFeries(annee, ajoutes).find((f) => f.date === date)?.nom ?? null
}

/** Jours fériés de `du` à `au` inclus, dans l'ordre. */
export function feriesEntre(
  du: string,
  au: string,
  ajoutes?: Parameters<typeof joursFeries>[1],
): JourFerie[] {
  if (au < du) return []
  const r: JourFerie[] = []
  for (let a = Number(du.slice(0, 4)); a <= Number(au.slice(0, 4)); a++)
    for (const f of joursFeries(a, ajoutes))
      if (f.date >= du && f.date <= au) r.push(f)
  return r
}

/** Premier lundi qu'une vue lit avant `lundi` (26 semaines) : celui
 * d'avant-avant (repos de 35 h de la semaine d'avant) ou plus tôt, pour qu'un
 * jour férié travaillé des `FERIE_RATTRAPAGE_JOURS` jours d'avant soit vu,
 * avec les JFR
 * posés depuis (R-FERIE-RATTRAPE). Deux fenêtres en arrière : les jours
 * fériés plus anciens prennent d'abord leurs JFR (`feriesARattraper`), sans
 * quoi le JFR d'un jour férié sorti de la fenêtre serait compté pour le
 * suivant. Shifts ET absences à partir de lui. */
export function premierLundiLu(
  lundi: string,
  fenetre: number = FERIE_RATTRAPAGE_JOURS,
): string {
  return lundiDe(ajouterJours(lundi, -Math.max(14, 2 * fenetre)))
}

/** La fenêtre de rattrapage des règles (`feries.rattrapageJours`) quand le
 * référentiel est déjà lu ; sinon le défaut. Une vue chargée avant lui lit
 * la fenêtre par défaut, puis la bonne à la lecture suivante. */
export function fenetreFeries(
  referentiel: Pick<Referentiel, 'reglages'> | null | undefined,
): number {
  return referentiel
    ? lireRegles(referentiel).feries.rattrapageJours
    : FERIE_RATTRAPAGE_JOURS
}

/** Le motif « Jour férié rattrapé » : son RÔLE (2026-11-06, à la place du
 * code JFR). À ne pas confondre avec le jour férié chômé (`ferie_chome`). */
export function estJfr(m: Pick<Motif, 'role'>): boolean {
  return m.role === 'ferie_rattrape'
}

/** Le motif du repos posé par le planning : celui qui en a le rôle, sinon
 * le premier motif de nature repos (même choix que la base). */
export function motifReposDefaut<
  M extends Pick<Motif, 'id' | 'nature' | 'role'>,
>(motifs: readonly M[] | undefined): M | undefined {
  const repos = (motifs ?? []).filter((m) => m.nature === 'repos')
  return (
    repos.find((m) => m.role === 'repos_defaut') ??
    [...repos].sort((a, b) => a.id - b.id)[0]
  )
}

/** « 11/11 ». */
export function jourMois(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`
}

/**
 * Jours fériés de [du, au] qu'une personne doit encore rattraper, du plus
 * ancien au plus récent. Un jour férié compte s'il ouvre droit
 * (`droitAuRattrapage`) ET si la personne y a un shift (`travailles`, dates
 * des shifts, proposés ou validés). Chaque JFR posé (`jfrPoses`, dates)
 * rattrape UN jour férié d'avant lui, le plus ancien d'abord ; un JFR ne sert
 * qu'une fois. L'imputation part de `depuis` (défaut : `du`) : les jours
 * fériés de [depuis, du[ prennent leurs JFR avant ceux de la fenêtre, sinon
 * le JFR d'un jour férié sorti de la fenêtre passerait au suivant (1er puis
 * 11 novembre). `travailles` doit couvrir [depuis, au].
 */
export function feriesARattraper(args: {
  salarie: Pick<Salarie, 'type_contrat' | 'date_entree'>
  du: string
  au: string
  depuis?: string
  travailles: ReadonlySet<string>
  jfrPoses: Iterable<string>
  /** Règles de l'établissement (modèle du contrat) ; absent : défauts. */
  regles?: RegleEtablissement
}): JourFerie[] {
  const depuis =
    args.depuis !== undefined && args.depuis < args.du ? args.depuis : args.du
  const droits = feriesEntre(
    depuis,
    args.au,
    args.regles?.feries.ajoutes,
  ).filter(
    (f) =>
      droitAuRattrapage(args.salarie, f.date, args.regles) &&
      args.travailles.has(f.date),
  )
  if (!droits.length) return []
  const poses = [...args.jfrPoses]
    .filter((d) => d > droits[0].date && d <= args.au)
    .sort()
  const pris = new Array<boolean>(poses.length).fill(false)
  const restants: JourFerie[] = []
  for (const f of droits) {
    const k = poses.findIndex((d, i) => !pris[i] && d > f.date)
    if (k >= 0) pris[k] = true
    else if (f.date >= args.du) restants.push(f)
  }
  return restants
}
