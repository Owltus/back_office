import type { EffectDefinition, EffectEnv, EffectRunner } from './types.ts'

/*
 * Pluie de glyphes — hommage à Matrix.
 *
 * Une colonne par tranche de `COLUMN_WIDTH` pixels, chacune avec sa propre
 * vitesse et sa position de tête. À chaque image on ne redessine QUE la tête et
 * quelques glyphes de traîne : le reste de l'image précédente est estompé par un
 * voile noir semi-transparent, ce qui produit la décroissance verte
 * caractéristique sans avoir à mémoriser toute la colonne.
 *
 * La tête est blanche et vive, les glyphes suivants virent au vert et
 * s'assombrissent — c'est ce dégradé, plus que les caractères eux-mêmes, qui
 * fait lire l'effet.
 */

const COLUMN_WIDTH = 16
const FONT_SIZE = 15
// Katakana demi-chasse + chiffres : le jeu de caractères d'origine.
const GLYPHS = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789'
const TRAIL = 8
const FADE_MS = 900

const glyph = () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)]

interface Column {
  y: number
  speed: number
  /** Glyphes de la traîne, du plus récent au plus ancien. */
  trail: string[]
}

function create({ ctx, width, height }: EffectEnv): EffectRunner {
  const count = Math.ceil(width / COLUMN_WIDTH)
  const columns: Column[] = Array.from({ length: count }, () => ({
    // Départs échelonnés au-dessus de l'écran : la pluie s'installe au lieu de
    // tomber d'un bloc.
    y: -Math.random() * height,
    speed: 0.18 + Math.random() * 0.42,
    trail: Array.from({ length: TRAIL }, glyph),
  }))

  ctx.font = `${FONT_SIZE}px "Courier New", monospace`
  ctx.textBaseline = 'top'

  return {
    frame(elapsed, dt) {
      // Voile d'estompage — c'est lui qui crée la traîne.
      ctx.globalCompositeOperation = 'source-over'
      ctx.fillStyle = 'rgba(2, 8, 4, 0.14)'
      ctx.fillRect(0, 0, width, height)

      // Fondu de sortie sur la dernière seconde.
      const remaining = DURATION - elapsed
      const alpha = remaining < FADE_MS ? Math.max(remaining / FADE_MS, 0) : 1

      for (let i = 0; i < columns.length; i++) {
        const col = columns[i]
        const x = i * COLUMN_WIDTH

        col.y += col.speed * dt
        // Un glyphe change à chaque descente d'une ligne : le grésillement.
        if (Math.random() < 0.06) {
          col.trail.pop()
          col.trail.unshift(glyph())
        }

        for (let t = 0; t < col.trail.length; t++) {
          const y = col.y - t * FONT_SIZE
          if (y < -FONT_SIZE || y > height) continue
          if (t === 0) {
            ctx.fillStyle = `rgba(220, 255, 230, ${alpha})`
          } else {
            // Vert qui s'éteint avec la distance à la tête.
            const l = 70 - (t / TRAIL) * 45
            ctx.fillStyle = `hsla(140, 90%, ${l}%, ${alpha * (1 - t / TRAIL)})`
          }
          ctx.fillText(col.trail[t], x, y)
        }

        // Recyclage une fois la colonne entièrement sortie par le bas.
        if (col.y - TRAIL * FONT_SIZE > height) {
          col.y = -Math.random() * 200
          col.speed = 0.18 + Math.random() * 0.42
        }
      }

      return elapsed < DURATION
    },
  }
}

const DURATION = 6500

export const matrixEffect: EffectDefinition = {
  id: 'matrix',
  label: 'Matrix',
  hint: 'Pluie de glyphes katakana, traîne verte',
  durationMs: DURATION,
  create,
}
