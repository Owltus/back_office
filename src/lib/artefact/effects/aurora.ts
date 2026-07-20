import type { EffectDefinition, EffectEnv, EffectRunner } from './types.ts'

/*
 * Aurore boréale — voiles ondulants sur ciel étoilé.
 *
 * Chaque voile est une rangée de colonnes verticales dont la HAUTEUR est un
 * bruit fractal bon marché : une somme de quatre sinus d'amplitudes
 * décroissantes (1, ½, ¼, ⅛) et de fréquences croissantes. C'est le principe du
 * fBm (mouvement brownien fractionnaire) sans la machinerie d'un vrai Perlin :
 * les basses fréquences donnent la grande respiration du rideau, les hautes le
 * grain de ses plis.
 *
 * Le détail qui fait tout : les fréquences sont dans un rapport ~2,13 et non 2.
 * Avec des octaves exactes, tous les sinus se réalignent périodiquement et l'œil
 * repère aussitôt le motif qui se répète. Un rapport légèrement irrationnel rend
 * la somme quasi non périodique — le rideau ne se répète jamais à l'échelle de
 * l'animation. Même raisonnement sur les vitesses de défilement, toutes
 * différentes, pour que les couches glissent les unes SUR les autres.
 *
 * Les dégradés sont créés UNE fois, en coordonnées écran absolues, et réutilisés
 * pour toutes les colonnes de toutes les images. Conséquence heureuse : la
 * couleur ne dépend pas de la colonne mais de l'ALTITUDE — exactement le
 * comportement d'une vraie aurore (l'oxygène émet vert en bas, l'azote violet en
 * haut). Un dégradé par colonne serait à la fois plus lent et moins juste.
 */

const DURATION = 8000
const FADE_IN_MS = 1000
const FADE_OUT_MS = 1800

const COLUMN_W = 7
const VEILS = 4
const OCTAVES = 4
// Rapport de fréquence entre deux octaves. Volontairement PAS 2.
const LACUNARITY = 2.13
const STARS = 110

interface Wave {
  freq: number
  speed: number
  amp: number
  phase: number
}

interface Veil {
  cx: number
  half: number
  cols: number
  baseY: number
  amp: number
  ampSum: number
  waves: Wave[]
  driftAmp: number
  driftSpeed: number
  driftPhase: number
  alpha: number
  body: CanvasGradient
  ray: CanvasGradient
  /** Hauteurs de l'image en cours, réutilisées par la passe des rais. */
  heights: Float32Array
}

interface Star {
  x: number
  y: number
  r: number
  base: number
  phase: number
  speed: number
}

const rand = (min: number, max: number) => min + Math.random() * (max - min)

function create({ ctx, width, height }: EffectEnv): EffectRunner {
  const veils: Veil[] = Array.from({ length: VEILS }, (_, i) => {
    // Voiles étalés sur la largeur, avec un peu de jeu : alignés, ils se
    // superposeraient en une seule masse au lieu de se croiser.
    const cx = width * (0.16 + i * 0.23) + rand(-0.05, 0.05) * width
    const half = width * rand(0.17, 0.3)
    const baseY = height * rand(0.76, 0.94)
    const amp = height * rand(0.44, 0.72)
    const topY = baseY - amp

    const f0 = rand(0.009, 0.016)
    const s0 = rand(0.00012, 0.00022)
    const waves: Wave[] = []
    let ampSum = 0
    for (let k = 0; k < OCTAVES; k++) {
      const a = 1 / 2 ** k
      ampSum += a
      waves.push({
        freq: f0 * LACUNARITY ** k,
        // Chaque octave défile plus vite ET dans un sens alterné : c'est ce
        // cisaillement entre couches qui donne l'ondulation vivante plutôt
        // qu'un rideau qui glisse d'un bloc.
        speed: s0 * (1 + k * 0.7) * (k % 2 === 0 ? 1 : -1),
        amp: a,
        phase: Math.random() * Math.PI * 2,
      })
    }

    /*
     * Dégradé du corps, du haut du rideau (0) vers sa base (1) : violet ténu au
     * sommet, cyan à mi-hauteur, vert dense en bas. Transparent aux DEUX
     * extrémités pour qu'aucune arête franche ne trahisse le rectangle.
     */
    const body = ctx.createLinearGradient(0, topY, 0, baseY)
    body.addColorStop(0, 'rgba(138, 72, 255, 0)')
    body.addColorStop(0.15, 'rgba(150, 84, 255, 0.15)')
    body.addColorStop(0.4, 'rgba(74, 194, 255, 0.2)')
    body.addColorStop(0.71, 'rgba(52, 242, 168, 0.28)')
    body.addColorStop(0.93, 'rgba(44, 255, 182, 0.1)')
    body.addColorStop(1, 'rgba(44, 255, 182, 0)')

    // Dégradé des rais : filets plus clairs et plus hauts, tirés une colonne sur
    // trois. Ce sont eux qui donnent la striation verticale caractéristique.
    const ray = ctx.createLinearGradient(0, topY, 0, baseY)
    ray.addColorStop(0, 'rgba(190, 160, 255, 0)')
    ray.addColorStop(0.3, 'rgba(180, 220, 255, 0.1)')
    ray.addColorStop(0.75, 'rgba(216, 255, 236, 0.16)')
    ray.addColorStop(1, 'rgba(216, 255, 236, 0)')

    const cols = Math.ceil((half * 2) / COLUMN_W)

    return {
      cx,
      half,
      cols,
      baseY,
      amp,
      ampSum,
      waves,
      driftAmp: width * rand(0.03, 0.08),
      driftSpeed: rand(0.00008, 0.00016),
      driftPhase: Math.random() * Math.PI * 2,
      alpha: rand(0.62, 1),
      body,
      ray,
      heights: new Float32Array(cols),
    }
  })

  const stars: Star[] = Array.from({ length: STARS }, () => ({
    x: Math.random() * width,
    // Cantonnées à la moitié haute : sous l'horizon des voiles, elles
    // brouilleraient la lecture du rideau.
    y: Math.random() * height * 0.62,
    r: rand(0.4, 1.35),
    base: rand(0.22, 0.72),
    phase: Math.random() * Math.PI * 2,
    speed: rand(0.0006, 0.0021),
  }))

  // Horloge PROPRE à l'effet, distincte d'`elapsed` : elle avance au rythme
  // qu'on lui impose, ce qui permet de ralentir l'aurore pendant qu'elle
  // s'éteint (une extinction à vitesse constante coupe l'hypnose net).
  let time = 0

  return {
    frame(elapsed, dt) {
      // Tout est recalculé depuis la géométrie à chaque image : pas de traînée à
      // conserver ici, donc effacement franc.
      ctx.clearRect(0, 0, width, height)

      const fadeIn = Math.min(elapsed / FADE_IN_MS, 1)
      const fadeOut = Math.min(Math.max(DURATION - elapsed, 0) / FADE_OUT_MS, 1)
      const env = fadeIn * fadeOut
      time += dt * (0.4 + 0.6 * fadeOut)

      ctx.globalCompositeOperation = 'source-over'
      for (const s of stars) {
        // Scintillement : sinus décalé par étoile, ramené dans [0,1]. Toutes
        // pulsent, aucune en même temps.
        const twinkle = 0.55 + 0.45 * Math.sin(time * s.speed + s.phase)
        ctx.fillStyle = `rgba(224, 234, 255, ${s.base * twinkle * env})`
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
        ctx.fill()
      }

      // `lighter` : là où deux voiles se croisent, les luminances s'ADDITIONNENT
      // au lieu de se masquer. Ce sont ces surbrillances de recouvrement qui
      // font lire l'aurore comme de la lumière et non comme de la peinture.
      ctx.globalCompositeOperation = 'lighter'

      for (const veil of veils) {
        const left =
          veil.cx -
          veil.half +
          veil.driftAmp * Math.sin(time * veil.driftSpeed + veil.driftPhase)

        ctx.globalAlpha = veil.alpha * env

        // Deux passes, deux `fill()` seulement : toutes les colonnes d'une passe
        // partagent le même chemin ET le même dégradé. Un fill par colonne
        // coûterait quelques centaines d'appels par image pour rien.
        ctx.fillStyle = veil.body
        ctx.beginPath()
        const heights = veil.heights
        for (let k = 0; k < veil.cols; k++) {
          const local = k * COLUMN_W
          let sum = 0
          for (const wv of veil.waves) {
            sum +=
              wv.amp * Math.sin(local * wv.freq + time * wv.speed + wv.phase)
          }
          // Somme dans [-ampSum, +ampSum] ramenée dans [0,1].
          const t = 0.5 + 0.5 * (sum / veil.ampSum)
          // Enveloppe en demi-sinus : la hauteur s'annule aux deux bords du
          // voile. C'est ce qui remplace un dégradé horizontal de transparence —
          // même effet de fondu latéral, mais compatible avec le fill unique.
          const u = veil.cols > 1 ? k / (veil.cols - 1) : 0.5
          const shape = Math.sin(Math.PI * u) ** 0.65
          const h = veil.amp * (0.3 + 0.7 * t) * shape
          heights[k] = h
          ctx.rect(left + local, veil.baseY - h, COLUMN_W + 1, h)
        }
        ctx.fill()

        ctx.fillStyle = veil.ray
        ctx.beginPath()
        for (let k = 1; k < veil.cols; k += 3) {
          // Les rais dépassent légèrement le corps : le rideau semble s'effiler
          // vers le haut au lieu de s'arrêter sur une ligne nette.
          const h = heights[k] * 1.16
          ctx.rect(left + k * COLUMN_W + 2, veil.baseY - h, 1.8, h)
        }
        ctx.fill()
      }

      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
      return elapsed < DURATION
    },
  }
}

export const auroraEffect: EffectDefinition = {
  id: 'aurora',
  label: 'Aurore',
  hint: 'Voiles boréaux ondulants, ciel étoilé',
  durationMs: DURATION,
  create,
}
