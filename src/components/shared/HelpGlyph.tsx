/*
 * Glyphe « ? » nu (sans cercle), tracé épais remplissant sa boîte 24×24. Source
 * UNIQUE partagée par les boutons d'aide (barre d'actions) et les en-têtes de
 * modals (`HelpDialogHeader`), pour que le même symbole désigne partout l'aide.
 */
export function HelpGlyph({ className = 'size-5' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M7.4 7.4a4.7 4.7 0 0 1 9 1.6c0 3.1-4.5 4.6-4.5 4.6" />
      <path d="M12 20h.01" />
    </svg>
  )
}
