/*
 * Aides pures de la vue semaine (prototype `pages/planning/edition.ts` et
 * `PlanningPage.tsx` : `statutDe`, `indice`, `journeeEtoile`, `titreHeures`).
 * Sans React : testées à part. Les écritures composées (poser un horaire,
 * déplacer la journée étoile) rendent une fonction qui appelle le service.
 */

import { dureeHoraire, heures, jourDeRepos } from '#/lib/planning/affichage.ts'
import { estEcole } from '#/lib/planning/semaine.ts'
import type { BilanOut, SemaineOut, ShiftOut } from '#/lib/planning/semaine.ts'
import * as service from '#/lib/planning/service.ts'
import { ajouterJours, horaireDe } from '#/lib/planning/temps.ts'
import type { Horaire, Motif, Salarie } from '#/lib/planning/types.ts'

export const NEUTRE = '#94a3b8'

export interface CaseJour {
  salarie_id: number
  jour: number
}

/** Ce que montre une case sans shift. */
export interface ContenuStatut {
  nom: string
  couleur: string
  /** Vient de la semaine type (ou hors contrat) : ne se glisse pas. */
  fixe: boolean
  /** Repos (ou hors contrat) : pas de motif posé. */
  repos: boolean
  genre: 'repos' | 'ecole' | 'absence' | 'hors'
}

export type Indice = 'ok' | 'depannage' | 'deconseille' | null

export type EnVol =
  | { type: 'shift'; shift: ShiftOut }
  | { type: 'statut'; salarie_id: number; jour: number; statut: ContenuStatut }

export function shiftDe(
  semaine: SemaineOut | null,
  o: CaseJour,
): ShiftOut | undefined {
  return semaine?.affectations.find(
    (a) => a.salarie_id === o.salarie_id && a.jour === o.jour,
  )
}

/** Absence posée sur ce jour, et si elle vient de la semaine type. */
export function absenceDe(
  bilan: BilanOut | undefined,
  jour: number,
): { motif_id: number | null; fixe: boolean } | null {
  if (!bilan || !(jour in bilan.absences)) return null
  return {
    motif_id: bilan.absences[jour] ?? null,
    fixe: bilan.absences_semaine_type.includes(jour),
  }
}

/** Le jour est un repos sûr (fixé par la semaine type, ou déduit d'une
 * semaine remplie), comme l'affiche la grille ; sinon null. */
export function reposDe(
  bilan: BilanOut | undefined,
  jour: number,
): { fixe: boolean } | null {
  const st = statutDuJour(bilan, jour, [])
  return st?.genre === 'repos' ? { fixe: st.fixe } : null
}

/** Statut d'un jour sans shift (prototype `statutDe`), ou null : « Non attribué ». */
export function statutDuJour(
  bilan: BilanOut | undefined,
  jour: number,
  motifs: Motif[],
): ContenuStatut | null {
  if (!bilan) return null
  if (bilan.hors_contrat.includes(jour)) {
    return {
      nom: 'Hors contrat',
      couleur: NEUTRE,
      fixe: true,
      repos: true,
      genre: 'hors',
    }
  }
  if (jour in bilan.absences) {
    const m = motifs.find((x) => x.id === bilan.absences[jour])
    return {
      nom: m?.nom ?? 'Absent',
      couleur: m?.couleur ?? NEUTRE,
      fixe: bilan.absences_semaine_type.includes(jour),
      repos: false,
      genre: m && estEcole(m) ? 'ecole' : 'absence',
    }
  }
  // Repos seulement s'il est sûr (fiche, semaine complète) : sinon « non attribué ».
  if (!jourDeRepos(bilan, jour)) return null
  return {
    nom: 'Repos',
    couleur: NEUTRE,
    fixe: bilan.repos_fixes.includes(jour),
    repos: true,
    genre: 'repos',
  }
}

/** Pendant un glisser : la case convient-elle (purement visuel, la base tranche). */
export function indiceDe(
  vol: EnVol | null,
  s: Salarie,
  jour: number,
  bilan: BilanOut | undefined,
  statut: ContenuStatut | null,
): Indice {
  if (!vol) return null
  if (statut?.genre === 'hors') return 'deconseille'
  if (vol.type === 'statut') {
    if (statut?.fixe) return 'deconseille'
    return vol.statut.repos && s.id !== vol.salarie_id ? 'deconseille' : 'ok'
  }
  if ((bilan && jour in bilan.absences) || bilan?.repos_fixes.includes(jour))
    return 'deconseille'
  const niveau = s.competences.find(
    (c) => c.poste_id === vol.shift.poste_id,
  )?.niveau
  if (!niveau) return 'deconseille'
  return niveau === 'titulaire' ? 'ok' : 'depannage'
}

/** Journée étoile d'une carte : pas au forfait, plus de 35 h, et court ou 7 h. */
export function estEtoile(
  s: Salarie | undefined,
  a: Pick<ShiftOut, 'court' | 'duree'>,
): boolean {
  if (!s || s.forfait_jours || Number(s.heures_hebdo) <= 35) return false
  return a.court || a.duree === 7 * 60
}

/** Temps de travail d'un code (pause déduite). */
export const travailCode = (h: Pick<Horaire, 'debut' | 'fin' | 'pause'>) =>
  dureeHoraire(h.debut, h.fin) - h.pause

/**
 * Pose ou change l'horaire d'une case (clic droit). Un shift : il prend ce
 * code (journée étoile retirée). Un jour d'absence non fixe : l'absence est
 * retirée, puis le shift posé ; si le shift est refusé, l'absence est remise
 * avec son motif (deux appels, pas une transaction : rien ne doit se perdre).
 * Sinon : un shift validé sur le poste de référence.
 */
export function poserHoraire(
  lundi: string,
  o: CaseJour,
  shift: ShiftOut | undefined,
  absence: { fixe: boolean; motif_id?: number | null } | null,
  h: Horaire,
  posteId: number,
): () => Promise<void> {
  const valeurs = {
    horaire_id: h.id,
    debut: h.debut,
    fin: h.fin,
    court: false,
    pause: h.pause,
  }
  if (shift) return () => service.modifierShift(shift.id, valeurs)
  return async () => {
    const date = ajouterJours(lundi, o.jour)
    const retiree = absence && !absence.fixe
    if (retiree) await service.poserAbsences(o.salarie_id, [date], null)
    try {
      await service.ajouterShift(lundi, {
        ...o,
        poste_id: posteId,
        ...valeurs,
        epinglee: true,
      })
    } catch (err) {
      if (retiree && absence.motif_id != null) {
        try {
          await service.poserAbsences(o.salarie_id, [date], absence.motif_id)
        } catch {
          throw new Error(
            "le shift a été refusé et l'absence du jour n'a pas pu être remise : posez-la de nouveau",
          )
        }
      }
      throw err
    }
  }
}

/** La journée étoile d'une case, si elle peut l'être : contrat au-delà de
 * 35 h, pas au forfait, code avec une version courte. Unique dans la semaine. */
export function etoileProposee(
  semaine: SemaineOut | null,
  personne: Salarie | undefined,
  horaires: Horaire[],
  o: CaseJour,
): { active: boolean; basculer: () => Promise<void> } | undefined {
  const shift = shiftDe(semaine, o)
  const code = horaires.find((h) => h.id === shift?.type_shift_id)
  if (!semaine || !shift || !personne || personne.forfait_jours)
    return undefined
  if (Number(personne.heures_hebdo) <= 35 || !code?.raccourci) return undefined
  const versCourt = (a: ShiftOut, court: boolean) => {
    const c = horaires.find((h) => h.id === a.type_shift_id)
    // Les heures finales sont calculées ici : la base les enregistre telles quelles.
    return service.modifierShift(a.id, {
      court,
      ...(c ? horaireDe(c, court) : {}),
    })
  }
  return {
    active: shift.court,
    basculer: async () => {
      if (shift.court) return versCourt(shift, false)
      const autres = semaine.affectations.filter(
        (a) => a.salarie_id === o.salarie_id && a.court && a.id !== shift.id,
      )
      for (const a of autres) await versCourt(a, false)
      await versCourt(shift, true)
    },
  }
}

/** Couleur de la colonne Heures. */
export function etatHeures(
  s: Salarie,
  b: BilanOut,
): 'danger' | 'attention' | 'ok' {
  if (b.minutes > b.minutes_max) return 'danger'
  if (!s.forfait_jours && b.minutes !== b.minutes_contrat) return 'attention'
  return 'ok'
}

/** Survol de la colonne Heures : l'écart au contrat, en clair. */
export function titreHeures(s: Salarie, b: BilanOut): string {
  if (s.forfait_jours)
    return `Forfait jours : ${b.jours} jours travaillés (heures non décomptées)`
  const ecart = b.minutes - b.minutes_contrat
  if (b.minutes > b.minutes_max)
    return `Au-delà du maximum de ${heures(b.minutes_max)}`
  if (ecart === 0) return 'Pile les heures du contrat'
  return `${heures(Math.abs(ecart))} ${ecart < 0 ? 'de moins' : 'de plus'} que le contrat`
}

/** Compteurs de la barre : en semaine verrouillée, tout est « verrouillé ». */
export function compteurs(semaine: SemaineOut) {
  const total = semaine.affectations.length
  if (semaine.verrouillee)
    return { propositions: 0, valides: 0, verrouilles: total }
  const valides = semaine.affectations.filter((a) => a.epinglee).length
  return { propositions: total - valides, valides, verrouilles: 0 }
}

/** Places à pourvoir après une génération. */
export const trous = (s: SemaineOut) =>
  s.a_pourvoir.reduce((n, t) => n + t.manquant, 0)
