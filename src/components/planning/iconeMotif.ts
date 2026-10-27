/*
 * Icône d'un jour d'absence, choisie d'après le motif (demande utilisateur
 * du 2026-10-27 : le calendrier barré pour tout « c'est pas ouf ») :
 * palmier pour les congés, tableau pour une formation, thermomètre pour un
 * arrêt maladie… Lue dans le code et le nom du motif ; un motif inconnu
 * garde le calendrier barré.
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

export function iconeMotif(m: { code: string; nom: string }): LucideIcon {
  const texte = `${m.nom} ${m.code}`
  return REGLES.find(([re]) => re.test(texte))?.[1] ?? CalendarOff
}
