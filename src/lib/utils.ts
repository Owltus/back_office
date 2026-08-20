import type { ClassValue } from 'clsx'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v))

export const range = (start: number, end: number) =>
  Array.from({ length: end - start + 1 }, (_, i) => start + i)

/** Première lettre en capitale, le reste inchangé (ex. « juillet » → « Juillet »).
 * Idiome courant sur les libellés date-fns, qui sortent en minuscule. */
export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Casse d'un NOM PROPRE saisi par un humain (ex. « MARTIN » → « Martin »,
 * « JEAN-MICHEL » → « Jean-Michel », « jean michel » → « Jean Michel »).
 * Chaque segment de lettres est capitalisé indépendamment — les séparateurs
 * (espace, tiret, apostrophe…) ne sont jamais touchés, donc un tiret OU un
 * espace entre deux prénoms composés est géré pareil, sans conversion de l'un
 * vers l'autre.
 * SEUL le tout premier segment de la chaîne, s'il fait 2 ou 3 lettres, est
 * gardé EN MAJUSCULE (initiales en tête, ex. « JP Martin ») — jamais un
 * segment suivant : sinon, en tapant un second prénom lettre à lettre (ex.
 * « Jean-Michel »), ses 2-3 premières lettres flasheraient en majuscule
 * (« Jean-MIC ») avant de se corriger, ce qui est exactement l'effet à éviter.
 * Pensé pour un input CONTRÔLÉ (valeur retransformée à chaque frappe) : la
 * casse interdite ne peut donc jamais apparaître à l'écran, Verrou Maj/Shift
 * compris — la lettre s'affiche corrigée dès le rendu suivant. */
export function titleCaseName(s: string): string {
  return s.replace(/\p{L}+/gu, (word, offset: number) =>
    word.length <= 3 && offset === 0
      ? word.toUpperCase()
      : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
  )
}
