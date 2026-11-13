/*
 * Ce qui a changé depuis la dernière impression (demande utilisateur du
 * 2026-11-13 : « imprimer ou télécharger tout ce qui a été modifié
 * récemment, pour mettre à jour rapidement mes archives PDF » ; choix :
 * depuis le dernier envoi).
 *
 * Pas de date : une EMPREINTE de ce qui s'imprime pour chaque élément
 * (titre, description, texte, réglage). Un `updated_at` bouge aussi quand
 * on réordonne un chapitre (le trigger d'estampillage le pose), ce qui
 * ferait réimprimer des pages identiques. Un élément est « à réimprimer »
 * quand son empreinte diffère de celle retenue à sa dernière impression,
 * ou quand il n'a jamais été imprimé.
 *
 * Retenu dans le `localStorage` du POSTE, par compte et par classeur (le
 * poste de la réception est partagé). Aucune donnée nominative : des clés
 * `kind:id` et des empreintes. Toute lecture ou écriture est protégée.
 */

import { cleRef } from '#/lib/classeur/ordre.ts'
import type { ChapterItem } from '#/lib/classeur/types.ts'
import type { Stockage } from '#/lib/classeur/brouillon.ts'

/** Empreinte retenue par élément (`kind:id` → empreinte). */
export type Empreintes = Readonly<Record<string, string>>

const PREFIXE = 'bo.classeur.imprime.v1:'

/** Événement émis à chaque écriture, pour rafraîchir les écrans ouverts. */
export const EVENEMENT_IMPRESSIONS = 'bo-classeur-impressions'

export function cleImpressions(userId: string, classeurId: number): string {
  return `${PREFIXE}${userId}:${String(classeurId)}`
}

/** FNV-1a 32 bits, en hexadécimal : court, stable, suffisant ici. */
function hacher(texte: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/** Empreinte de ce qui s'imprime pour un élément. */
export function empreinteElement(item: ChapterItem): string {
  const d = item.data
  const parts: string[] = [item.kind, d.title]
  switch (item.kind) {
    case 'document':
      parts.push(item.data.description, item.data.content)
      break
    case 'tracking_sheet':
      parts.push(String(item.data.periodicite_id))
      break
    case 'signature_sheet':
      parts.push(item.data.description, String(item.data.nombre))
      break
    case 'intercalaire':
      parts.push(item.data.description)
      break
  }
  return hacher(parts.join('\u0000'))
}

/**
 * Les éléments à réimprimer, dans l'ordre reçu : non supprimés, jamais
 * imprimés ou changés depuis.
 */
export function elementsModifies(
  items: readonly ChapterItem[],
  empreintes: Empreintes,
): ChapterItem[] {
  return items.filter(
    (it) =>
      it.data.deleted_at === null &&
      empreintes[cleRef(it.kind, it.data.id)] !== empreinteElement(it),
  )
}

/** Les empreintes après l'impression de `items` (les autres sont gardées). */
export function marquerImprimes(
  empreintes: Empreintes,
  items: readonly ChapterItem[],
): Empreintes {
  const suite: Record<string, string> = { ...empreintes }
  for (const it of items) {
    if (it.data.deleted_at !== null) continue
    suite[cleRef(it.kind, it.data.id)] = empreinteElement(it)
  }
  return suite
}

/** Vrai si rien n'a jamais été imprimé pour ce classeur sur ce poste. */
export function jamaisImprime(empreintes: Empreintes): boolean {
  return Object.keys(empreintes).length === 0
}

export function lireEmpreintes(
  stockage: Stockage | null,
  userId: string,
  classeurId: number,
): Empreintes {
  if (!stockage) return {}
  try {
    const brut = stockage.getItem(cleImpressions(userId, classeurId))
    if (brut === null) return {}
    const x: unknown = JSON.parse(brut)
    if (typeof x !== 'object' || x === null || Array.isArray(x)) return {}
    const sortie: Record<string, string> = {}
    for (const [k, v] of Object.entries(x)) {
      if (typeof v === 'string') sortie[k] = v
    }
    return sortie
  } catch {
    return {}
  }
}

export function ecrireEmpreintes(
  stockage: Stockage | null,
  userId: string,
  classeurId: number,
  empreintes: Empreintes,
): void {
  if (!stockage) return
  try {
    stockage.setItem(
      cleImpressions(userId, classeurId),
      JSON.stringify(empreintes),
    )
  } catch {
    // Quota ou stockage refusé : rien n'est retenu, rien ne casse.
  }
}
