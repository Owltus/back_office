/*
 * Export et réimport JSON d'UN chapitre ou d'UN document (demande utilisateur
 * du 2026-09-29 : « comme pour le classeur au complet, mais juste pour un
 * chapitre, puis pour un document », pour faire retravailler le contenu par
 * un LLM et le réimporter).
 *
 * Même format que l'export du classeur (v2, `construireExport`) : un fichier
 * de chapitre est un classeur à UN chapitre, un fichier de document un
 * classeur à un chapitre contenant ce seul document. Le bloc `_metadata`
 * garde le schéma descriptif et y ajoute :
 *   - `portee` : ce que le fichier représente (chapitre ou document, par uuid)
 *     — c'est ce qui permet de refuser un fichier appliqué au mauvais endroit ;
 *   - `instructions` : le mode d'emploi pour un LLM (ce qu'il peut modifier,
 *     ce qu'il ne doit JAMAIS toucher, les conventions Markdown de la page).
 *
 * Réimport LIMITÉ à la portée (`planifierFusionPortee`) :
 *   - le fichier FAIT FOI pour les éléments qu'il contient, horodatages
 *     ignorés : un LLM ne met pas `updated_at` à jour, la règle « le plus
 *     récent gagne » ignorerait donc toutes ses modifications ;
 *   - RIEN hors de la portée n'est touché : ni les autres chapitres, ni les
 *     autres documents, ni la position du chapitre dans le classeur ;
 *   - un élément absent du fichier n'est supprimé (douce) que si
 *     `supprimerAbsents` est demandé, et seulement dans ce chapitre — un LLM
 *     tronque parfois sa réponse, la suppression ne doit jamais être implicite.
 * Le plan est celui de `planifierFusion` en mode remplacement, FILTRÉ : on
 * réutilise ses règles d'appariement (uuid, puis titre), ses périodicités et
 * son aperçu plutôt que d'en écrire une seconde version.
 *
 * Pur : ni React, ni Supabase.
 */

import type {
  ChapterContent,
  ChapterItem,
  DbChapter,
  DbClasseur,
  DbDocument,
  DbPeriodicite,
} from '#/lib/classeur/types.ts'
import { flattenItems } from '#/lib/classeur/types.ts'
import { construireExport } from '#/lib/classeur/merge/schema.ts'
import type {
  ClasseurJson,
  ItemJson,
  MetadataJson,
} from '#/lib/classeur/merge/schema.ts'
import { planifierFusion } from '#/lib/classeur/merge/merge.ts'
import type {
  ActionFusion,
  EtatLocal,
  MergePreviewItem,
  PlanFusion,
} from '#/lib/classeur/merge/merge.ts'

// ---------------------------------------------------------------------------
// Portée
// ---------------------------------------------------------------------------

export type Portee =
  | { type: 'chapitre'; chapitre_uuid: string; chapitre_label: string }
  | {
      type: 'document'
      document_uuid: string
      document_title: string
      chapitre_label: string
    }

/** Fichier d'export limité : `_metadata` enrichi de la portée et des consignes. */
export interface ExportPortee extends ClasseurJson {
  _metadata: MetadataJson & { portee: Portee; instructions: string[] }
}

// ---------------------------------------------------------------------------
// Consignes pour un LLM
// ---------------------------------------------------------------------------

/** Conventions communes aux deux portées : ce que la page sait afficher. */
const CONSIGNES_COMMUNES: string[] = [
  "Ce fichier est un extrait d'un classeur réglementaire du Back Office de l'hôtel OKKO Nantes (page Classeur). Il sera RÉIMPORTÉ tel que tu le rends : ta réponse doit être le JSON complet et valide, dans un seul bloc, sans commentaire, sans « … » ni partie omise.",
  'Tu peux modifier : `title`, `description` et `content` des éléments, ainsi que `label` et `description` du chapitre. Tu peux corriger, reformuler, compléter, restructurer.',
  'Ne modifie JAMAIS : `format_version`, `_metadata`, le bloc `classeur`, `uid`, `uuid`, `kind`, `updated_at`, `periodicite_id`, `nombre`. Le `uuid` est la clé qui relie chaque élément à la base : le changer créerait un doublon au lieu de mettre à jour.',
  '`content` est du Markdown (GitHub). Conventions de la page : un retour à la ligne simple COLLE les lignes (il faut une ligne vide pour un nouveau paragraphe) ; `#`, `##`, `###` pour les titres ; `**gras**`, `*italique*`, `~~barré~~` ; listes `- ` ou `1. ` ; case à cocher `- [ ] ` ; encadré avec `> ` en début de ligne ; tableaux avec `|` et une ligne `| --- |` sous l’en-tête ; une ligne contenant seulement `===` fait un SAUT DE PAGE à l’impression.',
  "Les images s'écrivent `![nom](12/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.webp)` : ce sont des chemins vers des fichiers stockés, conserve ces lignes EXACTEMENT (tu peux les déplacer, pas les modifier ni en inventer).",
  "Pages imprimées en A4, en noir et blanc : pas de couleurs, pas de HTML, pas d'emoji ; phrases courtes et claires pour le personnel de la réception.",
]

function consignesChapitre(label: string): string[] {
  return [
    `PORTÉE : le chapitre « ${label} » et ses éléments. Seul ce chapitre sera modifié à la réimportation.`,
    ...CONSIGNES_COMMUNES,
    'Pour AJOUTER un document, ajoute un objet { "kind": "document", "title": …, "description": …, "content": …, "sort_order": … } SANS `uuid` : il sera créé. `sort_order` fixe l\'ordre d\'affichage dans le chapitre.',
    "Pour RETIRER un élément, supprime son objet du tableau `items` : il ne sera supprimé que si l'utilisateur coche l'option correspondante à la réimportation. En cas de doute, garde-le.",
  ]
}

function consignesDocument(titre: string, chapitre: string): string[] {
  return [
    `PORTÉE : le seul document « ${titre} » (chapitre « ${chapitre} »). Seul ce document sera modifié à la réimportation ; le bloc chapitre n'est là que pour le contexte et ne sera pas modifié.`,
    ...CONSIGNES_COMMUNES,
    "Le tableau `items` doit contenir exactement UN élément : ce document, avec son `uuid` inchangé. N'en ajoute pas, n'en retire pas.",
  ]
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

const CONTENU_VIDE: ChapterContent = {
  documents: [],
  tracking_sheets: [],
  signature_sheets: [],
  intercalaires: [],
}

/** Garde les seuls éléments du chapitre `chapterId`. */
function contenuDuChapitre(
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

/** Fichier v2 d'UN chapitre (ses éléments non supprimés), consignes comprises. */
export function construireExportChapitre(
  classeur: DbClasseur,
  chapitre: DbChapter,
  content: ChapterContent,
  periodicites: DbPeriodicite[],
  maintenant: Date = new Date(),
): ExportPortee {
  const base = construireExport(
    classeur,
    [chapitre],
    contenuDuChapitre(content, chapitre.id),
    periodicites,
    maintenant,
  )
  const metadata = base._metadata as MetadataJson
  return {
    ...base,
    _metadata: {
      ...metadata,
      description: `Chapitre « ${chapitre.label} » du classeur « ${classeur.name} », exporté depuis le Back Office (page Classeur), au format d'échange Registre.`,
      note: "Lis d'abord `instructions`. Ce bloc _metadata est informatif et ignoré lors de l'import.",
      portee: {
        type: 'chapitre',
        chapitre_uuid: chapitre.uuid,
        chapitre_label: chapitre.label,
      },
      instructions: consignesChapitre(chapitre.label),
    },
  }
}

/** Fichier v2 d'UN document, dans son chapitre (contexte), consignes comprises. */
export function construireExportDocument(
  classeur: DbClasseur,
  chapitre: DbChapter,
  document: DbDocument,
  periodicites: DbPeriodicite[],
  maintenant: Date = new Date(),
): ExportPortee {
  const base = construireExport(
    classeur,
    [chapitre],
    { ...CONTENU_VIDE, documents: [document] },
    periodicites,
    maintenant,
  )
  const metadata = base._metadata as MetadataJson
  return {
    ...base,
    _metadata: {
      ...metadata,
      description: `Document « ${document.title} » (chapitre « ${chapitre.label} », classeur « ${classeur.name} »), exporté depuis le Back Office (page Classeur), au format d'échange Registre.`,
      note: "Lis d'abord `instructions`. Ce bloc _metadata est informatif et ignoré lors de l'import.",
      portee: {
        type: 'document',
        document_uuid: document.uuid,
        document_title: document.title,
        chapitre_label: chapitre.label,
      },
      instructions: consignesDocument(document.title, chapitre.label),
    },
  }
}

// ---------------------------------------------------------------------------
// Lecture de la portée d'un fichier
// ---------------------------------------------------------------------------

/**
 * `_metadata.portee` du texte brut, si bien formée ; `null` sinon (fichier
 * d'un classeur complet, ou portée retirée par le LLM). `parseImportJson`
 * ne la retient pas : elle n'existe pas chez Registre.
 */
export function lirePortee(texte: string): Portee | null {
  let brut: unknown
  try {
    brut = JSON.parse(texte)
  } catch {
    return null
  }
  if (typeof brut !== 'object' || brut === null) return null
  const meta = (brut as { _metadata?: unknown })._metadata
  if (typeof meta !== 'object' || meta === null) return null
  const p = (meta as { portee?: unknown }).portee
  if (typeof p !== 'object' || p === null) return null
  const o = p as Record<string, unknown>
  const texteOu = (v: unknown) => (typeof v === 'string' ? v : '')
  if (o.type === 'chapitre' && typeof o.chapitre_uuid === 'string') {
    return {
      type: 'chapitre',
      chapitre_uuid: o.chapitre_uuid,
      chapitre_label: texteOu(o.chapitre_label),
    }
  }
  if (o.type === 'document' && typeof o.document_uuid === 'string') {
    return {
      type: 'document',
      document_uuid: o.document_uuid,
      document_title: texteOu(o.document_title),
      chapitre_label: texteOu(o.chapitre_label),
    }
  }
  return null
}

/**
 * Le JSON d'une réponse de LLM COLLÉE : les modèles l'entourent souvent de
 * ```json … ``` ou d'une phrase (« Voici le fichier : »). On garde du premier
 * `{` au dernier `}` ; un texte sans accolades est rendu tel quel (le parse
 * dira pourquoi il échoue).
 */
export function extraireJson(texte: string): string {
  const debut = texte.indexOf('{')
  const fin = texte.lastIndexOf('}')
  if (debut === -1 || fin <= debut) return texte.trim()
  return texte.slice(debut, fin + 1)
}

// ---------------------------------------------------------------------------
// Fusion limitée à la portée
// ---------------------------------------------------------------------------

/** Où l'on réimporte : le chapitre ou le document OUVERT dans la page. */
export type CiblePortee =
  | { type: 'chapitre'; chapitreId: number }
  | { type: 'document'; documentId: number }

export interface OptionsPortee {
  /** Chapitre seulement : supprimer (douce) les éléments absents du fichier. */
  supprimerAbsents: boolean
}

const cleItem = (kind: string, id: number) => `${kind}:${id}`

/**
 * Horodatage du fichier RETIRÉ : la base date la réimportation à `now()`.
 * En remplacement, la fusion recopie l'`updated_at` du fichier (E6) — un
 * document réimporté aurait repris sa date d'EXPORT, et un éditeur ouvert
 * avant la réimportation (sauvegarde conditionnée à cette date) aurait
 * écrasé le travail du LLM sans voir de conflit.
 */
function sansHorodatage(item: ItemJson): ItemJson {
  const { updated_at: _ignore, ...reste } = item
  return reste
}

/**
 * Plan d'un réimport limité à `cible`. Jette une `Error` au message destiné
 * à l'utilisateur si le fichier ne correspond pas à la cible (autre
 * chapitre, autre document, plusieurs chapitres…).
 */
export function planifierFusionPortee(
  local: EtatLocal,
  fichier: ClasseurJson,
  cible: CiblePortee,
  options: OptionsPortee,
): PlanFusion {
  if (fichier.chapters.length !== 1) {
    throw new Error(
      `Ce fichier contient ${fichier.chapters.length} chapitres : un export de chapitre ou de document n'en contient qu'un. Pour un classeur complet, utilisez l'import depuis l'accueil du classeur.`,
    )
  }
  return cible.type === 'chapitre'
    ? planChapitre(local, fichier, cible.chapitreId, options)
    : planDocument(local, fichier, cible.documentId)
}

function planChapitre(
  local: EtatLocal,
  fichier: ClasseurJson,
  chapitreId: number,
  options: OptionsPortee,
): PlanFusion {
  const chapitre = local.chapters.find(
    (c) => c.id === chapitreId && c.deleted_at === null,
  )
  if (chapitre === undefined)
    throw new Error('Chapitre introuvable ou supprimé.')
  const chJson = fichier.chapters[0]
  if (chJson.uuid !== undefined && chJson.uuid !== chapitre.uuid) {
    throw new Error(
      `Ce fichier concerne un autre chapitre (« ${chJson.label} »), pas « ${chapitre.label} ».`,
    )
  }
  // Le chapitre du fichier EST le chapitre ouvert (même sans uuid, fichier
  // v1 ou uuid retiré) ; sa position dans le classeur n'est pas à lui.
  const fichierCible: ClasseurJson = {
    ...fichier,
    chapters: [
      {
        ...chJson,
        uuid: chapitre.uuid,
        sort_order: chapitre.sort_order,
        items: chJson.items.map(sansHorodatage),
      },
    ],
  }
  const plan = planifierFusion(local, fichierCible, { replace: true })

  const items = indexItems(local.content)
  const actions: ActionFusion[] = []
  const supprimes: MergePreviewItem[] = []
  for (const a of plan.actions) {
    if (a.type === 'supprimerChapitre') continue
    if (a.type === 'supprimerItem') {
      const it = items.get(cleItem(a.kind, a.id))
      if (!options.supprimerAbsents || it?.data.chapter_id !== chapitre.id)
        continue
      supprimes.push({
        action: 'delete',
        kind: a.kind,
        title: it.data.title,
        chapter_label: chJson.label,
        icon: chJson.icon,
      })
    }
    actions.push(a)
  }
  return {
    actions,
    warnings: plan.warnings,
    resultat: { ...plan.resultat, deleted: supprimes.length },
    apercu: [...plan.apercu.filter((l) => l.action !== 'delete'), ...supprimes],
  }
}

function planDocument(
  local: EtatLocal,
  fichier: ClasseurJson,
  documentId: number,
): PlanFusion {
  const document = local.content.documents.find(
    (d) => d.id === documentId && d.deleted_at === null,
  )
  if (document === undefined)
    throw new Error('Document introuvable ou supprimé.')
  const chapitre = local.chapters.find((c) => c.id === document.chapter_id)
  if (chapitre === undefined)
    throw new Error('Chapitre du document introuvable.')

  const docs = fichier.chapters[0].items.filter((i) => i.kind === 'document')
  if (docs.length !== 1 || fichier.chapters[0].items.length !== 1) {
    throw new Error(
      'Un export de document doit contenir exactement un document. Pour un chapitre entier, importez depuis la page du chapitre.',
    )
  }
  const docJson = docs[0]
  if (docJson.uuid !== document.uuid) {
    throw new Error(
      docJson.uuid === undefined
        ? "Le document du fichier n'a plus d'identifiant (uuid) : impossible de savoir qu'il s'agit de celui-ci."
        : `Ce fichier concerne un autre document (« ${docJson.title} »), pas « ${document.title} ».`,
    )
  }
  // Chapitre et position LOCAUX : seul le document peut changer.
  const fichierCible: ClasseurJson = {
    ...fichier,
    chapters: [
      {
        uid: 'document',
        uuid: chapitre.uuid,
        label: chapitre.label,
        icon: chapitre.icon,
        description: chapitre.description,
        sort_order: chapitre.sort_order,
        items: [
          { ...sansHorodatage(docJson), sort_order: document.sort_order },
        ],
      },
    ],
  }
  const plan = planifierFusion(local, fichierCible, { replace: true })
  const actions = plan.actions.filter(
    (a) =>
      (a.type === 'modifierItem' || a.type === 'restaurerItem') &&
      a.id === document.id &&
      a.item.kind === 'document',
  )
  const modifie = actions.length > 0
  return {
    actions,
    warnings: plan.warnings,
    resultat: {
      inserted: 0,
      updated: modifie ? 1 : 0,
      unchanged: modifie ? 0 : 1,
      skipped: 0,
      deleted: 0,
    },
    apercu: modifie
      ? [
          {
            action: 'update',
            kind: 'document',
            title: docJson.title,
            chapter_label: chapitre.label,
            icon: chapitre.icon,
          },
        ]
      : [],
  }
}

function indexItems(content: ChapterContent): Map<string, ChapterItem> {
  const m = new Map<string, ChapterItem>()
  for (const it of flattenItems(content))
    m.set(cleItem(it.kind, it.data.id), it)
  return m
}
