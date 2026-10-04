/*
 * ORACLE DE TEST — ne sert à aucun code applicatif.
 *
 * Copie CONFORME de `planifierFusionPortee` (et de ses aides privées) telle
 * qu'elle était AVANT l'ajout du refus d'un élément (étape 1 du plan
 * `classeur-fonctions-2026-10-04`, commit de départ 5a652cf). La propriété
 * (b) de `exclusion.property.test.ts` exige que, sans refus, la nouvelle
 * fonction rende EXACTEMENT ce plan. Ne jamais la « mettre à jour » : elle
 * perdrait sa valeur d'oracle.
 */

import type { ChapterContent, ChapterItem } from '#/lib/classeur/types.ts'
import { flattenItems } from '#/lib/classeur/types.ts'
import type { ClasseurJson, ItemJson } from '#/lib/classeur/merge/schema.ts'
import { planifierFusion } from '#/lib/classeur/merge/merge.ts'
import type {
  ActionFusion,
  EtatLocal,
  MergePreviewItem,
  PlanFusion,
} from '#/lib/classeur/merge/merge.ts'
import type { CiblePortee, OptionsPortee } from '#/lib/classeur/merge/portee.ts'

export function ancienPlanifierFusionPortee(
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
