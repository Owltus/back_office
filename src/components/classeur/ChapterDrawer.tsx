import { createContext, useContext, useMemo } from 'react'
import type { ReactNode } from 'react'
import { PanelLeft } from 'lucide-react'

import { Tip } from '#/components/shared/Tip.tsx'
import { Button } from '#/components/ui/button.tsx'

/*
 * Tiroir des chapitres sous `lg` (1024px, seuil hamburger de la Navbar).
 *
 * Le layout `/classeur/$classeurId` porte le `Sheet` ; les pages qu'il rend
 * (tableau de bord, chapitre, détails) posent le bouton d'ouverture dans le
 * `leading` de leur `PageHeader` — à la place de l'ancienne barre « Chapitres
 * | nom du classeur » sous la Navbar, qui n'existait sur aucune autre page.
 * Le nom du classeur, lui, passe par `useNavbarSubtitle` (comme le jour
 * affiché sur Rapprochement ou PDJ).
 *
 * Un contexte minimal : `open` (ouvre le tiroir) et `mobile` (le tiroir
 * existe, donc le bouton a un sens). Hors layout ou au-delà de `lg`, le
 * bouton ne rend rien — la colonne est alors visible en permanence.
 */
interface ChapterDrawer {
  open: () => void
  mobile: boolean
}

const ChapterDrawerContext = createContext<ChapterDrawer | null>(null)

export function ChapterDrawerProvider({
  open,
  mobile,
  children,
}: ChapterDrawer & { children: ReactNode }) {
  const value = useMemo(() => ({ open, mobile }), [open, mobile])
  return (
    <ChapterDrawerContext.Provider value={value}>
      {children}
    </ChapterDrawerContext.Provider>
  )
}

/**
 * Bouton d'ouverture du tiroir (`leading` d'un `PageHeader`). `null` quand
 * la colonne des chapitres est affichée en permanence (≥ `lg`).
 */
export function ChapterDrawerButton() {
  const ctx = useContext(ChapterDrawerContext)
  if (!ctx || !ctx.mobile) return null
  return (
    <Tip label="Chapitres">
      {/* Aussi haut que le bloc titre + sous-titre à côté duquel il se
          trouve (`self-stretch`, 48 px de large), et bien visible (demande
          utilisateur du 2026-09-28 : « vraiment plus gros »). */}
      <Button
        variant="outline"
        aria-label="Ouvrir la liste des chapitres"
        onClick={ctx.open}
        className="h-auto min-h-10 w-12 shrink-0 self-stretch p-0 [&_svg:not([class*='size-'])]:size-5"
      >
        <PanelLeft />
      </Button>
    </Tip>
  )
}
