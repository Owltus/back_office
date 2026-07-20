import type { LucideIcon } from 'lucide-react'
import {
  ArrowLeftRight,
  Banknote,
  ClipboardList,
  Coffee,
  Monitor,
  Palette,
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
  | 'artefact'

export interface PageDef {
  key: PageKey
  label: string
  route: string
  icon: LucideIcon
}

// Registre central des pages gouvernées par les droits par page — source unique
// de vérité (remplace NAV_ITEMS/ADMIN_ITEMS dans la Navbar à l'étape 5). L'ordre
// définit l'ordre d'affichage ET la page d'accueil par défaut (première accordée).
export const PAGES: PageDef[] = [
  { key: 'repjour', label: 'RepJour', route: '/repjour', icon: ClipboardList },
  { key: 'pdj', label: 'PDJ', route: '/pdj', icon: Coffee },
  { key: 'parking', label: 'Parking', route: '/parking', icon: SquareParking },
  { key: 'rapro', label: 'Rapprochement', route: '/rapro', icon: ArrowLeftRight },
  { key: 'caisse', label: 'Caisse', route: '/caisse', icon: Banknote },
  { key: 'affichage', label: 'Affichage', route: '/affichage', icon: Monitor },
  { key: 'facturation', label: 'Facturation', route: '/facturation', icon: Stamp },
  { key: 'artefact', label: 'Artefact', route: '/artefact', icon: Palette },
]

export const PAGE_BY_KEY: Record<PageKey, PageDef> = Object.fromEntries(
  PAGES.map((p) => [p.key, p] as const),
) as Record<PageKey, PageDef>
