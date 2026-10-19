/*
 * Import d'un classeur COMPLET rendu par une IA (étape 5 du plan
 * `classeur-echange-ia-2026-10-19`, D1). Une COUCHE au-dessus de
 * `planifierFusion`, jamais une modification de ses règles : la restauration
 * d'un point (`restaurerInstantane`), l'import d'un fichier de Registre et
 * l'import comme nouveau classeur gardent EXACTEMENT leur plan.
 *
 * Trois règles, et rien d'autre :
 *   1. le fichier FAIT FOI pour ce qu'il contient, sans dépendre de
 *      `updated_at` : une IA recopie l'horodatage de l'export sans le mettre
 *      à jour, donc en fusion (R7, « le plus récent gagne ») toutes ses
 *      modifications passaient pour plus anciennes et étaient ignorées en
 *      silence. Horodatages RETIRÉS (`sansHorodatage`), puis remplacement
 *      (R8) ; la base date l'import à `now()` ;
 *   2. rien n'est supprimé, ni élément ni chapitre, sauf si la personne a
 *      coché « Supprimer ce qui n'est plus dans le fichier » : une IA tronque
 *      parfois sa réponse, une suppression ne doit jamais être implicite ;
 *   3. le fichier d'un chapitre ou d'un document est refusé (sa place est le
 *      bouton {} de sa page : ici, la case de suppression viderait le reste
 *      du classeur) ; le fichier d'un AUTRE classeur est accepté avec un
 *      avertissement (D10 : un classeur peut servir de modèle à un autre).
 *
 * Pur : ni React, ni Supabase.
 */

import type { DbClasseur } from '#/lib/classeur/types.ts'
import { planifierFusion } from '#/lib/classeur/merge/merge.ts'
import type { EtatLocal, PlanFusion } from '#/lib/classeur/merge/merge.ts'
import type { ClasseurJson, ItemJson } from '#/lib/classeur/merge/schema.ts'

export interface OptionsImportIa {
  /** Case « Supprimer ce qui n'est plus dans le fichier » (décochée par défaut). */
  supprimerAbsents: boolean
}

/**
 * Horodatage du fichier RETIRÉ : la base date l'import à `now()`. En
 * remplacement, la fusion recopie l'`updated_at` du fichier (E6) — un
 * élément importé aurait repris sa date d'EXPORT, et un éditeur ouvert avant
 * l'import (sauvegarde conditionnée à cette date) aurait écrasé le travail
 * de l'IA sans voir de conflit.
 */
export function sansHorodatage(item: ItemJson): ItemJson {
  const { updated_at: _ignore, ...reste } = item
  return reste
}

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
 * Plan d'un import « fichier rendu par une IA » : remplacement sans
 * horodatage, suppressions retirées tant que la case n'est pas cochée.
 *
 * Une suppression retirée laisse l'élément (ou le chapitre) tel quel : il
 * est compté `unchanged`, comme un refus dans l'aperçu (`filtrerPlan`).
 * Case cochée : le plan est celui du remplacement, suppressions comprises.
 */
export function planifierImportIa(
  local: EtatLocal,
  fichier: ClasseurJson,
  options: OptionsImportIa,
): PlanFusion {
  const plan = planifierFusion(local, fichierSansHorodatage(fichier), {
    replace: true,
  })
  if (options.supprimerAbsents) return plan
  const actions = plan.actions.filter(
    (a) => a.type !== 'supprimerItem' && a.type !== 'supprimerChapitre',
  )
  const retirees = plan.actions.length - actions.length
  if (retirees === 0) return plan
  return {
    actions,
    warnings: plan.warnings,
    resultat: {
      ...plan.resultat,
      deleted: plan.resultat.deleted - retirees,
      unchanged: plan.resultat.unchanged + retirees,
    },
    apercu: plan.apercu.filter((l) => l.action !== 'delete'),
  }
}

/**
 * Le fichier convient-il à l'import du classeur `classeur` ? Jette une
 * `Error` au message destiné à la personne si c'est l'export d'un chapitre ou
 * d'un document ; rend l'avertissement d'un fichier venu d'un autre classeur
 * (D10), ou rien. Un fichier sans portée (Registre, point de restauration,
 * portée retirée par l'IA) passe sans remarque.
 */
export function controlerPorteeClasseur(
  fichier: ClasseurJson,
  classeur: Pick<DbClasseur, 'uuid' | 'name'>,
): string[] {
  const portee = fichier._metadata?.portee
  if (portee === undefined) return []
  if (portee.type === 'chapitre') {
    throw new Error(
      `Ce fichier est l'export du chapitre ${portee.chapitre_label}. Importez-le depuis la page de ce chapitre, bouton {}.`,
    )
  }
  if (portee.type === 'document') {
    throw new Error(
      `Ce fichier est l'export du document ${portee.document_title}. Importez-le depuis la page de ce document, bouton {}.`,
    )
  }
  if (portee.classeur_uuid === classeur.uuid) return []
  const nom = portee.classeur_name.trim()
  return [
    nom === ''
      ? "Ce fichier vient d'un autre classeur. Relisez l'aperçu avant d'importer."
      : `Ce fichier vient du classeur ${nom}, pas de celui-ci. Relisez l'aperçu avant d'importer.`,
  ]
}
