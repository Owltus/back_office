/*
 * TRANSFERT vers un autre classeur — plan PUR (étape 7a du plan
 * `plan/classeur-fonctions-2026-10-04/`). Rien n'est écrit ici : on calcule
 * ce que l'étape 7b exécutera.
 *
 * Décisions retenues (`D-decisions.md`) :
 *   D18  Copier, limité à un AUTRE classeur (jamais le même : ce serait le
 *        « Dupliquer » refusé).
 *   D10  A : déplacer = changer le chapitre (même ligne, même historique,
 *        même numéro de version).
 *   D8   l'historique suit le document déplacé (trigger
 *        `classeur_versions_suivent`, rien à faire ici).
 *   D6   Copier exige AUSSI l'écriture sur l'origine.
 *   D9   la réécriture d'une image ne change QUE son chemin.
 *
 * POURQUOI COPIER LES IMAGES. Une image appartient à son classeur (dossier
 * `<classeurId>/…`, contrainte chemin ↔ `classeur_id`, RLS par classeur) :
 * un document transféré qui garderait ses chemins afficherait « image
 * indisponible » à un lecteur du classeur d'arrivée sans accès à l'origine.
 * Chaque image UTILISÉE est donc copiée une fois (affichage + original),
 * reçoit une fiche à l'arrivée, et ses références sont réécrites.
 *
 * LECTURE DES CHEMINS — pourquoi pas `REF_IMAGE` / `remplacementImage` :
 *   - `remplacementImage` RETIRE le cadre (`cadre=…`) : il vise une AUTRE
 *     image. Ici c'est la même image, son cadre reste juste (D9).
 *   - le jeton `![…](…)` de `images.ts` exige une légende sans `]`. Or une
 *     légende tapée à la main ou écrite par un LLM peut en porter un
 *     (`![a \] b](…)`, `![a [b] c](…)`) : Markdown affiche l'image, le jeton
 *     ne la voit pas, et son chemin resterait vers l'origine. On repère donc
 *     la DESTINATION seule — `](chemin` ou une définition de référence
 *     `]: chemin` — et on ne touche à rien d'autre de la ligne.
 *   Pour une légende sans `]`, l'ensemble trouvé contient exactement celui de
 *   `imagesReferencees` (testé).
 *
 * Non copiées, jamais réécrites : `a-inserer` (`IMAGE_A_INSERER`), les URL
 * externes, les chemins d'un AUTRE classeur, et les chemins de l'origine
 * dont la fiche est absente ou supprimée (`introuvables` : déjà « image
 * indisponible » à l'origine, la copie échouerait ; l'interface le dit).
 */

import { capacites, niveauEffectif } from '#/lib/classeur/droits.ts'
import type {
  ClasseurPourDroits,
  NiveauClasseur,
  NiveauEffectif,
  NiveauPage,
} from '#/lib/classeur/droits.ts'
import {
  cheminImage,
  cheminOriginalImage,
  estCheminImage,
} from '#/lib/classeur/images.ts'
import type { ImageInput } from '#/lib/classeur/service.ts'
import type { ChapterItem, DbImage, ItemKind } from '#/lib/classeur/types.ts'

export type ModeTransfert = 'copier' | 'deplacer'

/**
 * Une DESTINATION d'image ou de lien vers le bucket : après `](` (espaces et
 * `<` tolérés) ou `]:` (définition de référence), un chemin
 * `<classeurId>/<uuid>.webp`, suivi d'un `>`, d'un blanc, d'une `)` ou de
 * la fin du texte (une définition en dernière ligne).
 * Groupe 1 = ce qui précède (gardé tel quel), groupe 2 = le chemin.
 */
const DESTINATION =
  /(\]\(\s*<?|\]:[ \t]*<?)([0-9]{1,12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp)(?=[>\s)]|$)/gi

/** Les chemins de bucket référencés (minuscules, sans doublon, ordre d'apparition). */
function destinations(markdown: string): string[] {
  const vus = new Set<string>()
  for (const m of markdown.matchAll(DESTINATION)) vus.add(m[2].toLowerCase())
  return [...vus]
}

/**
 * Les chemins `<origine>/…` utilisés par ces documents, sans doublon, dans
 * l'ordre d'apparition (en minuscules, comme `imagesReferencees`).
 */
export function imagesATransferer(
  documents: ReadonlyArray<{ content: string }>,
  origineId: number,
): string[] {
  const prefixe = `${String(origineId)}/`
  const vus = new Set<string>()
  for (const doc of documents) {
    for (const chemin of destinations(doc.content)) {
      if (chemin.startsWith(prefixe)) vus.add(chemin)
    }
  }
  return [...vus]
}

/**
 * Réécrit les chemins d'après `correspondances` (ancien chemin en
 * minuscules → nouveau). Seul le chemin change (D9) : légende, titre
 * (taille, `cadre=`, `entiere`), chevrons, blocs et reste de la ligne sont
 * gardés au caractère près. Idempotent tant qu'aucun nouveau chemin n'est
 * lui-même une clé (classeurs différents).
 */
export function reecrireChemins(
  markdown: string,
  correspondances: ReadonlyMap<string, string>,
): string {
  return markdown.replace(
    DESTINATION,
    (tout: string, avant: string, chemin: string) => {
      const nouveau = correspondances.get(chemin.toLowerCase())
      return nouveau === undefined ? tout : avant + nouveau
    },
  )
}

/** Ce qu'il faut savoir de l'utilisateur pour calculer ses droits par classeur. */
export interface DroitsUtilisateur {
  page: NiveauPage
  /** Exceptions d'accès de la personne, par identifiant de classeur. */
  exceptions: ReadonlyMap<number, NiveauClasseur>
  userId: string | null
}

/** Copier ou déplacer exige l'écriture des DEUX côtés (D6 pour la copie). */
export function peutTransferer(
  mode: ModeTransfert,
  niveauOrigine: NiveauEffectif,
  niveauArrivee: NiveauEffectif,
): boolean {
  // Même règle pour les deux modes : la base l'impose au déplacement
  // (USING sur l'origine, WITH CHECK sur l'arrivée) ; l'app l'impose à la
  // copie (D6), la base ne demandant que la lecture de l'origine.
  void mode
  return capacites(niveauOrigine).modifier && capacites(niveauArrivee).modifier
}

/**
 * Les classeurs où l'on peut transférer : non supprimés, de niveau effectif
 * écriture ou gestion, ordre d'entrée conservé.
 *
 * L'ORIGINE est exclue dans les deux modes :
 *   - copier : D18, jamais vers le même classeur ;
 *   - déplacer : un déplacement dans le même classeur a déjà ses voies
 *     (glisser-déposer, menu « Déplacer vers… » → `moveItems`), sans image à
 *     copier. L'offrir ici doublerait le parcours et mêlerait deux
 *     comportements dans un dialogue « vers un autre classeur ».
 */
export function classeursCibles<
  TClasseur extends ClasseurPourDroits & { id: number; deleted_at: string | null },
>(
  classeurs: readonly TClasseur[],
  droitsParClasseur: DroitsUtilisateur,
  origineId: number,
  mode: ModeTransfert,
): TClasseur[] {
  void mode
  return classeurs.filter((c) => {
    if (c.id === origineId || c.deleted_at !== null) return false
    const niveau = niveauEffectif(
      droitsParClasseur.page,
      c,
      droitsParClasseur.exceptions.get(c.id),
      droitsParClasseur.userId,
    )
    return capacites(niveau).modifier
  })
}

// ---------------------------------------------------------------------------
// Le plan ordonné
// ---------------------------------------------------------------------------

/** Champs écrits par la COPIE d'un élément : ni `id`, ni `uuid` (défaut en base). */
export type ChampsCopie =
  | {
      kind: 'document'
      champs: {
        title: string
        description: string
        content: string
        version_majeure: 1
        version_mineure: 0
      }
    }
  | {
      kind: 'tracking_sheet'
      champs: { title: string; periodicite_id: number }
    }
  | {
      kind: 'signature_sheet'
      champs: { title: string; description: string; nombre: number }
    }
  | { kind: 'intercalaire'; champs: { title: string; description: string } }

export type OperationTransfert =
  /** Point de restauration (`avantEcriture`) — toujours en tête. */
  | { type: 'point'; classeurId: number }
  /** Copie d'un fichier du bucket (jamais `upsert`). */
  | { type: 'copierFichier'; source: string; destination: string }
  /** Fiche de médiathèque à l'arrivée, après ses fichiers. */
  | {
      type: 'creerFiche'
      classeurId: number
      ficheOrigineId: number
      fiche: ImageInput
    }
  /** Copie d'un élément (version 1.0 pour un document). */
  | ({
      type: 'insererElement'
      elementOrigineId: number
      chapterId: number
      sortOrder: number
    } & ChampsCopie)
  /** Déplacement (D10 = A) : chapitre et ordre ; `content` si réécrit. */
  | {
      type: 'deplacerElement'
      kind: ItemKind
      id: number
      chapterId: number
      sortOrder: number
      content?: string
    }

export interface CorrespondanceImage {
  source: string
  destination: string
}

export interface PlanTransfert {
  operations: OperationTransfert[]
  /** Images copiées : ancien chemin → nouveau. */
  correspondances: CorrespondanceImage[]
  /** Chemins de l'origine utilisés mais sans fiche vivante : ni copiés ni réécrits. */
  introuvables: string[]
}

export interface DemandeTransfert {
  mode: ModeTransfert
  /** Éléments à transférer, dans l'ordre voulu à l'arrivée. */
  elements: readonly ChapterItem[]
  origine: number
  arrivee: number
  chapitreArrivee: number
  /** Premier `sort_order` libre du chapitre d'arrivée. */
  ordreSuivant: number
  /** Médiathèque de l'origine (fiches supprimées comprises, elles sont ignorées). */
  imagesOrigine: readonly DbImage[]
  /** Générateur d'uuid (injecté : `crypto.randomUUID` en production). */
  nouveauxUuids: () => string
}

function champsCopie(
  item: ChapterItem,
  table: ReadonlyMap<string, string>,
): ChampsCopie {
  switch (item.kind) {
    case 'document':
      return {
        kind: 'document',
        champs: {
          title: item.data.title,
          description: item.data.description,
          content: reecrireChemins(item.data.content, table),
          version_majeure: 1,
          version_mineure: 0,
        },
      }
    case 'tracking_sheet':
      return {
        kind: 'tracking_sheet',
        champs: {
          title: item.data.title,
          periodicite_id: item.data.periodicite_id,
        },
      }
    case 'signature_sheet':
      return {
        kind: 'signature_sheet',
        champs: {
          title: item.data.title,
          description: item.data.description,
          nombre: item.data.nombre,
        },
      }
    case 'intercalaire':
      return {
        kind: 'intercalaire',
        champs: {
          title: item.data.title,
          description: item.data.description,
        },
      }
  }
}

/**
 * La suite ordonnée des opérations d'un transfert :
 *   1. points de restauration de l'origine puis de l'arrivée (un seul si
 *      c'est le même classeur) ;
 *   2. pour chaque image utilisée : fichier d'affichage, original s'il
 *      existe, puis sa fiche ;
 *   3. les éléments : copie (insert, chemins réécrits, version 1.0, sans
 *      uuid) ou déplacement (chapitre et ordre ; contenu réécrit s'il change).
 * Lève une erreur sur une demande impossible (copie vers le même classeur,
 * élément supprimé, uuid généré invalide ou répété).
 */
export function planTransfert(demande: DemandeTransfert): PlanTransfert {
  const { mode, elements, origine, arrivee } = demande
  const memeClasseur = origine === arrivee
  if (mode === 'copier' && memeClasseur) {
    throw new Error('Une copie va toujours vers un autre classeur.')
  }
  if (elements.some((e) => e.data.deleted_at !== null)) {
    throw new Error('Un élément supprimé ne se transfère pas.')
  }

  const operations: OperationTransfert[] = [
    { type: 'point', classeurId: origine },
  ]
  if (!memeClasseur) operations.push({ type: 'point', classeurId: arrivee })

  // Dans le même classeur, les chemins restent valables : rien à copier.
  const utilisees = memeClasseur
    ? []
    : imagesATransferer(
        elements.flatMap((e) => (e.kind === 'document' ? [e.data] : [])),
        origine,
      )
  const fiches = new Map<string, DbImage>()
  for (const image of demande.imagesOrigine) {
    if (image.deleted_at === null) fiches.set(image.chemin.toLowerCase(), image)
  }

  const correspondances: CorrespondanceImage[] = []
  const introuvables: string[] = []
  const uuidsVus = new Set<string>()
  for (const chemin of utilisees) {
    const fiche = fiches.get(chemin)
    if (fiche === undefined) {
      introuvables.push(chemin)
      continue
    }
    const uuid = demande.nouveauxUuids().toLowerCase()
    const destination = cheminImage(arrivee, uuid)
    if (!estCheminImage(destination) || uuidsVus.has(uuid)) {
      throw new Error('Identifiant d’image généré invalide.')
    }
    uuidsVus.add(uuid)
    correspondances.push({ source: chemin, destination })
    operations.push({
      type: 'copierFichier',
      source: fiche.chemin,
      destination,
    })
    let original: string | null = null
    if (fiche.original_chemin !== null) {
      original = cheminOriginalImage(arrivee, uuid)
      operations.push({
        type: 'copierFichier',
        source: fiche.original_chemin,
        destination: original,
      })
    }
    operations.push({
      type: 'creerFiche',
      classeurId: arrivee,
      ficheOrigineId: fiche.id,
      fiche: {
        chemin: destination,
        nom: fiche.nom,
        taille: fiche.taille,
        largeur: fiche.largeur,
        hauteur: fiche.hauteur,
        original_chemin: original,
        original_largeur: fiche.original_largeur,
        original_hauteur: fiche.original_hauteur,
        original_taille: fiche.original_taille,
      },
    })
  }

  const table = new Map(correspondances.map((c) => [c.source, c.destination]))
  elements.forEach((item, i) => {
    const sortOrder = demande.ordreSuivant + i
    if (mode === 'copier') {
      operations.push({
        type: 'insererElement',
        elementOrigineId: item.data.id,
        chapterId: demande.chapitreArrivee,
        sortOrder,
        ...champsCopie(item, table),
      })
      return
    }
    const deplacement: Extract<
      OperationTransfert,
      { type: 'deplacerElement' }
    > = {
      type: 'deplacerElement',
      kind: item.kind,
      id: item.data.id,
      chapterId: demande.chapitreArrivee,
      sortOrder,
    }
    if (item.kind === 'document') {
      const content = reecrireChemins(item.data.content, table)
      if (content !== item.data.content) deplacement.content = content
    }
    operations.push(deplacement)
  })

  return { operations, correspondances, introuvables }
}
