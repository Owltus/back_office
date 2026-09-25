import { NotebookTabs } from 'lucide-react'

import { PageHeader } from '#/components/shared/PageHeader.tsx'

/*
 * Classeur — board VIDE (2026-09-25).
 *
 * La page existe pour que son câblage soit en place et vérifiable en
 * production avant tout contenu : entrée de navbar, garde par page, droits
 * lecture/écriture/gestion attribuables depuis /comptes, ordre des pages.
 *
 * Aucune lecture Supabase ici. Quand le contenu arrivera, toute table nouvelle
 * devra suivre `page_permissions_rls*` : lecture gatée par
 * `private.get_page_level('classeur')`, écriture enveloppée par niveau, et
 * toute RPC privilégiée dans `private` avec relais invoker dans `public`.
 *
 * Pas de squelette dédié : la route garde la variante `board` du shell
 * (`RouteSkeleton`), ce qui est exact tant que la page n'a pas de forme.
 */
export function ClasseurBoard() {
  return (
    <div className="flex flex-1 flex-col gap-4">
      <PageHeader title="Classeur" />
      <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border px-4 py-16 text-center">
        <NotebookTabs className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">
          Page en construction. Rien à afficher pour le moment.
        </p>
      </div>
    </div>
  )
}
