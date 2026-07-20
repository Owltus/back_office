import type { EffectDefinition, EffectEnv, EffectRunner } from './types.ts'

/*
 * Vortex galactique — enroulement différentiel.
 *
 * Les bras ne sont pas dessinés, ils se FORMENT. Les particules partent posées
 * sur quelques spirales à peine marquées, et c'est la rotation képlérienne —
 * la vitesse angulaire décroît comme r^(-3/2), donc l'intérieur tourne
 * beaucoup plus vite que l'extérieur — qui resserre progressivement ces bras
 * sur eux-mêmes. Aucune trajectoire n'est scriptée : on ne pose que la loi de
 * vitesse, la figure en découle.
 *
 * C'est le fameux « problème de l'enroulement » de l'astrophysique : appliqué à
 * une vraie galaxie, ce mécanisme boucle les bras en quelques rotations, bien
 * trop vite pour ce qu'on observe au télescope (d'où la théorie des ondes de
 * densité, où les bras sont un embouteillage et non un objet matériel). Ce qui
 * est un défaut du modèle est ici exactement l'effet recherché : en sept
 * secondes, la structure passe de bras nets à tourbillon.
 *
 * Le rendu ne mémorise AUCUNE trajectoire. Chaque particule ne pose qu'un point
 * par image ; les filaments sont la rémanence du canvas, effacé d'un cran à
 * chaque image (`destination-out` à alpha faible). Le voile joue donc le rôle
 * d'une constante de temps : plus il est léger, plus les traînées sont longues.
 *
 * Les alphas sont minuscules parce que le rendu est additif (`lighter`) : la
 * lumière s'accumule là où les bras se croisent et où les points se superposent.
 * Les particules du bord sont plus GROSSES mais plus pâles, celles du cœur plus
 * petites mais plus chaudes — sans quoi le centre, où la densité explose,
 * saturerait en une tache blanche informe.
 */

const DURATION = 7500
const COUNT = 560
const ARMS = 4
/** Points scintillants tirés au sort parmi les particules. */
const STARS = 34
/**
 * Pas de la spirale logarithmique : l'angle croît comme le LOGARITHME du rayon,
 * ce qui donne un bras dont la courbure ne dépend pas de l'échelle — le motif
 * est le même près du cœur et sur le bord.
 */
const WIND = 0.85
/** Dispersion angulaire autour de l'axe du bras. */
const SPREAD = 0.34
/** Léger écrasement : la galaxie est vue presque de face, mais pas tout à fait. */
const SQUASH = 0.8
/** Vitesse angulaire au bord (rad/ms) : ~0.35 tour sur toute la durée. */
const OMEGA_EDGE = 0.00029
const BUCKETS = 18
const TAU = Math.PI * 2

interface Star {
  r: number
  a: number
  /** Vitesse angulaire propre, figée à la création : elle ne dépend que de r. */
  w: number
  bucket: number
  /** Épaisseur du disque, décroissante vers l'extérieur : le bulbe central. */
  z: number
  phase: number
  freq: number
  twinkle: boolean
}

/*
 * Teintes de nébuleuse : bleu froid sur le bord, violet à mi-distance, magenta
 * au cœur. La progression n'est pas linéaire (exposant 1.4) pour que le violet
 * occupe la plus grande surface — c'est la teinte qui « fait » la nébuleuse,
 * le bleu et le magenta ne sont que les extrêmes qui la cadrent.
 */
const PALETTE = Array.from({ length: BUCKETS }, (_, i) => {
  // rn = 0 au centre, 1 au bord.
  const rn = i / (BUCKETS - 1)
  const inner = Math.pow(1 - rn, 1.4)
  const hue = Math.round(205 + 118 * inner)
  const light = Math.round(52 + 24 * inner)
  const alpha = 0.05 + 0.115 * inner
  return {
    color: `hsla(${hue}, 92%, ${light}%, ${alpha.toFixed(3)})`,
    size: 0.95 + 0.6 * rn,
  }
})

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

function create({ ctx, width, height }: EffectEnv): EffectRunner {
  const cx = width / 2
  const cy = height / 2
  const RMAX = Math.min(width, height) * 0.46
  const RMIN = RMAX * 0.06
  /**
   * Rayon de cœur : plafonne la loi képlérienne, qui diverge en r → 0. Sans ce
   * palier les particules centrales feraient plusieurs tours par image et
   * l'intégration partirait en confettis.
   */
  const RCORE = RMAX * 0.13

  const parts: Star[] = Array.from({ length: COUNT }, (_, i) => {
    // Racine d'un tirage uniforme : la surface d'un anneau croît avec son rayon,
    // donc sans cette racine tout s'entasserait au centre.
    const r = RMIN + Math.sqrt(Math.random()) * (RMAX - RMIN)
    const rn = clamp01((r - RMIN) / (RMAX - RMIN))
    // Somme de deux tirages uniformes ≈ loi normale (théorème central limite du
    // pauvre) : le bras est dense sur son axe et s'effiloche sur les bords,
    // là où un tirage plat donnerait une bande à densité constante.
    const jitter = (Math.random() + Math.random() - 1) * SPREAD
    const arm = i % ARMS
    return {
      r,
      a: (arm / ARMS) * TAU + Math.log(r / RMIN) * WIND + jitter,
      w: OMEGA_EDGE * Math.pow(RMAX / Math.max(r, RCORE), 1.5),
      bucket: Math.min(BUCKETS - 1, (rn * BUCKETS) | 0),
      // Épaisseur concentrée au centre : c'est ce renflement qui empêche le
      // disque de se lire comme un simple anneau plat.
      z: (Math.random() + Math.random() - 1) * RCORE * Math.pow(1 - rn, 2),
      phase: Math.random() * TAU,
      freq: 0.0016 + Math.random() * 0.0032,
      twinkle: i < STARS,
    }
  })

  return {
    frame(elapsed, dt) {
      const closing = clamp01((elapsed - (DURATION - 1500)) / 1500)

      // Le voile s'alourdit sur la fin : les traînées raccourcissent, la galaxie
      // s'éteint par le bord au lieu de disparaître d'un coup.
      ctx.globalCompositeOperation = 'destination-out'
      ctx.globalAlpha = 0.055 + 0.17 * closing
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, width, height)

      // Démarrage en douceur (lissage cubique) : la figure existe déjà à la
      // première image et se met à tourner, plutôt que d'apparaître déjà lancée.
      const e = Math.min(elapsed / 600, 1)
      const ease = e * e * (3 - 2 * e)
      // Aspiration finale : le cœur ravale les bras pendant l'extinction.
      const suck = 0.0022 * (1 + 7 * closing * closing)
      const fade = Math.min(elapsed / 700, 1) * (1 - closing * closing)

      const paths = Array.from({ length: BUCKETS }, () => new Path2D())

      for (const p of parts) {
        p.a += p.w * dt * ease
        // Chute vers le centre plus rapide à l'intérieur : la spirale se resserre
        // au lieu de simplement pivoter.
        p.r -= suck * dt * Math.sqrt(RMAX / Math.max(p.r, RCORE))
        if (p.r < RMIN * 0.4) p.r = RMIN * 0.4

        const x = cx + Math.cos(p.a) * p.r
        const y = cy + Math.sin(p.a) * p.r * SQUASH + p.z
        if (p.twinkle) continue

        const s = PALETTE[p.bucket].size
        // `arc` enchaîné dans un Path2D relie le point courant au début du
        // nouvel arc par un segment parasite : le `moveTo` préalable coupe le
        // trait. C'est le prix à payer pour ne faire qu'un `fill` par teinte.
        paths[p.bucket].moveTo(x + s, y)
        paths[p.bucket].arc(x, y, s, 0, TAU)
      }

      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = fade
      for (let i = 0; i < BUCKETS; i++) {
        ctx.fillStyle = PALETTE[i].color
        ctx.fill(paths[i])
      }

      // Bulbe central : un unique dégradé radial, qui respire lentement. C'est
      // lui qui fournit la luminosité du cœur — l'obtenir en gonflant l'alpha
      // des particules produirait une tache dure aux bords nets.
      const breathe = 0.86 + 0.14 * Math.sin(elapsed * 0.0011)
      const rr = RCORE * 3.6 * breathe
      const bulge = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr)
      bulge.addColorStop(0, 'rgba(255, 236, 250, 0.5)')
      bulge.addColorStop(0.22, 'rgba(228, 150, 240, 0.26)')
      bulge.addColorStop(0.6, 'rgba(140, 96, 226, 0.1)')
      bulge.addColorStop(1, 'rgba(70, 80, 200, 0)')
      ctx.fillStyle = bulge
      ctx.beginPath()
      ctx.arc(cx, cy, rr, 0, TAU)
      ctx.fill()

      // Les scintillantes sont peintes une par une : leur alpha varie à chaque
      // image, elles ne peuvent pas entrer dans le regroupement par teinte. Elles
      // sont assez peu nombreuses pour que le surcoût reste invisible.
      for (const p of parts) {
        if (!p.twinkle) continue
        const x = cx + Math.cos(p.a) * p.r
        const y = cy + Math.sin(p.a) * p.r * SQUASH + p.z
        // Sinus au carré : la pulsation passe plus de temps éteinte qu'allumée,
        // ce qui donne un clignotement franc plutôt qu'un halo qui ondule.
        const s = Math.sin(elapsed * p.freq + p.phase)
        const pulse = 0.25 + 0.75 * s * s
        const a = fade * pulse

        ctx.fillStyle = `rgba(236, 226, 255, ${(a * 0.85).toFixed(3)})`
        ctx.beginPath()
        ctx.arc(x, y, 1.1 + 1.2 * pulse, 0, TAU)
        ctx.fill()

        // Aigrette en croix : deux traits suffisent à évoquer la diffraction
        // d'une optique, à une fraction du coût d'un `shadowBlur`.
        const len = 2.5 + 6 * pulse
        ctx.strokeStyle = `rgba(214, 208, 255, ${(a * 0.4).toFixed(3)})`
        ctx.lineWidth = 0.8
        ctx.beginPath()
        ctx.moveTo(x - len, y)
        ctx.lineTo(x + len, y)
        ctx.moveTo(x, y - len)
        ctx.lineTo(x, y + len)
        ctx.stroke()
      }

      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
      return elapsed < DURATION
    },
  }
}

export const vortexEffect: EffectDefinition = {
  id: 'vortex',
  label: 'Vortex',
  hint: 'Bras spiraux enroulés par la rotation différentielle',
  durationMs: DURATION,
  create,
}
