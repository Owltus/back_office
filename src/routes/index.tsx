import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  // La page « Dashboard » (ComingSoon) est retirée pour l'instant. La racine
  // renvoie vers l'onglet RepJour, la page fonctionnelle par défaut.
  beforeLoad: () => {
    throw redirect({ to: '/repjour' })
  },
  component: () => null,
})
