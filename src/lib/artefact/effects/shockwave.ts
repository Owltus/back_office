import type { EffectDefinition, EffectEnv, EffectRunner } from './types.ts'

/*
 * Ondes de choc — quatre fronts concentriques sur un tapis de poussière.
 *
 * Le sujet n'est pas l'anneau, c'est ce que l'anneau FAIT au décor. Chaque grain
 * de poussière retient sa position de repos ; le front le bouscule au passage,
 * puis un rappel élastique sous-amorti le ramène en le faisant osciller autour
 * de son point d'origine. Sans cette mémoire on obtiendrait un souffle qui
 * chasse tout vers les bords et laisse un écran vide au bout de deux secondes.
 *
 * Trois points de physique donnent le poids de l'effet :
 *
 * 1. Le front DÉCÉLÈRE. Une onde de souffle réelle perd de la vitesse en
 *    poussant le milieu devant elle (Sedov-Taylor : R croît comme une puissance
 *    du temps INFÉRIEURE à 1). Un rayon strictement linéaire glisse comme un
 *    cercle qu'on redimensionne ; un exposant sous 1 donne au contraire la masse
 *    d'air qui force le passage.
 *
 * 2. L'amplitude tombe en 1/√r. À deux dimensions l'énergie se répartit sur une
 *    CIRCONFÉRENCE, pas sur une sphère : elle décroît comme la racine du rayon
 *    et non comme son carré. Les anneaux lointains bousculent donc encore la
 *    poussière, faiblement — c'est ce qui garde l'écran vivant jusqu'au bout.
 *
 * 3. La poussée est proportionnelle à la VITESSE du front. Un front rapide
 *    survole un grain en deux images, un front lent s'attarde : sans cette
 *    compensation, les ondes tardives cogneraient plus fort que les premières,
 *    exactement l'inverse de ce qu'on veut.
 *
 * L'impulsion est étroitement localisée (gaussienne sur l'écart au rayon
 * courant) : seule la poussière que l'onde TRAVERSE bouge, à l'instant où elle
 * la traverse. C'est cette localisation qui fait lire une onde plutôt qu'un
 * champ de force global.
 */

const DURATION = 5600
const TARGET_DUST = 560
/** Durée de vie d'un anneau, du centre à sa dissolution. */
const RING_MS = 2400
/** Sedov-Taylor adouci : 0.4 décélère trop visiblement, 1 ne décélère pas. */
const EXPANSION = 0.62
/** Demi-épaisseur du front, en pixels. */
const FRONT = 26
/** Raideur du rappel : période d'oscillation d'environ 800 ms. */
const STIFF = 0.000062
/** Amortissement (ζ ≈ 0.35) : la poussière dépasse et revient, elle ne colle pas. */
const DAMP = 0.0055
/** Calibré pour que le front communique ~0.6 px/ms au grain qu'il traverse. */
const PUSH = 0.012
const BUCKETS = 10
const TAU = Math.PI * 2

/*
 * Instants d'émission et puissance relative : la deuxième onde est la brute.
 * Les écarts s'allongent (620, 880, 1100 ms) pour que l'oreille intérieure lise
 * un souffle qui s'essouffle et non un métronome. La dernière part assez tard
 * pour que la poussière n'ait pas fini de se calmer quand le rideau tombe : un
 * effet qui se termine sur un écran immobile paraît deux fois trop long.
 */
const WAVES = [
  { at: 0, power: 0.85 },
  { at: 620, power: 1 },
  { at: 1500, power: 0.72 },
  { at: 2600, power: 0.58 },
]

interface Grain {
  /** Position de repos — la mémoire qui permet le retour. */
  hx: number
  hy: number
  x: number
  y: number
  vx: number
  vy: number
}

/*
 * Poussière au repos : à peine visible. Poussière bousculée : incandescente.
 * L'échelle de couleur est indexée sur le DÉPLACEMENT, si bien que le sillage
 * de chaque onde s'allume tout seul et s'éteint à mesure que les grains
 * retrouvent leur place. Dix niveaux préconstruits = dix `fill()` par image au
 * lieu de six cents.
 */
const PALETTE = Array.from({ length: BUCKETS }, (_, i) => {
  const u = i / (BUCKETS - 1)
  const r = Math.round(148 + 107 * u)
  const g = Math.round(176 + 74 * u)
  const b = Math.round(214 + 26 * u)
  return {
    color: `rgba(${r}, ${g}, ${b}, ${(0.12 + 0.72 * u).toFixed(3)})`,
    size: 1 + 1.7 * u,
  }
})

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

function create({ ctx, width, height }: EffectEnv): EffectRunner {
  const cx = width / 2
  const cy = height / 2
  // Au-delà de la demi-diagonale l'anneau est hors champ : on vise plus loin
  // pour qu'il sorte de l'écran avant de s'éteindre, sinon il meurt en scène.
  const RMAX = Math.hypot(width, height) * 0.62
  // Rayon de référence de la loi en 1/√r. Calé assez près du centre pour que la
  // décroissance se fasse sentir sur la portion visible du parcours.
  const REF = Math.min(width, height) * 0.16

  // Grille jitterée plutôt qu'un semis aléatoire : le semis laisse des trous et
  // des paquets, la grille garantit une couverture régulière, et le bruit ajouté
  // sur chaque cellule casse l'alignement qui trahirait le réseau.
  const cols = Math.max(
    4,
    Math.round(Math.sqrt((TARGET_DUST * width) / height)),
  )
  const rows = Math.max(3, Math.ceil(TARGET_DUST / cols))
  const cw = width / cols
  const ch = height / rows
  const grains: Grain[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const hx = (c + 0.5 + (Math.random() - 0.5) * 0.85) * cw
      const hy = (r + 0.5 + (Math.random() - 0.5) * 0.85) * ch
      grains.push({ hx, hy, x: hx, y: hy, vx: 0, vy: 0 })
    }
  }

  return {
    frame(elapsed, dt) {
      // Effacement franc mais pas total : les deux ou trois images rémanentes
      // suffisent à donner un filé de mouvement à la poussière rapide sans
      // empâter les anneaux, qui sont redessinés à neuf de toute façon.
      ctx.globalCompositeOperation = 'destination-out'
      ctx.globalAlpha = 0.3
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, width, height)

      const fade = clamp01((DURATION - elapsed) / 600)

      // État des fronts vivants, calculé une seule fois puis réutilisé par les
      // six cents grains : recalculer un `Math.pow` par grain et par onde serait
      // le vrai coût de cet effet.
      const live: { r: number; speed: number; power: number; age: number }[] =
        []
      for (const w of WAVES) {
        const age = elapsed - w.at
        if (age < 0 || age > RING_MS) continue
        const u = age / RING_MS
        const r = RMAX * Math.pow(u, EXPANSION)
        // Dérivée analytique du rayon : plus juste et moins bavarde que de
        // mémoriser le rayon de l'image précédente pour le soustraire.
        const speed =
          (RMAX * EXPANSION * Math.pow(Math.max(u, 0.004), EXPANSION - 1)) /
          RING_MS
        live.push({ r, speed, power: w.power, age })
      }

      const paths = Array.from({ length: BUCKETS }, () => new Path2D())

      for (const g of grains) {
        for (const wave of live) {
          const dx = g.x - cx
          const dy = g.y - cy
          const d = Math.sqrt(dx * dx + dy * dy) || 1
          const gap = d - wave.r
          // Hors du front, rien : le test sort avant la racine et l'exponentielle
          // pour la quasi-totalité des couples (grain, onde).
          if (gap < -FRONT * 2.2 || gap > FRONT * 2.2) continue
          const bell = Math.exp(-(gap * gap) / (FRONT * FRONT))
          const amp =
            PUSH *
            wave.speed *
            wave.power *
            bell *
            Math.sqrt(REF / Math.max(d, REF))
          g.vx += (dx / d) * amp * dt
          g.vy += (dy / d) * amp * dt
        }

        // Rappel élastique amorti vers la position de repos. C'est le ressort,
        // et non une interpolation vers l'origine, qui produit le dépassement :
        // le grain revient, rate sa cible, repart — l'inertie se voit.
        const ox = g.x - g.hx
        const oy = g.y - g.hy
        g.vx += (-STIFF * ox - DAMP * g.vx) * dt
        g.vy += (-STIFF * oy - DAMP * g.vy) * dt
        g.x += g.vx * dt
        g.y += g.vy * dt

        const disp = Math.sqrt(ox * ox + oy * oy)
        const b = Math.min(BUCKETS - 1, (clamp01(disp / 30) * BUCKETS) | 0)
        const s = PALETTE[b].size
        // Rectangles et non arcs : à deux pixels la différence ne se voit pas,
        // et `rect` dans un Path2D coûte une fraction d'un `arc`.
        paths[b].rect(g.x - s * 0.5, g.y - s * 0.5, s, s)
      }

      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = fade
      for (let i = 0; i < BUCKETS; i++) {
        ctx.fillStyle = PALETTE[i].color
        ctx.fill(paths[i])
      }

      for (const wave of live) {
        const u = wave.age / RING_MS
        // L'anneau s'affine en s'élargissant : la matière du front s'étale sur
        // une circonférence qui grandit, elle ne peut que s'amincir.
        const thin = Math.pow(1 - u, 1.8)
        const a = Math.pow(1 - u, 1.6) * wave.power * fade
        ctx.globalAlpha = 1

        // Halo interne large et discret : c'est lui qui donne l'épaisseur, le
        // trait fin ne fait que poser l'arête.
        ctx.strokeStyle = `rgba(96, 150, 235, ${(a * 0.22).toFixed(3)})`
        ctx.lineWidth = 6 + 34 * thin
        ctx.beginPath()
        ctx.arc(cx, cy, Math.max(wave.r - 6, 0.5), 0, TAU)
        ctx.stroke()

        // Aberration chromatique : trois passes décalées d'un cheveu, une froide
        // en avant, une chaude en arrière. En `lighter` elles se recomposent en
        // blanc au centre du trait et laissent une frange colorée sur les bords,
        // comme une lentille bon marché — l'œil lit « distorsion optique ».
        ctx.lineWidth = Math.max(0.8, 1.2 + 5 * thin)
        ctx.strokeStyle = `rgba(120, 190, 255, ${(a * 0.55).toFixed(3)})`
        ctx.beginPath()
        ctx.arc(cx, cy, wave.r * 1.008, 0, TAU)
        ctx.stroke()
        ctx.strokeStyle = `rgba(238, 246, 255, ${(a * 0.9).toFixed(3)})`
        ctx.beginPath()
        ctx.arc(cx, cy, wave.r, 0, TAU)
        ctx.stroke()
        ctx.strokeStyle = `rgba(255, 156, 108, ${(a * 0.5).toFixed(3)})`
        ctx.beginPath()
        ctx.arc(cx, cy, Math.max(wave.r * 0.992, 0.5), 0, TAU)
        ctx.stroke()

        // Éclair d'émission : bref, sinon il devient une lampe de chevet.
        if (wave.age < 210) {
          const k = Math.pow(1 - wave.age / 210, 2) * wave.power * fade
          const rr = 40 + wave.age * 0.5
          const flash = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr)
          flash.addColorStop(0, `rgba(255, 255, 255, ${(k * 0.95).toFixed(3)})`)
          flash.addColorStop(
            0.45,
            `rgba(170, 210, 255, ${(k * 0.4).toFixed(3)})`,
          )
          flash.addColorStop(1, 'rgba(120, 170, 255, 0)')
          ctx.fillStyle = flash
          ctx.beginPath()
          ctx.arc(cx, cy, rr, 0, TAU)
          ctx.fill()

          // Voile additif sur toute la surface : trois images à peine, mais
          // c'est ce qui donne la secousse de l'émission plutôt qu'un simple
          // point lumineux au centre.
          if (wave.age < 120) {
            const v = Math.pow(1 - wave.age / 120, 2) * wave.power * 0.07 * fade
            ctx.fillStyle = `rgba(180, 210, 255, ${v.toFixed(3)})`
            ctx.fillRect(0, 0, width, height)
          }
        }
      }

      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
      return elapsed < DURATION
    },
  }
}

export const shockwaveEffect: EffectDefinition = {
  id: 'shockwave',
  label: 'Onde de choc',
  hint: 'Fronts concentriques, poussière soufflée puis rappelée',
  durationMs: DURATION,
  create,
}
