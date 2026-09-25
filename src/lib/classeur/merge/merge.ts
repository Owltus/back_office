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
 *      son `sort_order` local n'est touché qu'en mode remplacement (E6).
 *  R3  Chapitre non apparié : `insert`, ajouté en FIN (max des sort_order
 *      locaux non supprimés + 1), pas au sort_order du fichier.
 *  R4  Élément de type inconnu ou sans titre (après trim) : `skip` + avertissement.
 *  R5  Élément : apparié par `uuid` d'abord (tout le classeur, supprimés
 *      compris, même dans un autre chapitre), sinon par (chapitre local,
 *      nature, titre exact) parmi les non supprimés. Un chapitre nouveau n'a
 *      aucun élément local : pas de repli possible. Le Rust ne déplaçait
 *      jamais un élément apparié ailleurs : ici, si le fichier gagne, il est
 *      déplacé (E6).
 *  R6  Élément apparié mais supprimé localement : `skip` en mode fusion ;
 *      restauré et compté `insert` en mode remplacement. Le Rust le
 *      restaurait SANS ses champs : ici les champs, le chapitre, l'ordre et
 *      l'horodatage du fichier sont appliqués (E6). Les éléments d'un
 *      chapitre lui-même restauré (E1) sont restaurés même en mode fusion,
 *      sinon le chapitre revenait vide.
 *  R7  Mode fusion, dernier écrit gagne : le fichier ne s'applique que si
 *      son `updated_at` est STRICTEMENT plus récent que le local, ou si l'un
 *      des deux manque (`(Some, Some) => json > local`, sinon `true`).
 *      Un fichier plus ancien → `unchanged`, même si le contenu diffère.
 *  R8  Mode remplacement : les horodatages sont ignorés, le fichier fait foi.
 *  R9  Élément apparié et retenu : `update` si un champ de sa nature diffère
 *      (document : title/description/content ; suivi : title/periodicite ;
 *      signature : title/description/nombre ; intercalaire :
 *      title/description), ou si son chapitre, son ordre ou son uuid
 *      diffèrent du fichier (E6), sinon `unchanged`.
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
 *  E6  (audit adverse du 2026-09-25, 7 défauts rouges) Quand le fichier
 *      gagne (remplacement, ou plus récent en fusion), l'élément reçoit AUSSI
 *      son chapitre, son `sort_order`, son `uuid` (apparié par titre) et son
 *      `updated_at` du fichier — le trigger `classeur_stamp` respecte cet
 *      horodatage, ce qui répare « dernier écrit gagne » après une première
 *      fusion (la base réestampillait « now », et tout fichier antérieur à la
 *      fusion était ensuite jugé plus vieux). La restauration d'un instantané
 *      redevient exacte (ordre, emplacement, contenu des éléments supprimés
 *      puis restaurés), ce que Registre obtenait en purgeant et réinsérant.
 *  E7  Appariement par slug/titre CONSOMMÉ : deux chapitres de même slug ou
 *      deux éléments de même titre (fichiers v1) s'apparient un à un dans
 *      l'ordre, au lieu de tous tomber sur le premier (doublons / écrasement).
 *  E8  Un élément au titre vide n'est ignoré que s'il n'a pas d'uuid (sinon il
 *      s'apparie par uuid) : un export est un point fixe du remplacement.
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
      /** Mode remplacement seulement (E6). */
      sort_order?: number
    }
  | {
      type: 'restaurerChapitre'
      id: number
      label: string
      icon: string
      description: string
      sort_order?: number
    }
  | { type: 'supprimerChapitre'; id: number }
  | {
      type: 'creerItem'
      chapitre: RefChapitre
      uuid: string | null
      sort_order: number
      /** Horodatage du fichier, en ISO ; absent si le fichier n'en a pas. */
      updated_at?: string
      item: ChampsItem
    }
  | {
      type: 'modifierItem'
      id: number
      item: ChampsItem
      /** Présent si l'élément change de chapitre (E6). */
      chapitre?: RefChapitre
      sort_order?: number
      /** Présent si l'élément a été apparié par titre et que le fichier porte un uuid (E6). */
      uuid?: string
      updated_at?: string
    }
  | {
      type: 'restaurerItem'
      id: number
      item: ChampsItem
      chapitre: RefChapitre
      sort_order: number
      uuid?: string
      updated_at?: string
    }
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

/** Horodatage du fichier normalisé en ISO pour la base ; `undefined` si absent ou illisible. */
export function horodatageIso(s: string | undefined): string | undefined {
  if (s === undefined || s === '') return undefined
  const t = instant(s)
  return Number.isFinite(t) ? new Date(t).toISOString() : undefined
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

  // Index des chapitres (R1). Le repli par slug est une FILE consommée (E7).
  const chapitresLocaux = [...local.chapters].sort(
    (a, b) => a.sort_order - b.sort_order || a.id - b.id,
  )
  const chapitresParUuid = new Map<string, DbChapter>()
  const chapitresParSlug = new Map<string, DbChapter[]>()
  for (const c of chapitresLocaux) {
    if (c.uuid && !chapitresParUuid.has(c.uuid)) chapitresParUuid.set(c.uuid, c)
    if (c.deleted_at === null) {
      const slug = slugify(c.label)
      const file = chapitresParSlug.get(slug)
      if (file === undefined) chapitresParSlug.set(slug, [c])
      else file.push(c)
    }
  }

  // Index des éléments (R5). Le repli par titre est une FILE consommée (E7).
  const itemsLocaux = flattenItems(local.content)
  const itemsParUuid = new Map<string, ChapterItem>()
  const itemsParRepli = new Map<string, ChapterItem[]>()
  for (const it of itemsLocaux) {
    if (it.data.uuid && !itemsParUuid.has(it.data.uuid))
      itemsParUuid.set(it.data.uuid, it)
    if (it.data.deleted_at === null) {
      const cle = cleRepli(it.data.chapter_id, it.kind, it.data.title)
      const file = itemsParRepli.get(cle)
      if (file === undefined) itemsParRepli.set(cle, [it])
      else file.push(it)
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
    const { ref, restaure: chapitreRestaure } = apparierChapitre(chJson)
    const chapterIdLocal = ref.type === 'local' ? ref.id : null

    for (const item of chJson.items) {
      // R4 (+ E8)
      if (!estKindConnu(item.kind)) {
        warnings.push(
          `Chapitre '${chJson.label}': item de type inconnu '${item.kind}' ignoré`,
        )
        resultat.skipped += 1
        apercu.push(ligne('skip', item.kind, item.title, chJson))
        continue
      }
      if (item.title.trim() === '' && item.uuid === undefined) {
        warnings.push(`Chapitre '${chJson.label}': item sans titre ignoré`)
        resultat.skipped += 1
        apercu.push(ligne('skip', item.kind, '(sans titre)', chJson))
        continue
      }
      const kind = item.kind
      const titreAffiche =
        item.title.trim() === '' ? '(sans titre)' : item.title
      const updated_at = horodatageIso(item.updated_at)

      // R5 (+ E2, E7)
      let existant =
        item.uuid !== undefined ? itemsParUuid.get(item.uuid) : undefined
      if (existant !== undefined && existant.kind !== kind) existant = undefined
      let parTitre = false
      if (existant === undefined && chapterIdLocal !== null) {
        const file = itemsParRepli.get(
          cleRepli(chapterIdLocal, kind, item.title),
        )
        existant = file?.shift()
        parTitre = existant !== undefined
      }

      if (existant !== undefined) {
        itemsApparies.add(cleItem(existant.kind, existant.data.id))
        // Un uuid du fichier adopté par un élément apparié par titre (E6) :
        // les fusions suivantes s'apparieront par uuid.
        const uuid =
          parTitre &&
          item.uuid !== undefined &&
          item.uuid !== existant.data.uuid
            ? item.uuid
            : undefined

        // R6 (+ E1, E6)
        if (existant.data.deleted_at !== null) {
          if (replace || chapitreRestaure) {
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
              apercu.push(ligne('skip', kind, titreAffiche, chJson))
              continue
            }
            actions.push({
              type: 'restaurerItem',
              id: existant.data.id,
              item: champs,
              chapitre: ref,
              sort_order: item.sort_order,
              ...(uuid !== undefined ? { uuid } : {}),
              ...(updated_at !== undefined ? { updated_at } : {}),
            })
            resultat.inserted += 1
            apercu.push(ligne('insert', kind, titreAffiche, chJson))
          } else {
            resultat.skipped += 1
            apercu.push(ligne('skip', kind, titreAffiche, chJson))
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

        // R9 (+ E6)
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
          apercu.push(ligne('skip', kind, titreAffiche, chJson))
          continue
        }
        const bouge =
          chapterIdLocal === null || existant.data.chapter_id !== chapterIdLocal
        const ordreDiffere = existant.data.sort_order !== item.sort_order
        if (
          champsDifferent(champs, existant) ||
          bouge ||
          ordreDiffere ||
          uuid !== undefined
        ) {
          actions.push({
            type: 'modifierItem',
            id: existant.data.id,
            item: champs,
            ...(bouge ? { chapitre: ref } : {}),
            ...(ordreDiffere ? { sort_order: item.sort_order } : {}),
            ...(uuid !== undefined ? { uuid } : {}),
            ...(updated_at !== undefined ? { updated_at } : {}),
          })
          resultat.updated += 1
          apercu.push(ligne('update', kind, titreAffiche, chJson))
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
        apercu.push(ligne('skip', kind, titreAffiche, chJson))
        continue
      }
      actions.push({
        type: 'creerItem',
        chapitre: ref,
        uuid: item.uuid ?? null,
        sort_order: item.sort_order,
        ...(updated_at !== undefined ? { updated_at } : {}),
        item: champs,
      })
      resultat.inserted += 1
      apercu.push(ligne('insert', kind, titreAffiche, chJson))
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

  // R1, R2, R3, E1, E6, E7
  function apparierChapitre(chJson: ChapterJson): {
    ref: RefChapitre
    restaure: boolean
  } {
    let apparie =
      chJson.uuid !== undefined ? chapitresParUuid.get(chJson.uuid) : undefined
    apparie ??= chapitresParSlug.get(slugify(chJson.label))?.shift()

    if (apparie === undefined) {
      const index = indexNouveau
      indexNouveau += 1
      // R3 en fusion : en fin de liste. En remplacement (E6) : l'ordre du
      // fichier, sinon la passe suivante réordonnerait ce qu'elle vient de créer.
      actions.push({
        type: 'creerChapitre',
        index,
        uuid: chJson.uuid ?? null,
        label: chJson.label,
        icon: chJson.icon,
        description: chJson.description,
        sort_order: replace ? chJson.sort_order : prochainOrdreChapitre,
      })
      prochainOrdreChapitre += 1
      resultat.inserted += 1
      apercu.push(ligne('insert', 'chapter', chJson.label, chJson))
      return { ref: { type: 'nouveau', index }, restaure: false }
    }

    chapitresApparies.add(apparie.id)
    const ordreDiffere = replace && apparie.sort_order !== chJson.sort_order
    const champs = {
      label: chJson.label,
      icon: chJson.icon,
      description: chJson.description,
      ...(ordreDiffere ? { sort_order: chJson.sort_order } : {}),
    }
    if (apparie.deleted_at !== null) {
      actions.push({ type: 'restaurerChapitre', id: apparie.id, ...champs })
      resultat.inserted += 1
      apercu.push(ligne('insert', 'chapter', chJson.label, chJson))
      return { ref: { type: 'local', id: apparie.id }, restaure: true }
    }
    if (
      apparie.label !== chJson.label ||
      apparie.icon !== chJson.icon ||
      apparie.description !== chJson.description ||
      ordreDiffere
    ) {
      actions.push({ type: 'modifierChapitre', id: apparie.id, ...champs })
      resultat.updated += 1
      apercu.push(ligne('update', 'chapter', chJson.label, chJson))
    } else {
      resultat.unchanged += 1
    }
    return { ref: { type: 'local', id: apparie.id }, restaure: false }
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
