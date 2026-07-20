import type { EffectDefinition, EffectEnv, EffectRunner } from './types.ts'

/*
 * Trou noir — spirale d'accrétion, puis effondrement.
 *
 * La simulation vit dans le PLAN du disque (coordonnées relatives au centre) et
 * le rendu lui applique un écrasement vertical : on regarde le disque par la
 * tranche. Ce simple facteur d'échelle est ce qui transforme un tourbillon plat
 * en objet à trois dimensions — sans lui, l'image lit « spirale », jamais
 * « trou noir ».
 *
 * Trois partis pris portent tout l'effet :
 *
 * 1. La gravité seule ne fait PAS tomber la matière. Une orbite newtonienne est
 *    stable : livrées à elles-mêmes, les particules tourneraient jusqu'à la fin
 *    des temps. C'est la viscosité du disque qui dissipe le moment cinétique,
 *    donc une friction TANGENTIELLE — et non un freinage global, qui écraserait
 *    aussi la chute libre — pilote l'accrétion.
 *
 * 2. Effet Doppler relativiste : le côté du disque qui vient vers nous est
 *    nettement plus lumineux que celui qui s'éloigne. On l'approxime par une
 *    fonction affine de la composante horizontale de la vitesse. C'est cette
 *    asymétrie gauche/droite, plus que la spirale, qui rend l'image crédible.
 *
 * 3. Tri en profondeur : la moitié du disque située derrière le trou est peinte
 *    AVANT le cœur noir, celle de devant APRÈS. Le disque passe donc devant
 *    l'ombre par le bas et disparaît derrière par le haut.
 *
 * L'effacement se fait en `destination-out` : la traînée s'efface vers la
 * TRANSPARENCE et non vers le noir, sinon le voile finirait par masquer la page
 * posée sous le canvas. Le cœur, lui, est un disque noir OPAQUE : c'est
 * littéralement un trou percé dans l'interface.
 */

const DURATION = 7000
const COUNT = 520
/** Au-delà, plus de réalimentation : le disque se vide, la fin se sent venir. */
const FEED_END = 4200
const IMPLODE_AT = 5300
const COLLAPSE_AT = 5760
/**
 * Une force en 1/d² intégrée d'un seul pas par image « gagne » de l'énergie
 * près du centre et éjecte les particules au lieu de les avaler. Découper le pas
 * suffit à garder la spirale propre, pour trois fois presque rien : la force
 * vient d'un corps unique, il n'y a pas d'interaction N² à recalculer.
 */
const SUBSTEPS = 3
const BUCKETS = 12
const TAU = Math.PI * 2
/** Écrasement vertical du plan du disque : l'angle de vue, en une constante. */
const SQUASH = 0.42
/** Garde-fou : un `dt` élastique dessinerait des rayons traversant l'écran. */
const MAX_STREAK = 64

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  alive: boolean
}

/*
 * Palette des traînées, construite une fois pour toutes : de l'ambre des bords
 * externes au blanc bleuté du bord interne, où le gaz est le plus chaud. Les
 * particules sont rangées dans ces douze niveaux, ce qui permet de n'émettre que
 * douze `stroke()` par passe au lieu d'un par particule — le coût d'un tracé
 * canvas tient dans l'appel, pas dans la géométrie qu'il transporte.
 *
 * Les alphas sont volontairement faibles : le rendu se fait en `lighter`, donc
 * la luminosité s'ADDITIONNE là où les orbites se superposent. C'est cette
 * accumulation qui fabrique le disque, on ne le dessine nulle part.
 */
const PALETTE = Array.from({ length: BUCKETS }, (_, i) => {
  const u = i / (BUCKETS - 1)
  const r = Math.round(255 - 42 * u * u)
  const g = Math.round(128 + 108 * u)
  const b = Math.round(44 + 210 * Math.pow(u, 1.35))
  return {
    color: `rgba(${r}, ${g}, ${b}, ${(0.1 + 0.52 * u).toFixed(3)})`,
    width: 0.8 + 1.5 * u,
  }
})

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

function create({ ctx, width, height }: EffectEnv): EffectRunner {
  const cx = width / 2
  const cy = height / 2
  const R = Math.min(width, height) * 0.5
  // Horizon borné : lisible aussi bien sur un écran étroit que sur un 27 pouces.
  const RS = Math.min(Math.max(R * 0.085, 16), 44)
  // Constante gravitationnelle calibrée à l'œil (elle n'a rien de physique) pour
  // que le disque intermédiaire boucle un tour en ~2 s : plus vite, les traînées
  // deviennent des barres ; plus lentement, l'accrétion n'a pas le temps de se
  // lire dans les sept secondes imparties.
  const GM = 0.00022 * R * R
  // Adoucissement de Plummer : on ajoute une longueur au dénominateur pour que
  // la force reste finie quand d tend vers zéro. Sans lui, une particule frôlant
  // le centre part à l'infini.
  const SOFT2 = (RS * 0.55) ** 2

  const spawn = (p: Particle, atEdge: boolean) => {
    const u = Math.random()
    const r = atEdge
      ? R * (0.94 + Math.random() * 0.2)
      : RS * 2.6 + Math.pow(u, 0.65) * (R * 1.06 - RS * 2.6)
    const a = Math.random() * TAU
    // Vitesse circulaire de l'orbite, prise volontairement SOUS sa valeur
    // d'équilibre : l'orbite est alors elliptique et rentrante, la spirale
    // démarre dès la première image au lieu d'attendre que la friction agisse.
    const vc = Math.sqrt(GM / r) * (0.82 + Math.random() * 0.16)
    p.x = Math.cos(a) * r
    p.y = Math.sin(a) * r
    // Perpendiculaire au rayon, et TOUJOURS dans le même sens : c'est ce qui
    // fait un disque plutôt qu'un essaim.
    p.vx = -Math.sin(a) * vc
    p.vy = Math.cos(a) * vc
    p.alive = true
  }

  const parts: Particle[] = Array.from({ length: COUNT }, () => {
    const p: Particle = { x: 0, y: 0, vx: 0, vy: 0, alive: true }
    spawn(p, false)
    return p
  })

  ctx.lineCap = 'round'

  return {
    frame(elapsed, dt) {
      const collapsed = elapsed >= COLLAPSE_AT

      // Estompage : on RETIRE de l'alpha au lieu de peindre du noir, la traînée
      // s'efface donc vers la transparence. On accélère après l'effondrement
      // pour nettoyer le disque résiduel avant la fin.
      ctx.globalCompositeOperation = 'destination-out'
      ctx.globalAlpha = collapsed ? 0.3 : 0.11
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, width, height)

      // L'horizon s'ouvre au démarrage, puis se referme sur lui-même à la fin.
      const rs = collapsed
        ? RS * Math.max(1 - (elapsed - COLLAPSE_AT) / 190, 0)
        : RS * Math.min(elapsed / 500, 1)
      // Rayon d'absorption maintenu généreux : pendant l'effondrement l'horizon
      // se referme plus vite que les traînardes ne tombent, et une particule
      // laissée dehors gâcherait la netteté de la fin.
      const eat = Math.max(rs, RS * 0.6)

      const imploding = elapsed >= IMPLODE_AT
      // Effondrement : gravité démultipliée ET friction tangentielle massive.
      // La seconde compte autant que la première — c'est le moment cinétique,
      // pas la vitesse, qui empêchait jusqu'ici la chute.
      const gs = imploding
        ? 1 + 13 * Math.min((elapsed - IMPLODE_AT) / 320, 1)
        : 1
      const spin = imploding ? 0.0006 : 0.00016
      const sub = dt / SUBSTEPS

      const back = Array.from({ length: BUCKETS }, () => new Path2D())
      const front = Array.from({ length: BUCKETS }, () => new Path2D())

      for (const p of parts) {
        if (!p.alive) continue

        const px = cx + p.x
        const py = cy + p.y * SQUASH
        let eaten = false

        for (let s = 0; s < SUBSTEPS; s++) {
          const d2 = p.x * p.x + p.y * p.y
          const d = Math.sqrt(d2)
          if (d < eat) {
            eaten = true
            break
          }
          const nx = p.x / d
          const ny = p.y / d
          const a = (GM * gs) / (d2 + SOFT2)
          p.vx -= nx * a * sub
          p.vy -= ny * a * sub

          // Friction purement tangentielle : on projette la vitesse sur la
          // perpendiculaire au rayon et on n'ampute QUE cette part. Freiner le
          // vecteur entier reviendrait à ralentir aussi la chute, et la spirale
          // se transformerait en descente molle.
          const vt = -ny * p.vx + nx * p.vy
          const k = spin * sub
          p.vx += ny * vt * k
          p.vy -= nx * vt * k

          p.x += p.vx * sub
          p.y += p.vy * sub
        }

        if (eaten) {
          // Tant que le disque est alimenté, la matière avalée revient du bord
          // externe : sans ce recyclage l'anneau maigrirait dès la deuxième
          // seconde. Passé ce seuil on laisse le disque se vider pour de bon.
          if (elapsed < FEED_END) spawn(p, true)
          else p.alive = false
          continue
        }
        if (collapsed) {
          // Le flash consomme ce qui restait : rien ne survit à l'effondrement.
          p.alive = false
          continue
        }

        const qx = cx + p.x
        const qy = cy + p.y * SQUASH
        let sx = px
        let sy = py
        const dx = qx - px
        const dy = qy - py
        const len = Math.sqrt(dx * dx + dy * dy)
        if (len > MAX_STREAK) {
          const k = MAX_STREAK / len
          sx = qx - dx * k
          sy = qy - dy * k
        }

        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy) || 1
        const d = Math.sqrt(p.x * p.x + p.y * p.y)
        // Température : le gaz chauffe en tombant, on le fait donc virer au
        // blanc bleuté près de l'horizon. Le carré resserre la zone chaude sur
        // le bord interne au lieu de blanchir tout le disque.
        const temp = clamp01(1 - (d - RS) / (R * 0.8))
        // Doppler : +1 quand la particule file vers la droite de l'image, -1
        // vers la gauche. Une des deux moitiés du disque brille près de trois
        // fois plus que l'autre.
        const beam = 0.38 + 0.45 * (1 + p.vx / speed)
        const score = clamp01((0.28 + 0.72 * temp * temp) * beam)
        const b = Math.min(BUCKETS - 1, (score * BUCKETS) | 0)

        // y < 0 dans le plan du disque = moitié qui passe DERRIÈRE le trou.
        const path = p.y < 0 ? back[b] : front[b]
        path.moveTo(sx, sy)
        path.lineTo(qx, qy)
      }

      const fade =
        Math.min(elapsed / 420, 1) * clamp01((DURATION - elapsed) / 700)
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = fade

      for (let i = 0; i < BUCKETS; i++) {
        ctx.strokeStyle = PALETTE[i].color
        ctx.lineWidth = PALETTE[i].width
        ctx.stroke(back[i])
      }

      if (rs > 0.5) {
        // Cœur noir opaque, posé APRÈS la moitié arrière : il masque tout ce qui
        // est passé de l'autre côté. Aucune lumière ne ressort de l'horizon,
        // c'est la seule règle que l'effet ne négocie pas.
        ctx.globalCompositeOperation = 'source-over'
        ctx.globalAlpha = 1
        ctx.fillStyle = '#000'
        ctx.beginPath()
        ctx.arc(cx, cy, rs, 0, TAU)
        ctx.fill()

        // Anneau de photons : le halo diffus donne la chaleur, le trait fin
        // donne l'arête. Un seul dégradé par image, on peut se le permettre —
        // ce qui coûte vraiment, ce sont les dégradés créés dans une boucle.
        ctx.globalCompositeOperation = 'lighter'
        ctx.globalAlpha = fade
        const halo = ctx.createRadialGradient(
          cx,
          cy,
          rs * 0.9,
          cx,
          cy,
          rs * 1.7,
        )
        halo.addColorStop(0, 'rgba(255, 236, 200, 0)')
        halo.addColorStop(0.34, 'rgba(255, 212, 148, 0.8)')
        halo.addColorStop(1, 'rgba(255, 138, 52, 0)')
        ctx.fillStyle = halo
        ctx.beginPath()
        ctx.arc(cx, cy, rs * 1.7, 0, TAU)
        ctx.fill()

        ctx.strokeStyle = 'rgba(255, 246, 226, 0.85)'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(cx, cy, rs * 1.06, 0, TAU)
        ctx.stroke()
      }

      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = fade
      for (let i = 0; i < BUCKETS; i++) {
        ctx.strokeStyle = PALETTE[i].color
        ctx.lineWidth = PALETTE[i].width
        ctx.stroke(front[i])
      }

      if (collapsed) {
        // Implosion : un front qui part de l'horizon et se dilue, doublé d'un
        // éclair central très court. Le cube sur (1 - f) fait tomber l'anneau
        // presque d'un coup — une décroissance linéaire traînerait et donnerait
        // une bulle de savon là où il faut une détonation.
        const f = (elapsed - COLLAPSE_AT) / 620
        if (f < 1) {
          const ease = 1 - Math.pow(1 - f, 3)
          ctx.globalAlpha = 1
          ctx.strokeStyle = `rgba(196, 224, 255, ${(1 - f) ** 3 * 0.9})`
          ctx.lineWidth = Math.max(1, 20 * (1 - f))
          ctx.beginPath()
          ctx.arc(cx, cy, RS + (R * 1.5 - RS) * ease, 0, TAU)
          ctx.stroke()

          if (f < 0.4) {
            const k = 1 - f / 0.4
            const flash = ctx.createRadialGradient(cx, cy, 0, cx, cy, RS * 4.5)
            flash.addColorStop(0, `rgba(255, 255, 255, ${k * 0.9})`)
            flash.addColorStop(0.4, `rgba(180, 214, 255, ${k * 0.4})`)
            flash.addColorStop(1, 'rgba(120, 160, 255, 0)')
            ctx.fillStyle = flash
            ctx.beginPath()
            ctx.arc(cx, cy, RS * 4.5, 0, TAU)
            ctx.fill()
          }
        }
      }

      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
      return elapsed < DURATION
    },
  }
}

export const blackholeEffect: EffectDefinition = {
  id: 'blackhole',
  label: 'Trou noir',
  hint: "Spirale d'accrétion, horizon, implosion finale",
  durationMs: DURATION,
  create,
}
