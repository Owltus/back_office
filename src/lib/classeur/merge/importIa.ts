/*
 * Import d'un fichier dans un classeur EXISTANT : un seul comportement, quel
 * que soit l'endroit d'où il part (accueil du classeur, page d'un chapitre ou
 * d'un document). Décision utilisateur du 2026-10-20 (« trop complexe pour
 * rien », plan `classeur-echange-ia-2026-10-19`, étape 9) : plus de choix de
 * provenance, plus de fusion « le plus récent gagne » à l'écran, plus de case
 * de suppression. Une COUCHE au-dessus de `planifierFusion`, jamais une
 * modification de ses règles : la restauration d'un point
 * (`restaurerInstantane`) et l'import comme nouveau classeur gardent
 * EXACTEMENT leur plan.
 *
 * Trois règles, et rien d'autre :
 *   1. le fichier FAIT FOI pour ce qu'il contient, sans dépendre de
 *      `updated_at` : une IA recopie l'horodatage de l'export sans le mettre
 *      à jour, donc en fusion (R7, « le plus récent gagne ») toutes ses
 *      modifications passaient pour plus anciennes et étaient ignorées en
 *      silence. Horodatages RETIRÉS (`sansHorodatage`), puis remplacement
 *      (R8) ; la base date l'import à `now()` ;
 *   2. ce qui est ABSENT du fichier est TOUJOURS gardé (une IA tronque
 *      parfois sa réponse). Un élément ou un chapitre n'est mis à la
 *      corbeille que si le fichier le demande : il y reste, marqué
 *      `"supprimer": true` (`planSuppressionsDemandees`) ;
 *   3. la PORTÉE est déduite du fichier (`destinationImport`), jamais
 *      demandée : un fichier de chapitre ou de document de ce classeur
 *      s'applique à ce chapitre ou à ce document, d'où qu'on l'importe ; un
 *      fichier sans portée (ancien export, autre poste) se traite comme un
 *      classeur complet ; un fichier d'un AUTRE classeur est accepté avec un
 *      avertissement (D10 : un classeur peut servir de modèle à un autre).
 *
 * Pur : ni React, ni Supabase.
 */

import type { DbClasseur } from '#/lib/classeur/types.ts'
import { planifierFusion } from '#/lib/classeur/merge/merge.ts'
import type { EtatLocal, PlanFusion } from '#/lib/classeur/merge/merge.ts'
import {
  planSuppressionsDemandees,
  planifierFusionPortee,
  sansHorodatage,
} from '#/lib/classeur/merge/portee.ts'
import type { CiblePortee } from '#/lib/classeur/merge/portee.ts'
import type { ClasseurJson } from '#/lib/classeur/merge/schema.ts'

export { sansHorodatage } from '#/lib/classeur/merge/portee.ts'

/** Le fichier, sans aucun horodatage d'élément. */
export function fichierSansHorodatage(fichier: ClasseurJson): ClasseurJson {
  return {
    ...fichier,
    chapters: fichier.chapters.map((c) => ({
      ...c,
      items: c.items.map(sansHorodatage),
    })),
  }
}

/**
 * Plan de l'import d'un classeur COMPLET : remplacement sans horodatage,
 * aucune suppression d'un absent, suppressions demandées par `"supprimer":
 * true` gardées. Une suppression retirée laisse l'élément (ou le chapitre)
 * tel quel : il est compté `unchanged`, comme un refus dans l'aperçu.
 */
export function planifierImportIa(
  local: EtatLocal,
  fichier: ClasseurJson,
): PlanFusion {
  return planSuppressionsDemandees(local, fichierSansHorodatage(fichier), (f) =>
    planifierFusion(local, f, { replace: true }),
  )
}

// ---------------------------------------------------------------------------
// Portée déduite du fichier
// ---------------------------------------------------------------------------

/** D'où l'on importe, ou ce à quoi le fichier s'applique. */
export type ContexteImport = { type: 'classeur' } | CiblePortee

export interface DestinationImport {
  /** Ce que l'import modifie. */
  cible: ContexteImport
  /**
   * Ligne d'information, posée quand la portée du fichier n'est pas celle
   * d'où l'on importe (« Ce fichier concerne le chapitre X. ») ; `null`
   * sinon.
   */
  note: string | null
  /** Anomalies à relire (autre classeur, chapitre introuvable). */
  avertissements: string[]
}

const RESTE_INTACT = 'Le reste du classeur ne change pas.'

function memeCible(a: ContexteImport, b: ContexteImport): boolean {
  if (a.type === 'chapitre' && b.type === 'chapitre')
    return a.chapitreId === b.chapitreId
  if (a.type === 'document' && b.type === 'document')
    return a.documentId === b.documentId
  return a.type === 'classeur' && b.type === 'classeur'
}

/**
 * À quoi s'applique `fichier`, importé depuis `contexte`. Jamais d'erreur :
 * ce que le fichier ne permet pas de situer se traite comme un classeur
 * complet, ce qui est sans danger puisque rien d'absent n'est supprimé.
 *
 *   - `_metadata.portee` de type classeur : le classeur (avertissement s'il
 *     vient d'un autre, D10) ;
 *   - un seul chapitre dans le fichier, contenant un seul document dont
 *     l'uuid est celui d'un document de ce classeur, et le fichier se dit
 *     d'un document (ou, sans portée, on importe depuis CE document) : ce
 *     document ;
 *   - un seul chapitre dont l'uuid est celui d'un chapitre de ce classeur
 *     (ou, sans uuid ni portée, importé depuis la page d'un chapitre : ce
 *     chapitre) : ce chapitre ;
 *   - sinon le classeur ; un fichier qui se dit d'un chapitre ou d'un
 *     document introuvable ici est signalé.
 */
export function destinationImport(
  local: EtatLocal,
  fichier: ClasseurJson,
  classeur: Pick<DbClasseur, 'uuid' | 'name'>,
  contexte: ContexteImport,
): DestinationImport {
  const portee = fichier._metadata?.portee
  const avertissements: string[] = []
  const conclure = (
    cible: ContexteImport,
    quoi: string,
  ): DestinationImport => ({
    cible,
    note: memeCible(cible, contexte)
      ? null
      : cible.type === 'classeur'
        ? `Ce fichier concerne ${quoi}.`
        : `Ce fichier concerne ${quoi}. ${RESTE_INTACT}`,
    avertissements,
  })

  if (portee?.type === 'classeur') {
    if (portee.classeur_uuid !== classeur.uuid) {
      const nom = portee.classeur_name.trim()
      avertissements.push(
        nom === ''
          ? "Ce fichier vient d'un autre classeur. Relisez l'aperçu avant d'importer."
          : `Ce fichier vient du classeur ${nom}, pas de celui-ci. Relisez l'aperçu avant d'importer.`,
      )
    }
    return conclure({ type: 'classeur' }, 'tout le classeur')
  }

  const seul = fichier.chapters.length === 1 ? fichier.chapters[0] : undefined
  if (seul !== undefined) {
    // Un document seul.
    const docJson =
      seul.items.length === 1 && seul.items[0].kind === 'document'
        ? seul.items[0]
        : undefined
    const document =
      docJson?.uuid === undefined
        ? undefined
        : local.content.documents.find(
            (d) => d.uuid === docJson.uuid && d.deleted_at === null,
          )
    if (
      document !== undefined &&
      (portee?.type === 'document' ||
        (portee === undefined &&
          contexte.type === 'document' &&
          contexte.documentId === document.id))
    )
      return conclure(
        { type: 'document', documentId: document.id },
        `le document ${document.title}`,
      )

    // Un chapitre (uuid du chapitre, sinon celui de la portée).
    const uuidChapitre =
      seul.uuid ??
      (portee?.type === 'chapitre' ? portee.chapitre_uuid : undefined)
    const chapitre =
      uuidChapitre === undefined
        ? portee === undefined && contexte.type === 'chapitre'
          ? local.chapters.find(
              (c) => c.id === contexte.chapitreId && c.deleted_at === null,
            )
          : undefined
        : local.chapters.find(
            (c) => c.uuid === uuidChapitre && c.deleted_at === null,
          )
    if (chapitre !== undefined)
      return conclure(
        { type: 'chapitre', chapitreId: chapitre.id },
        `le chapitre ${chapitre.label}`,
      )
  }

  if (portee?.type === 'document')
    avertissements.push(
      `Le document ${portee.document_title} n'est pas dans ce classeur. Relisez l'aperçu avant d'importer.`,
    )
  else if (portee?.type === 'chapitre')
    avertissements.push(
      `Le chapitre ${portee.chapitre_label} n'est pas dans ce classeur. Relisez l'aperçu avant d'importer.`,
    )
  return conclure(
    { type: 'classeur' },
    seul === undefined ? 'tout le classeur' : `le chapitre ${seul.label}`,
  )
}

function pluriel(n: number, singulier: string, plurielForme: string): string {
  return `${String(n)} ${n > 1 ? plurielForme : singulier}`
}

/**
 * Texte court sous l'aperçu d'un import : « 3 ajouts, 2 modifications,
 * 12 inchangés, 1 mis à la corbeille ». Les mots de l'écran, pas ceux du
 * moteur (`resumerPlan` parle de fusion et de suppressions).
 */
export function resumerImport(plan: PlanFusion): string {
  const r = plan.resultat
  if (r.inserted + r.updated + r.unchanged + r.skipped + r.deleted === 0)
    return 'Rien à importer'
  const parts = [
    pluriel(r.inserted, 'ajout', 'ajouts'),
    pluriel(r.updated, 'modification', 'modifications'),
    pluriel(r.unchanged, 'inchangé', 'inchangés'),
  ]
  if (r.deleted > 0) parts.push(`${String(r.deleted)} mis à la corbeille`)
  if (r.skipped > 0) parts.push(pluriel(r.skipped, 'ignoré', 'ignorés'))
  return parts.join(', ')
}

/** Plan d'un fichier déjà validé, appliqué à sa destination. */
export function planifierVers(
  local: EtatLocal,
  fichier: ClasseurJson,
  cible: ContexteImport,
): PlanFusion {
  return cible.type === 'classeur'
    ? planifierImportIa(local, fichier)
    : planifierFusionPortee(local, fichier, cible)
}
