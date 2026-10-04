/*
 * Corbeille d'un classeur (étape 6 du plan
 * `plan/classeur-fonctions-2026-10-04/`) — logique PURE, sans React ni
 * Supabase.
 *
 * La suppression est douce (`deleted_at`) : la corbeille ne fait que MONTRER
 * ce qui a été supprimé et proposer de l'annuler. Elle reçoit les lignes
 * BRUTES du classeur (supprimées ou non, `fetchCorbeille`) et en tire :
 *   - les chapitres supprimés, avec le nombre d'éléments encore actifs
 *     qu'ils emportent (supprimer un chapitre ne supprime pas ses éléments :
 *     ils reviennent avec lui) ;
 *   - les éléments supprimés, avec le nom de leur chapitre d'origine ; un
 *     élément dont le chapitre est AUSSI supprimé (ou introuvable) est
 *     ORPHELIN : le restaurer seul le laisserait invisible ;
 *   - le tout du plus récemment supprimé au plus ancien.
 *
 * Le classeur entier reste hors corbeille (D17).
 */

import type { ItemKind } from '#/lib/classeur/types.ts'

/** Chapitre tel que lu par `fetchCorbeille` (supprimé ou non). */
export interface ChapitreBrut {
  id: number
  label: string
  sort_order: number
  deleted_at: string | null
}

/** Élément tel que lu par `fetchCorbeille` (supprimé ou non). */
export interface ElementBrut {
  kind: ItemKind
  id: number
  chapter_id: number
  title: string
  deleted_at: string | null
}

/** Ce que lit `fetchCorbeille` : tout le classeur, colonnes légères. */
export interface DonneesCorbeille {
  chapitres: ChapitreBrut[]
  elements: ElementBrut[]
}

export interface ChapitreSupprime {
  type: 'chapitre'
  /** `chapitre:<id>` — unique dans la liste. */
  cle: string
  id: number
  titre: string
  deletedAt: string
  /** Éléments NON supprimés du chapitre : ils reviennent avec lui. */
  elements: number
}

export interface ElementSupprime {
  type: 'element'
  /** `<kind>:<id>` — unique dans la liste. */
  cle: string
  kind: ItemKind
  id: number
  titre: string
  deletedAt: string
  chapitreId: number
  /** Nom du chapitre d'origine, `null` s'il est introuvable. */
  chapitreLabel: string | null
  /** Chapitre d'origine supprimé ou introuvable. */
  orphelin: boolean
}

export type EntreeCorbeille = ChapitreSupprime | ElementSupprime

/**
 * Plus récent d'abord ; à date égale, ordre stable par clé (deux
 * suppressions groupées partagent le même instant).
 */
export function comparerEntrees(
  a: EntreeCorbeille,
  b: EntreeCorbeille,
): number {
  const ecart = Date.parse(b.deletedAt) - Date.parse(a.deletedAt)
  if (ecart !== 0) return ecart
  return a.cle < b.cle ? -1 : a.cle > b.cle ? 1 : 0
}

/** Les entrées de la corbeille, triées (voir l'en-tête). */
export function construireCorbeille(
  donnees: DonneesCorbeille,
): EntreeCorbeille[] {
  const chapitres = new Map(donnees.chapitres.map((c) => [c.id, c]))
  const actifsParChapitre = new Map<number, number>()
  for (const e of donnees.elements) {
    if (e.deleted_at === null) {
      actifsParChapitre.set(
        e.chapter_id,
        (actifsParChapitre.get(e.chapter_id) ?? 0) + 1,
      )
    }
  }

  const entrees: EntreeCorbeille[] = []
  for (const c of donnees.chapitres) {
    if (c.deleted_at === null) continue
    entrees.push({
      type: 'chapitre',
      cle: `chapitre:${c.id}`,
      id: c.id,
      titre: c.label,
      deletedAt: c.deleted_at,
      elements: actifsParChapitre.get(c.id) ?? 0,
    })
  }
  for (const e of donnees.elements) {
    if (e.deleted_at === null) continue
    const chapitre = chapitres.get(e.chapter_id)
    entrees.push({
      type: 'element',
      cle: `${e.kind}:${e.id}`,
      kind: e.kind,
      id: e.id,
      titre: e.title,
      deletedAt: e.deleted_at,
      chapitreId: e.chapter_id,
      chapitreLabel: chapitre?.label ?? null,
      orphelin: chapitre === undefined || chapitre.deleted_at !== null,
    })
  }
  return entrees.sort(comparerEntrees)
}

/**
 * Chapitres où l'on peut remettre un élément orphelin : les chapitres NON
 * supprimés, dans l'ordre du classeur.
 */
export function chapitresDisponibles(
  chapitres: ReadonlyArray<ChapitreBrut>,
): ChapitreBrut[] {
  return chapitres
    .filter((c) => c.deleted_at === null)
    .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
}
