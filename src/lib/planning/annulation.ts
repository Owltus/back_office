/*
 * ANNULER / RÉTABLIR le planning (Ctrl+Z / Ctrl+Y, demande utilisateur du
 * 2026-11-18).
 *
 * Principe, sans rien savoir des actions : avant une écriture de la grille,
 * l'état des semaines touchées est relu en base ; après, il est relu encore.
 * La DIFFÉRENCE (les cases personne × jour qui ont changé : shift et jour
 * d'absence) est gardée. Annuler remet ces cases dans leur état d'avant,
 * rétablir dans leur état d'après, en une transaction
 * (`planning_restaurer_cases`), et SEULEMENT si elles sont encore dans l'état
 * attendu : sinon un collègue les a changées entre-temps, et rien n'est fait.
 *
 * Toutes les actions de la grille passent par là (poser, déplacer, coller,
 * valider, vider, compléter, effacer…). Pas les réglages, ni la fiche, ni le
 * cadenas : ils ne changent aucune case.
 *
 * L'historique vit en mémoire du poste (50 actions), il est oublié au
 * changement de compte (poste partagé, `oubliSession`) et au rechargement.
 */

import { surOubliSession } from '#/lib/auth/oubliSession.ts'
import { fetchShifts, restaurerCases } from '#/lib/planning/service.ts'
import type { DonneesShifts } from '#/lib/planning/service.ts'
import { ajouterJours, lundiDe } from '#/lib/planning/temps.ts'

// ------------------------------------------------------------- logique pure

export interface ShiftCase {
  poste_id: number
  horaire_id: number | null
  debut: string
  fin: string
  pause: number
  epinglee: boolean
}

export interface AbsenceCase {
  motif_id: number
  epinglee: boolean
}

/** Ce qu'une case (personne, jour) contient. */
export interface ContenuCase {
  shift: ShiftCase | null
  absence: AbsenceCase | null
}

export interface CaseChangee {
  lundi: string
  salarie_id: number
  jour: number
  avant: ContenuCase
  apres: ContenuCase
}

const VIDE: ContenuCase = { shift: null, absence: null }
const cle = (lundi: string, salarieId: number, jour: number) =>
  `${lundi}|${salarieId}|${jour}`

/** Le contenu de chaque case non vide des semaines `lundis`. Les champs sont
 * ceux que la base compare (`planning_restaurer_cases`), dans le même ordre. */
export function contenusParCase(
  etat: DonneesShifts,
  lundis: readonly string[],
): Map<string, ContenuCase> {
  const semaines = new Set(lundis)
  const m = new Map<string, ContenuCase>()
  for (const a of etat.affectations) {
    if (!semaines.has(a.lundi)) continue
    const k = cle(a.lundi, a.salarie_id, a.jour)
    m.set(k, {
      ...(m.get(k) ?? VIDE),
      shift: {
        poste_id: a.poste_id,
        horaire_id: a.horaire_id,
        debut: a.debut,
        fin: a.fin,
        pause: a.pause,
        epinglee: a.epinglee,
      },
    })
  }
  for (const b of etat.absences) {
    const lundi = lundiDe(b.jour)
    if (!semaines.has(lundi)) continue
    const jour = Math.round(
      (Date.parse(`${b.jour}T00:00:00Z`) - Date.parse(`${lundi}T00:00:00Z`)) /
        86_400_000,
    )
    const k = cle(lundi, b.salarie_id, jour)
    m.set(k, {
      ...(m.get(k) ?? VIDE),
      absence: { motif_id: b.motif_id, epinglee: b.epinglee ?? true },
    })
  }
  return m
}

const memeContenu = (a: ContenuCase, b: ContenuCase) =>
  JSON.stringify(a) === JSON.stringify(b)

/** Les cases qui ont changé entre deux lectures des mêmes semaines. */
export function difference(
  avant: DonneesShifts,
  apres: DonneesShifts,
  lundis: readonly string[],
): CaseChangee[] {
  const a = contenusParCase(avant, lundis)
  const b = contenusParCase(apres, lundis)
  const cles = new Set([...a.keys(), ...b.keys()])
  const changees: CaseChangee[] = []
  for (const k of [...cles].sort()) {
    const x = a.get(k) ?? VIDE
    const y = b.get(k) ?? VIDE
    if (memeContenu(x, y)) continue
    const [lundi, s, j] = k.split('|')
    changees.push({
      lundi,
      salarie_id: Number(s),
      jour: Number(j),
      avant: x,
      apres: y,
    })
  }
  return changees
}

/** Ce que reçoit `planning_restaurer_cases` pour annuler (remettre l'état
 * d'avant) ou rétablir (l'état d'après). */
export function demandeRestauration(
  cases: readonly CaseChangee[],
  sens: 'annuler' | 'retablir',
) {
  return cases.map((c) => ({
    lundi: c.lundi,
    salarie_id: c.salarie_id,
    jour: c.jour,
    attendu: sens === 'annuler' ? c.apres : c.avant,
    voulu: sens === 'annuler' ? c.avant : c.apres,
  }))
}

// ------------------------------------------------------- historique du poste

/** Au plus 50 actions annulables. */
export const HISTORIQUE_MAX = 50

interface Entree {
  cases: CaseChangee[]
}

let annulables: Entree[] = []
let retablissables: Entree[] = []
let version = 0
const abonnes = new Set<() => void>()
const prevenir = () => {
  version++
  for (const f of abonnes) f()
}

export function abonnerHistorique(f: () => void): () => void {
  abonnes.add(f)
  return () => {
    abonnes.delete(f)
  }
}
export const versionHistorique = () => version
export const peutAnnuler = () => annulables.length > 0
export const peutRetablir = () => retablissables.length > 0

export function viderHistorique(): void {
  annulables = []
  retablissables = []
  prevenir()
}

// Poste partagé : le compte suivant ne doit pas annuler le travail du
// précédent.
surOubliSession(viderHistorique)

/** Garde une action (ses cases changées) ; une nouvelle action efface ce qui
 * pouvait être rétabli. */
export function retenir(cases: CaseChangee[]): void {
  if (!cases.length) return
  annulables = [...annulables, { cases }].slice(-HISTORIQUE_MAX)
  retablissables = []
  prevenir()
}

/** Bornes de lecture des semaines `lundis`. */
function bornes(lundis: readonly string[]) {
  const tries = [...lundis].sort()
  return { du: tries[0], au: ajouterJours(tries[tries.length - 1], 6) }
}

async function lire(lundis: readonly string[]): Promise<DonneesShifts> {
  const { du, au } = bornes(lundis)
  return fetchShifts([...lundis], du, au)
}

/**
 * Joue une écriture de la grille en la rendant annulable : l'état des
 * semaines `lundis` est lu avant et après. Même si l'action échoue à moitié
 * (« Compléter le mois » arrêté), ce qui a changé est retenu. Une lecture
 * qui échoue ne fait jamais échouer l'action : elle n'est alors simplement
 * pas annulable.
 */
export async function avecHistorique<T>(
  lundis: readonly string[],
  action: () => Promise<T>,
): Promise<T> {
  let avant: DonneesShifts | null = null
  if (lundis.length) {
    try {
      avant = await lire(lundis)
    } catch {
      avant = null
    }
  }
  try {
    return await action()
  } finally {
    if (avant) {
      try {
        retenir(difference(avant, await lire(lundis), lundis))
      } catch {
        // Lecture impossible : l'action reste faite, sans annulation.
      }
    }
  }
}

/** Annule la dernière action ; rend le nombre de cases remises (null : rien
 * à annuler). Refusé par la base (changé entre-temps, semaine verrouillée,
 * jour passé) : l'action reste dans l'historique, l'erreur remonte. */
export async function annuler(): Promise<number | null> {
  const e = annulables.at(-1)
  if (!e) return null
  await restaurerCases(demandeRestauration(e.cases, 'annuler'))
  annulables = annulables.slice(0, -1)
  retablissables = [...retablissables, e]
  prevenir()
  return e.cases.length
}

/** Rétablit la dernière action annulée (null : rien à rétablir). */
export async function retablir(): Promise<number | null> {
  const e = retablissables.at(-1)
  if (!e) return null
  await restaurerCases(demandeRestauration(e.cases, 'retablir'))
  retablissables = retablissables.slice(0, -1)
  annulables = [...annulables, e]
  prevenir()
  return e.cases.length
}
