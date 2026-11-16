/*
 * Couleur de l'ICÔNE d'un classeur (demande utilisateur du 2026-11-16,
 * « purement esthétique ») : 14 teintes rangées dans l'ordre du cercle
 * chromatique (une ligne dans le dialogue), puis un gris ardoise. `violet` =
 * la couleur principale de l'app, l'apparence d'avant et le défaut. Colonne
 * `classeur_classeurs.couleur`, CHECK sur ces mêmes clés (migration
 * `20261116120000_classeur_visibilite`). Les classes sont écrites EN ENTIER
 * (Tailwind ne lit que des chaînes complètes).
 */

export const COULEURS_CLASSEUR = [
  'rouge',
  'orange',
  'jaune',
  'lime',
  'vert',
  'sarcelle',
  'cyan',
  'ciel',
  'bleu',
  'indigo',
  'violet',
  'fuchsia',
  'rose',
  'ardoise',
] as const

export type CouleurClasseur = (typeof COULEURS_CLASSEUR)[number]

export const COULEUR_PAR_DEFAUT: CouleurClasseur = 'violet'

export const NOM_COULEUR: Record<CouleurClasseur, string> = {
  rouge: 'Rouge',
  orange: 'Orange',
  jaune: 'Jaune',
  lime: 'Vert tendre',
  vert: 'Vert',
  sarcelle: 'Sarcelle',
  cyan: 'Cyan',
  ciel: 'Bleu ciel',
  bleu: 'Bleu',
  indigo: 'Indigo',
  violet: 'Violet',
  fuchsia: 'Fuchsia',
  rose: 'Rose',
  ardoise: 'Ardoise',
}

/** Fond teinté et trait de l'icône (pastille de la liste). */
export const CLASSES_ICONE: Record<CouleurClasseur, string> = {
  rouge: 'bg-red-500/15 text-red-600 dark:text-red-400',
  orange: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
  jaune: 'bg-amber-400/15 text-amber-600 dark:text-amber-300',
  lime: 'bg-lime-500/15 text-lime-700 dark:text-lime-400',
  vert: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  sarcelle: 'bg-teal-500/15 text-teal-600 dark:text-teal-400',
  cyan: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400',
  ciel: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
  bleu: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  indigo: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400',
  violet: 'bg-primary/10 text-primary',
  fuchsia: 'bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400',
  rose: 'bg-pink-500/15 text-pink-600 dark:text-pink-400',
  ardoise: 'bg-slate-400/15 text-slate-600 dark:text-slate-300',
}

/** Pastille pleine du sélecteur. */
export const CLASSES_PASTILLE: Record<CouleurClasseur, string> = {
  rouge: 'bg-red-500',
  orange: 'bg-orange-500',
  jaune: 'bg-amber-400',
  lime: 'bg-lime-500',
  vert: 'bg-emerald-500',
  sarcelle: 'bg-teal-500',
  cyan: 'bg-cyan-500',
  ciel: 'bg-sky-500',
  bleu: 'bg-blue-500',
  indigo: 'bg-indigo-500',
  violet: 'bg-primary',
  fuchsia: 'bg-fuchsia-500',
  rose: 'bg-pink-500',
  ardoise: 'bg-slate-400',
}

/** Une valeur lue (base, cache ancien) ramenée à une couleur connue. */
export function couleurDe(x: unknown): CouleurClasseur {
  return (COULEURS_CLASSEUR as readonly unknown[]).includes(x)
    ? (x as CouleurClasseur)
    : COULEUR_PAR_DEFAUT
}
