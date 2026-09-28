/*
 * Sommaire et découpage par chapitre — fonctions PURES partagées par le
 * tableau de bord (page « Sommaire », PDF du classeur complet) et la page
 * chapitre. Portées de Registre (`DashboardPage` : `tocEntries`).
 *
 * `SommaireEntree` a la forme du `ChapterEntry` de
 * `components/classeur/print/TableOfContentsPage.tsx` (structurellement
 * identique) : le métier ne dépend pas des composants.
 */

import { flattenItems } from '#/lib/classeur/types.ts'
import type { ChapterContent, DbChapter } from '#/lib/classeur/types.ts'

/** Titre d'un élément sans titre (comme Registre). */
export const SANS_TITRE = 'Sans titre'

export interface SommaireEntree {
  number: number
  label: string
  icon: string
  items: string[]
}

/** Les quatre familles d'un seul chapitre, extraites d'un contenu global. */
export function contenuDuChapitre(
  content: ChapterContent,
  chapterId: number,
): ChapterContent {
  return {
    documents: content.documents.filter((d) => d.chapter_id === chapterId),
    tracking_sheets: content.tracking_sheets.filter(
      (d) => d.chapter_id === chapterId,
    ),
    signature_sheets: content.signature_sheets.filter(
      (d) => d.chapter_id === chapterId,
    ),
    intercalaires: content.intercalaires.filter(
      (d) => d.chapter_id === chapterId,
    ),
  }
}

/** Chapitres triés par `sort_order` puis `id` (l'ordre d'impression). */
export function trierChapitres(
  chapters: ReadonlyArray<DbChapter>,
): DbChapter[] {
  return [...chapters].sort(
    (a, b) => a.sort_order - b.sort_order || a.id - b.id,
  )
}

/** Titre affiché d'un élément : « Sans titre » si vide. */
export function titreOuDefaut(titre: string): string {
  return titre.trim() === '' ? SANS_TITRE : titre
}

/**
 * Entrées du sommaire : un chapitre par entrée, numéroté par sa POSITION
 * (1, 2, 3…), avec les titres de ses éléments dans l'ordre d'affichage.
 * Les chapitres vides figurent au sommaire (comme Registre) ; seul le PDF
 * complet les saute.
 */
export function construireSommaire(
  chapters: ReadonlyArray<DbChapter>,
  content: ChapterContent,
): SommaireEntree[] {
  return trierChapitres(chapters).map((ch, i) => ({
    number: i + 1,
    label: ch.label,
    icon: ch.icon,
    items: flattenItems(contenuDuChapitre(content, ch.id)).map((it) =>
      titreOuDefaut(it.data.title),
    ),
  }))
}
