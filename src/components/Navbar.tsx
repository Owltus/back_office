import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  ArrowLeftRight,
  Banknote,
  ChevronsUpDown,
  ClipboardList,
  Coffee,
  Menu,
  Monitor,
  SquareParking,
} from 'lucide-react'

import { Logo } from '#/components/Logo.tsx'
import { UserMenu } from '#/components/UserMenu.tsx'
import { UserAvatar } from '#/components/shared/UserAvatar.tsx'
import { useAuth } from '#/components/auth/AuthContext.tsx'
import { Button } from '#/components/ui/button.tsx'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '#/components/ui/sheet.tsx'

const NAV_ITEMS = [
  { to: '/repjour', label: 'RepJour', icon: ClipboardList },
  { to: '/pdj', label: 'PDJ', icon: Coffee },
  { to: '/parking', label: 'Parking', icon: SquareParking },
  { to: '/rapro', label: 'Rapprochement', icon: ArrowLeftRight },
  { to: '/caisse', label: 'Caisse', icon: Banknote },
  { to: '/affichage', label: 'Affichage', icon: Monitor },
] as const

export function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { profile, user } = useAuth()
  const userName = profile?.display_name || profile?.email || user?.email || ''

  // En passant en mode desktop (>= md), on ferme le tiroir s'il est ouvert.
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 768px)')
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) setMenuOpen(false)
    }
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur-md select-none print:hidden">
      <nav className="flex h-16 items-center gap-3 px-4">
        {/* --- Tiroir mobile (< md) : hamburger + Sheet --- */}
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="order-last ml-auto text-muted-foreground md:hidden"
              aria-label="Ouvrir le menu"
            >
              <Menu className="size-5" />
            </Button>
          </SheetTrigger>
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
              {NAV_ITEMS.map((item) => (
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

        {/* --- Logo / marque (nom affiché en mobile) --- */}
        <Link
          to="/repjour"
          className="flex items-center gap-2.5"
          aria-label="Accueil"
        >
          <Logo className="size-7" />
          <span className="text-lg font-bold tracking-tight md:hidden">
            Back Office
          </span>
        </Link>

        {/* --- Liens inline (>= md) --- */}
        <ul className="ml-2 hidden items-center gap-1 md:flex">
          {NAV_ITEMS.map((item) => (
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
        <div className="ml-auto hidden items-center gap-1 sm:gap-2 md:flex">
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
