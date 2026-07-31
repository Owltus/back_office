/*
 * Contrat commun des effets visuels de la page Artefact.
 *
 * Un effet est du MÉTIER PUR : il ne connaît ni React ni Tailwind, il reçoit une
 * surface de dessin et dessine. Toute la mécanique commune (création du canvas,
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
 *
 * DEUX MODES DE RENDU. La grande majorité des effets sont « 2d » (mode par
 * défaut) : ils reçoivent un `CanvasRenderingContext2D`. Un effet peut aussi être
 * « webgl » (ex. une scène three.js) : l'overlay ne prend alors PAS de contexte 2D
 * et lui passe le `<canvas>` BRUT — l'effet crée son propre renderer WebGL. Un
 * canvas ne pouvant avoir qu'un type de contexte à vie, c'est le champ `mode` qui
 * décide, lu par l'overlay AVANT tout `getContext`.
 */

/** Surface de dessin 2D. Dimensions en pixels CSS, pas en pixels physiques. */
export interface EffectEnv {
  ctx: CanvasRenderingContext2D
  width: number
  height: number
}

/** Surface WebGL : l'effet reçoit le `<canvas>` brut (l'overlay n'a pas pris de
 * contexte 2D dessus) et crée lui-même son WebGLRenderer. Dimensions en pixels CSS. */
export interface WebglEffectEnv {
  canvas: HTMLCanvasElement
  width: number
  height: number
  /** Densité de pixels déjà plafonnée par l'overlay (à passer à `setPixelRatio`). */
  dpr: number
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
  /**
   * Libère les ressources lourdes (renderer WebGL, monde physique, écouteurs).
   * Appelé une seule fois par l'overlay, à l'arrêt / au démontage. Inutile pour les
   * effets 2D (leurs canvas offscreen sont ramassés par le GC).
   */
  destroy?: () => void
}

/** Métadonnées communes à tous les effets (id / libellés / durée). */
interface EffectMeta {
  /** Identifiant stable, sert de clé React et de nom de bouton. */
  id: string
  /** Nom affiché sur le bouton. */
  label: string
  /** Une ligne : ce que ça fait, montré sous le bouton. */
  hint: string
  /** Durée indicative en ms. L'overlay coupe au-delà, quoi qu'il arrive. */
  durationMs: number
}

/** Effet 2D historique — mode implicite (`mode` absent = `'2d'`). */
export interface Canvas2DEffect extends EffectMeta {
  mode?: '2d'
  create: (env: EffectEnv) => EffectRunner
}

/** Effet WebGL (three.js) — reçoit le canvas brut. */
export interface WebglEffect extends EffectMeta {
  mode: 'webgl'
  create: (env: WebglEffectEnv) => EffectRunner
}

export type EffectDefinition = Canvas2DEffect | WebglEffect
