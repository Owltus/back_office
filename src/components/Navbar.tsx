import { useEffect, useState, useSyncExternalStore } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { ChevronsUpDown, Menu } from 'lucide-react'

import { Logo } from '#/components/Logo.tsx'
import { UserMenu } from '#/components/UserMenu.tsx'
import { UserAvatar } from '#/components/shared/UserAvatar.tsx'
import { useAuth } from '#/components/auth/AuthContext.tsx'
import { PAGES } from '#/lib/permissions/index.ts'
import {
  getNavbarBadge,
  getNavbarSubtitle,
  subscribeNavbarBadge,
  subscribeNavbarSubtitle,
} from '#/lib/navbarSubtitle.ts'
import { Button } from '#/components/ui/button.tsx'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '#/components/ui/sheet.tsx'

export function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { profile, user, can } = useAuth()
  const userName = profile?.display_name || profile?.email || user?.email || ''
  // Une seule liste, dérivée des droits par page : l'utilisateur ne voit QUE les
  // pages auxquelles on lui a donné au moins la Lecture (un admin les voit toutes).
  const navItems = PAGES.filter((p) => can(p.key, 'lecture')).map((p) => ({
    to: p.route,
    label: p.label,
    icon: p.icon,
  }))

  // Nom de la page courante (en mobile, remplace la marque « Back Office » à côté
  // du logo — cf. plus bas) : en desktop, l'onglet actif dans les liens inline
  // suffit déjà à le dire, mais en mobile les onglets sont cachés dans le tiroir,
  // donc rien ne l'indiquait. `startsWith` couvre les sous-pages (ex. l'analytique
  // d'une page, `/rapro/analytique`). Une route hors PAGES (accueil, profil,
  // gestion, comptes…) n'a pas de nom de page : la marque reste affichée.
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const currentPage = PAGES.find(
    (p) => pathname === p.route || pathname.startsWith(`${p.route}/`),
  )

  // Sous-titre posé par la page courante (ex. le jour affiché sur Rapprochement),
  // affiché sous son nom — cf. lib/navbarSubtitle.ts. `null` par défaut (getServerSnapshot) :
  // rendu serveur identique au premier rendu client, avant qu'un board n'ait eu la
  // chance de poser le sien (évite un flash/mismatch d'hydratation).
  const subtitle = useSyncExternalStore(
    subscribeNavbarSubtitle,
    getNavbarSubtitle,
    () => null,
  )
  // Badge posé par la page courante (ex. le cadenas clôturé/ouvert de
  // Rapprochement), affiché juste à côté du hamburger — cf. lib/navbarSubtitle.ts.
  const badge = useSyncExternalStore(subscribeNavbarBadge, getNavbarBadge, () => null)

  // En passant en mode desktop (>= lg), on ferme le tiroir s'il est ouvert.
  // Seuil relevé de md (768px) à lg (1024px, 2026-08-21) : à 768-1024px, les 9
  // onglets inline + l'avatar débordaient déjà du viewport (avatar coupé,
  // inatteignable) — le tiroir mobile gère cette plage bien plus proprement.
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 1024px)')
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) setMenuOpen(false)
    }
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur-md select-none print:hidden">
      <nav className="flex h-16 items-center gap-3 px-4">
        {/* --- Tiroir mobile (< lg) : badge de page (si posé) + hamburger + Sheet.
            Les deux partagent UN SEUL wrapper `order-last ml-auto` — c'est lui
            qui pousse le duo au bord droit, jamais un des deux enfants pris
            isolément (sinon le `ml-auto` du hamburger pousserait un vide ENTRE
            le badge et lui, au lieu de pousser les deux ensemble). Sans badge
            posé (la plupart des pages), le wrapper ne contient que le bouton :
            comportement identique à avant. */}
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <div className="order-last ml-auto flex items-center gap-2 lg:hidden">
            {badge}
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground"
                aria-label="Ouvrir le menu"
              >
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
          </div>
          <SheetContent
            side="left"
            showCloseButton={false}
            className="flex w-72 flex-col p-0 select-none"
          >
            <SheetHeader className="border-b border-border p-4">
              <SheetTitle className="flex items-center gap-2.5">
                <Logo className="size-6" />
                <span className="text-lg font-bold tracking-tight">
                  Back Office
                </span>
              </SheetTitle>
            </SheetHeader>
            <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
              {navItems.map((item) => (
                <SheetClose asChild key={item.to}>
                  <Link
                    to={item.to}
                    activeOptions={undefined}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
                    activeProps={{
                      className:
                        'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium bg-primary/10 text-primary transition-colors',
                    }}
                  >
                    <item.icon className="size-4 shrink-0" />
                    {item.label}
                  </Link>
                </SheetClose>
              ))}
            </nav>

            {/* --- Compte (dans le tiroir en mode responsive) --- */}
            <div className="border-t border-border p-3">
              <UserMenu
                align="start"
                side="top"
                trigger={
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left outline-none transition-colors hover:bg-secondary/60 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <UserAvatar
                      withImage
                      name={userName}
                      className="size-9 ring-2 ring-border"
                    />
                    <div className="grid text-sm leading-tight">
                      <span className="truncate font-medium">
                        {userName || 'Utilisateur'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Compte
                      </span>
                    </div>
                    <ChevronsUpDown className="ml-auto size-4 shrink-0 text-muted-foreground" />
                  </button>
                }
              />
            </div>
          </SheetContent>
        </Sheet>

        {/* --- Logo / marque (nom + sous-titre affichés en mobile) --- */}
        <div className="flex items-center gap-2.5">
          {/* Logo home-link, toujours cliquable, jamais empilé (il reste petit
              et centré sur la hauteur des deux lignes de texte à côté). */}
          <Link to="/repjour" aria-label="Accueil" className="shrink-0">
            <Logo className="size-7" />
          </Link>
          <div className="flex min-w-0 flex-col justify-center lg:hidden">
            {/* Nom de page : lien « Accueil » séparé, PAS le même élément que
                le sous-titre en dessous. Le sous-titre (posé par une page, ex.
                le jour de Rapprochement) peut lui-même être tappable (voir
                DatePickerButton en trigger personnalisé) — il ne doit donc
                JAMAIS finir imbriqué dans un lien : un bouton dans un `<a>`
                est invalide, et le clic dessus déclenchait la navigation du
                lien au lieu d'ouvrir son propre popover. */}
            <Link
              to="/repjour"
              aria-label="Accueil"
              className="truncate text-lg leading-tight font-bold tracking-tight"
            >
              {currentPage?.label ?? 'Back Office'}
            </Link>
            {subtitle != null && (
              <div className="min-w-0 truncate text-xs leading-tight text-muted-foreground">
                {subtitle}
              </div>
            )}
          </div>
        </div>

        {/* --- Liens inline (>= md) --- */}
        <ul className="ml-2 hidden items-center gap-1 lg:flex">
          {navItems.map((item) => (
            <li key={item.to}>
              <Link
                to={item.to}
                activeOptions={undefined}
                className="rounded-lg px-3.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
                activeProps={{
                  className:
                    'rounded-lg px-3.5 py-1.5 text-sm font-medium bg-background text-foreground ring-1 ring-border shadow-sm transition-colors',
                }}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>

        {/* --- Compte : dans la top bar sur desktop uniquement --- */}
        <div className="ml-auto hidden items-center gap-1 sm:gap-2 lg:flex">
          <UserMenu
            trigger={
              <button
                type="button"
                aria-label="Menu du compte"
                className="rounded-full outline-none transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <UserAvatar
                  withImage
                  name={userName}
                  className="size-9 ring-2 ring-border"
                />
              </button>
            }
          />
        </div>
      </nav>
    </header>
  )
}
