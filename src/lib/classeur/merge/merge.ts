/*
 * Fusion d'un fichier JSON dans un classeur existant — portée de Registre
 * (`files.rs::do_merge`), en fonction PURE : aucune écriture, un PLAN
 * d'actions que `apply.ts` exécute via `service.ts`, plus les compteurs et
 * l'aperçu que le dialogue affiche.
 *
 * Règles reproduites de `do_merge` (une ligne chacune, référencées dans les
 * tests par leur numéro R1…R14) :
 *  R1  Chapitre : apparié par `uuid` d'abord, parmi TOUS les chapitres du
 *      classeur (supprimés compris), sinon par `slugify(label)` parmi les
 *      non supprimés.
 *  R2  Chapitre apparié : `update` si label, icon ou description diffèrent
 *      (jamais de règle d'horodatage pour un chapitre), sinon `unchanged` ;
 *      son `sort_order` local n'est jamais touché.
 *  R3  Chapitre non apparié : `insert`, ajouté en FIN (max des sort_order
 *      locaux non supprimés + 1), pas au sort_order du fichier.
 *  R4  Élément de type inconnu ou sans titre (après trim) : `skip` + avertissement.
 *  R5  Élément : apparié par `uuid` d'abord (tout le classeur, supprimés
 *      compris, même dans un autre chapitre : il n'est PAS déplacé), sinon
 *      par (chapitre local, nature, titre exact) parmi les non supprimés.
 *      Un chapitre nouveau n'a aucun élément local : pas de repli possible.
 *  R6  Élément apparié mais supprimé localement : `skip` en mode fusion ;
 *      restauré et compté `insert` en mode remplacement (sans mise à jour
 *      de son contenu, comme le Rust).
 *  R7  Mode fusion, dernier écrit gagne : le fichier ne s'applique que si
 *      son `updated_at` est STRICTEMENT plus récent que le local, ou si l'un
 *      des deux manque (`(Some, Some) => json > local`, sinon `true`).
 *      Un fichier plus ancien → `unchanged`, même si le contenu diffère.
 *  R8  Mode remplacement : les horodatages sont ignorés, le fichier fait foi.
 *  R9  Élément apparié et retenu : `update` si un champ de sa nature diffère
 *      (document : title/description/content ; suivi : title/periodicite ;
 *      signature : title/description/nombre ; intercalaire :
 *      title/description), sinon `unchanged`.
 *  R10 Élément non apparié : `insert` avec le `sort_order` du fichier et
 *      son `uuid` s'il en a un.
 *  R11 Mode remplacement : tout élément local non supprimé et non apparié
 *      est supprimé (douce) puis tout chapitre local non supprimé et non
 *      apparié, chacun compté `deleted`. Le mode fusion ne supprime jamais.
 *  R12 L'aperçu ne liste pas les `unchanged` (comptés seulement).
 *
 * Écarts assumés par rapport au Rust, tous documentés dans le rapport :
 *  E1  Un chapitre supprimé apparié par uuid est RESTAURÉ (`restaurerChapitre`,
 *      compté `insert`). Le Rust l'appariait sans le restaurer : les
 *      éléments atterrissaient dans un chapitre invisible.
 *  E2  Le repli des éléments exige la même NATURE (le Rust n'appariait que
 *      par chapitre + titre, puis écrivait dans la table de la nature du
 *      fichier avec l'id d'une autre table).
 *  E3  `periodicite_id` est apparié PAR LIBELLÉ via `_metadata.periodicites`
 *      quand le fichier l'embarque (les ids diffèrent d'une base à l'autre) ;
 *      sans métadonnées, l'id est pris tel quel s'il existe localement.
 *      Introuvable : périodicité locale conservée (mise à jour) ou défaut
 *      « Non défini » / première du référentiel (création) ; sans référentiel
 *      du tout, l'élément est `skip`. Le Rust copiait l'id aveuglément.
 *  E4  Les horodatages sont comparés comme instants (formats SQLite
 *      `YYYY-MM-DD HH:MM:SS` UTC et ISO Postgres réconciliés), et non comme
 *      chaînes ; repli lexicographique si l'un n'est pas lisible.
 *  E5  Les suppressions du mode remplacement suivent l'ordre local
 *      (sort_order, id) et non celui d'une HashMap.
 */

import { slugify } from '#/lib/classeur/slug.ts'
import type {
  ChapterContent,
  ChapterItem,
  DbChapter,
  DbDocument,
  DbIntercalaire,
  DbPeriodicite,
  DbSignatureSheet,
  DbTrackingSheet,
  ItemKind,
} from '#/lib/classeur/types.ts'
import { flattenItems } from '#/lib/classeur/types.ts'
import type {
  ChapterJson,
  ClasseurJson,
  ItemJson,
} from '#/lib/classeur/merge/schema.ts'
import { DEFAUTS, estKindConnu } from '#/lib/classeur/merge/schema.ts'

// ---------------------------------------------------------------------------
// Contrats
// ---------------------------------------------------------------------------

/** État local d'un classeur, TOUT compris (les supprimés portent `deleted_at`). */
export interface EtatLocal {
  chapters: DbChapter[]
  content: ChapterContent
  /** Référentiel local des périodicités (E3). Absent : ids pris tels quels. */
  periodicites?: DbPeriodicite[]
}

/** Les cinq compteurs (miroir de `MergeResult` côté Rust, sans `warnings`). */
export interface MergeResult {
  inserted: number
  updated: number
  unchanged: number
  skipped: number
  deleted: number
}

export type ActionApercu = 'insert' | 'update' | 'unchanged' | 'skip' | 'delete'

/** Ligne de l'aperçu (miroir de `MergePreviewItem`). `kind` vaut aussi `chapter`. */
export interface MergePreviewItem {
  action: ActionApercu
  kind: string
  title: string
  chapter_label: string
  icon?: string
}

/** Chapitre cible d'une création : local (id) ou créé par ce plan (index). */
export type RefChapitre =
  { type: 'local'; id: number } | { type: 'nouveau'; index: number }

/** Champs d'un élément, dans la forme attendue par `createItem`/`updateItem`. */
export type ChampsItem =
  | {
      kind: 'document'
      input: Pick<DbDocument, 'title' | 'description' | 'content'>
    }
  | {
      kind: 'tracking_sheet'
      input: Pick<DbTrackingSheet, 'title' | 'periodicite_id'>
    }
  | {
      kind: 'signature_sheet'
      input: Pick<DbSignatureSheet, 'title' | 'description' | 'nombre'>
    }
  | {
      kind: 'intercalaire'
      input: Pick<DbIntercalaire, 'title' | 'description'>
    }

/**
 * Union discriminée exécutable dans l'ordre par `apply.ts`. Les créations de
 * chapitres précèdent toujours les éléments qui les référencent ; les
 * suppressions (mode remplacement) viennent en dernier.
 */
export type ActionFusion =
  | {
      type: 'creerChapitre'
      index: number
      uuid: string | null
      label: string
      icon: string
      description: string
      sort_order: number
    }
  | {
      type: 'modifierChapitre'
      id: number
      label: string
      icon: string
      description: string
    }
  | {
      type: 'restaurerChapitre'
      id: number
      label: string
      icon: string
      description: string
    }
  | { type: 'supprimerChapitre'; id: number }
  | {
      type: 'creerItem'
      chapitre: RefChapitre
      uuid: string | null
      sort_order: number
      item: ChampsItem
    }
  | { type: 'modifierItem'; id: number; item: ChampsItem }
  | { type: 'restaurerItem'; kind: ItemKind; id: number }
  | { type: 'supprimerItem'; kind: ItemKind; id: number }

export interface PlanFusion {
  actions: ActionFusion[]
  resultat: MergeResult
  apercu: MergePreviewItem[]
  warnings: string[]
}

export interface OptionsFusion {
  /** `true` : le fichier fait foi, les orphelins locaux sont supprimés (R8, R11). */
  replace: boolean
}

// ---------------------------------------------------------------------------
// Horodatages (R7, E4)
// ---------------------------------------------------------------------------

/** Rend un instant comparable ; `NaN` si illisible. */
function instant(s: string): number {
  let t = s.trim()
  // SQLite `datetime('now')` : « 2026-09-25 10:00:00 », UTC, sans zone.
  if (/^\d{4}-\d{2}-\d{2} \d/.test(t)) t = t.replace(' ', 'T')
  if (/^\d{4}-\d{2}-\d{2}T/.test(t) && !/(Z|[+-]\d{2}:?\d{2})$/.test(t))
    t = `${t}Z`
  // Fractions au-delà de la milliseconde (Postgres : microsecondes).
  t = t.replace(/(\.\d{3})\d+/, '$1')
  return Date.parse(t)
}

/** R7 : `true` si le fichier doit s'appliquer (plus récent, ou horodatage manquant). */
export function fichierPlusRecent(
  fichier: string | undefined,
  local: string | null | undefined,
): boolean {
  if (fichier === undefined || fichier === '') return true
  if (local === null || local === undefined || local === '') return true
  const a = instant(fichier)
  const b = instant(local)
  if (Number.isFinite(a) && Number.isFinite(b)) return a > b
  return fichier > local
}

// ---------------------------------------------------------------------------
// Périodicités (E3)
// ---------------------------------------------------------------------------

/**
 * Traduit le `periodicite_id` d'un fichier en id local. `null` si
 * intraduisible (l'appelant décide : conserver, défaut ou ignorer).
 */
function resoudrePeriodicite(
  idFichier: number | null | undefined,
  fichier: ClasseurJson,
  locales: DbPeriodicite[] | undefined,
): { id: number | null; libelle: string | null } {
  if (idFichier === null || idFichier === undefined)
    return { id: null, libelle: null }
  const meta = fichier._metadata?.periodicites.find((p) => p.id === idFichier)
  if (meta !== undefined) {
    if (locales === undefined) return { id: idFichier, libelle: meta.label }
    const cible = slugify(meta.label)
    const locale = locales.find((p) => slugify(p.label) === cible)
    return { id: locale?.id ?? null, libelle: meta.label }
  }
  if (locales === undefined) return { id: idFichier, libelle: null }
  return {
    id: locales.some((p) => p.id === idFichier) ? idFichier : null,
    libelle: null,
  }
}

/** Périodicité par défaut d'une création : « Non défini », sinon la première. */
function periodiciteParDefaut(
  locales: DbPeriodicite[] | undefined,
): number | null {
  if (locales === undefined || locales.length === 0) return null
  const nonDefini = locales.find((p) => slugify(p.label) === 'non-defini')
  if (nonDefini !== undefined) return nonDefini.id
  return [...locales].sort(
    (a, b) => a.sort_order - b.sort_order || a.id - b.id,
  )[0].id
}

// ---------------------------------------------------------------------------
// Champs par nature (R9, R10)
// ---------------------------------------------------------------------------

/**
 * Champs d'un élément du fichier pour une écriture locale. `existant` sert
 * au suivi (périodicité conservée si intraduisible). Rend `null` quand une
 * création est impossible (suivi sans périodicité résoluble ni défaut).
 */
function champsDepuisFichier(
  item: ItemJson,
  kind: ItemKind,
  existant: ChapterItem | undefined,
  fichier: ClasseurJson,
  locales: DbPeriodicite[] | undefined,
  warnings: string[],
): ChampsItem | null {
  const description = item.description ?? ''
  switch (kind) {
    case 'document':
      return {
        kind,
        input: { title: item.title, description, content: item.content ?? '' },
      }
    case 'signature_sheet':
      return {
        kind,
        input: {
          title: item.title,
          description,
          nombre: item.nombre ?? DEFAUTS.signature_sheet.nombre,
        },
      }
    case 'intercalaire':
      return { kind, input: { title: item.title, description } }
    case 'tracking_sheet': {
      const { id, libelle } = resoudrePeriodicite(
        item.periodicite_id,
        fichier,
        locales,
      )
      const quoi =
        libelle !== null
          ? `périodicité '${libelle}' inconnue dans cette base`
          : `périodicité n° ${String(item.periodicite_id)} inconnue dans cette base`
      if (id !== null)
        return { kind, input: { title: item.title, periodicite_id: id } }
      if (existant !== undefined && existant.kind === 'tracking_sheet') {
        if (item.periodicite_id !== null && item.periodicite_id !== undefined) {
          warnings.push(
            `Feuille de suivi '${item.title}' : ${quoi}, périodicité locale conservée`,
          )
        }
        return {
          kind,
          input: {
            title: item.title,
            periodicite_id: existant.data.periodicite_id,
          },
        }
      }
      const defaut = periodiciteParDefaut(locales)
      if (defaut === null) {
        warnings.push(
          `Feuille de suivi '${item.title}' : ${quoi}, élément ignoré`,
        )
        return null
      }
      if (item.periodicite_id !== null && item.periodicite_id !== undefined) {
        warnings.push(
          `Feuille de suivi '${item.title}' : ${quoi}, périodicité par défaut appliquée`,
        )
      }
      return { kind, input: { title: item.title, periodicite_id: defaut } }
    }
  }
}

/** R9 : un champ de la nature diffère-t-il entre le fichier et le local ? */
function champsDifferent(champs: ChampsItem, local: ChapterItem): boolean {
  if (champs.kind !== local.kind) return true
  switch (champs.kind) {
    case 'document': {
      const d = local.data as DbDocument
      return (
        d.title !== champs.input.title ||
        d.description !== champs.input.description ||
        d.content !== champs.input.content
      )
    }
    case 'tracking_sheet': {
      const d = local.data as DbTrackingSheet
      return (
        d.title !== champs.input.title ||
        d.periodicite_id !== champs.input.periodicite_id
      )
    }
    case 'signature_sheet': {
      const d = local.data as DbSignatureSheet
      return (
        d.title !== champs.input.title ||
        d.description !== champs.input.description ||
        d.nombre !== champs.input.nombre
      )
    }
    case 'intercalaire': {
      const d = local.data as DbIntercalaire
      return (
        d.title !== champs.input.title ||
        d.description !== champs.input.description
      )
    }
  }
}

// ---------------------------------------------------------------------------
// Planification
// ---------------------------------------------------------------------------

const cleItem = (kind: ItemKind, id: number) => `${kind}:${id}`
const cleRepli = (chapterId: number, kind: string, title: string) =>
  `${chapterId}|${kind}|${title}`

export function planifierFusion(
  local: EtatLocal,
  fichier: ClasseurJson,
  options: OptionsFusion,
): PlanFusion {
  const { replace } = options
  const actions: ActionFusion[] = []
  const apercu: MergePreviewItem[] = []
  const warnings: string[] = []
  const resultat: MergeResult = {
    inserted: 0,
    updated: 0,
    unchanged: 0,
    skipped: 0,
    deleted: 0,
  }

  // Index des chapitres (R1)
  const chapitresLocaux = [...local.chapters].sort(
    (a, b) => a.sort_order - b.sort_order || a.id - b.id,
  )
  const chapitresParUuid = new Map<string, DbChapter>()
  const chapitresParSlug = new Map<string, DbChapter>()
  for (const c of chapitresLocaux) {
    if (c.uuid && !chapitresParUuid.has(c.uuid)) chapitresParUuid.set(c.uuid, c)
    if (c.deleted_at === null) {
      const slug = slugify(c.label)
      if (!chapitresParSlug.has(slug)) chapitresParSlug.set(slug, c)
    }
  }

  // Index des éléments (R5)
  const itemsLocaux = flattenItems(local.content)
  const itemsParUuid = new Map<string, ChapterItem>()
  const itemsParRepli = new Map<string, ChapterItem>()
  for (const it of itemsLocaux) {
    if (it.data.uuid && !itemsParUuid.has(it.data.uuid))
      itemsParUuid.set(it.data.uuid, it)
    if (it.data.deleted_at === null) {
      const cle = cleRepli(it.data.chapter_id, it.kind, it.data.title)
      if (!itemsParRepli.has(cle)) itemsParRepli.set(cle, it)
    }
  }

  const chapitresApparies = new Set<number>()
  const itemsApparies = new Set<string>()
  let prochainOrdreChapitre =
    Math.max(
      0,
      ...chapitresLocaux
        .filter((c) => c.deleted_at === null)
        .map((c) => c.sort_order),
    ) + 1
  let indexNouveau = 0

  for (const chJson of fichier.chapters) {
    const ref = apparierChapitre(chJson)
    const chapterIdLocal = ref.type === 'local' ? ref.id : null

    for (const item of chJson.items) {
      // R4
      if (!estKindConnu(item.kind)) {
        warnings.push(
          `Chapitre '${chJson.label}': item de type inconnu '${item.kind}' ignoré`,
        )
        resultat.skipped += 1
        apercu.push(ligne('skip', item.kind, item.title, chJson))
        continue
      }
      if (item.title.trim() === '') {
        warnings.push(`Chapitre '${chJson.label}': item sans titre ignoré`)
        resultat.skipped += 1
        apercu.push(ligne('skip', item.kind, '(sans titre)', chJson))
        continue
      }
      const kind = item.kind

      // R5 (+ E2)
      let existant =
        item.uuid !== undefined ? itemsParUuid.get(item.uuid) : undefined
      if (existant !== undefined && existant.kind !== kind) existant = undefined
      if (existant === undefined && chapterIdLocal !== null) {
        existant = itemsParRepli.get(cleRepli(chapterIdLocal, kind, item.title))
      }

      if (existant !== undefined) {
        itemsApparies.add(cleItem(existant.kind, existant.data.id))

        // R6
        if (existant.data.deleted_at !== null) {
          if (replace) {
            actions.push({
              type: 'restaurerItem',
              kind: existant.kind,
              id: existant.data.id,
            })
            resultat.inserted += 1
            apercu.push(ligne('insert', kind, item.title, chJson))
          } else {
            resultat.skipped += 1
            apercu.push(ligne('skip', kind, item.title, chJson))
          }
          continue
        }

        // R7 / R8
        if (
          !replace &&
          !fichierPlusRecent(item.updated_at, existant.data.updated_at)
        ) {
          resultat.unchanged += 1
          continue
        }

        // R9
        const champs = champsDepuisFichier(
          item,
          kind,
          existant,
          fichier,
          local.periodicites,
          warnings,
        )
        if (champs === null) {
          resultat.skipped += 1
          apercu.push(ligne('skip', kind, item.title, chJson))
          continue
        }
        if (champsDifferent(champs, existant)) {
          actions.push({
            type: 'modifierItem',
            id: existant.data.id,
            item: champs,
          })
          resultat.updated += 1
          apercu.push(ligne('update', kind, item.title, chJson))
        } else {
          resultat.unchanged += 1
        }
        continue
      }

      // R10
      const champs = champsDepuisFichier(
        item,
        kind,
        undefined,
        fichier,
        local.periodicites,
        warnings,
      )
      if (champs === null) {
        resultat.skipped += 1
        apercu.push(ligne('skip', kind, item.title, chJson))
        continue
      }
      actions.push({
        type: 'creerItem',
        chapitre: ref,
        uuid: item.uuid ?? null,
        sort_order: item.sort_order,
        item: champs,
      })
      resultat.inserted += 1
      apercu.push(ligne('insert', kind, item.title, chJson))
    }
  }

  // R11 (+ E5)
  if (replace) {
    const chapitresVisibles = new Map<number, DbChapter>()
    for (const c of chapitresLocaux)
      if (c.deleted_at === null) chapitresVisibles.set(c.id, c)

    for (const it of itemsLocaux) {
      if (it.data.deleted_at !== null) continue
      if (itemsApparies.has(cleItem(it.kind, it.data.id))) continue
      actions.push({ type: 'supprimerItem', kind: it.kind, id: it.data.id })
      resultat.deleted += 1
      const ch = chapitresVisibles.get(it.data.chapter_id)
      apercu.push({
        action: 'delete',
        kind: it.kind,
        title: it.data.title,
        chapter_label: ch?.label ?? '',
        icon: ch?.icon ?? '',
      })
    }
    for (const c of chapitresLocaux) {
      if (c.deleted_at !== null || chapitresApparies.has(c.id)) continue
      actions.push({ type: 'supprimerChapitre', id: c.id })
      resultat.deleted += 1
      apercu.push({
        action: 'delete',
        kind: 'chapter',
        title: c.label,
        chapter_label: c.label,
        icon: c.icon,
      })
    }
  }

  return { actions, resultat, apercu, warnings }

  // R1, R2, R3, E1
  function apparierChapitre(chJson: ChapterJson): RefChapitre {
    let apparie =
      chJson.uuid !== undefined ? chapitresParUuid.get(chJson.uuid) : undefined
    apparie ??= chapitresParSlug.get(slugify(chJson.label))

    if (apparie === undefined) {
      const index = indexNouveau
      indexNouveau += 1
      actions.push({
        type: 'creerChapitre',
        index,
        uuid: chJson.uuid ?? null,
        label: chJson.label,
        icon: chJson.icon,
        description: chJson.description,
        sort_order: prochainOrdreChapitre,
      })
      prochainOrdreChapitre += 1
      resultat.inserted += 1
      apercu.push(ligne('insert', 'chapter', chJson.label, chJson))
      return { type: 'nouveau', index }
    }

    chapitresApparies.add(apparie.id)
    const champs = {
      label: chJson.label,
      icon: chJson.icon,
      description: chJson.description,
    }
    if (apparie.deleted_at !== null) {
      actions.push({ type: 'restaurerChapitre', id: apparie.id, ...champs })
      resultat.inserted += 1
      apercu.push(ligne('insert', 'chapter', chJson.label, chJson))
    } else if (
      apparie.label !== chJson.label ||
      apparie.icon !== chJson.icon ||
      apparie.description !== chJson.description
    ) {
      actions.push({ type: 'modifierChapitre', id: apparie.id, ...champs })
      resultat.updated += 1
      apercu.push(ligne('update', 'chapter', chJson.label, chJson))
    } else {
      resultat.unchanged += 1
    }
    return { type: 'local', id: apparie.id }
  }
}

/** Ligne d'aperçu portant le libellé et l'icône du chapitre du fichier. */
function ligne(
  action: ActionApercu,
  kind: string,
  title: string,
  chJson: ChapterJson,
): MergePreviewItem {
  return { action, kind, title, chapter_label: chJson.label, icon: chJson.icon }
}

// ---------------------------------------------------------------------------
// Résumé
// ---------------------------------------------------------------------------

function pluriel(n: number, singulier: string, plurielForme: string): string {
  return `${n} ${n > 1 ? plurielForme : singulier}`
}

/** Texte court pour l'aperçu : « 3 ajouts, 2 modifications, 12 inchangés ». */
export function resumerPlan(plan: PlanFusion): string {
  const r = plan.resultat
  if (r.inserted + r.updated + r.unchanged + r.skipped + r.deleted === 0) {
    return 'Aucun élément à fusionner'
  }
  const parts = [
    pluriel(r.inserted, 'ajout', 'ajouts'),
    pluriel(r.updated, 'modification', 'modifications'),
    pluriel(r.unchanged, 'inchangé', 'inchangés'),
  ]
  if (r.deleted > 0)
    parts.push(pluriel(r.deleted, 'suppression', 'suppressions'))
  if (r.skipped > 0) parts.push(pluriel(r.skipped, 'ignoré', 'ignorés'))
  return parts.join(', ')
}
