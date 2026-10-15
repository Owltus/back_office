/**
 * sizeCalculator.ts — Calcul automatique des tailles de police
 * Algorithme intelligent optimisé pour maximiser l'utilisation de l'espace.
 * Porté du fork (assets/js/size-calculator.js).
 *
 * Note de portage : le paramètre `contentDensity` du fork était calculé
 * (via _calculateContentDensity) puis passé à _findOptimalSizes SANS jamais
 * y être lu (code mort). Il est donc omis ici, sans changement de comportement.
 *
 * MONOTONIE (2026-10-15) — allonger un texte ne fait JAMAIS grandir le titre.
 * Le fork la violait par deux mécanismes indépendants :
 *   1. le nombre de lignes du message était estimé depuis la longueur MOYENNE
 *      des mots : ajouter un mot court fait baisser la moyenne, donc monter le
 *      nombre de mots par ligne, donc BAISSER le nombre de lignes estimé ;
 *   2. l'icône rétrécit par PALIERS de longueur (`calculateIconSize`) : le
 *      caractère qui fait passer un palier libère 15 px d'un coup, que la
 *      recherche rendait au titre alors que le texte ajouté n'occupait aucune
 *      ligne nouvelle.
 * Correctifs, tous deux « au plus près » du fork (on ne retire que ce qui
 * viole la monotonie, les cas ordinaires gardent leurs tailles) :
 *   1. le message compte pour le MAXIMUM des estimations de ses débuts
 *      (préfixes finissant sur un mot) — l'estimation du fork inchangée,
 *      simplement rendue croissante quand on tape ;
 *   2. une taille n'est retenue que si AUCUN texte plus court contenu dans
 *      celui-ci (début de chacun des quatre champs), dans un palier d'icône
 *      plus grande, ne déborderait avec cette taille. C'est la plus grande
 *      taille croissante possible sous la règle du fork : elle n'en diffère
 *      que juste après un changement de palier.
 * La recherche rend la plus GRANDE taille qui tient (le fork gardait le
 * « meilleur remplissage », qui est la même chose : la hauteur croît avec la
 * taille).
 */

import { POSTER } from './config.ts'

/** Tailles de police calculées (en px) — nommage aligné sur PosterContent */
export interface AutoSizes {
  fontSizeTitle: number
  fontSizeMessage: number
  fontSizeInfo: number
}

/** Une section de l'affiche (FR, ou EN) */
interface Section {
  title: string
  message: string
}

/** Un palier d'icône plus grande, à respecter pour la monotonie */
interface PalierPrecedent {
  /** Longueur totale maximale d'un texte de ce palier */
  longueurMax: number
  /** Hauteur utile d'une section quand l'icône a la taille de ce palier */
  maxHeight: number
}

// Paliers de `calculateIconSize` : au-delà de `auDela` caractères, `taille`.
// Du plus long au plus court ; en deçà du dernier, 175 px.
const PALIERS_ICONE = [
  { auDela: 900, taille: 85 },
  { auDela: 700, taille: 100 },
  { auDela: 500, taille: 115 },
  { auDela: 350, taille: 130 },
  { auDela: 200, taille: 145 },
  { auDela: 100, taille: 160 },
]
const ICONE_PEU_DE_CONTENU = 175

// Constantes pour l'estimation (identiques au CSS)
const TITLE_LINE_HEIGHT = 1.1
const MESSAGE_LINE_HEIGHT = 1.6
const INFO_LINE_HEIGHT = 2.0

// Facteurs optimisés - moins conservateurs pour permettre des tailles plus grandes
const TITLE_CHAR_WIDTH_FACTOR = 0.55 // Moins conservateur
const MESSAGE_CHAR_WIDTH_FACTOR = 0.5 // Moins conservateur

// Marges entre éléments (réduites pour maximiser l'espace)
const TITLE_BOTTOM_MARGIN = 25
const MESSAGE_BOTTOM_MARGIN = 25
const INFO_TOP_MARGIN = 15

// MARGE DE SÉCURITÉ très permissive pour maximiser
const SAFETY_FILL_RATIO = 0.98

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
  const posterWidth = POSTER.width - POSTER.padding.horizontal * 2
  const availableHeight = posterHeight - posterPadding * 2

  // Analyser ce qui est réellement présent pour optimiser l'espace
  const hasIcon = showIcon
  const hasInfo = showDates || showHours
  const hasTwoLanguages = showEnglish

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

  // Hauteur utile d'une section pour une taille d'icône donnée (0 = sans icône)
  const perSectionHeightFor = (iconSize: number): number => {
    // L'icône s'adapte selon la quantité totale de contenu
    const iconMargin = hasIcon ? 20 : 0 // Réduit au minimum
    const iconZoneTopPadding = hasIcon ? 10 : 0 // Réduit au minimum

    // Calculer l'espace total utilisé par les éléments fixes
    const fixedHeight =
      iconSize +
      iconMargin +
      iconZoneTopPadding +
      contentZoneTopPadding +
      dividerHeight +
      dividerMargins +
      sectionPaddingVertical * numSections +
      logoHeight +
      logoTopPadding +
      SAFETY_MARGIN

    // Espace disponible pour le contenu textuel
    let availableForText = availableHeight - fixedHeight

    // Si l'espace est négatif ou trop petit, utiliser un minimum
    if (availableForText < 100) {
      availableForText = 100
    }

    return hasTwoLanguages ? availableForText / 2 : availableForText
  }

  const iconSize = hasIcon
    ? calculateIconSize(titleFr, messageFr, titleEn, messageEn, showEnglish)
    : 0
  const perSectionHeight = perSectionHeightFor(iconSize)

  // Paliers d'icône PLUS GRANDE déjà franchis par ce texte (voir l'en-tête).
  const sections: Section[] = [{ title: titleFr, message: messageFr }]
  if (showEnglish) sections.push({ title: titleEn, message: messageEn })
  const totalLength = sections.reduce(
    (n, s) => n + s.title.length + s.message.length,
    0,
  )
  const numLanguages = showEnglish ? 2 : 1
  const paliers: PalierPrecedent[] = []
  if (hasIcon) {
    for (const p of PALIERS_ICONE) {
      if (p.auDela < totalLength) {
        // Un texte de `p.auDela` caractères est dans le palier d'avant.
        paliers.push({
          longueurMax: p.auDela,
          maxHeight: perSectionHeightFor(
            _iconePourLongueur(p.auDela, numLanguages),
          ),
        })
      }
    }
  }

  // Infos (dates et heures)
  const infoLines = (showDates ? 1 : 0) + (showHours ? 1 : 0)

  // Largeur disponible pour le texte
  const textWidth = posterWidth - 120 // 60px de chaque côté

  // Trouver les tailles optimales par recherche itérative
  return _findOptimalSizes(
    sections,
    textWidth,
    perSectionHeight,
    paliers,
    hasInfo,
    infoLines,
  )
}

/**
 * Trouve les tailles optimales par recherche itérative adaptative
 * Objectif : remplir au maximum l'espace SANS JAMAIS déborder
 */
function _findOptimalSizes(
  sections: Section[],
  textWidth: number,
  maxHeight: number,
  paliers: PalierPrecedent[],
  hasInfo: boolean,
  infoLines: number,
): AutoSizes {
  // Plages de tailles possibles
  const titleRange = { min: 20, max: 80 }
  const messageRange = { min: 12, max: 40 }
  const infoRange = { min: 10, max: 28 }

  // Ratios adaptatifs pour maintenir la hiérarchie visuelle
  const MESSAGE_TO_TITLE_RATIO = 0.48 // Fixe et généreux
  const INFO_TO_MESSAGE_RATIO = 0.74 // Fixe et généreux

  // Recherche : de la plus grande taille de titre à la plus petite, la
  // première qui tient est retenue (la hauteur croît avec la taille).
  for (
    let titleSize = titleRange.max;
    titleSize >= titleRange.min;
    titleSize -= 1
  ) {
    // Calculer les autres tailles en respectant les ratios
    let messageSize = Math.round(titleSize * MESSAGE_TO_TITLE_RATIO)
    messageSize = Math.min(
      Math.max(messageSize, messageRange.min),
      messageRange.max,
    )

    let infoSize = Math.round(messageSize * INFO_TO_MESSAGE_RATIO)
    infoSize = Math.min(Math.max(infoSize, infoRange.min), infoRange.max)

    const modeles = sections.map((s) =>
      _modeleSection(
        s,
        titleSize,
        messageSize,
        infoSize,
        textWidth,
        hasInfo,
        infoLines,
      ),
    )

    // Le texte lui-même tient-il (la plus haute des sections) ?
    const limite = maxHeight * SAFETY_FILL_RATIO
    if (modeles.some((m) => m.hauteur(m.titleLength, m.messageLength) > limite))
      continue

    // Aucun début du texte, dans un palier d'icône plus grande, ne déborde.
    const ok = paliers.every(
      (p) =>
        _longueurMinDebordement(modeles, p.maxHeight * SAFETY_FILL_RATIO) >
        p.longueurMax,
    )
    if (!ok) continue

    return {
      fontSizeTitle: titleSize,
      fontSizeMessage: messageSize,
      fontSizeInfo: infoSize,
    }
  }

  // Si aucune taille n'a été trouvée (contenu très long), utiliser les minimums
  return {
    fontSizeTitle: titleRange.min,
    fontSizeMessage: messageRange.min,
    fontSizeInfo: infoRange.min,
  }
}

/** Hauteur estimée d'une section pour les `a` premiers caractères du titre et
 *  les `c` premiers du message, à tailles données. */
interface ModeleSection {
  titleLength: number
  messageLength: number
  /** Nombre de caractères de titre minimal pour atteindre `n` lignes */
  titleCharsPerLine: number
  hauteur: (a: number, c: number) => number
}

function _modeleSection(
  section: Section,
  titleSize: number,
  messageSize: number,
  infoSize: number,
  textWidth: number,
  hasInfo: boolean,
  infoLines: number,
): ModeleSection {
  // Calculer le nombre de lignes pour le titre (100% de la largeur)
  const titleCharsPerLine = Math.floor(
    textWidth / (titleSize * TITLE_CHAR_WIDTH_FACTOR),
  )

  // Le message utilise max-width: 90% selon le CSS
  const messageTextWidth = textWidth * 0.9
  const messageCharsPerLine = Math.floor(
    messageTextWidth / (messageSize * MESSAGE_CHAR_WIDTH_FACTOR),
  )
  const lignesMessage = _lignesMessageParPrefixe(
    section.message,
    messageCharsPerLine,
  )

  // Calculer la hauteur des infos
  const infoHeight = hasInfo
    ? INFO_TOP_MARGIN + infoLines * infoSize * INFO_LINE_HEIGHT
    : 0

  return {
    titleLength: section.title.length,
    messageLength: section.message.length,
    titleCharsPerLine,
    hauteur: (a, c) => {
      const titleLines =
        titleCharsPerLine > 0 ? Math.ceil(a / titleCharsPerLine) : 1
      const titleHeight =
        titleSize * TITLE_LINE_HEIGHT * titleLines + TITLE_BOTTOM_MARGIN
      const messageHeight =
        messageSize * MESSAGE_LINE_HEIGHT * lignesMessage[c] +
        MESSAGE_BOTTOM_MARGIN
      return titleHeight + messageHeight + infoHeight
    },
  }
}

/**
 * Lignes estimées du message pour chacun de ses débuts : `lignes[c]` vaut pour
 * les `c` premiers caractères. Estimation du fork (longueur moyenne des mots),
 * prise au MAXIMUM sur les débuts qui finissent sur un mot : croissante quand
 * on tape (voir l'en-tête). Les blancs finaux ne comptent pas (ils ne
 * s'affichent pas).
 */
function _lignesMessageParPrefixe(
  message: string,
  messageCharsPerLine: number,
): number[] {
  const lignes = new Array<number>(message.length + 1)
  lignes[0] = 1
  let mots = 0
  let retours = 0
  let dansUnMot = false
  let max = 1
  for (let i = 0; i < message.length; i++) {
    const ch = message[i]
    if (/\s/.test(ch)) {
      dansUnMot = false
      if (ch === '\n') retours++
    } else {
      if (!dansUnMot) mots++
      dansUnMot = true
      // Estimation basée sur les mots (fork), pour les i + 1 premiers caractères
      const avgWordLength = (i + 1) / mots
      const wordsPerLine = Math.max(
        1,
        Math.floor(messageCharsPerLine / (avgWordLength + 1)),
      )
      const estimation = Math.max(Math.ceil(mots / wordsPerLine), retours + 1)
      if (estimation > max) max = estimation
    }
    lignes[i + 1] = max
  }
  return lignes
}

/**
 * Plus petite longueur totale (titres + messages des sections) d'un début du
 * texte qui déborde de `limite`. Un début déborde dès qu'UNE section déborde :
 * les autres peuvent rester vides. `Infinity` si aucun ne déborde.
 */
function _longueurMinDebordement(
  modeles: ModeleSection[],
  limite: number,
): number {
  let best = Infinity
  for (const m of modeles) {
    // Le titre ne compte que par son nombre de lignes : seuls les débuts qui
    // ouvrent une ligne nouvelle sont à essayer.
    const debutsTitre = [0]
    if (m.titleCharsPerLine > 0) {
      for (let a = 1; a <= m.titleLength; a += m.titleCharsPerLine)
        debutsTitre.push(a)
    }
    for (const a of debutsTitre) {
      if (a >= best) break
      if (m.hauteur(a, m.messageLength) <= limite) continue
      // Plus petit début du message qui fait déborder (hauteur croissante).
      let lo = 0
      let hi = m.messageLength
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (m.hauteur(a, mid) > limite) hi = mid
        else lo = mid + 1
      }
      best = Math.min(best, a + lo)
    }
  }
  return best
}

/**
 * Taille d'icône pour une longueur totale de texte (barème du fork)
 */
function _iconePourLongueur(totalLength: number, numLanguages: number): number {
  // Adapter la taille de l'icône selon la quantité de contenu ET le contexte
  let iconSize = ICONE_PEU_DE_CONTENU // Beaucoup plus grand si très peu de contenu
  for (const p of PALIERS_ICONE) {
    if (totalLength > p.auDela) {
      iconSize = p.taille
      break
    }
  }

  // Ajustement selon le nombre de langues
  // Si une seule langue, on peut se permettre une icône plus grande
  if (numLanguages === 1) {
    iconSize = Math.round(iconSize * 1.15)
  }

  // Limites de sécurité
  return Math.min(Math.max(iconSize, 80), 180)
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
  const enLength = showEnglish ? titleEn.length + messageEn.length : 0

  // Calculer le nombre de langues actives
  const numLanguages = showEnglish ? 2 : 1

  return _iconePourLongueur(frLength + enLength, numLanguages)
}
