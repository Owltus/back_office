import { Upload } from 'lucide-react'

/**
 * Voile affiché sur la grille pendant qu'un fichier est glissé au-dessus de
 * la page — porté de Registre (`DropOverlay`). Le hook associé vit dans
 * `hooks/useDropZone.ts` (page chapitre, `.md` / `.txt`) ; la liste des
 * classeurs le réutilise avec son propre libellé (export `.json`).
 *
 * C'est le SEUL usage du cadre pointillé dans le Classeur : une zone de
 * dépôt, visible uniquement pendant le geste — jamais un état vide.
 */
export function DropOverlay({
  label = 'Déposez vos fichiers .md ou .txt ici',
}: {
  label?: string
}) {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-40 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-primary bg-primary/5 backdrop-blur-[2px]"
      aria-hidden="true"
    >
      <div className="flex flex-col items-center gap-2 rounded-xl bg-background/80 px-8 py-6 shadow-sm">
        <Upload className="size-8 text-primary" />
        <p className="text-sm font-medium text-primary">{label}</p>
      </div>
    </div>
  )
}
