/**
 * types.ts — Type canonique du contenu d'une affiche
 *
 * `PosterContent` déclare UNE SEULE FOIS la forme du contenu d'affiche,
 * partagée entre l'état du store (`AfficheState`, src/lib/afficheStore.ts)
 * et les props du composant de rendu (`PosterProps`,
 * src/components/affiche/Poster.tsx). Nommage des tailles : celui du store
 * (`fontSizeTitle` / `fontSizeMessage` / `fontSizeInfo`).
 *
 * Module sans React ni Tailwind : types + fonction pure uniquement.
 */

import type { ColorKey } from '#/lib/poster/config.ts'

/** Contenu complet et sérialisable d'une affiche (saisie = rendu). */
export interface PosterContent {
  // Contenu textuel
  /** Titre de la section française. */
  titleFr: string
  /** Message de la section française (les `\n` sont convertis en `<br />`). */
  messageFr: string
  /** Titre de la section anglaise. */
  titleEn: string
  /** Message de la section anglaise (les `\n` sont convertis en `<br />`). */
  messageEn: string
  // Apparence
  /** Clé de l'icône sélectionnée, ou `'none'` pour masquer la zone icône. */
  selectedIcon: string
  /** Clé du thème de couleur. */
  colorKey: ColorKey
  // Dates / horaires (formats natifs des inputs)
  /** Date de début au format natif `YYYY-MM-DD` (ou chaîne vide). */
  dateStart: string
  /** Date de fin au format natif `YYYY-MM-DD` (ou chaîne vide). */
  dateEnd: string
  /** Heure de début au format natif `HH:MM` (ou chaîne vide). */
  timeStart: string
  /** Heure de fin au format natif `HH:MM` (ou chaîne vide). */
  timeEnd: string
  // Tailles
  /**
   * Mode taille automatique. En auto, l'icône garde la taille CSS par défaut
   * (140px) comme le fork ; en manuel, la valeur du slider est appliquée inline.
   */
  isAutoSizeMode: boolean
  /** Taille (px) de l'icône, appliquée en style inline sur le SVG (mode manuel). */
  fontSizeIcon: number
  /** Taille (px) des titres. */
  fontSizeTitle: number
  /** Taille (px) des messages. */
  fontSizeMessage: number
  /** Taille (px) des infos (dates / horaires). */
  fontSizeInfo: number
}

/**
 * Règle centralisée d'affichage de la section anglaise : visible (avec son
 * divider) dès qu'un contenu anglais est présent (titre OU message non vide).
 */
export function hasEnglishContent(
  c: Pick<PosterContent, 'titleEn' | 'messageEn'>,
): boolean {
  return c.titleEn.trim() !== '' || c.messageEn.trim() !== ''
}
