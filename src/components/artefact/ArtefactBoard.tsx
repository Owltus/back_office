import galleryHtml from './gallery.html?raw'

/*
 * Page « Artefact » — REGISTRE des éléments d'interface retenus (trace de ce qui
 * a été conçu et mis en service). Une section par composant ; on en ajoute
 * d'autres au fil du temps.
 *
 * Rendu de la maquette autonome (HTML/CSS self-contained) dans un <iframe
 * srcDoc> : l'iframe est ISOLÉ (ses propres tokens de couleur, styles) → rendu
 * fidèle sans interférer avec le thème de l'app. `gallery.html` importé en `?raw`.
 * Réservé aux admins (cf. route + lien Navbar).
 */
export function ArtefactBoard() {
  return (
    <div className="flex flex-1 flex-col">
      <iframe
        title="Registre d'artefacts"
        srcDoc={galleryHtml}
        className="w-full flex-1 border-0"
        style={{ minHeight: 'calc(100dvh - 4rem)' }}
      />
    </div>
  )
}
