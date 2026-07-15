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
