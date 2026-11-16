import { useEffect, useRef } from 'react'

import { useEffectTrigger } from './EffectOverlay.tsx'

import type { EffectDefinition } from '#/lib/artefact/effects/types.ts'
import {
  DELAI_FIN_DE_MOT_MS,
  continueUnMot,
  creerDetecteur,
  estChampSecret,
  estChampTexte,
  normaliser,
} from '#/lib/easter-eggs/detecteur.ts'

/*
 * Easter eggs clavier — taper un MOT-CLÉ (n'importe où, à la Konami) déclenche
 * un effet visuel plein écran, joué par le moteur commun `EffectOverlay`.
 *
 * UN SEUL écouteur pour TOUS les mots-clés (refonte du 2026-11-16) : une
 * mémoire commune, un mot-clé n'est reconnu que tapé comme un mot entier
 * (voir `lib/easter-eggs/detecteur.ts`). Avant, un composant par mot-clé
 * gardait sa propre mémoire, et la fin d'un mot-clé en déclenchait un autre.
 *
 * - PARTOUT, champs de saisie compris (demande utilisateur du 2026-09-29),
 *   SAUF les champs de mot de passe.
 * - L'overlay est en `pointer-events: none` : il n'intercepte JAMAIS clics ni
 *   saisie.
 * - SSR-safe : les écouteurs sont posés côté client dans un effet.
 */

export interface MotCleSecret {
  /** Mot déclencheur, tel qu'on le tape (casse et accents ignorés). */
  keyword: string
  /**
   * Charge l'effet — il n'est téléchargé QU'AU déclenchement (audit du
   * 2026-09-21) : les animations ne pèsent rien tant que personne ne tape.
   */
  load: () => Promise<EffectDefinition>
}

/** Lettre ou chiffre juste avant et juste après le curseur d'un champ. */
function voisinsDuCurseur(el: Element | null): {
  avant: boolean
  apres: boolean
} {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement))
    return { avant: false, apres: false }
  try {
    const debut = el.selectionStart
    const fin = el.selectionEnd
    if (debut === null || fin === null) return { avant: false, apres: false }
    return {
      avant: continueUnMot(el.value[debut - 1]),
      apres: continueUnMot(el.value[fin]),
    }
  } catch {
    // Champ sans curseur lisible (type email) : rien à dire.
    return { avant: false, apres: false }
  }
}

export function SecretEffect({ motsCles }: { motsCles: MotCleSecret[] }) {
  const { trigger, overlay } = useEffectTrigger()
  // `trigger` et les chargeurs changent d'identité à chaque rendu : lus par
  // ref pour ne poser les écouteurs qu'une fois par liste de mots.
  const triggerRef = useRef(trigger)
  triggerRef.current = trigger
  const motsRef = useRef(motsCles)
  motsRef.current = motsCles

  // La liste ne compte que par ses mots (normalisés), pas par l'identité du
  // tableau, recréé à chaque rendu du parent.
  const cle = motsCles.map((m) => normaliser(m.keyword)).join('|')

  useEffect(() => {
    const detecteur = creerDetecteur(cle.split('|'))
    if (!detecteur.actif) return
    let minuterie: number | undefined

    function declencher(motCle: string | null) {
      if (motCle === null) return
      const egg = motsRef.current.find((m) => normaliser(m.keyword) === motCle)
      if (!egg) return
      // Premier déclenchement = un aller-retour réseau pour le chunk de
      // l'effet ; un échec ne casse jamais la page, l'effet ne part pas.
      void egg.load().then(
        (effect) => triggerRef.current(effect),
        () => {},
      )
    }

    /** Après chaque frappe : un mot-clé complet part après une courte pause. */
    function armer() {
      window.clearTimeout(minuterie)
      if (!detecteur.enAttente()) return
      minuterie = window.setTimeout(
        () => declencher(detecteur.finirMot()),
        DELAI_FIN_DE_MOT_MS,
      )
    }

    function vider() {
      window.clearTimeout(minuterie)
      detecteur.vider()
    }

    function finirMot() {
      window.clearTimeout(minuterie)
      declencher(detecteur.finirMot())
    }

    // Hors champ : la touche. Dans un champ de texte, c'est `beforeinput`
    // qui lit les caractères (jamais les deux pour une même frappe).
    function onKeyDown(e: KeyboardEvent) {
      if (e.isComposing) return
      const el = e.target instanceof Element ? e.target : null
      if (estChampSecret(el)) return vider()
      if (e.key === 'Enter' || e.key === 'Tab') return finirMot()
      if (e.ctrlKey || e.metaKey || e.altKey) return // raccourcis
      if (e.key.length !== 1) {
        // Effacement, flèches, Échap… : le mot n'est plus celui qu'on a lu.
        // Une touche sans nom (clavier virtuel) ou Maj ne change rien.
        if (!['Unidentified', 'Shift', 'CapsLock', 'Dead'].includes(e.key))
          vider()
        return
      }
      if (estChampTexte(el)) return
      declencher(detecteur.ajouter(e.key))
      armer()
    }

    // Dans un champ : le TEXTE inséré — clavier physique comme virtuel
    // (téléphone), lettres accentuées comprises.
    function onBeforeInput(e: Event) {
      const el = e.target instanceof Element ? e.target : null
      if (estChampSecret(el)) return vider()
      if (!estChampTexte(el)) return
      const saisie = e as InputEvent
      const type = saisie.inputType
      if (type === 'insertParagraph' || type === 'insertLineBreak')
        return finirMot()
      if (
        (type !== 'insertText' && type !== 'insertCompositionText') ||
        saisie.data === null
      )
        // Effacement, collage, dépôt, annulation : on oublie le mot.
        return vider()
      const { avant, apres } = voisinsDuCurseur(el)
      if (type === 'insertCompositionText') {
        declencher(detecteur.composer(saisie.data))
      } else {
        // Frappe collée à des lettres déjà là : ce n'est pas un mot entier.
        if (avant && detecteur.vide()) detecteur.marquerColle()
        declencher(detecteur.ajouter(saisie.data))
      }
      if (apres) detecteur.marquerColle()
      armer()
    }

    // Un clic ou un changement de champ termine le mot en cours.
    function onPointerDown() {
      finirMot()
    }

    // Phase de CAPTURE : un composant qui arrête la propagation (éditeur,
    // glisser-déposer, dialogue) ne peut pas masquer la frappe.
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('beforeinput', onBeforeInput, true)
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('focusin', onPointerDown, true)
    return () => {
      window.clearTimeout(minuterie)
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('beforeinput', onBeforeInput, true)
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('focusin', onPointerDown, true)
    }
  }, [cle])

  return overlay
}
