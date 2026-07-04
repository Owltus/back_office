import { Store } from '@tanstack/store'

import type { ColorKey } from '#/lib/poster/config.ts'
import { getTemplate, getTemplatesList } from '#/lib/poster/templates.ts'

/* Store module-level : l'état de saisie de l'affiche survit à la navigation
 * (le composant peut se démonter/remonter sans perdre la saisie en cours).
 * En mémoire uniquement — réinitialisé à un rechargement complet de la page.
 * Calqué sur src/lib/pdjStore.ts : singleton Store + actions exportées. */

/** État complet et sérialisable de l'affiche en cours de saisie. */
export interface AfficheState {
  // Contenu textuel
  titleFr: string
  messageFr: string
  titleEn: string
  messageEn: string
  // Apparence
  selectedIcon: string
  colorKey: ColorKey
  selectedTemplate: string
  // Dates / horaires (formats natifs des inputs)
  dateStart: string // 'YYYY-MM-DD'
  dateEnd: string // 'YYYY-MM-DD'
  timeStart: string // 'HH:MM'
  timeEnd: string // 'HH:MM'
  // Tailles
  isAutoSizeMode: boolean
  fontSizeIcon: number
  fontSizeTitle: number
  fontSizeMessage: number
  fontSizeInfo: number
}

// L'app ne démarre jamais vide : état initial = contenu du PREMIER template
// (getTemplatesList()[0] = coffee_broken), couleur 'okko', mode auto activé.
const firstKey = getTemplatesList()[0].key
const firstTemplate = getTemplate(firstKey)

function buildInitialState(): AfficheState {
  return {
    titleFr: firstTemplate?.titleFr ?? '',
    messageFr: firstTemplate?.messageFr ?? '',
    titleEn: firstTemplate?.titleEn ?? '',
    messageEn: firstTemplate?.messageEn ?? '',
    selectedIcon: firstTemplate?.icon ?? 'none',
    colorKey: firstTemplate?.color ?? 'okko',
    selectedTemplate: firstKey,
    dateStart: '',
    dateEnd: '',
    timeStart: '',
    timeEnd: '',
    isAutoSizeMode: true,
    // Tailles par défaut (mode manuel) — reprises du fork.
    fontSizeIcon: 140,
    fontSizeTitle: 56,
    fontSizeMessage: 26,
    fontSizeInfo: 18,
  }
}

export const afficheStore = new Store<AfficheState>(buildInitialState())

/** Met à jour un ou plusieurs champs de l'état de l'affiche. */
export function setAffiche(patch: Partial<AfficheState>) {
  afficheStore.setState((s) => ({ ...s, ...patch }))
}

/**
 * Applique un template : remplace les 4 textes + icône + couleur et mémorise
 * la clé du template sélectionné. Le recalcul des tailles est piloté par le
 * composant (effet mode auto), comme dans le fork (applyTemplate + updateSizeMode).
 */
export function applyAfficheTemplate(key: string) {
  const template = getTemplate(key)
  if (!template) return
  setAffiche({
    titleFr: template.titleFr,
    messageFr: template.messageFr,
    titleEn: template.titleEn,
    messageEn: template.messageEn,
    selectedIcon: template.icon,
    colorKey: template.color,
    selectedTemplate: key,
  })
}

/** Réinitialise l'état à celui du premier template. */
export function resetAffiche() {
  afficheStore.setState(() => buildInitialState())
}
