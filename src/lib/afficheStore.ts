import { Store } from '@tanstack/store'

import type { PosterContent } from '#/lib/poster/types.ts'
import type { AfficheTemplate } from '#/lib/affiche/model.ts'

/* Store module-level : l'état de saisie de l'affiche survit à la navigation
 * (le composant peut se démonter/remonter sans perdre la saisie en cours).
 * En mémoire uniquement — réinitialisé à un rechargement complet de la page.
 * Calqué sur src/lib/pdjStore.ts : singleton Store + actions exportées.
 *
 * Les modèles sont désormais chargés depuis Supabase (table `affiche_templates`),
 * plus depuis une collection en dur. L'état initial est donc NEUTRE (affiche
 * vierge) ; le board applique le premier modèle chargé si la saisie est encore
 * pristine (voir AffichageBoard). */

/** État complet et sérialisable de l'affiche en cours de saisie :
 * le contenu canonique (PosterContent) + les champs propres au store. */
export interface AfficheState extends PosterContent {
  /** Id du modèle sélectionné ('' dès que le contenu a divergé du modèle). */
  selectedTemplate: string
}

/** État initial neutre : affiche vierge, thème OKKO, mode auto. Aucune lecture
 * synchrone d'une collection en dur (les modèles sont asynchrones désormais). */
function buildInitialState(): AfficheState {
  return {
    titleFr: '',
    messageFr: '',
    titleEn: '',
    messageEn: '',
    selectedIcon: 'none',
    colorKey: 'okko',
    selectedTemplate: '',
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
    // Espacement intra-section par défaut (titre / message / dates), mode manuel
    // uniquement. 25 = valeur du CSS en auto → pas de saut à la bascule.
    gap: 25,
  }
}

export const afficheStore = new Store<AfficheState>(buildInitialState())

/** Met à jour un ou plusieurs champs de l'état de l'affiche. */
export function setAffiche(patch: Partial<AfficheState>) {
  afficheStore.setState((s) => ({ ...s, ...patch }))
}

/**
 * Applique un modèle : réinjecte l'ÉTAT COMPLET de l'affiche (textes, icône,
 * couleur, dates/heures, mode taille + tailles perso + espacement) et mémorise
 * l'id du modèle sélectionné. Reçoit un modèle DÉJÀ RÉSOLU. En mode auto, les
 * tailles restockées sont ignorées à l'affichage (recalcul dérivé) mais servent
 * de base au passage en manuel.
 */
export function applyAfficheTemplate(t: AfficheTemplate) {
  setAffiche({
    titleFr: t.titleFr,
    messageFr: t.messageFr,
    titleEn: t.titleEn,
    messageEn: t.messageEn,
    selectedIcon: t.selectedIcon,
    colorKey: t.colorKey,
    dateStart: t.dateStart,
    dateEnd: t.dateEnd,
    timeStart: t.timeStart,
    timeEnd: t.timeEnd,
    isAutoSizeMode: t.isAutoSizeMode,
    fontSizeIcon: t.fontSizeIcon,
    fontSizeTitle: t.fontSizeTitle,
    fontSizeMessage: t.fontSizeMessage,
    fontSizeInfo: t.fontSizeInfo,
    gap: t.gap,
    selectedTemplate: t.id,
  })
}

/** Réinitialise l'état à l'état neutre (affiche vierge). */
export function resetAffiche() {
  afficheStore.setState(() => buildInitialState())
}
