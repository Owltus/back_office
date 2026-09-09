import type { LucideIcon } from 'lucide-react'
import {
  ArrowLeftRight,
  Banknote,
  BedDouble,
  ClipboardList,
  Coffee,
  Monitor,
  SquareParking,
  Stamp,
} from 'lucide-react'

// Clé stable d'une page de la navbar. Sert de clé de permission (côté base :
// user_page_permissions.page ; côté RLS : get_page_level('<key>')).
export type PageKey =
  | 'repjour'
  | 'pdj'
  | 'parking'
  | 'rapro'
  | 'caisse'
  | 'affichage'
  | 'facturation'
  | 'literie'

export interface PageDef {
  key: PageKey
  label: string
  route: string
  icon: LucideIcon
}

// Registre central des pages gouvernées par les droits par page — source unique
// des clés, libellés, routes et icônes.
//
// Depuis le 2026-09-09, l'ordre de ce tableau n'est plus qu'un REPLI : chaque
// compte peut avoir le sien (`profiles.page_order`), et c'est la tête de SON
// ordre qui fait office de page d'accueil. L'ordre ci-dessous s'applique donc
// aux comptes sans préférence, et complète une préférence partielle — voir
// `orderedPages` (lib/permissions/navigation.ts), qui est la seule autorité sur
// l'ordre affiché.
export const PAGES: PageDef[] = [
  { key: 'repjour', label: 'RepJour', route: '/repjour', icon: ClipboardList },
  { key: 'pdj', label: 'PDJ', route: '/pdj', icon: Coffee },
  { key: 'parking', label: 'Parking', route: '/parking', icon: SquareParking },
  { key: 'rapro', label: 'Rapprochement', route: '/rapro', icon: ArrowLeftRight },
  { key: 'caisse', label: 'Caisse', route: '/caisse', icon: Banknote },
  { key: 'affichage', label: 'Affichage', route: '/affichage', icon: Monitor },
  { key: 'facturation', label: 'Facturation', route: '/facturation', icon: Stamp },
  { key: 'literie', label: 'Literie', route: '/literie', icon: BedDouble },
]

export const PAGE_BY_KEY: Record<PageKey, PageDef> = Object.fromEntries(
  PAGES.map((p) => [p.key, p] as const),
) as Record<PageKey, PageDef>
