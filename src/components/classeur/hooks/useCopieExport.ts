import { useCallback, useEffect, useRef, useState } from 'react'

import { copierOuTelecharger } from '#/lib/classeur/exportJson.ts'
import type { IssueCopie } from '#/lib/classeur/exportJson.ts'

/*
 * « Copier » d'un export JSON (étape 3 du plan `classeur-echange-ia-2026-10-19`),
 * partagé par l'accueil d'un classeur, le dialogue d'un chapitre ou d'un
 * document et le menu de la liste des classeurs :
 *   - le bouton affiche « Copié » deux secondes ;
 *   - un refus du navigateur télécharge le fichier à la place
 *     (`copierOuTelecharger`) et le dit en UNE phrase ;
 *   - un second clic pendant une copie en cours est ignoré : le contenu
 *     n'est lu qu'une fois (la liste le lit sur le réseau).
 * Rien n'est mémorisé : `oublier` remet tout à zéro (fermeture d'un dialogue).
 */

/** Durée de « Copié » sur le bouton. */
export const DUREE_COPIE_MS = 2000

/** La seule phrase affichée quand le navigateur refuse la copie. */
export const MESSAGE_COPIE_REFUSEE =
  'Copie refusée par le navigateur : le fichier est téléchargé, joignez-le à la conversation.'

/** Ce qu'il faut copier : le texte, et le nom du fichier de repli. */
export interface ACopier {
  texte: string
  nomFichier: string
}

export function useCopieExport() {
  const [issue, setIssue] = useState<IssueCopie | null>(null)
  const [erreur, setErreur] = useState<unknown>(null)
  const [enCours, setEnCours] = useState(false)
  const verrou = useRef(false)
  const minuteur = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(minuteur.current), [])

  const oublier = useCallback(() => {
    window.clearTimeout(minuteur.current)
    setIssue(null)
    setErreur(null)
  }, [])

  const copier = useCallback(
    async (construire: () => ACopier | null | Promise<ACopier | null>) => {
      if (verrou.current) return
      verrou.current = true
      setEnCours(true)
      window.clearTimeout(minuteur.current)
      setIssue(null)
      setErreur(null)
      try {
        const x = await construire()
        if (x === null) return
        const r = await copierOuTelecharger(x.texte, x.nomFichier)
        setIssue(r)
        if (r === 'copie')
          minuteur.current = window.setTimeout(
            () => setIssue(null),
            DUREE_COPIE_MS,
          )
      } catch (e) {
        setErreur(e)
      } finally {
        verrou.current = false
        setEnCours(false)
      }
    },
    [],
  )

  return {
    /** `true` deux secondes après une copie réussie. */
    copie: issue === 'copie',
    /** Le presse-papiers a refusé : le fichier a été téléchargé. */
    refusee: issue === 'telecharge',
    /** La lecture du contenu a échoué (liste des classeurs). */
    erreur,
    enCours,
    copier,
    oublier,
  }
}
