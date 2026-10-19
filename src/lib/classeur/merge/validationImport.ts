/*
 * Validation d'un fichier AVANT toute écriture (étape 6 du plan
 * `classeur-echange-ia-2026-10-19`). L'import n'a pas de transaction : les
 * écritures partent une à une, et une seule refusée par la base (CHECK,
 * format d'uuid, clé étrangère) laissait un classeur À MOITIÉ importé. Tout
 * ce que la base refuserait est donc contrôlé ici, avant le plan et donc
 * avant le point de restauration, et devient un avertissement clair, une
 * valeur bornée ou un élément ignoré.
 *
 * Contrôles, un par règle de la base ou de l'interface :
 *   V1 `nombre` d'une feuille de signature : entier de 1 à 60 (CHECK en
 *      base). Hors borne ou non entier : ramené dans la borne.
 *   V2 `uuid` d'un élément ou d'un chapitre au format non UUID (erreur
 *      22P02, jamais réessayée) : retiré, l'élément est traité comme
 *      nouveau. Un uuid CONNU localement est gardé tel quel (il vient de la
 *      base : il ne repart jamais en écriture, l'élément est apparié).
 *   V3 `periodicite_id` d'une feuille de suivi introuvable dans le
 *      référentiel (même traduction que la fusion, E3) : retiré, donc
 *      périodicité actuelle gardée ou défaut « Non défini » à la création,
 *      avec un avertissement (la fusion l'appliquait souvent sans rien dire).
 *   V4 libellé `periodicite` de l'élément (D8) différent de celui de son id :
 *      avertissement, l'id fait foi.
 *   V5 création d'une feuille de suivi sans `periodicite_id` : avertissement
 *      (plus de défaut muet).
 *   V6 titre vide : élément ignoré. S'il désigne un élément existant (par son
 *      uuid), celui-ci reste tel quel, et n'est jamais supprimé par la case
 *      « supprimer ce qui n'est plus dans le fichier » (`proteges`). Un
 *      élément DÉJÀ sans titre en base passe tel quel (E8).
 *   V7 `_metadata.periodicites` retouché (E3 apparie les périodicités par ce
 *      bloc) : quand il vient de cette base (au moins une entrée identique au
 *      référentiel) mais qu'une entrée a changé, il est remplacé par le
 *      référentiel de l'application, avec un avertissement. Un fichier d'une
 *      autre base (Registre : ids différents) n'est pas touché.
 *   V8 `sort_order` hors des entiers de la base (int4) : ramené dans la borne.
 *
 * Un fichier valide est rendu TEL QUEL (même objet), sans avertissement :
 * le plan d'un fichier valide est exactement celui d'avant cette étape.
 *
 * Pur : ni React, ni Supabase.
 */

import { slugify } from '#/lib/classeur/slug.ts'
import type { DbPeriodicite, ItemKind } from '#/lib/classeur/types.ts'
import { flattenItems } from '#/lib/classeur/types.ts'
import {
  periodiciteParDefaut,
  resoudrePeriodicite,
} from '#/lib/classeur/merge/merge.ts'
import type { EtatLocal, PlanFusion } from '#/lib/classeur/merge/merge.ts'
import { filtrerPlan } from '#/lib/classeur/merge/portee.ts'
import { DEFAUTS } from '#/lib/classeur/merge/schema.ts'
import type {
  ChapterJson,
  ClasseurJson,
  ItemJson,
} from '#/lib/classeur/merge/schema.ts'

/** Bornes de `nombre` (CHECK `nombre BETWEEN 1 AND 60` en base). */
export const NOMBRE_MIN = 1
export const NOMBRE_MAX = 60

/** Bornes d'un entier Postgres (`integer`). */
const INT4_MIN = -2_147_483_648
const INT4_MAX = 2_147_483_647

/** Forme canonique d'un UUID, la seule que la base accepte à coup sûr. */
const RE_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function estUuid(s: string): boolean {
  return RE_UUID.test(s)
}

export interface ResultatValidation {
  /** Le fichier corrigé ; le MÊME objet si rien n'était à corriger. */
  fichier: ClasseurJson
  avertissements: string[]
  /** Uuids d'éléments locaux ignorés (V6) : à ne jamais supprimer. */
  proteges: ReadonlySet<string>
}

const NATURES: Record<ItemKind, string> = {
  document: 'Document',
  tracking_sheet: 'Feuille de suivi',
  signature_sheet: 'Feuille de signature',
  intercalaire: 'Intercalaire',
}

function nature(kind: string): string {
  return kind in NATURES ? NATURES[kind as ItemKind] : 'Élément'
}

function nombreFr(n: number): string {
  return String(n).replace('.', ',')
}

function lignes(n: number): string {
  return `${nombreFr(n)} ${Math.abs(n) > 1 ? 'lignes' : 'ligne'}`
}

/** V8 : un entier de la base. */
function positionBornee(n: number): number {
  return Math.min(INT4_MAX, Math.max(INT4_MIN, n))
}

/**
 * Contrôle `fichier` face à l'état `local` (référentiel des périodicités,
 * uuids et titres existants). Voir l'en-tête pour les règles V1 à V8.
 */
export function validerFichierImport(
  fichier: ClasseurJson,
  local: EtatLocal,
): ResultatValidation {
  const avertissements: string[] = []
  const proteges = new Set<string>()
  let modifie = false

  const locales = local.periodicites
  const itemsLocaux = flattenItems(local.content)
  const uuidsLocaux = new Set<string>([
    ...local.chapters.map((c) => c.uuid).filter(Boolean),
    ...itemsLocaux.map((it) => it.data.uuid).filter(Boolean),
  ])
  const parUuid = new Map(
    itemsLocaux
      .filter((it) => it.data.uuid)
      .map((it) => [`${it.kind}:${it.data.uuid}`, it]),
  )
  const suivisParTitre = new Set(
    local.content.tracking_sheets
      .filter((t) => t.deleted_at === null)
      .map((t) => t.title),
  )
  const libelleLocal = new Map((locales ?? []).map((p) => [p.id, p.label]))

  // V7 : le bloc des périodicités, avant les éléments (il sert à les lire).
  let reference = fichier
  const meta = fichier._metadata
  if (meta !== undefined && locales !== undefined && locales.length > 0) {
    const identique = (p: { id: number; label: string }) =>
      libelleLocal.has(p.id) &&
      slugify(libelleLocal.get(p.id) ?? '') === slugify(p.label)
    const changees = meta.periodicites.filter((p) => !identique(p))
    if (changees.length > 0 && changees.length < meta.periodicites.length) {
      modifie = true
      avertissements.push(
        `La liste des périodicités a été modifiée dans le fichier (${changees.map((p) => p.label).join(', ')}) : seule celle de l'application compte.`,
      )
      reference = {
        ...fichier,
        _metadata: {
          ...meta,
          periodicites: [...locales]
            .sort((a, b) => a.id - b.id)
            .map((p) => ({ id: p.id, label: p.label, nombre: p.nombre })),
        },
      }
    }
  }
  const defaut = periodiciteParDefaut(locales)
  const libelleDefaut =
    defaut === null ? null : (libelleLocal.get(defaut) ?? null)

  const chapters: ChapterJson[] = fichier.chapters.map((c) => {
    let ch = c
    // V2 (chapitre)
    if (c.uuid !== undefined && !uuidsLocaux.has(c.uuid) && !estUuid(c.uuid)) {
      const { uuid: _invalide, ...reste } = ch
      ch = reste
      avertissements.push(`Chapitre ${c.label} : identifiant invalide, retiré.`)
    }
    // V8 (chapitre)
    if (positionBornee(c.sort_order) !== c.sort_order) {
      ch = { ...ch, sort_order: positionBornee(c.sort_order) }
      avertissements.push(
        `Chapitre ${c.label} : position hors limites, corrigée.`,
      )
    }
    let itemsChanges = false
    const items = c.items.flatMap((item) => {
      const r = validerItem(item, c.label)
      if (r !== item) itemsChanges = true
      return r === null ? [] : [r]
    })
    if (ch === c && !itemsChanges) return c
    modifie = true
    return { ...ch, items }
  })

  if (!modifie) return { fichier, avertissements, proteges }
  return {
    fichier: { ...reference, chapters },
    avertissements,
    proteges,
  }

  function validerItem(item: ItemJson, chapitre: string): ItemJson | null {
    const titre = item.title.trim()
    // V6
    if (titre === '') {
      const existant =
        item.uuid === undefined
          ? undefined
          : parUuid.get(`${item.kind}:${item.uuid}`)
      // Déjà sans titre en base : rien n'a été vidé, l'élément passe tel
      // quel (un export reste un point fixe du remplacement, E8).
      if (existant !== undefined && existant.data.title.trim() === '')
        return item
      if (existant !== undefined && existant.data.deleted_at === null) {
        proteges.add(existant.data.uuid)
        avertissements.push(
          `${nature(item.kind)} ${existant.data.title} : titre vide dans le fichier, élément laissé tel quel.`,
        )
      } else {
        avertissements.push(
          `Chapitre ${chapitre} : un élément sans titre a été ignoré.`,
        )
      }
      return null
    }
    let it = item
    const nom = `${nature(item.kind)} ${item.title}`
    // V2 (élément)
    if (
      item.uuid !== undefined &&
      !uuidsLocaux.has(item.uuid) &&
      !estUuid(item.uuid)
    ) {
      const { uuid: _invalide, ...reste } = it
      it = reste
      avertissements.push(`${nom} : identifiant invalide, retiré.`)
    }
    // V8 (élément)
    if (positionBornee(item.sort_order) !== item.sort_order) {
      it = { ...it, sort_order: positionBornee(item.sort_order) }
      avertissements.push(`${nom} : position hors limites, corrigée.`)
    }
    // V1
    if (
      item.kind === 'signature_sheet' &&
      item.nombre !== undefined &&
      item.nombre !== null
    ) {
      const n = item.nombre
      const borne = Number.isFinite(n)
        ? Math.min(NOMBRE_MAX, Math.max(NOMBRE_MIN, Math.round(n)))
        : DEFAUTS.signature_sheet.nombre
      if (borne !== n) {
        it = { ...it, nombre: borne }
        avertissements.push(
          !Number.isFinite(n)
            ? `${nom} : nombre de lignes illisible, ${lignes(borne)}.`
            : n > NOMBRE_MAX
              ? `${nom} : ${lignes(n)} demandées, ${String(NOMBRE_MAX)} au plus.`
              : n < NOMBRE_MIN
                ? `${nom} : ${lignes(n)} demandée${Math.abs(n) > 1 ? 's' : ''}, ${String(NOMBRE_MIN)} au moins.`
                : `${nom} : ${lignes(n)}, arrondi à ${String(borne)}.`,
        )
      }
    }
    // V3, V4, V5 (référentiel connu et non vide seulement : sinon la fusion
    // décide seule, comme avant).
    if (
      item.kind === 'tracking_sheet' &&
      locales !== undefined &&
      locales.length > 0
    ) {
      const id = item.periodicite_id
      const existe =
        (item.uuid !== undefined &&
          parUuid.has(`tracking_sheet:${item.uuid}`)) ||
        suivisParTitre.has(item.title)
      if (id === undefined || id === null) {
        if (!existe)
          avertissements.push(
            `${nom} : aucune périodicité donnée, ${libelleDefaut ?? 'la première'} appliquée.`,
          )
      } else {
        const r = resoudrePeriodicite(id, reference, locales)
        if (r.id === null) {
          it = { ...it, periodicite_id: null }
          const quoi =
            r.libelle !== null
              ? `périodicité ${r.libelle} inconnue`
              : `périodicité n° ${String(id)} inconnue`
          avertissements.push(
            existe
              ? `${nom} : ${quoi}, la périodicité actuelle est gardée.`
              : `${nom} : ${quoi}, ${libelleDefaut ?? 'la première'} appliquée.`,
          )
        } else {
          const rappel = item.periodicite?.trim() ?? ''
          const vraie = libelleLocal.get(r.id) ?? ''
          if (rappel !== '' && slugify(rappel) !== slugify(vraie)) {
            avertissements.push(
              `${nom} : le fichier dit ${rappel}, mais la périodicité choisie est ${vraie}. ${vraie} est gardée.`,
            )
          }
        }
      }
    }
    return it
  }
}

/**
 * Le plan d'un import, précédé de la validation : `planifier` reçoit le
 * fichier CORRIGÉ ; les avertissements passent en tête du plan ; un élément
 * protégé (V6) n'est jamais supprimé (même filtre qu'un refus de l'aperçu).
 * Fichier valide : `planifier(fichier)` tel quel.
 */
export function planAvecValidation(
  local: EtatLocal,
  fichier: ClasseurJson,
  planifier: (fichier: ClasseurJson) => PlanFusion,
): PlanFusion {
  const v = validerFichierImport(fichier, local)
  const plan = planifier(v.fichier)
  if (v.avertissements.length === 0 && v.proteges.size === 0) return plan
  // Seules les SUPPRESSIONS d'un élément protégé sont retirées (sa clé
  // `kind:id` est celle de `clesActions` pour une suppression).
  const proteges = new Set(
    flattenItems(local.content)
      .filter((it) => v.proteges.has(it.data.uuid))
      .map((it) => `${it.kind}:${String(it.data.id)}`),
  )
  const cles = new Set(
    plan.actions.flatMap((a) =>
      a.type === 'supprimerItem' && proteges.has(`${a.kind}:${String(a.id)}`)
        ? [`${a.kind}:${String(a.id)}`]
        : [],
    ),
  )
  const filtre = cles.size === 0 ? plan : filtrerPlan(plan, cles).plan
  return {
    ...filtre,
    warnings: [...v.avertissements, ...filtre.warnings],
  }
}

/**
 * Validation d'un fichier importé comme NOUVEAU classeur (liste des
 * classeurs) : face à un état vide, avec le référentiel des périodicités.
 * L'appelant passe `fichier` corrigé à `importerCommeNouveauClasseur`.
 */
export function validerPourNouveauClasseur(
  fichier: ClasseurJson,
  periodicites: DbPeriodicite[],
): ResultatValidation {
  return validerFichierImport(fichier, {
    chapters: [],
    content: {
      documents: [],
      tracking_sheets: [],
      signature_sheets: [],
      intercalaires: [],
    },
    periodicites,
  })
}
