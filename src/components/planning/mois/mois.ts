/*
 * Aides pures de la vue mois (prototype `pages/planning/VueMois.tsx`) : les
 * jours du mois, les semaines qui le couvrent, ce qu'il y a dans une case,
 * les bandeaux, l'état de chaque semaine et les compteurs.
 *
 * Périmètres (anomalie 9 de la spec, rendue honnête) : la grille montre
 * des semaines ENTIÈRES, jours du mois voisin compris et grisés (demande
 * utilisateur du 2026-11-04 : « toute semaine affichée l'est en entier ») ;
 * le compteur de validation et le total d'heures ne comptent que les jours
 * du MOIS ; les actions (compléter, valider, effacer, verrouiller) portent
 * sur les semaines entières. Les libellés le disent.
 */

import type { BilanOut, ShiftOut, SemaineOut } from '#/lib/planning/semaine.ts'
import { ajouterJours, ecartJours, lundiDe } from '#/lib/planning/temps.ts'
import { jourDeRepos } from '#/lib/planning/affichage.ts'
import { estJfr } from '#/lib/planning/feries.ts'
import {
  raisonOblige,
  reposProposesParJour,
} from '#/components/planning/semaine/edition.ts'
import type { Motif, Salarie } from '#/lib/planning/types.ts'

/** « 2026-11 » → les dates du 1er au dernier jour. */
export function joursDuMois(mois: string): string[] {
  const jours: string[] = []
  for (let j = `${mois}-01`; j.slice(0, 7) === mois; j = ajouterJours(j, 1))
    jours.push(j)
  return jours
}

/** Les jours affichés pour un mois : du lundi de la semaine du 1er au
 * dimanche de la semaine du dernier jour, toujours des semaines entières. */
export function joursAffiches(mois: string): string[] {
  const duMois = joursDuMois(mois)
  const jours: string[] = []
  const fin = ajouterJours(lundiDe(duMois[duMois.length - 1]), 6)
  for (let j = lundiDe(duMois[0]); j <= fin; j = ajouterJours(j, 1))
    jours.push(j)
  return jours
}

/** Lundis des semaines qui couvrent ces jours, dans l'ordre. */
export function lundisDe(jours: string[]): string[] {
  return [...new Set(jours.map(lundiDe))]
}

/** « 2026-11 » décalé de n mois. */
export function moisDecale(mois: string, n: number): string {
  const [a, m] = mois.split('-').map(Number)
  const t = a * 12 + (m - 1) + n
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`
}

/** Une date : sa semaine et son numéro de jour (0 = lundi). */
export function reperer(date: string): { lundi: string; jour: number } {
  const lundi = lundiDe(date)
  return { lundi, jour: ecartJours(lundi, date) }
}

export interface EtatSemaine {
  verrouillee: boolean
  passee: boolean
  /** Ni verrouillée, ni passée : les actions du mois la touchent (décision
   * U8 du 2026-11-01 : une semaine d'avant le dernier verrou reste ouverte). */
  ouverte: boolean
}

export function etatSemaine(
  lundi: string,
  verrous: string[],
  aujourdhui: string,
): EtatSemaine {
  const verrouillee = verrous.includes(lundi)
  const passee = lundi < lundiDe(aujourdhui)
  return { verrouillee, passee, ouverte: !verrouillee && !passee }
}

/** Pourquoi une semaine n'est pas touchée par les actions du mois. */
export function raisonFermee(e: EtatSemaine): string | null {
  if (e.verrouillee) return 'verrouillée : planning réalisé'
  if (e.passee) return 'passée : on ne génère pas le passé'
  return null
}

export type CaseMois =
  | { type: 'shift'; shift: ShiftOut; fixe: false }
  | { type: 'hors'; fixe: true }
  | {
      type: 'absence'
      motif: Motif | undefined
      motifId: number | null
      fixe: boolean
      /** Repos posé, ou jour férié rattrapé, encore en proposition
       * (2026-10-31, 2026-11-02). */
      proposition: boolean
      /** Repos posé qui est aussi un repos obligé : sa raison. */
      raison?: string
    }
  | {
      type: 'repos'
      fixe: boolean
      proposition: boolean
      /** Repos obligé (2026-11-04) : pourquoi ce jour ne peut pas être travaillé. */
      raison?: string
    }

/** Ce qu'il y a dans la case d'une personne un jour donné (null : rien). */
export function caseDe(
  semaines: Map<string, SemaineOut>,
  motifs: Motif[],
  salarieId: number,
  date: string,
): CaseMois | null {
  const { lundi, jour } = reperer(date)
  const sem = semaines.get(lundi)
  if (!sem) return null
  const shift = sem.affectations.find(
    (a) => a.salarie_id === salarieId && a.jour === jour,
  )
  if (shift) return { type: 'shift', shift, fixe: false }
  const bilan: BilanOut | undefined = sem.bilan.find(
    (b) => b.salarie_id === salarieId,
  )
  if (!bilan) return null
  if (bilan.hors_contrat.includes(jour)) return { type: 'hors', fixe: true }
  // Repos proposé sur un jour de congé en trop (`reposDeduits`).
  if (jour in bilan.absences && bilan.repos_deduits.includes(jour))
    return { type: 'repos', fixe: false, proposition: !sem.verrouillee }
  if (jour in bilan.absences) {
    const motifId = bilan.absences[jour]
    const fixe = bilan.absences_semaine_type.includes(jour)
    const motif = motifs.find((m) => m.id === motifId)
    const raison =
      motif?.nature === 'repos' ? raisonOblige(bilan, jour) : undefined
    return {
      type: 'absence',
      motif,
      motifId,
      fixe,
      ...(raison ? { raison } : {}),
      proposition:
        !fixe &&
        !sem.verrouillee &&
        (bilan.repos_proposes.includes(jour) ||
          (bilan.jfr_proposes ?? []).includes(jour)),
    }
  }
  // Repos obligé (2026-11-04) : montré « Repos » avec sa raison, en
  // proposition ; rien sur une semaine verrouillée.
  const raison = raisonOblige(bilan, jour)
  if (raison && !sem.verrouillee && !jourDeRepos(bilan, jour))
    return { type: 'repos', fixe: false, proposition: true, raison }
  if (!jourDeRepos(bilan, jour)) return null
  const fixe = bilan.repos_fixes.includes(jour)
  // Déduit d'une semaine remplie : une proposition, comme un shift proposé.
  // Semaine verrouillée (planning réalisé) : plus rien n'est proposé.
  return { type: 'repos', fixe, proposition: !fixe && !sem.verrouillee }
}

/** Ce qui se valide dans une case, comme au clic droit : un shift, un repos
 * déduit (proposition, écrit en base à la validation) ou posé. Jamais un
 * repos fixe, une autre absence ou une case vide (null). */
export function validationDeCase(
  c: CaseMois | null,
): { valide: boolean; deduit: boolean } | null {
  if (!c || c.fixe) return null
  if (c.type === 'shift') return { valide: c.shift.epinglee, deduit: false }
  if (c.type === 'repos') return { valide: false, deduit: true }
  // Il ne reste qu'une absence posée : un repos posé ou un JFR se valident.
  if (c.motif?.nature === 'repos' || (c.motif && estJfr(c.motif)))
    return { valide: !c.proposition, deduit: false }
  return null
}

/** Clé de bandeau : deux jours voisins de même clé fusionnent (repos de même
 * validation, qu'il soit fixe, déduit ou posé ; même motif et même origine
 * fixe ou posée ; hors contrat). */
export function cleBandeau(c: CaseMois | null): string | null {
  if (!c || c.type === 'shift') return null
  if (c.type === 'hors') return 'hors'
  if (c.type === 'absence' && c.motif?.nature !== 'repos')
    return `motif-${c.motifId ?? 0}-${c.fixe ? 'fixe' : 'pose'}${c.proposition ? '-proposition' : ''}`
  return c.proposition ? 'repos-proposition' : 'repos'
}

/** Personnes affichées : sous contrat un jour du mois, et actives ou ayant
 * un shift dans le mois (historique). */
export function presentsDuMois(
  salaries: Salarie[],
  jours: string[],
  semaines: SemaineOut[],
): Salarie[] {
  const debut = jours[0]
  const fin = jours[jours.length - 1]
  const avecShift = new Set<number>()
  for (const s of semaines) {
    for (const a of s.affectations) {
      const d = ajouterJours(s.lundi, a.jour)
      if (d >= debut && d <= fin) avecShift.add(a.salarie_id)
    }
  }
  return salaries.filter(
    (s) =>
      (!s.date_entree || s.date_entree <= fin) &&
      (!s.date_sortie || s.date_sortie >= debut) &&
      (s.actif || avecShift.has(s.id)),
  )
}

export interface Compteurs {
  /** Shifts des JOURS DU MOIS, par état. */
  propositions: number
  valides: number
  verrouilles: number
  /** Semaines entières affichées. */
  places: number
  pourvues: number
  infractions: number
  alertes: number
}

/** Places encore à pourvoir que la génération du mois pouvait remplir : jours
 * du mois, à partir d'aujourd'hui. Un jour passé ou du mois voisin (semaine
 * à cheval) ne compte pas. Les extras n'y sont pour rien : le moteur ne les
 * place jamais, on les appelle au besoin. */
export function placesAPourvoir(
  mois: string,
  aujourdhui: string,
  semaines: SemaineOut[],
): number {
  let n = 0
  for (const s of semaines) {
    for (const a of s.a_pourvoir) {
      const date = ajouterJours(s.lundi, a.jour)
      if (date.startsWith(mois) && date >= aujourdhui) n += a.manquant
    }
  }
  return n
}

function sommeJoursDuMois(
  mois: string,
  semaines: SemaineOut[],
  parJour: (s: SemaineOut) => number[] | undefined,
): number {
  let n = 0
  for (const s of semaines) {
    const valeurs = parJour(s) ?? []
    valeurs.forEach((v, j) => {
      if (ajouterJours(s.lundi, j).startsWith(mois)) n += v
    })
  }
  return n
}

export function compter(mois: string, semaines: SemaineOut[]): Compteurs {
  let propositions = 0
  let valides = 0
  let verrouilles = 0
  for (const s of semaines) {
    for (const a of s.affectations) {
      if (ajouterJours(s.lundi, a.jour).slice(0, 7) !== mois) continue
      if (s.verrouillee) verrouilles++
      else if (a.epinglee) valides++
      else propositions++
    }
    // Les repos en proposition comptent avec les shifts proposés.
    reposProposesParJour(s).forEach((n, j) => {
      if (ajouterJours(s.lundi, j).slice(0, 7) === mois) propositions += n
    })
  }
  return {
    propositions,
    valides,
    verrouilles,
    // Couverture : les seuls jours du mois (une semaine à cheval ne compte
    // que sa part ; décision utilisateur du 2026-10-28).
    places: sommeJoursDuMois(mois, semaines, (s) => s.stats.places_jour),
    pourvues: sommeJoursDuMois(mois, semaines, (s) => s.stats.pourvues_jour),
    infractions: semaines.reduce((n, s) => n + s.stats.infractions, 0),
    alertes: semaines.reduce(
      (n, s) =>
        n +
        s.a_pourvoir.length +
        s.presence.filter((p) => p.ecart !== 0).length +
        s.bilan.reduce((m, b) => m + b.alertes.length, 0),
      0,
    ),
  }
}

/** Shifts des semaines ouvertes (entières) : ce que les actions touchent. */
export function dansLesOuvertes(semaines: SemaineOut[], ouvertes: string[]) {
  let propositions = 0
  let valides = 0
  for (const s of semaines) {
    if (!ouvertes.includes(s.lundi)) continue
    for (const a of s.affectations) {
      if (a.epinglee) valides++
      else propositions++
    }
    propositions += reposProposesParJour(s).reduce((a, b) => a + b, 0)
  }
  return { propositions, valides }
}

/** « S45, S46 et S48 ». */
export function listeSemaines(
  lundis: string[],
  numero: (l: string) => number,
): string {
  const n = lundis.map((l) => `S${numero(l)}`)
  if (n.length <= 1) return n.join('')
  return `${n.slice(0, -1).join(', ')} et ${n.at(-1)}`
}

export const pluriel = (n: number, mot: string, motPluriel = `${mot}s`) =>
  `${n} ${n > 1 ? motPluriel : mot}`
