/*
 * Contrat commun des effets visuels de la page Artefact.
 *
 * Un effet est du MÉTIER PUR : il ne connaît ni React ni Tailwind, il reçoit un
 * contexte 2D et dessine. Toute la mécanique commune (création du canvas,
 * densité de pixels, boucle d'animation, nettoyage, arrêt d'urgence) vit dans
 * `components/artefact/EffectOverlay.tsx` — un effet n'a donc qu'à décrire ce
 * qu'il peint image par image.
 *
 * Le canvas est superposé à la page en `pointer-events: none` : un effet
 * n'intercepte jamais un clic. C'est le même principe que les easter eggs
 * clavier (`components/shared/SecretEffect.tsx`), qui rejouent ces définitions.
 *
 * L'EFFACEMENT EST À LA CHARGE DE L'EFFET : certains veulent un fond net à
 * chaque image, d'autres vivent de leurs traînées (`destination-out` avec un
 * alpha faible). L'overlay ne présume rien et n'efface jamais à leur place.
 */

/** Surface de dessin. Dimensions en pixels CSS, pas en pixels physiques. */
export interface EffectEnv {
  ctx: CanvasRenderingContext2D
  width: number
  height: number
}

/** Instance vivante d'un effet, créée à chaque déclenchement. */
export interface EffectRunner {
  /**
   * Dessine une image.
   * @param elapsed millisecondes écoulées depuis le déclenchement
   * @param dt millisecondes depuis l'image précédente, borné pour survivre à un
   *           changement d'onglet (sinon un `dt` de plusieurs secondes ferait
   *           exploser toutes les intégrations de vitesse)
   * @returns `false` quand il n'y a plus rien à animer — l'overlay se démonte
   */
  frame: (elapsed: number, dt: number) => boolean
}

export interface EffectDefinition {
  /** Identifiant stable, sert de clé React et de nom de bouton. */
  id: string
  /** Nom affiché sur le bouton. */
  label: string
  /** Une ligne : ce que ça fait, montré sous le bouton. */
  hint: string
  /** Durée indicative en ms. L'overlay coupe au-delà, quoi qu'il arrive. */
  durationMs: number
  create: (env: EffectEnv) => EffectRunner
}
