import { useState } from 'react'
import { Link, Navigate, Outlet, createFileRoute } from '@tanstack/react-router'
import { PanelLeft } from 'lucide-react'

import { PageGuard } from '#/components/auth/PageGuard.tsx'
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

export const Route = createFileRoute('/classeur/$classeurId')({
  component: ClasseurLayout,
})

/**
 * Layout d'un classeur : colonne des chapitres à gauche (`ChapterSidebar`),
 * page à droite (`Outlet` : tableau de bord, chapitre, détails). Sous `lg`, la
 * colonne devient un tiroir (`ui/sheet`) ouvert depuis une barre au-dessus de
 * la page.
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
  const classeur = useClasseur(classeurId)

  // Classeur supprimé ou inexistant : `null` une fois la lecture réussie.
  if (classeur.isSuccess && classeur.data === null) {
    return (
      <PageContainer>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border px-4 py-16 text-center">
          <p className="text-sm text-muted-foreground">
            Ce classeur n'existe plus.
          </p>
          <Button asChild size="sm" variant="outline">
            <Link to="/classeur">Tous les classeurs</Link>
          </Button>
        </div>
      </PageContainer>
    )
  }

  const nom = classeur.data?.name ?? DEFAULT_REGISTRY_NAME

  return (
    <DndProvider>
      <div className="flex flex-1">
        {isNavbarMobile ? (
          <Sheet open={tiroirOuvert} onOpenChange={setTiroirOuvert}>
            <SheetContent
              side="left"
              className="w-72 p-0"
              showCloseButton={false}
            >
              <SheetHeader className="sr-only">
                <SheetTitle>Chapitres</SheetTitle>
                <SheetDescription>Chapitres du classeur {nom}</SheetDescription>
              </SheetHeader>
              <ChapterSidebar
                classeurId={classeurId}
                onNavigate={() => setTiroirOuvert(false)}
              />
            </SheetContent>
          </Sheet>
        ) : (
          <aside
            aria-label="Chapitres"
            className="classeur-sidebar hidden w-64 shrink-0 border-r border-border bg-card/40 lg:block"
          >
            <ChapterSidebar classeurId={classeurId} />
          </aside>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          {isNavbarMobile && (
            <div className="flex items-center gap-2 border-b border-border px-4 py-2 lg:hidden">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTiroirOuvert(true)}
                aria-label="Ouvrir la liste des chapitres"
              >
                <PanelLeft />
                Chapitres
              </Button>
              <span className="truncate text-sm text-muted-foreground">
                {nom}
              </span>
            </div>
          )}
          <Outlet />
        </div>
      </div>
    </DndProvider>
  )
}
