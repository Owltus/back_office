import { createFileRoute, redirect } from '@tanstack/react-router'

import { homeTarget } from '#/lib/auth/homeTarget.ts'

export const Route = createFileRoute('/')({
  // La page « Dashboard » (ComingSoon) est retirée pour l'instant. La racine
  // renvoie vers la PAGE D'ACCUEIL DU COMPTE : la tête de son ordre de pages
  // (`profiles.page_order`), lue dans le cache local — `beforeLoad` est un hook
  // du routeur, exécuté hors de React, il n'a pas accès à `AuthContext`.
  //
  // Avant le 2026-09-09 la cible était `/repjour` en dur, ce qui infligeait un
  // double saut visible à tout compte n'y ayant pas droit : `/` → `/repjour` →
  // squelette → page réelle, via `PageGuard`. Le repli reste `/repjour` quand
  // le cache ne sait rien (premier chargement) : jamais pire qu'avant.
  beforeLoad: () => {
    throw redirect({ to: homeTarget() })
  },
  component: () => null,
})
