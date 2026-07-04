import { Avatar, AvatarFallback, AvatarImage } from '#/components/ui/avatar.tsx'
import { cn } from '#/lib/utils.ts'

/** Dérive des initiales (1 à 2 lettres) à partir d'un nom d'affichage. */
export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * Avatar de l'utilisateur courant.
 *
 * - `name` : nom d'affichage réel (sert à dériver les initiales du fallback).
 * - `className` : variantes de taille/anneau portées par l'Avatar (size-8, size-9…).
 * - `fallbackClassName` : variantes du fallback (ex. text-xs en petite taille).
 * - `withImage` : rend aussi un AvatarImage (vide pour l'instant, pas de photo de profil).
 */
export function UserAvatar({
  name,
  className,
  fallbackClassName,
  withImage = false,
}: {
  name?: string
  className?: string
  fallbackClassName?: string
  withImage?: boolean
}) {
  const initials = name ? initialsFromName(name) : '?'
  return (
    <Avatar className={className}>
      {withImage && <AvatarImage src="" alt="Profil" />}
      <AvatarFallback
        className={cn('bg-primary/15 text-primary', fallbackClassName)}
      >
        {initials}
      </AvatarFallback>
    </Avatar>
  )
}
