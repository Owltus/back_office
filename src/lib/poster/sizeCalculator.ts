/**
 * sizeCalculator.ts — Calcul automatique des tailles de police
 * Algorithme intelligent optimisé pour maximiser l'utilisation de l'espace.
 * Porté à l'identique du fork (assets/js/size-calculator.js).
 *
 * Note de portage : le paramètre `contentDensity` du fork était calculé
 * (via _calculateContentDensity) puis passé à _findOptimalSizes SANS jamais
 * y être lu (code mort). Il est donc omis ici, sans changement de comportement.
 */

import { POSTER } from './config.ts'

/** Tailles de police calculées (en px) */
export interface AutoSizes {
  title: number
  message: number
  info: number
}

/**
 * Calcule les tailles optimales de police en fonction du contenu
 * Approche ultra-adaptative : s'ajuste en fonction de TOUS les éléments présents
 */
export function calculateAutoSizes(
  titleFr: string,
  messageFr: string,
  titleEn: string,
  messageEn: string,
  showIcon: boolean,
  showDates: boolean,
  showHours: boolean,
  showEnglish = true,
): AutoSizes {
  // Dimensions du poster
  const posterHeight = POSTER.height
  const posterPadding = POSTER.padding.vertical
  const posterWidth = POSTER.width - (POSTER.padding.horizontal * 2)
  const availableHeight = posterHeight - (posterPadding * 2)

  // Analyser ce qui est réellement présent pour optimiser l'espace
  const hasIcon = showIcon
  const hasInfo = showDates || showHours
  const hasTwoLanguages = showEnglish

  // Calcul adaptatif de la taille d'icône selon le contexte
  let iconSize = 0
  let iconMargin = 0
  let iconZoneTopPadding = 0

  if (hasIcon) {
    // L'icône s'adapte selon la quantité totale de contenu
    iconSize = calculateIconSize(titleFr, messageFr, titleEn, messageEn, showEnglish)
    iconMargin = 20 // Réduit au minimum
    iconZoneTopPadding = 10 // Réduit au minimum
  }

  // Divider et sections
  const dividerHeight = hasTwoLanguages ? 2 : 0
  // Marges minimales du divider
  const dividerMargins = hasTwoLanguages ? 80 : 0 // 40px de chaque côté

  const numSections = hasTwoLanguages ? 2 : 1
  // Padding vertical réduit des sections
  const sectionPaddingVertical = 30 * 2 // padding top + bottom par section (réduit)
  const contentZoneTopPadding = 10 // Réduit au minimum

  // Zone footer (logo) - TOUJOURS présent et fixe
  const logoHeight = 100
  const logoTopPadding = 40

  // MARGE DE SÉCURITÉ minimale - on veut maximiser l'espace
  const SAFETY_MARGIN = 20

  // Calculer l'espace total utilisé par les éléments fixes
  const fixedHeight = iconSize + iconMargin + iconZoneTopPadding +
    contentZoneTopPadding +
    dividerHeight + dividerMargins +
    (sectionPaddingVertical * numSections) +
    logoHeight + logoTopPadding +
    SAFETY_MARGIN

  // Espace disponible pour le contenu textuel
  let availableForText = availableHeight - fixedHeight

  // Si l'espace est négatif ou trop petit, utiliser un minimum
  if (availableForText < 100) {
    availableForText = 100
  }

  const perSectionHeight = hasTwoLanguages ? (availableForText / 2) : availableForText

  // Infos (dates et heures)
  const infoLines = (showDates ? 1 : 0) + (showHours ? 1 : 0)

  // Largeur disponible pour le texte
  const textWidth = posterWidth - 120 // 60px de chaque côté

  // Trouver les tailles optimales par recherche itérative
  const sizes = _findOptimalSizes(
    titleFr, messageFr, titleEn, messageEn,
    textWidth, perSectionHeight,
    hasInfo, infoLines, hasTwoLanguages,
  )

  return sizes
}

/**
 * Trouve les tailles optimales par recherche itérative adaptative
 * Objectif : remplir au maximum l'espace SANS JAMAIS déborder
 */
function _findOptimalSizes(
  titleFr: string,
  messageFr: string,
  titleEn: string,
  messageEn: string,
  textWidth: number,
  maxHeight: number,
  hasInfo: boolean,
  infoLines: number,
  showEnglish: boolean,
): AutoSizes {
  // Plages de tailles possibles
  const titleRange = { min: 20, max: 80 }
  const messageRange = { min: 12, max: 40 }
  const infoRange = { min: 10, max: 28 }

  // Ratios adaptatifs pour maintenir la hiérarchie visuelle
  const MESSAGE_TO_TITLE_RATIO = 0.48 // Fixe et généreux
  const INFO_TO_MESSAGE_RATIO = 0.74 // Fixe et généreux

  // Marges entre éléments (réduites pour maximiser l'espace)
  const TITLE_BOTTOM_MARGIN = 25
  const MESSAGE_BOTTOM_MARGIN = 25
  const INFO_TOP_MARGIN = 15

  // MARGE DE SÉCURITÉ très permissive pour maximiser
  const SAFETY_FILL_RATIO = 0.98

  let bestSizes: AutoSizes | null = null
  let bestFillRatio = 0

  // Objectif de remplissage AGRESSIF - on veut remplir au maximum
  const targetFillRatio = 0.92

  // Recherche itérative : on teste différentes tailles de titre
  for (let titleSize = titleRange.max; titleSize >= titleRange.min; titleSize -= 1) {
    // Calculer les autres tailles en respectant les ratios
    let messageSize = Math.round(titleSize * MESSAGE_TO_TITLE_RATIO)
    messageSize = Math.min(Math.max(messageSize, messageRange.min), messageRange.max)

    let infoSize = Math.round(messageSize * INFO_TO_MESSAGE_RATIO)
    infoSize = Math.min(Math.max(infoSize, infoRange.min), infoRange.max)

    // Estimer les hauteurs pour chaque section
    const frHeight = _estimateSectionHeight(
      titleFr, messageFr, titleSize, messageSize, infoSize,
      textWidth, hasInfo, infoLines,
      TITLE_BOTTOM_MARGIN, MESSAGE_BOTTOM_MARGIN, INFO_TOP_MARGIN,
    )

    const enHeight = showEnglish ? _estimateSectionHeight(
      titleEn, messageEn, titleSize, messageSize, infoSize,
      textWidth, hasInfo, infoLines,
      TITLE_BOTTOM_MARGIN, MESSAGE_BOTTOM_MARGIN, INFO_TOP_MARGIN,
    ) : 0

    // La hauteur maximale entre les deux sections
    const maxSectionHeight = Math.max(frHeight, enHeight)

    // Vérifier si ça rentre dans l'espace disponible (avec marge de sécurité)
    if (maxSectionHeight <= maxHeight * SAFETY_FILL_RATIO) {
      // Calculer le ratio de remplissage
      const fillRatio = maxSectionHeight / maxHeight

      // Si c'est le meilleur ratio trouvé, on garde ces tailles
      if (fillRatio > bestFillRatio) {
        bestFillRatio = fillRatio
        bestSizes = {
          title: titleSize,
          message: messageSize,
          info: infoSize,
        }
      }

      // Si on atteint l'objectif de remplissage adaptatif, c'est suffisant
      if (fillRatio >= targetFillRatio) {
        break
      }
    }
  }

  // Si aucune taille n'a été trouvée (contenu très long), utiliser les minimums
  if (!bestSizes) {
    bestSizes = {
      title: titleRange.min,
      message: messageRange.min,
      info: infoRange.min,
    }
  }

  return bestSizes
}

/**
 * Estime la hauteur totale d'une section avec des tailles données
 * Version améliorée avec calcul plus précis
 */
function _estimateSectionHeight(
  title: string,
  message: string,
  titleSize: number,
  messageSize: number,
  infoSize: number,
  textWidth: number,
  hasInfo: boolean,
  infoLines: number,
  titleMargin: number,
  messageMargin: number,
  infoTopMargin: number,
): number {
  // Constantes pour l'estimation (identiques au CSS)
  const TITLE_LINE_HEIGHT = 1.1
  const MESSAGE_LINE_HEIGHT = 1.6
  const INFO_LINE_HEIGHT = 2.0

  // Facteurs optimisés - moins conservateurs pour permettre des tailles plus grandes
  const TITLE_CHAR_WIDTH_FACTOR = 0.55 // Moins conservateur
  const MESSAGE_CHAR_WIDTH_FACTOR = 0.50 // Moins conservateur

  // Calculer le nombre de lignes pour le titre (100% de la largeur)
  const titleCharsPerLine = Math.floor(textWidth / (titleSize * TITLE_CHAR_WIDTH_FACTOR))
  const titleLines = titleCharsPerLine > 0 ? Math.ceil(title.length / titleCharsPerLine) : 1
  const titleHeight = (titleSize * TITLE_LINE_HEIGHT * titleLines) + titleMargin

  // Le message utilise max-width: 90% selon le CSS
  const messageTextWidth = textWidth * 0.90

  // Calculer le nombre de lignes pour le message
  const messageLineBreaks = (message.match(/\n/g) || []).length
  const messageWords = message.split(/\s+/).filter(w => w.length > 0).length
  const messageCharsPerLine = Math.floor(messageTextWidth / (messageSize * MESSAGE_CHAR_WIDTH_FACTOR))

  // Estimation basée sur les mots
  let messageLines: number
  if (messageWords === 0) {
    messageLines = 1
  } else {
    const avgWordLength = message.length / messageWords
    const wordsPerLine = Math.max(1, Math.floor(messageCharsPerLine / (avgWordLength + 1)))
    messageLines = Math.max(
      Math.ceil(messageWords / wordsPerLine),
      messageLineBreaks + 1,
    )
  }

  const messageHeight = (messageSize * MESSAGE_LINE_HEIGHT * messageLines) + messageMargin

  // Calculer la hauteur des infos
  const infoHeight = hasInfo ? (infoTopMargin + (infoLines * infoSize * INFO_LINE_HEIGHT)) : 0

  return titleHeight + messageHeight + infoHeight
}

/**
 * Ajuste la taille de l'icône en fonction du contenu total
 * Version ultra-adaptative qui prend en compte tous les éléments
 */
export function calculateIconSize(
  titleFr: string,
  messageFr: string,
  titleEn: string,
  messageEn: string,
  showEnglish = true,
): number {
  const frLength = titleFr.length + messageFr.length
  const enLength = showEnglish ? (titleEn.length + messageEn.length) : 0
  const totalLength = frLength + enLength

  // Calculer le nombre de langues actives
  const numLanguages = showEnglish ? 2 : 1

  // Adapter la taille de l'icône selon la quantité de contenu ET le contexte
  let iconSize: number

  if (totalLength > 900) {
    iconSize = 85
  } else if (totalLength > 700) {
    iconSize = 100
  } else if (totalLength > 500) {
    iconSize = 115
  } else if (totalLength > 350) {
    iconSize = 130
  } else if (totalLength > 200) {
    iconSize = 145
  } else if (totalLength > 100) {
    iconSize = 160
  } else {
    iconSize = 175 // Beaucoup plus grand si très peu de contenu
  }

  // Ajustement selon le nombre de langues
  // Si une seule langue, on peut se permettre une icône plus grande
  if (numLanguages === 1) {
    iconSize = Math.round(iconSize * 1.15)
  }

  // Limites de sécurité
  return Math.min(Math.max(iconSize, 80), 180)
}
