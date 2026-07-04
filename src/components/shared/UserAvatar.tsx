import { Avatar, AvatarFallback, AvatarImage } from '#/components/ui/avatar.tsx'
import { cn } from '#/lib/utils.ts'

// Identité codée en dur, en attendant un vrai profil utilisateur (auth).
export const USER_NAME = 'Pierre-Louis'
export const USER_INITIALS = 'PL'

/**
 * Avatar de l'utilisateur courant (fallback « PL »).
 *
 * - `className` : variantes de taille/anneau portées par l'Avatar (size-8, size-9…).
 * - `fallbackClassName` : variantes du fallback (ex. text-xs en petite taille).
 * - `withImage` : rend aussi un AvatarImage (vide pour l'instant), comme dans la Navbar.
 */
export function UserAvatar({
  className,
  fallbackClassName,
  withImage = false,
}: {
  className?: string
  fallbackClassName?: string
  withImage?: boolean
}) {
  return (
    <Avatar className={className}>
      {withImage && <AvatarImage src="" alt="Profil" />}
      <AvatarFallback
        className={cn('bg-primary/15 text-primary', fallbackClassName)}
      >
        {USER_INITIALS}
      </AvatarFallback>
    </Avatar>
  )
}
