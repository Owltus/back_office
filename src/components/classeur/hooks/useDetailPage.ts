import { useMutation } from '@tanstack/react-query'
import { useNavigate, useParams } from '@tanstack/react-router'

import { useAuth } from '#/components/auth/AuthContext.tsx'
import {
  useChapter,
  useChapterContent,
  useClasseur,
  useInvaliderClasseur,
} from '#/components/classeur/hooks/useClasseur.ts'
import { updateItem } from '#/lib/classeur/service.ts'
import type {
  DocumentInput,
  SignatureSheetInput,
  TrackingSheetInput,
} from '#/lib/classeur/service.ts'
import {
  DEFAULT_REGISTRY_NAME,
  buildEstablishment,
} from '#/lib/classeur/naming.ts'
import type {
  ChapterContent,
  ChapterItem,
  ItemKind,
} from '#/lib/classeur/types.ts'

/*
 * Hook partagé par les quatre pages de détail (document, feuille de suivi,
 * feuille de signature, intercalaire) — porté de Registre
 * (`lib/hooks/useDetailPage.ts`) sur TanStack Router + TanStack Query.
 *
 * Routes servies : `/classeur/$classeurId/$chapterId/{document,suivi,
 * signature,intercalaire}.$id`. Les trois paramètres sont lus en `strict:
 * false` (le hook ne connaît pas la route qui l'appelle) et convertis en
 * nombres ; un identifiant invalide donne `NaN`, que les lectures refusent
 * (`enabled`) et que `itemIntrouvable` signale.
 *
 * L'élément est lu dans le cache du CHAPITRE (`classeurKeys.items`), le même
 * que la page chapitre : revenir en arrière ne recharge rien.
 */

type Patch = Partial<DocumentInput & TrackingSheetInput & SignatureSheetInput>

export type ItemOf<TKind extends ItemKind> = Extract<
  ChapterItem,
  { kind: TKind }
>['data']

const FAMILLE: Record<ItemKind, keyof ChapterContent> = {
  document: 'documents',
  tracking_sheet: 'tracking_sheets',
  signature_sheet: 'signature_sheets',
  intercalaire: 'intercalaires',
}

function trouver<TKind extends ItemKind>(
  contenu: ChapterContent,
  kind: TKind,
  id: number,
): ItemOf<TKind> | null {
  const liste = contenu[FAMILLE[kind]] as unknown as ReadonlyArray<
    ItemOf<TKind>
  >
  return liste.find((x) => x.id === id) ?? null
}

export function useDetailPage<TKind extends ItemKind>(kind: TKind) {
  const params: Record<string, string | undefined> = useParams({
    strict: false,
  })
  const classeurId = Number(params.classeurId)
  const chapterId = Number(params.chapterId)
  const id = Number(params.id)
  const navigate = useNavigate()
  const { can } = useAuth()
  const canWrite = can('classeur', 'ecriture')

  /** Cible du bouton « Retour » : la page du chapitre. */
  const backTo = '/classeur/$classeurId/$chapterId' as const
  const backParams = {
    classeurId: String(classeurId),
    chapterId: String(chapterId),
  }
  const goBack = () => navigate({ to: backTo, params: backParams })

  const contenu = useChapterContent(chapterId)
  const item = contenu.data ? trouver(contenu.data, kind, id) : null
  const itemIntrouvable = contenu.isSuccess && item === null

  const classeurQ = useClasseur(classeurId)
  const classeur = classeurQ.data ?? null
  const classeurName = classeur?.name ?? DEFAULT_REGISTRY_NAME
  const establishment = buildEstablishment(classeur)

  const chapterQ = useChapter(chapterId)
  const chapter = chapterQ.data ?? null

  const invalider = useInvaliderClasseur()
  const update = useMutation({
    mutationFn: (patch: Patch) => updateItem(kind, id, patch),
    onSuccess: () => invalider(),
  })

  return {
    id,
    chapterId,
    classeurId,
    navigate,
    backTo,
    backParams,
    goBack,
    /** L'élément, `null` tant qu'il n'est pas chargé ou s'il est introuvable. */
    item,
    itemIntrouvable,
    /** Garde de chargement : `isPending`, jamais `isSuccess`. */
    isPending: contenu.isPending,
    isError: contenu.isError,
    error: contenu.error,
    classeur,
    classeurName,
    establishment,
    chapter,
    /** `update.mutateAsync(patch)` écrit puis invalide `classeurKeys.all`. */
    update,
    canWrite,
  }
}
