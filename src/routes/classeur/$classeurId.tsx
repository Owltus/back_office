import { useCallback, useState } from 'react'
import { Link, Navigate, Outlet, createFileRoute } from '@tanstack/react-router'

import { PageGuard } from '#/components/auth/PageGuard.tsx'
import { ChapterDrawerProvider } from '#/components/classeur/ChapterDrawer.tsx'
import { ChapterSidebar } from '#/components/classeur/ChapterSidebar.tsx'
import { DndProvider } from '#/components/classeur/dnd/DndProvider.tsx'
import { useClasseur } from '#/components/classeur/hooks/useClasseur.ts'
import { PageContainer } from '#/components/shared/PageContainer.tsx'
import { useResponsiveShell } from '#/components/shared/useResponsiveShell.ts'
import { Button } from '#/components/ui/button.tsx'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet.tsx'
import { DEFAULT_REGISTRY_NAME } from '#/lib/classeur/naming.ts'
import { useNavbarSubtitle } from '#/lib/navbarSubtitle.ts'

export const Route = createFileRoute('/classeur/$classeurId')({
  component: ClasseurLayout,
})

/**
 * Layout d'un classeur : colonne des chapitres à gauche (`ChapterSidebar`,
 * une carte collante dans la gouttière de page), page à droite (`Outlet` :
 * tableau de bord, chapitre, détails). Sous `lg`, la colonne devient un
 * tiroir (`ui/sheet`) que chaque page ouvre depuis le `leading` de son
 * `PageHeader` (`ChapterDrawerButton`) ; le nom du classeur passe alors en
 * sous-titre de la Navbar, comme le jour affiché sur les autres pages.
 *
 * `DndProvider` enveloppe les DEUX : un élément de la page chapitre peut être
 * déposé sur un chapitre de la colonne. L'identifiant de route est converti
 * en nombre ; invalide, retour à la liste.
 */
function ClasseurLayout() {
  const { classeurId: brut } = Route.useParams()
  const classeurId = Number(brut)
  if (!Number.isInteger(classeurId) || classeurId <= 0) {
    return <Navigate to="/classeur" replace />
  }
  return (
    <PageGuard page="classeur">
      <ClasseurShell classeurId={classeurId} />
    </PageGuard>
  )
}

function ClasseurShell({ classeurId }: { classeurId: number }) {
  const { isNavbarMobile } = useResponsiveShell()
  const [tiroirOuvert, setTiroirOuvert] = useState(false)
  const ouvrirTiroir = useCallback(() => setTiroirOuvert(true), [])
  const classeur = useClasseur(classeurId)

  const nom = classeur.data?.name ?? DEFAULT_REGISTRY_NAME
  // Sous 1024px, le nom du classeur vit dans la Navbar globale (sous-titre à
  // côté du hamburger). GATÉ par `isNavbarMobile`, comme sur PDJ/Rapro.
  useNavbarSubtitle(isNavbarMobile && classeur.data ? nom : null)

  // Classeur supprimé ou inexistant : `null` une fois la lecture réussie.
  if (classeur.isSuccess && classeur.data === null) {
    return (
      <PageContainer>
        <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-3 rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
          <p className="text-sm">
            Ce classeur n'existe pas, ou vous n'y avez pas accès.
          </p>
          <Button asChild size="sm" variant="outline">
            <Link to="/classeur">Tous les classeurs</Link>
          </Button>
        </div>
      </PageContainer>
    )
  }

  return (
    <DndProvider>
      <ChapterDrawerProvider open={ouvrirTiroir} mobile={isNavbarMobile}>
        <div className="flex flex-1">
          {isNavbarMobile ? (
            <Sheet open={tiroirOuvert} onOpenChange={setTiroirOuvert}>
              <SheetContent
                side="left"
                className="w-[85vw] max-w-80 p-0"
                showCloseButton={false}
              >
                <SheetHeader className="sr-only">
                  <SheetTitle>Chapitres</SheetTitle>
                  <SheetDescription>
                    Chapitres du classeur {nom}
                  </SheetDescription>
                </SheetHeader>
                <ChapterSidebar
                  classeurId={classeurId}
                  onNavigate={() => setTiroirOuvert(false)}
                />
              </SheetContent>
            </Sheet>
          ) : (
            /* Colonne PLEINE HAUTEUR collée au bord gauche, bordure à droite,
               comme la sidebar de Registre — décision utilisateur du
               2026-09-26 (« trop petite ») : 20 rem au lieu d'une carte de
               16 rem dans une gouttière. Elle défile en interne. */
            <aside
              aria-label="Chapitres"
              className="classeur-sidebar hidden w-80 shrink-0 border-r border-border bg-card lg:flex lg:flex-col"
            >
              <ChapterSidebar classeurId={classeurId} />
            </aside>
          )}

          <div className="flex min-w-0 flex-1 flex-col">
            <Outlet />
          </div>
        </div>
      </ChapterDrawerProvider>
    </DndProvider>
  )
}
