/*
 * Libellés, icônes et formats de la page Classeur — portés de Registre
 * (`lib/navigation.ts`, `pages/chapter/types.ts`).
 */
import { icons, type LucideIcon } from 'lucide-react'

import type { DbClasseur } from '#/lib/classeur/types.ts'

/** Nom d'un classeur sans nom. */
export const DEFAULT_REGISTRY_NAME = 'Mon classeur'

/** Établissement imprimé en pied de page quand le classeur n'en a pas. */
export const DEFAULT_ESTABLISHMENT = 'Okko Hotels\nNantes Centre-ville'

/**
 * Bibliothèque complète des icônes Lucide, adressée par nom (`BookOpen`,
 * `Shield`…). Les noms sont stockés en base (`icon`) et dans les exports
 * JSON : ils doivent rester ceux de Lucide.
 */
export const iconMap = icons as Record<string, LucideIcon>

/** Entrées [nom, composant], calculées une fois (sélecteur d'icônes). */
export const iconEntries = Object.entries(iconMap) as [string, LucideIcon][]

/** Icône d'un nom Lucide, `FileText` si le nom est inconnu. */
export function getIcon(name: string): LucideIcon {
  return iconMap[name] ?? icons.FileText
}

/** Bloc établissement du pied de page : deux lignes au plus, vides retirées. */
export function buildEstablishment(
  classeur: Pick<DbClasseur, 'etablissement' | 'etablissement_complement'> | null | undefined,
): string {
  if (!classeur) return ''
  return [classeur.etablissement, classeur.etablissement_complement]
    .filter((l) => l.trim() !== '')
    .join('\n')
}

/** Date courte française (« 25 sept. 2026 »), la chaîne brute si invalide. */
export function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
