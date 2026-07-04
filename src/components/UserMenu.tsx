import type { ComponentProps, ReactNode } from 'react'
import { LogOut, Settings, User } from 'lucide-react'

import { USER_NAME, UserAvatar } from '#/components/shared/UserAvatar.tsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu.tsx'
import { supabase } from '#/lib/supabase.ts'

async function handleSignOut() {
  await supabase.auth.signOut()
  // TODO: une fois l'authentification en place, rediriger vers /login ici.
}

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
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align={align} side={side} className="w-56">
        <DropdownMenuLabel className="flex items-center gap-2.5 py-2 font-normal">
          <UserAvatar className="size-8" fallbackClassName="text-xs" />
          <div className="grid text-sm leading-tight">
            <span className="truncate font-medium">{USER_NAME}</span>
            <span className="truncate text-xs text-muted-foreground">Compte</span>
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
