/**
 * Page 404 — glitch chromatique.
 *
 * Un « 404 » géant qui se déchire en aberration chromatique (RGB split) par
 * bursts, sur fond bleu nuit plat. Ni néon ni effet écran CRT : juste le texte
 * qui glitche. Entre deux dechirures, l'écran est net.
 *
 * Branché comme `defaultNotFoundComponent` du router (voir #/router.tsx) :
 * rendu dans le <main> sous la Navbar, il remplit sa zone (min-h-full flex-1).
 * La navigation de retour se fait par la Navbar globale.
 *
 * Tout le style vit dans src/styles/not-found.css, scopé .nf404-* (aucune fuite).
 */
export function NotFound() {
  return (
    <div className="nf404-root flex min-h-full flex-1 flex-col items-center justify-center">
      {/* Titre réel pour lecteurs d'écran (le « 404 » visible est décoratif). */}
      <h1 className="sr-only">Erreur 404 — page introuvable</h1>

      <div className="nf404-stage">
        <span className="nf404-glitch" data-text="404" aria-hidden="true">
          404
        </span>
      </div>
    </div>
  )
}
