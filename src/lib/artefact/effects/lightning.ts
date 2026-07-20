import type { EffectDefinition, EffectEnv, EffectRunner } from './types.ts'

/*
 * Orage — éclairs fractals et flashs.
 *
 * Chaque éclair naît d'un SEUL segment (le point d'impact visé depuis le haut de
 * l'écran) qu'on brise récursivement : on déplace le milieu perpendiculairement
 * au segment, d'une quantité aléatoire, puis on recommence sur les deux moitiés
 * avec un déplacement DEUX FOIS PLUS FAIBLE. Ce halving est toute l'astuce : il
 * produit une courbe auto-similaire (déplacement de milieu, le même procédé que
 * les terrains fractals) dont chaque échelle a le même aspect brisé. Sans lui,
 * un déplacement constant donnerait un simple gribouillis, un déplacement qui
 * décroît trop vite une ligne quasi droite.
 *
 * Le déplacement est PERPENDICULAIRE au segment courant, pas vertical : c'est ce
 * qui permet aux ramifications parties à l'horizontale de rester crédibles.
 *
 * Deux points de mise en scène comptent autant que la géométrie :
 * - le SILENCE entre deux frappes, de durée variable, sans lequel l'œil
 *   s'habitue et l'effet retombe ;
 * - le RÉAMORÇAGE : un vrai éclair est une salve de plusieurs décharges de
 *   retour en 50-150 ms. On rallume donc le même tracé deux ou trois fois avant
 *   de l'éteindre — c'est ce clignotement qui « fait » la foudre.
 */

const DURATION = 7500
// Bascule en phase d'éloignement : au-delà, plus aucun éclair au premier plan,
// seulement des lueurs de nappe assourdies. L'orage part au lieu de s'arrêter.
const LAST_STRIKE_MS = 6000

// Constante de temps du flash plein écran (ms) : très courte, c'est une gifle
// lumineuse, pas un fondu.
const FLASH_TAU = 62
// Durée de vie du tracé, sensiblement plus longue que le flash : l'éclair
// persiste en rémanence quelques images après que la pièce s'est rassombrie.
const BOLT_LIFE_MS = 300

const MAIN_DEPTH = 6
const BRANCH_DEPTH = 4

interface Stroke {
  /** Géométrie figée à la frappe : re-tracée telle quelle à chaque image. */
  path: Path2D
  width: number
}

interface Bolt {
  strokes: Stroke[]
  glow: CanvasGradient
  life: number
  /** Réamorçages restants, cf. décharges de retour. */
  pulses: number
  /** Compte à rebours (ms) avant le prochain réamorçage. */
  nextPulse: number
}

const rand = (min: number, max: number) => min + Math.random() * (max - min)

/*
 * Déplacement de milieu récursif. Écrit les points DANS L'ORDRE (moitié gauche
 * puis moitié droite) : le parcours infixe garantit une polyligne continue du
 * départ à l'arrivée, sans avoir à trier quoi que ce soit.
 */
function subdivide(
  pts: number[],
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  depth: number,
  disp: number,
) {
  if (depth === 0) {
    pts.push(x2, y2)
    return
  }
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.sqrt(dx * dx + dy * dy) || 1
  // Normale unitaire au segment.
  const nx = -dy / len
  const ny = dx / len
  const off = rand(-disp, disp)
  const mx = (x1 + x2) / 2 + nx * off
  const my = (y1 + y2) / 2 + ny * off
  subdivide(pts, x1, y1, mx, my, depth - 1, disp / 2)
  subdivide(pts, mx, my, x2, y2, depth - 1, disp / 2)
}

function strokeFrom(pts: number[], width: number): Stroke {
  const path = new Path2D()
  path.moveTo(pts[0], pts[1])
  for (let i = 2; i < pts.length; i += 2) path.lineTo(pts[i], pts[i + 1])
  return { path, width }
}

/*
 * Construit un éclair complet : tronc + ramifications (et ramifications de
 * ramifications, une génération seulement — au-delà c'est invisible et ça coûte).
 * Une branche repart d'un point du tracé parent, dans une direction tournée de
 * 20 à 55°, sur une fraction de la longueur restante : elle doit toujours
 * paraître FUIR le tronc, jamais le doubler.
 */
function branchOut(
  strokes: Stroke[],
  pts: number[],
  width: number,
  generation: number,
) {
  const points = pts.length / 2
  const probability = generation === 0 ? 0.16 : 0.07
  const endX = pts[pts.length - 2]
  const endY = pts[pts.length - 1]
  for (let i = 2; i < points - 2; i++) {
    if (Math.random() > probability) continue
    const bx = pts[i * 2]
    const by = pts[i * 2 + 1]
    // Cap local, pris sur le segment précédent.
    const dx = bx - pts[(i - 1) * 2]
    const dy = by - pts[(i - 1) * 2 + 1]
    const base = Math.atan2(dy, dx)
    const angle = base + rand(0.35, 0.95) * (Math.random() < 0.5 ? -1 : 1)
    // Longueur prise sur ce qu'il RESTE à parcourir jusqu'à l'impact : les
    // ramifications s'épuisent donc naturellement à l'approche du sol, comme un
    // traceur qui a déjà dissipé l'essentiel de sa charge.
    const len = rand(0.25, 0.55) * Math.hypot(endX - bx, endY - by)
    const ex = bx + Math.cos(angle) * len
    const ey = by + Math.sin(angle) * len
    const sub: number[] = [bx, by]
    subdivide(sub, bx, by, ex, ey, BRANCH_DEPTH, len * 0.14)
    strokes.push(strokeFrom(sub, width))
    if (generation === 0) branchOut(strokes, sub, width * 0.6, 1)
  }
}

function create({ ctx, width, height }: EffectEnv): EffectRunner {
  const bolts: Bolt[] = []
  // Intensité du flash plein écran, cumulative : deux frappes rapprochées
  // s'additionnent au lieu de se remplacer.
  let flash = 0
  let nextStrikeAt = rand(180, 420)

  function radial(x: number, y: number, r: number, intensity: number) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, `rgba(196, 222, 255, ${0.5 * intensity})`)
    g.addColorStop(0.35, `rgba(96, 148, 255, ${0.16 * intensity})`)
    g.addColorStop(1, 'rgba(60, 100, 255, 0)')
    return g
  }

  function strike(receding: boolean) {
    /*
     * Une frappe sur quatre est un éclair de nappe : lointain, masqué par les
     * nuages, il ne montre AUCUN tracé — juste une lueur diffuse et un flash
     * atténué. C'est ce qui donne de la profondeur à l'orage : sans lui, toutes
     * les décharges semblent tomber à la même distance.
     * En phase d'éloignement, il ne reste QUE ce type de frappe, assourdi.
     */
    if (receding || Math.random() < 0.26) {
      const dim = receding ? 0.45 : 1
      bolts.push({
        strokes: [],
        glow: radial(
          rand(0.15, 0.85) * width,
          rand(0.05, 0.3) * height,
          rand(0.3, 0.5) * width,
          0.85 * dim,
        ),
        life: 1,
        pulses: 0,
        nextPulse: 0,
      })
      flash += rand(0.22, 0.4) * dim
      return
    }

    const sx = rand(0.15, 0.85) * width
    const ex = Math.min(
      Math.max(sx + rand(-0.22, 0.22) * width, 0.05 * width),
      0.95 * width,
    )
    const ey = rand(0.6, 0.92) * height
    const span = Math.hypot(ex - sx, ey + 20)

    const pts: number[] = [sx, -20]
    // Déplacement initial proportionnel à la portée : un éclair court doit être
    // aussi tortueux qu'un long, en proportion.
    subdivide(pts, sx, -20, ex, ey, MAIN_DEPTH, span * 0.14)

    const strokes: Stroke[] = [strokeFrom(pts, rand(1.9, 2.8))]
    branchOut(strokes, pts, 1.1, 0)

    bolts.push({
      strokes,
      glow: radial(ex, ey, rand(90, 170), 1),
      life: 1,
      pulses: Math.random() < 0.7 ? (Math.random() < 0.4 ? 2 : 1) : 0,
      nextPulse: rand(45, 110),
    })
    flash += rand(0.55, 0.9)
  }

  return {
    frame(elapsed, dt) {
      ctx.clearRect(0, 0, width, height)

      // Décroissance EXPONENTIELLE et non linéaire : multiplier par une constante
      // à chaque image lierait la vitesse d'extinction au nombre d'images par
      // seconde. Avec exp(-dt/τ), le flash met le même temps réel à s'éteindre
      // à 30 comme à 144 fps.
      flash *= Math.exp(-dt / FLASH_TAU)
      if (flash < 0.002) flash = 0

      if (elapsed >= nextStrikeAt) {
        // Passé LAST_STRIKE_MS l'orage S'ÉLOIGNE : plus aucun tracé au premier
        // plan, seulement des lueurs de nappe assourdies. L'effet s'achève sur
        // un orage qui s'en va — et non sur un écran brutalement vide, ce que
        // donnait une simple coupure des frappes (jusqu'à 1,5 s de néant).
        const receding = elapsed >= LAST_STRIKE_MS
        strike(receding)
        // Le silence est la matière première de l'effet : intervalle largement
        // variable, avec parfois une réplique quasi immédiate — mais jamais
        // pendant l'éloignement, où l'on veut au contraire de l'espacement.
        nextStrikeAt =
          elapsed +
          (!receding && Math.random() < 0.22 ? rand(160, 340) : rand(520, 1550))
      }

      for (let i = bolts.length - 1; i >= 0; i--) {
        const bolt = bolts[i]

        if (bolt.pulses > 0) {
          bolt.nextPulse -= dt
          if (bolt.nextPulse <= 0) {
            bolt.pulses--
            bolt.nextPulse = rand(45, 110)
            bolt.life = rand(0.55, 0.9)
            flash += rand(0.25, 0.5)
          }
        }

        bolt.life -= dt / BOLT_LIFE_MS
        if (bolt.life <= 0 && bolt.pulses === 0) {
          bolts.splice(i, 1)
          continue
        }
        const a = Math.max(bolt.life, 0)
        if (a === 0) continue

        ctx.globalCompositeOperation = 'lighter'

        // Lueur d'impact au sol (ou nappe nuageuse), sous le tracé.
        ctx.globalAlpha = a * a
        ctx.fillStyle = bolt.glow
        ctx.fillRect(0, 0, width, height)
        ctx.globalAlpha = 1

        /*
         * Trois passes sur le MÊME chemin, de la plus large à la plus fine :
         * halo bleu froid très transparent, corps bleu clair, cœur blanc presque
         * opaque. En `lighter`, l'empilement recrée la saturation d'un capteur
         * ébloui — bien plus convaincant qu'un `shadowBlur`, et sans son coût.
         */
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        for (const st of bolt.strokes) {
          ctx.strokeStyle = `rgba(64, 118, 255, ${0.14 * a})`
          ctx.lineWidth = st.width * 7
          ctx.stroke(st.path)
          ctx.strokeStyle = `rgba(148, 190, 255, ${0.45 * a})`
          ctx.lineWidth = st.width * 2.6
          ctx.stroke(st.path)
          ctx.strokeStyle = `rgba(244, 249, 255, ${0.95 * a})`
          ctx.lineWidth = st.width
          ctx.stroke(st.path)
        }
      }

      // Flash plein écran EN DERNIER et en `source-over` : il doit voiler la
      // page ET l'éclair lui-même, comme un œil saturé de lumière.
      if (flash > 0) {
        ctx.globalCompositeOperation = 'source-over'
        ctx.fillStyle = `rgba(216, 232, 255, ${Math.min(flash, 1) * 0.38})`
        ctx.fillRect(0, 0, width, height)
      }

      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
      return elapsed < DURATION
    },
  }
}

export const lightningEffect: EffectDefinition = {
  id: 'lightning',
  label: 'Orage',
  hint: 'Éclairs fractals, flashs et silences',
  durationMs: DURATION,
  create,
}
