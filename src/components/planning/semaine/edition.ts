/*
 * Aides pures de la vue semaine (prototype `pages/planning/edition.ts` et
 * `PlanningPage.tsx` : `statutDe`, `indice`, `journeeEtoile`, `titreHeures`).
 * Sans React : testées à part. Les écritures composées (poser un horaire)
 * rendent une fonction qui appelle le service. La journée étoile n'a plus
 * d'écriture à part depuis le 2026-11-02 : c'est un autre horaire, posé comme
 * les autres (`etoileDeLaCase`, `codesCase.ts`).
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
  /** Repos posé à cette date (motif de nature « repos ») : un motif posé,
   * montré comme le repos de la semaine type. */
  reposPose?: boolean
  /** Repos encore en proposition (déduit, ou posé non validé) : pointillés,
   * comme un shift proposé (2026-10-31). */
  proposition?: boolean
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
  /** Semaine verrouillée (planning réalisé) : rien n'y est une proposition. */
  verrouillee = false,
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
    if (m?.nature === 'repos')
      return {
        nom: 'Repos',
        couleur: NEUTRE,
        fixe: bilan.absences_semaine_type.includes(jour),
        repos: false,
        reposPose: true,
        proposition:
          !verrouillee &&
          !bilan.absences_semaine_type.includes(jour) &&
          bilan.repos_proposes.includes(jour),
        genre: 'absence',
      }
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
  const fixe = bilan.repos_fixes.includes(jour)
  return {
    nom: 'Repos',
    couleur: NEUTRE,
    fixe,
    repos: true,
    proposition: !fixe && !verrouillee,
    genre: 'repos',
  }
}

/** Validation d'un repos (demande utilisateur du 2026-10-31 : « les repos
 * fonctionnent comme les shifts »). Repos fixe de la semaine type : toujours
 * validé, rien à basculer (null). Repos déduit d'une semaine remplie : une
 * proposition, que « Valider » écrit en base. Repos posé : validé ou en
 * proposition. null : ce n'est pas un repos qui se valide. */
export function validationRepos(
  bilan: BilanOut | undefined,
  jour: number,
  motifs: Motif[],
): { valide: boolean; deduit: boolean } | null {
  const st = statutDuJour(bilan, jour, motifs)
  if (!st || st.fixe) return null
  if (st.reposPose) return { valide: !st.proposition, deduit: false }
  if (st.genre === 'repos') return { valide: false, deduit: true }
  return null
}

/** Repos déduits à écrire validés par « Valider » : toute la semaine, ou un
 * jour, ou une personne. Rien sur une semaine verrouillée. */
export function reposAValider(
  semaine: SemaineOut | null | undefined,
  jour: number | null = null,
  salarieId: number | null = null,
): Array<{ salarie_id: number; jour: number }> {
  if (!semaine || semaine.verrouillee) return []
  return semaine.bilan.flatMap((b) =>
    salarieId !== null && b.salarie_id !== salarieId
      ? []
      : b.repos_deduits
          .filter((j) => jour === null || j === jour)
          .map((j) => ({ salarie_id: b.salarie_id, jour: j })),
  )
}

/** Repos en proposition d'une semaine (déduits et posés non validés), par
 * jour 0 à 6 : ils comptent avec les shifts proposés. */
export function reposProposesParJour(semaine: SemaineOut): number[] {
  const n = [0, 0, 0, 0, 0, 0, 0]
  if (semaine.verrouillee) return n
  for (const b of semaine.bilan)
    for (const j of [...b.repos_deduits, ...b.repos_proposes]) n[j]++
  return n
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

/** Temps de travail d'un code (pause déduite). */
export const travailCode = (h: Pick<Horaire, 'debut' | 'fin' | 'pause'>) =>
  dureeHoraire(h.debut, h.fin) - h.pause

/**
 * Pose ou change l'horaire d'une case (clic droit). Un shift : il prend cet
 * horaire (une journée étoile est un horaire comme un autre). Un jour
 * d'absence non fixe : l'absence est
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
  const valeurs = { horaire_id: h.id, ...horaireDe(h), pause: h.pause }
  // Un code choisi dans une autre rubrique (casquette) change aussi le poste.
  if (shift)
    return () =>
      service.modifierShift(
        shift.id,
        shift.poste_id === posteId
          ? valeurs
          : { ...valeurs, poste_id: posteId },
      )
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
  const repos = reposProposesParJour(semaine).reduce((a, b) => a + b, 0)
  return { propositions: total - valides + repos, valides, verrouilles: 0 }
}

/** Places à pourvoir après une génération. */
export const trous = (s: SemaineOut) =>
  s.a_pourvoir.reduce((n, t) => n + t.manquant, 0)
