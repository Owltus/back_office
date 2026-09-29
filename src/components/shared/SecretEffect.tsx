import { useEffect, useRef } from 'react'

import { useEffectTrigger } from './EffectOverlay.tsx'

import type { EffectDefinition } from '#/lib/artefact/effects/types.ts'
import {
  creerDetecteur,
  estChampSecret,
  estChampTexte,
} from '#/lib/easter-eggs/detecteur.ts'

/*
 * Easter egg clavier générique — taper un MOT-CLÉ (n'importe où, à la Konami)
 * déclenche un effet visuel plein écran. Généralise l'ancien `SecretFireworks` :
 * le mot ET l'effet arrivent en props, l'animation étant un `EffectDefinition`
 * joué par le moteur commun `EffectOverlay`.
 *
 * - Détecteur de séquence : buffer glissant des dernières frappes, insensible à
 *   la casse ET aux accents (« chloé » comme « chloe » marchent).
 * - PARTOUT, champs de saisie compris (demande utilisateur du 2026-09-29),
 *   SAUF les champs de mot de passe : voir `lib/easter-eggs/detecteur.ts`.
 * - L'overlay est en `pointer-events: none` : il n'intercepte JAMAIS clics ni
 *   saisie — d'où le « n'importe où » sans rien casser.
 * - SSR-safe : l'écouteur clavier est posé côté client dans un effet ; rien n'est
 *   rendu tant qu'aucun effet n'est armé.
 */

interface SecretEffectProps {
  /** Mot déclencheur, tel qu'on le tape (casse et accents ignorés). */
  keyword: string
  /**
   * Charge l'effet — il n'est téléchargé QU'AU déclenchement (audit du
   * 2026-09-21). Recevoir un `EffectDefinition` tout fait obligeait l'appelant à
   * importer les quatorze animations dans le chunk d'entrée ; recevoir une
   * fonction de chargement ne coûte rien tant que personne ne tape le mot.
   */
  load: () => Promise<EffectDefinition>
}

export function SecretEffect({ keyword, load }: SecretEffectProps) {
  const { trigger, overlay } = useEffectTrigger()
  // `trigger` n'est pas mémoïsé (nouvelle fonction à chaque rendu) : on le lit
  // par une ref pour n'attacher l'écouteur clavier qu'UNE seule fois.
  const triggerRef = useRef(trigger)
  triggerRef.current = trigger
  // Idem pour le chargeur : il change d'identité à chaque rendu du parent, et
  // l'écouteur clavier ne doit pas être réattaché pour autant.
  const loadRef = useRef(load)
  loadRef.current = load

  useEffect(() => {
    const detecteur = creerDetecteur(keyword)
    if (!detecteur.actif) return
    const declencher = () => {
      // Premier déclenchement = un aller-retour réseau pour le chunk de
      // l'effet ; les suivants sont instantanés (module mis en cache par le
      // navigateur). Un échec de chargement ne doit jamais casser la page :
      // l'easter egg ne se déclenche simplement pas.
      void loadRef.current().then(
        (effect) => triggerRef.current(effect),
        () => {},
      )
    }

    // Hors champ : la touche. Dans un champ de texte, c'est `beforeinput`
    // qui lit (jamais les deux pour une même frappe).
    function onKeyDown(e: KeyboardEvent) {
      if (e.isComposing) return
      const el = e.target instanceof Element ? e.target : null
      if (estChampSecret(el)) {
        detecteur.vider()
        return
      }
      if (estChampTexte(el) || e.key.length !== 1) return
      if (e.ctrlKey || e.metaKey || e.altKey) return // raccourcis
      if (detecteur.ajouter(e.key)) declencher()
    }

    // Dans un champ : le TEXTE inséré — clavier physique comme virtuel
    // (téléphone), lettres accentuées comprises. Coller n'en fait pas partie.
    function onBeforeInput(e: Event) {
      const el = e.target instanceof Element ? e.target : null
      if (estChampSecret(el)) {
        detecteur.vider()
        return
      }
      if (!estChampTexte(el)) return
      const saisie = e as InputEvent
      if (
        saisie.inputType !== 'insertText' &&
        saisie.inputType !== 'insertCompositionText'
      )
        return
      if (saisie.data !== null && detecteur.ajouter(saisie.data)) declencher()
    }

    // Phase de CAPTURE : un composant qui arrête la propagation (éditeur,
    // glisser-déposer, dialogue) ne peut pas masquer la frappe.
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('beforeinput', onBeforeInput, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('beforeinput', onBeforeInput, true)
    }
  }, [keyword])

  return overlay
}
