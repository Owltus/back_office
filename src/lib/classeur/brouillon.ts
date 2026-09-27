/*
 * Brouillon de secours d'un document en cours d'édition (amélioration n° 3
 * de `plan/classeur-editeur-ameliorations`) : le texte non sauvegardé est
 * recopié dans le `localStorage` du poste, pour être repris après un onglet
 * fermé, un plantage ou la déconnexion par inactivité.
 *
 * - Clé PAR COMPTE et par document : le poste de la réception est partagé,
 *   un brouillon n'est proposé qu'à celui qui l'a écrit.
 * - `base` = l'horodatage (`updated_at`) du document au début de
 *   l'édition : reprendre un brouillon garde la détection de conflit
 *   (amélioration n° 2) — si un collègue a sauvegardé entre-temps, la
 *   sauvegarde le signalera au lieu d'écraser.
 * - Périmé au bout de 7 jours, et toute lecture ou écriture est protégée :
 *   un stockage indisponible (navigation privée, quota) ne casse rien.
 *
 * Pas de donnée nominative par nature (procédures), mais le brouillon n'est
 * PAS dans le cache persisté de TanStack Query : il a sa propre clé, sa
 * propre durée, et disparaît à la sauvegarde ou à l'abandon.
 */

export interface Brouillon {
  titre: string
  description: string
  contenu: string
  /** `updated_at` du document au début de l'édition. */
  base: string
  /** Date de la dernière écriture du brouillon (ms). */
  enregistreLe: number
}

/** Le stockage utile (injectable pour les tests). */
export type Stockage = Pick<
  Storage,
  'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'
>

const PREFIXE = 'bo.classeur.brouillon.v1:'
export const DUREE_BROUILLON_MS = 7 * 24 * 60 * 60 * 1000

export function cleBrouillon(userId: string, documentId: number): string {
  return `${PREFIXE}${userId}:${String(documentId)}`
}

function estBrouillon(x: unknown): x is Brouillon {
  if (typeof x !== 'object' || x === null) return false
  const b = x as Record<string, unknown>
  return (
    typeof b.titre === 'string' &&
    typeof b.description === 'string' &&
    typeof b.contenu === 'string' &&
    typeof b.base === 'string' &&
    typeof b.enregistreLe === 'number' &&
    Number.isFinite(b.enregistreLe)
  )
}

/** Le stockage du navigateur, ou `null` s'il est inaccessible. */
export function stockageNavigateur(): Stockage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/** Brouillon valide et non périmé, sinon `null` (un périmé est effacé). */
export function lireBrouillon(
  stockage: Stockage | null,
  userId: string,
  documentId: number,
  maintenant: number,
): Brouillon | null {
  if (!stockage) return null
  const cle = cleBrouillon(userId, documentId)
  try {
    const brut = stockage.getItem(cle)
    if (brut === null) return null
    const b: unknown = JSON.parse(brut)
    if (!estBrouillon(b) || maintenant - b.enregistreLe > DUREE_BROUILLON_MS) {
      stockage.removeItem(cle)
      return null
    }
    return b
  } catch {
    return null
  }
}

export function ecrireBrouillon(
  stockage: Stockage | null,
  userId: string,
  documentId: number,
  brouillon: Brouillon,
): boolean {
  if (!stockage) return false
  try {
    stockage.setItem(
      cleBrouillon(userId, documentId),
      JSON.stringify(brouillon),
    )
    return true
  } catch {
    return false
  }
}

export function effacerBrouillon(
  stockage: Stockage | null,
  userId: string,
  documentId: number,
): void {
  try {
    stockage?.removeItem(cleBrouillon(userId, documentId))
  } catch {
    // Stockage indisponible : rien à effacer.
  }
}

/** Retire tous les brouillons périmés du poste (tous comptes confondus). */
export function purgerBrouillonsPerimes(
  stockage: Stockage | null,
  maintenant: number,
): void {
  if (!stockage) return
  try {
    const cles: string[] = []
    for (let i = 0; i < stockage.length; i++) {
      const cle = stockage.key(i)
      if (cle?.startsWith(PREFIXE)) cles.push(cle)
    }
    for (const cle of cles) {
      const brut = stockage.getItem(cle)
      let perime = true
      try {
        const b: unknown = brut === null ? null : JSON.parse(brut)
        perime =
          !estBrouillon(b) || maintenant - b.enregistreLe > DUREE_BROUILLON_MS
      } catch {
        perime = true
      }
      if (perime) stockage.removeItem(cle)
    }
  } catch {
    // Stockage indisponible.
  }
}

/** Le brouillon apporte-t-il quelque chose par rapport au document ? */
export function brouillonDiffere(
  b: Pick<Brouillon, 'titre' | 'description' | 'contenu'>,
  doc: { title: string; description: string; content: string },
): boolean {
  return (
    b.titre !== doc.title ||
    b.description !== doc.description ||
    b.contenu !== doc.content
  )
}
