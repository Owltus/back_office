import type { Edition } from '#/lib/classeur/markdownEdition.ts'

/*
 * Application d'une `Edition` (voir `lib/classeur/markdownEdition.ts`) dans
 * le `textarea` de l'éditeur, SANS casser l'historique d'annulation.
 *
 * `execCommand('insertText')` inscrit la modification dans la pile du
 * navigateur : Ctrl + Z l'annule comme une frappe (amélioration n° 4 de
 * `plan/classeur-editeur-ameliorations`). Écrire `value` — ce que fait
 * React quand l'état change par `setContenu` — vide au contraire cette
 * pile. `setRangeText` n'est qu'un repli (jsdom, navigateur sans
 * `execCommand`) : le texte est juste, seul l'historique est perdu.
 */

/** Applique l'édition ; `false` si le repli (sans historique) a servi. */
export function appliquerDansEditeur(
  editeur: HTMLTextAreaElement,
  e: Edition,
): boolean {
  editeur.focus()
  editeur.setSelectionRange(e.debut, e.fin)
  let fait = false
  // `execCommand` n'agit que sur l'élément qui a VRAIMENT le focus : si un
  // dialogue le retient (piège de focus), on ne tente pas.
  if (document.activeElement === editeur) {
    try {
      fait =
        e.texte === '' && e.debut !== e.fin
          ? document.execCommand('delete')
          : document.execCommand('insertText', false, e.texte)
    } catch {
      fait = false
    }
  }
  if (!fait) {
    editeur.setRangeText(e.texte, e.debut, e.fin)
    editeur.dispatchEvent(new Event('input', { bubbles: true }))
  }
  editeur.setSelectionRange(e.selection[0], e.selection[1])
  return fait
}

const ATTENTE_MAX_MS = 1500

/**
 * Comme `appliquerDansEditeur`, mais attend qu'aucun dialogue ne soit
 * ouvert : une image s'insère au moment où le dialogue de préparation ou la
 * médiathèque se FERME, et son piège de focus empêcherait `execCommand`
 * d'atteindre l'éditeur. L'édition est calculée au dernier moment, sur le
 * texte tel qu'il est alors (la frappe pendant l'envoi n'est pas perdue).
 * Sans éditeur monté (sortie d'édition entre-temps), `repli` est appelé.
 */
export function appliquerQuandLibre(
  getEditeur: () => HTMLTextAreaElement | null,
  calculer: (valeur: string) => Edition,
  repli: () => void,
): void {
  const depart = performance.now()
  const essayer = () => {
    const editeur = getEditeur()
    if (!editeur?.isConnected) {
      repli()
      return
    }
    // Seul un dialogue OUVERT piège le focus : un dialogue en animation de
    // sortie (`data-state="closed"`) l'a déjà rendu.
    const dialogueOuvert =
      document.querySelector(
        '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
      ) !== null
    if (dialogueOuvert && performance.now() - depart < ATTENTE_MAX_MS) {
      // Minuterie plutôt que `requestAnimationFrame`, suspendu par le
      // navigateur quand la fenêtre n'est pas affichée.
      window.setTimeout(essayer, 50)
      return
    }
    appliquerDansEditeur(editeur, calculer(editeur.value))
  }
  essayer()
}
