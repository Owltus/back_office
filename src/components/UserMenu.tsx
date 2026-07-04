import type { ComponentProps, ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { LogOut, Settings, User } from 'lucide-react'

import { useAuth } from '#/components/auth/AuthContext.tsx'
import { ROLE_LABELS } from '#/lib/repjour/roles.ts'
import { UserAvatar } from '#/components/shared/UserAvatar.tsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu.tsx'

type ContentProps = ComponentProps<typeof DropdownMenuContent>

export function UserMenu({
  trigger,
  align = 'end',
  side = 'bottom',
}: {
  trigger: ReactNode
  align?: ContentProps['align']
  side?: ContentProps['side']
}) {
  const { profile, user, role, signOut } = useAuth()
  const navigate = useNavigate()

  const name = profile?.display_name || profile?.email || user?.email || ''
  const subtitle = role ? ROLE_LABELS[role] : 'Compte'

  async function handleSignOut() {
    await signOut()
    // La garde globale renvoie déjà vers /login quand la session disparaît ;
    // on navigue explicitement pour une transition immédiate.
    navigate({ to: '/login', replace: true })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align={align} side={side} className="w-56">
        <DropdownMenuLabel className="flex items-center gap-2.5 py-2 font-normal">
          <UserAvatar name={name} className="size-8" fallbackClassName="text-xs" />
          <div className="grid text-sm leading-tight">
            <span className="truncate font-medium">{name || 'Utilisateur'}</span>
            <span className="truncate text-xs text-muted-foreground">
              {subtitle}
            </span>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem>
          <User />
          Profil
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Settings />
          Paramètres
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem variant="destructive" onSelect={() => handleSignOut()}>
          <LogOut />
          Déconnexion
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
