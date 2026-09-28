import {
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'

/*
 * Capteurs de glisser-déposer du Classeur, SÉPARÉS souris / doigt (audit
 * tactile du 2026-09-28 ; demande utilisateur : « sur téléphone, quand je
 * fais défiler un chapitre, j'attrape un document au lieu de défiler »).
 *
 * Avant : un seul `PointerSensor` à 5 px, qui capte aussi le doigt, et
 * `touch-action: none` sur les cartes entières → tout balayage partant d'une
 * carte démarrait un glisser. Désormais :
 *   - souris : inchangée, glisser dès 5 px ;
 *   - doigt : APPUI LONG (250 ms) avant de glisser ; un doigt qui bouge de
 *     plus de 8 px pendant l'attente annule, et le navigateur fait défiler.
 *     Les cartes portent `touch-action: manipulation` (défilement permis).
 *
 * ⚠ Les boutons posés DANS une carte glissable arrêtent `onMouseDown` et
 * `onTouchStart` (plus `onPointerDown` : ces capteurs ne l'écoutent pas).
 */
export function useCapteursClasseur() {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )
}

/**
 * À poser sur un bouton ou une zone cliquable DANS une carte glissable :
 * le geste ne démarre pas de glisser.
 */
export const neDemarrePasDeGlisser = {
  onMouseDown: (e: { stopPropagation: () => void }) => e.stopPropagation(),
  onTouchStart: (e: { stopPropagation: () => void }) => e.stopPropagation(),
}

/** Classes d'une carte glissable : défilement au doigt permis, pas de loupe iOS. */
export const CLASSES_CARTE_GLISSABLE =
  'touch-manipulation select-none [-webkit-touch-callout:none]'
