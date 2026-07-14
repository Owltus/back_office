import galleryHtml from './gallery.html?raw'

/*
 * Page TEMPORAIRE « Artefact » — galerie de propositions de cartes de synthèse.
 *
 * Repli au service de publication d'artefacts en ligne (indisponible) : on rend
 * la maquette autonome (HTML/CSS/JS self-contained) telle quelle dans un
 * <iframe srcDoc>. L'iframe est ISOLÉ (ses propres tokens de couleur, styles et
 * scripts) → rendu identique à l'artefact, sans interférer avec le thème de
 * l'app. Le fichier gallery.html est importé en `?raw` (chaîne brute).
 *
 * À retirer une fois la direction de carte choisie (route + lien Navbar + ce
 * dossier).
 */
export function ArtefactBoard() {
  return (
    <div className="flex flex-1 flex-col">
      <iframe
        title="Propositions de cartes de synthèse"
        srcDoc={galleryHtml}
        className="w-full flex-1 border-0"
        style={{ minHeight: 'calc(100dvh - 4rem)' }}
      />
    </div>
  )
}
