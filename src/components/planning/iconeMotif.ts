/*
 * Icône d'un jour d'absence (demande utilisateur du 2026-10-27 : le
 * calendrier barré pour tout « c'est pas ouf ») : palmier pour les congés,
 * tableau pour une formation, thermomètre pour un arrêt maladie…
 * L'icône CHOISIE sur le motif fait foi (`Motif.icone`, 2026-11-06) ; sans
 * choix, elle est devinée d'après le nom et le code ; un motif inconnu garde
 * le calendrier barré.
 */

import {
  BadgeCheck,
  CalendarOff,
  Flower2,
  GraduationCap,
  Moon,
  PartyPopper,
  Presentation,
  RotateCcw,
  Thermometer,
  TreePalm,
  Wallet,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/** Les icônes qu'un motif peut choisir (mêmes clés que le CHECK
 * `planning_motifs_icone_check`), dans l'ordre de l'écran. */
export const ICONES_MOTIF: ReadonlyArray<{
  cle: string
  libelle: string
  Icone: LucideIcon
}> = [
  { cle: 'conge', libelle: 'Congé', Icone: TreePalm },
  { cle: 'repos', libelle: 'Repos', Icone: Moon },
  { cle: 'ferie', libelle: 'Jour férié', Icone: PartyPopper },
  { cle: 'ecole', libelle: 'École', Icone: GraduationCap },
  { cle: 'formation', libelle: 'Formation', Icone: Presentation },
  { cle: 'maladie', libelle: 'Maladie', Icone: Thermometer },
  { cle: 'recuperation', libelle: 'Récupération', Icone: RotateCcw },
  { cle: 'autorise', libelle: 'Absence autorisée', Icone: BadgeCheck },
  { cle: 'argent', libelle: 'Sans solde', Icone: Wallet },
  { cle: 'deces', libelle: 'Deuil', Icone: Flower2 },
  { cle: 'absence', libelle: 'Absence', Icone: CalendarOff },
]

/** Repli : l'icône devinée d'après le nom et le code. */
const REGLES: ReadonlyArray<[RegExp, LucideIcon]> = [
  [/[ée]cole|cfa/i, GraduationCap],
  [/formation/i, Presentation],
  [/maladie|arr[eê]t|accident/i, Thermometer],
  [/f[ée]ri[ée]/i, PartyPopper],
  [/sans solde/i, Wallet],
  [/d[ée]c[eè]s/i, Flower2],
  [/r[ée]cup/i, RotateCcw],
  [/autoris[ée]e/i, BadgeCheck],
  [/repos/i, Moon],
  [/cong[ée]|vacances|cp\b/i, TreePalm],
]

export function iconeMotif(m: {
  code: string
  nom: string
  icone?: string | null
}): LucideIcon {
  const choisie = ICONES_MOTIF.find((i) => i.cle === m.icone)
  if (choisie) return choisie.Icone
  const texte = `${m.nom} ${m.code}`
  return REGLES.find(([re]) => re.test(texte))?.[1] ?? CalendarOff
}
