/*
 * Impression d'une SÉLECTION d'éléments d'un chapitre (étape 4 du plan
 * `plan/classeur-fonctions-2026-10-04/`) — fonction PURE, réutilisée par
 * l'impression des éléments modifiés (étape 5) et le PDF direct (étape 9).
 *
 * Règles :
 * - l'ordre est TOUJOURS celui de la liste du chapitre (`flattenItems`),
 *   jamais celui du cochage : `useSelection` est un ensemble, non ordonné ;
 * - aucun doublon, même si la liste ou les clés en contiennent ;
 * - un élément supprimé (`deleted_at` posé) ou absent de la liste est
 *   ignoré : il a pu disparaître entre le cochage et l'aperçu.
 */

import { cleRef } from '#/lib/classeur/ordre.ts'
import type { CleRef, ItemRef } from '#/lib/classeur/ordre.ts'
import { flattenItems } from '#/lib/classeur/types.ts'
import type {
  ChapterContent,
  ChapterItem,
  DbChapter,
  DbDocumentVersion,
} from '#/lib/classeur/types.ts'

/** Une clé `kind:id` ou une référence `{ kind, id }` : les deux sont admises. */
export type CleSelection = CleRef | ItemRef

function versCle(c: CleSelection): string {
  return typeof c === 'string' ? c : cleRef(c.kind, c.id)
}

/**
 * Les éléments de `liste` désignés par `cles`, dans l'ordre de `liste`,
 * sans doublon ni élément supprimé.
 */
export function elementsAImprimer(
  liste: ReadonlyArray<ChapterItem>,
  cles: Iterable<CleSelection>,
): ChapterItem[] {
  const voulues = new Set<string>()
  for (const c of cles) voulues.add(versCle(c))
  const vues = new Set<string>()
  const sortie: ChapterItem[] = []
  for (const it of liste) {
    const cle = cleRef(it.kind, it.data.id)
    if (!voulues.has(cle) || vues.has(cle)) continue
    if (it.data.deleted_at !== null) continue
    vues.add(cle)
    sortie.push(it)
  }
  return sortie
}

// ---------------------------------------------------------------------------
// Éléments modifiés depuis une date (étape 5 : remplacer dans les pochettes
// les seules feuilles qui ont changé)
// ---------------------------------------------------------------------------
//
// Ce qui compte comme « modifié » (plan, `5-imprimer-modifies.md`) :
// - un DOCUMENT a une version enregistrée strictement après la date
//   (`classeur_document_versions`, hors `etat_initial`, qui est l'état
//   d'AVANT l'historique). Son `updated_at` n'est PAS regardé : il bouge
//   aussi quand on réordonne ou qu'on déplace ;
// - une FEUILLE (suivi, signature) ou un INTERCALAIRE a un `updated_at`
//   strictement après la date. Ces éléments n'ont pas d'historique : un
//   réordonnancement ou une restauration les fait donc apparaître (D11), et
//   la liste le dit ;
// - un élément ou un chapitre supprimé n'apparaît jamais.
// L'ordre est celui du classeur : chapitres (`sort_order`, `id`) puis
// éléments comme sur la page du chapitre (`flattenItems`).

/** Une ligne de `classeur_document_versions`, sans le contenu (lourd). */
export interface VersionModifiee {
  id: number
  document_id: number
  origine: DbDocumentVersion['origine']
  auteur: string
  created_at: string
  /** « 2.3 » ; vide pour l'historique antérieur au versionnage. */
  version?: string
  raison?: string
}

/** Pourquoi un élément figure dans la liste. */
export type MotifModification =
  | {
      type: 'version'
      /** La version la plus récente après la date. */
      version: string
      raison: string
      auteur: string
      date: string
    }
  | {
      type: 'feuille'
      /** Créée après la date (sinon : contenu, ordre ou restauration). */
      nouvelle: boolean
      date: string
    }

export interface ElementModifie {
  item: ChapterItem
  motif: MotifModification
}

/** Les éléments modifiés d'un chapitre, dans l'ordre du chapitre. */
export interface GroupeModifies {
  chapitre: DbChapter
  elements: ElementModifie[]
}

/**
 * La version la plus récente de chaque document, parmi celles enregistrées
 * STRICTEMENT après `depuisMs` et hors `etat_initial`. À date égale, la plus
 * grande `id` (la dernière écrite) l'emporte.
 */
export function derniereVersionParDocument(
  versions: ReadonlyArray<VersionModifiee>,
  depuisMs: number,
): Map<number, VersionModifiee> {
  const parDoc = new Map<number, VersionModifiee>()
  for (const v of versions) {
    if (v.origine === 'etat_initial') continue
    const t = Date.parse(v.created_at)
    if (!(t > depuisMs)) continue
    const deja = parDoc.get(v.document_id)
    if (deja !== undefined) {
      const td = Date.parse(deja.created_at)
      if (td > t || (td === t && deja.id > v.id)) continue
    }
    parDoc.set(v.document_id, v)
  }
  return parDoc
}

/**
 * Les éléments modifiés depuis `depuis` (instant ISO), groupés par chapitre
 * dans l'ordre du classeur ; un chapitre sans modification n'a pas de groupe.
 * Date illisible : aucun élément (jamais « tout »).
 */
export function modifiesDepuis({
  chapters,
  content,
  versions,
  depuis,
}: {
  chapters: ReadonlyArray<DbChapter>
  content: ChapterContent
  versions: ReadonlyArray<VersionModifiee>
  depuis: string
}): GroupeModifies[] {
  const depuisMs = Date.parse(depuis)
  if (Number.isNaN(depuisMs)) return []
  const dernieres = derniereVersionParDocument(versions, depuisMs)
  const parChapitre = new Map<number, ElementModifie[]>()
  for (const item of flattenItems(content)) {
    const d = item.data
    if (d.deleted_at !== null) continue
    let motif: MotifModification | null = null
    if (item.kind === 'document') {
      const v = dernieres.get(d.id)
      if (v !== undefined) {
        motif = {
          type: 'version',
          version: v.version ?? '',
          raison: v.raison ?? '',
          auteur: v.auteur,
          date: v.created_at,
        }
      }
    } else if (Date.parse(d.updated_at) > depuisMs) {
      motif = {
        type: 'feuille',
        nouvelle: Date.parse(d.created_at) > depuisMs,
        date: d.updated_at,
      }
    }
    if (motif === null) continue
    const liste = parChapitre.get(d.chapter_id) ?? []
    liste.push({ item, motif })
    parChapitre.set(d.chapter_id, liste)
  }
  const groupes: GroupeModifies[] = []
  const ordonnes = [...chapters].sort(
    (a, b) => a.sort_order - b.sort_order || a.id - b.id,
  )
  for (const chapitre of ordonnes) {
    if (chapitre.deleted_at !== null) continue
    const elements = parChapitre.get(chapitre.id)
    if (elements === undefined) continue
    groupes.push({ chapitre, elements })
    // Un chapitre listé deux fois ne donne qu'un groupe.
    parChapitre.delete(chapitre.id)
  }
  return groupes
}

/** Les éléments des groupes, à plat, dans l'ordre du classeur. */
export function elementsDesGroupes(
  groupes: ReadonlyArray<GroupeModifies>,
): ChapterItem[] {
  return groupes.flatMap((g) => g.elements.map((e) => e.item))
}

// ---------------------------------------------------------------------------
// Dates au fuseau de l'hôtel (la date choisie est un JOUR de Paris)
// ---------------------------------------------------------------------------

/** L'heure de Paris à cet instant, en ms « comme si c'était UTC ». */
function heureLocaleParis(ms: number): number {
  // Formateur créé à chaque appel (quelques appels par dialogue) : un
  // formateur de module ne serait pas réévalué par le test de mutation.
  const formatParis = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const c: Record<string, number> = {}
  for (const p of formatParis.formatToParts(new Date(ms))) {
    if (p.type !== 'literal') c[p.type] = Number(p.value)
  }
  return Date.UTC(c.year, c.month - 1, c.day, c.hour, c.minute, c.second)
}

/** Décalage de Paris sur UTC à cet instant, en ms (+1 h l'hiver, +2 h l'été). */
function decalageParis(ms: number): number {
  return heureLocaleParis(ms) - Math.floor(ms / 1000) * 1000
}

/** Le jour de Paris (« 2026-10-04 ») qui contient cet instant. */
export function jourParis(ms: number): string {
  return new Date(heureLocaleParis(ms)).toISOString().slice(0, 10)
}

/** Le jour de Paris `n` jours avant celui qui contient cet instant. */
export function jourParisMoins(ms: number, n: number): string {
  const local = new Date(heureLocaleParis(ms))
  local.setUTCDate(local.getUTCDate() - n)
  return local.toISOString().slice(0, 10)
}

/**
 * Minuit à Paris du jour « aaaa-mm-jj », en instant ISO (UTC) ; `null` si le
 * jour est illisible ou n'existe pas (« 2026-02-30 »).
 */
export function debutJourParis(jour: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(jour)
  if (m === null) return null
  const utc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  // Un jour inexistant (« 2026-02-30 ») déborde sur le suivant : refusé.
  if (new Date(utc).toISOString().slice(0, 10) !== jour) return null
  // Paris ne change d'heure qu'à 2 h ou 3 h du matin : minuit n'a qu'un
  // décalage, relu à l'instant obtenu pour être exact.
  return new Date(utc - decalageParis(utc - decalageParis(utc))).toISOString()
}
