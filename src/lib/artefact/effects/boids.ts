import type { EffectDefinition, EffectEnv, EffectRunner } from './types.ts'

/*
 * Nuée d'oiseaux — modèle de Reynolds (1987).
 *
 * Aucun agent ne connaît la nuée : chacun n'applique que trois règles locales
 * sur ses voisins immédiats — SÉPARATION (ne pas se percuter), ALIGNEMENT
 * (adopter le cap moyen), COHÉSION (rejoindre le barycentre local). La forme
 * globale, les scissions, les recompositions ne sont écrites nulle part : elles
 * ÉMERGENT. C'est tout l'intérêt de l'effet, et la raison pour laquelle il ne
 * faut surtout pas ajouter de règle « de groupe » qui court-circuiterait
 * l'émergence.
 *
 * Une quatrième pesée, très faible, tire vers un point mobile : sans elle la
 * nuée se stabilise vite au centre et l'écran devient statique. Le point suit
 * une courbe de Lissajous (deux sinus de fréquences non commensurables) — donc
 * une trajectoire qui ne se referme jamais sur elle-même pendant l'animation,
 * contrairement à un cercle qui donnerait un ballet visiblement périodique.
 *
 * Coût : O(n²) par image. Avec n plafonné à 140 c'est ~9 700 paires (la boucle
 * est symétrique, cf. plus bas) — négligeable, à condition de ne JAMAIS extraire
 * de racine carrée à l'intérieur.
 */

const DURATION = 7000
const FADE_MS = 900

/*
 * Rayons de perception, stockés au CARRÉ. Toute la double boucle compare des
 * distances au carré : `d² < r²` équivaut strictement à `d < r` (la racine est
 * monotone croissante sur les positifs) et économise un Math.sqrt par paire.
 */
const SEPARATION_R2 = 27 * 27
const NEIGHBOR_R2 = 64 * 64

// Vitesses en pixels par image de référence (16,7 ms) ; `step` les convertit.
const MAX_SPEED = 2.8
const MIN_SPEED = 1.4
// Accélération maximale par image : c'est ce plafond qui donne l'inertie, donc
// les grandes courbes souples plutôt que des changements de cap instantanés.
const MAX_FORCE = 0.09

const W_SEPARATION = 1.7
const W_ALIGNMENT = 1.05
const W_COHESION = 0.95
const W_TARGET = 0.32

// Un agent isolé reste cyan, un agent au cœur d'un peloton vire au violet et
// s'éclaircit : la couleur cartographie la densité locale, ce qui rend les
// scissions de la nuée lisibles à l'œil.
const HUE_BASE = 192
const HUE_SPAN = 88
const DENSITY_REF = 11

interface Boid {
  x: number
  y: number
  vx: number
  vy: number
}

function create({ ctx, width, height }: EffectEnv): EffectRunner {
  // Densité constante quelle que soit la taille de l'écran, mais plafonnée :
  // au-delà, le coût quadratique se voit et la nuée devient une bouillie.
  const n = Math.max(45, Math.min(140, Math.round((width * height) / 9500)))

  const flock: Boid[] = Array.from({ length: n }, () => {
    const angle = Math.random() * Math.PI * 2
    const speed = MIN_SPEED + Math.random() * (MAX_SPEED - MIN_SPEED)
    return {
      x: Math.random() * width,
      y: Math.random() * height,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
    }
  })

  // Accumulateurs alloués UNE fois : les réallouer à chaque image ferait
  // travailler le ramasse-miettes 60 fois par seconde, ce qui se voit en à-coups.
  const sepX = new Float32Array(n)
  const sepY = new Float32Array(n)
  const aliX = new Float32Array(n)
  const aliY = new Float32Array(n)
  const cohX = new Float32Array(n)
  const cohY = new Float32Array(n)
  const neighbors = new Int32Array(n)

  const halfW = width / 2
  const halfH = height / 2

  // Sortie de `setSteer`. Un objet mutable partagé évite de rendre un couple
  // (x, y) — donc un objet neuf — quatre fois par agent et par image.
  const steer = { x: 0, y: 0 }

  /*
   * Formule de pilotage de Reynolds : `force = désiré - actuel`, bornée.
   * Le vecteur souhaité est ramené à MAX_SPEED (seule la DIRECTION du désir
   * compte, pas son intensité brute, sinon un voisin lointain pèserait plus
   * lourd qu'un voisin proche), puis on ne garde que l'écart au cap actuel.
   * Ces racines-là sont en O(n) par image, pas en O(n²) : elles sont gratuites.
   */
  function setSteer(dx: number, dy: number, b: Boid) {
    const m = Math.sqrt(dx * dx + dy * dy)
    if (m === 0) {
      steer.x = 0
      steer.y = 0
      return
    }
    let sx = (dx / m) * MAX_SPEED - b.vx
    let sy = (dy / m) * MAX_SPEED - b.vy
    const s = Math.sqrt(sx * sx + sy * sy)
    if (s > MAX_FORCE) {
      sx = (sx / s) * MAX_FORCE
      sy = (sy / s) * MAX_FORCE
    }
    steer.x = sx
    steer.y = sy
  }

  return {
    frame(elapsed, dt) {
      // Traînée : on ronge l'alpha de l'image précédente au lieu de l'effacer.
      // `destination-out` (et non un voile noir) parce que le canvas est
      // TRANSPARENT au-dessus de la page — un voile opaque salirait le fond.
      ctx.globalCompositeOperation = 'destination-out'
      ctx.fillStyle = 'rgba(0, 0, 0, 0.14)'
      ctx.fillRect(0, 0, width, height)
      ctx.globalCompositeOperation = 'lighter'

      // Intégration en pas de temps normalisé : à 30 fps les agents avancent
      // deux fois plus par image, donc la nuée vole à la même vitesse réelle.
      const step = dt / 16.667
      const remaining = DURATION - elapsed
      const fade = remaining < FADE_MS ? Math.max(remaining / FADE_MS, 0) : 1

      // Point d'attraction : Lissajous. Le rapport des deux pulsations (0,21 et
      // 0,34 mrad/ms) est proche du nombre d'or, donc la courbe ne se referme
      // pas — la nuée traverse l'écran en diagonale sans jamais repasser.
      const tx = width * (0.5 + 0.4 * Math.sin(elapsed * 0.00021))
      const ty = height * (0.5 + 0.32 * Math.sin(elapsed * 0.00034 + 1.1))

      sepX.fill(0)
      sepY.fill(0)
      aliX.fill(0)
      aliY.fill(0)
      cohX.fill(0)
      cohY.fill(0)
      neighbors.fill(0)

      /*
       * Double boucle en j > i : chaque paire n'est visitée QU'UNE fois et
       * alimente les deux agents (la séparation et la cohésion sont
       * antisymétriques, l'alignement croisé). Moitié moins de travail que la
       * boucle naïve i × j, pour un résultat identique.
       */
      for (let i = 0; i < n; i++) {
        const a = flock[i]
        for (let j = i + 1; j < n; j++) {
          const b = flock[j]
          let dx = b.x - a.x
          let dy = b.y - a.y

          /*
           * Convention de l'image la plus proche (empruntée aux simulations en
           * conditions périodiques) : l'écran étant un tore — on sort à gauche,
           * on rentre à droite — deux agents de part et d'autre d'une bordure
           * sont VOISINS. Sans cette correction, la cohésion les tirerait l'un
           * vers l'autre à travers tout l'écran et déchirerait la nuée à chaque
           * passage de bord. Deux comparaisons par axe suffisent.
           */
          if (dx > halfW) dx -= width
          else if (dx < -halfW) dx += width
          if (dy > halfH) dy -= height
          else if (dy < -halfH) dy += height

          const d2 = dx * dx + dy * dy
          if (d2 > NEIGHBOR_R2 || d2 === 0) continue

          // Cohésion : on somme les décalages RELATIFS, pas les positions
          // absolues — c'est ce qui rend le barycentre local valable à cheval
          // sur une bordure du tore.
          cohX[i] += dx
          cohY[i] += dy
          cohX[j] -= dx
          cohY[j] -= dy

          aliX[i] += b.vx
          aliY[i] += b.vy
          aliX[j] += a.vx
          aliY[j] += a.vy

          neighbors[i]++
          neighbors[j]++

          if (d2 < SEPARATION_R2) {
            // Répulsion en 1/d : diviser le vecteur par d² le normalise (÷d) ET
            // le pondère par l'inverse de la distance (÷d) d'un seul coup. Un
            // voisin collé repousse violemment, un voisin en limite de rayon à
            // peine — le tout sans jamais toucher à Math.sqrt.
            const k = 1 / d2
            sepX[i] -= dx * k
            sepY[i] -= dy * k
            sepX[j] += dx * k
            sepY[j] += dy * k
          }
        }
      }

      for (let i = 0; i < n; i++) {
        const a = flock[i]
        const c = neighbors[i]
        let ax = 0
        let ay = 0

        if (c > 0) {
          setSteer(aliX[i] / c, aliY[i] / c, a)
          ax += steer.x * W_ALIGNMENT
          ay += steer.y * W_ALIGNMENT

          setSteer(cohX[i] / c, cohY[i] / c, a)
          ax += steer.x * W_COHESION
          ay += steer.y * W_COHESION
        }

        if (sepX[i] !== 0 || sepY[i] !== 0) {
          setSteer(sepX[i], sepY[i], a)
          ax += steer.x * W_SEPARATION
          ay += steer.y * W_SEPARATION
        }

        setSteer(tx - a.x, ty - a.y, a)
        ax += steer.x * W_TARGET
        ay += steer.y * W_TARGET

        a.vx += ax * step
        a.vy += ay * step

        // Plancher ET plafond de vitesse : le plafond évite les fuites en ligne
        // droite, le plancher empêche un agent coincé entre deux forces
        // opposées de s'immobiliser (un oiseau à l'arrêt casse l'illusion).
        const speed = Math.sqrt(a.vx * a.vx + a.vy * a.vy)
        if (speed > MAX_SPEED) {
          a.vx = (a.vx / speed) * MAX_SPEED
          a.vy = (a.vy / speed) * MAX_SPEED
        } else if (speed < MIN_SPEED && speed > 0) {
          a.vx = (a.vx / speed) * MIN_SPEED
          a.vy = (a.vy / speed) * MIN_SPEED
        }

        a.x += a.vx * step
        a.y += a.vy * step

        // Enroulement torique, cohérent avec la convention d'image ci-dessus.
        if (a.x < 0) a.x += width
        else if (a.x >= width) a.x -= width
        if (a.y < 0) a.y += height
        else if (a.y >= height) a.y -= height

        // Repère local de l'agent : `f` son cap unitaire, `r` la normale. Les
        // trois sommets s'en déduisent par combinaison linéaire — bien moins
        // cher qu'un save/rotate/restore répété 140 fois par image.
        const norm = Math.sqrt(a.vx * a.vx + a.vy * a.vy) || 1
        const fx = a.vx / norm
        const fy = a.vy / norm
        const rx = -fy
        const ry = fx

        const density = Math.min(c, DENSITY_REF) / DENSITY_REF
        const hue = HUE_BASE + density * HUE_SPAN
        const light = 56 + density * 26
        ctx.fillStyle = `hsla(${hue}, 96%, ${light}%, ${(0.5 + density * 0.45) * fade})`

        ctx.beginPath()
        ctx.moveTo(a.x + fx * 7.5, a.y + fy * 7.5)
        ctx.lineTo(a.x - fx * 4 + rx * 3.1, a.y - fy * 4 + ry * 3.1)
        ctx.lineTo(a.x - fx * 4 - rx * 3.1, a.y - fy * 4 - ry * 3.1)
        ctx.closePath()
        ctx.fill()
      }

      ctx.globalCompositeOperation = 'source-over'
      return elapsed < DURATION
    },
  }
}

export const boidsEffect: EffectDefinition = {
  id: 'boids',
  label: 'Nuée',
  hint: 'Vol groupé émergent, trois règles locales',
  durationMs: DURATION,
  create,
}
