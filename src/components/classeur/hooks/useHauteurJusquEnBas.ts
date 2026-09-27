import { useCallback, useEffect, useState } from 'react'

/**
 * Hauteur qui mène un élément jusqu'au BAS de la fenêtre (éditeur d'un
 * document, décision utilisateur du 2026-09-27 : « pas modifiable, qui
 * s'adapte directement à la taille de la fenêtre »).
 *
 * Mesurée plutôt que devinée en CSS (`calc(100dvh - 8rem)`) : la hauteur de
 * la Navbar, d'un bandeau de panne ou d'une barre d'outils qui passe sur
 * deux lignes change ce qu'il reste. Le calcul part du conteneur qui
 * défile (`<main class="app-scroll">`), comme si la page était en haut :
 * place disponible = hauteur visible − position de l'élément dans le
 * contenu − rembourrages bas des ancêtres (la marge de page reste).
 *
 * Actif seulement à partir de `minLargeur` (deux colonnes) : en dessous,
 * `null` et le flux naturel reprend. Recalcul au redimensionnement de la
 * fenêtre et du conteneur.
 */
export function useHauteurJusquEnBas({
  minLargeur = 1024,
  minimum = 360,
}: { minLargeur?: number; minimum?: number } = {}) {
  const [hauteur, setHauteur] = useState<number | null>(null)
  // L'élément est un ÉTAT (pas une ref) : il n'existe qu'en mode édition,
  // et son arrivée doit (re)brancher les observateurs.
  const [el, setEl] = useState<HTMLElement | null>(null)

  const mesurer = useCallback(() => {
    if (!el || window.innerWidth < minLargeur) {
      setHauteur(null)
      return
    }
    const defileur = el.closest<HTMLElement>('.app-scroll')
    const haut = defileur
      ? el.getBoundingClientRect().top -
        defileur.getBoundingClientRect().top +
        defileur.scrollTop
      : el.getBoundingClientRect().top + window.scrollY
    const visible = defileur ? defileur.clientHeight : window.innerHeight
    let bas = 0
    for (let a = el.parentElement; a && a !== defileur; a = a.parentElement) {
      bas += parseFloat(getComputedStyle(a).paddingBottom) || 0
    }
    setHauteur(Math.max(minimum, Math.floor(visible - haut - bas)))
  }, [el, minLargeur, minimum])

  useEffect(() => {
    mesurer()
    const defileur = el?.closest<HTMLElement>('.app-scroll')
    const observateur =
      defileur && typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => mesurer())
        : null
    if (defileur) observateur?.observe(defileur)
    // Le parent grandit quand un élément apparaît au-dessus (erreur de
    // sauvegarde, état d'image) : l'élément descend, on remesure.
    if (el?.parentElement) observateur?.observe(el.parentElement)
    window.addEventListener('resize', mesurer)
    return () => {
      observateur?.disconnect()
      window.removeEventListener('resize', mesurer)
    }
  }, [el, mesurer])

  return { ref: setEl, hauteur }
}
