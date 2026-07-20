import type { EffectDefinition, EffectEnv, EffectRunner } from './types.ts'

/*
 * Désintégration — la surface part en poussière, balayée par un front.
 *
 * Faute de pouvoir capturer la page, on peint notre propre surface : une nappe
 * lumineuse quadrillée à la maille des futurs fragments. Le quadrillage est
 * CUIT dans l'image dès le départ, si bien que l'écran se lit d'emblée comme une
 * mosaïque de petits carrés — et chaque carré qui s'envole correspond
 * exactement à une case qu'on voyait déjà.
 *
 * L'astuce centrale est de ne JAMAIS dessiner la partie intacte case par case.
 * On pose l'image entière en un seul `drawImage`, puis on GOMME
 * (`destination-out`) la zone déjà dissoute. Le coût de la partie intacte est
 * donc constant quelle que soit la finesse de la maille, et elle reste nette au
 * pixel près au lieu d'être reconstituée en blocs approximatifs. Seuls les
 * fragments réellement détachés existent en tant qu'objets.
 *
 * Le gommage se fait en deux temps, et c'est ce qui fait tout l'effet : un
 * polygone unique efface le gros de la zone morte (une passe, très bon marché),
 * puis les cases de la LISIÈRE sont effacées une à une. Le front n'est donc
 * jamais une coupe nette — il est dentelé à l'échelle de la maille, il grignote.
 *
 * Chaque fragment hérite de la couleur exacte du pixel qu'il occupait, lue une
 * seule fois dans l'image source : la poussière garde le dessin en mémoire au
 * lieu d'être un nuage de points colorés au hasard.
 */

const DURATION = 7000
/** Plafond DUR : la maille est calculée pour que le nombre de cases y tienne. */
const MAX_FRAGMENTS = 2000
/** Le front met ce temps à traverser l'écran ; le reste sert à la retombée. */
const SWEEP_MS = 4300
/** Inclinaison du front, en px du haut au bas de l'écran. */
const TILT = 130
/** Teintes de braise : quelques chaînes fixes, jamais reconstruites. */
const EMBERS = ['rgb(255,214,150)', 'rgb(255,180,96)', 'rgb(255,240,214)']

interface Fragment {
  x: number
  y: number
  size: number
  vx: number
  vy: number
  /** Phase du tourbillon : deux cases voisines ne serpentent jamais ensemble. */
  phase: number
  swirlSpeed: number
  swirlAmp: number
  life: number
  decay: number
  color: string
  ember: boolean
}

function makeLayer(
  w: number,
  h: number,
  dpr: number,
): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(w * dpr))
  canvas.height = Math.max(1, Math.round(h * dpr))
  const g = canvas.getContext('2d')
  if (!g) throw new Error('disintegrate : contexte 2D hors écran indisponible')
  g.scale(dpr, dpr)
  return g
}

/** La surface à pulvériser : nappes colorées, structure, quadrillage. */
function paintSource(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  cell: number,
): void {
  g.fillStyle = '#080d1e'
  g.fillRect(0, 0, w, h)

  // Trois nappes larges composées en additif : leurs recouvrements créent des
  // teintes intermédiaires qu'aucune ne contient. C'est ce qui donnera à la
  // poussière une palette continue plutôt que trois couleurs franches.
  const span = Math.max(w, h)
  const blooms = [
    { x: w * 0.24, y: h * 0.34, r: span * 0.44, hue: 196 },
    { x: w * 0.74, y: h * 0.6, r: span * 0.42, hue: 276 },
    { x: w * 0.54, y: h * 0.16, r: span * 0.3, hue: 38 },
  ]
  g.globalCompositeOperation = 'lighter'
  for (const b of blooms) {
    const grad = g.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r)
    grad.addColorStop(0, `hsla(${b.hue}, 92%, 56%, 0.8)`)
    grad.addColorStop(0.45, `hsla(${b.hue}, 90%, 48%, 0.26)`)
    grad.addColorStop(1, `hsla(${b.hue}, 88%, 42%, 0)`)
    g.fillStyle = grad
    g.fillRect(0, 0, w, h)
  }

  // Quelques barres horizontales vives : sans elles la nappe est trop douce et
  // les fragments se ressemblent tous. Il faut des ruptures pour que la
  // dissolution donne du GRAIN.
  for (let i = 0; i < 7; i++) {
    const y = Math.random() * h
    const bh = 3 + Math.random() * 10
    g.fillStyle = `hsla(${[196, 276, 38, 152][i % 4]}, 100%, 70%, ${0.1 + Math.random() * 0.22})`
    g.fillRect(0, y, w, bh)
  }
  for (let i = 0; i < 120; i++) {
    g.fillStyle = `hsla(${190 + Math.random() * 110}, 100%, 78%, ${0.15 + Math.random() * 0.45})`
    g.fillRect(Math.random() * w, Math.random() * h, 3, 3)
  }

  // Vignette : assombrir les bords concentre le regard au centre, là où le front
  // passera le plus longtemps.
  g.globalCompositeOperation = 'source-over'
  const vig = g.createRadialGradient(
    w / 2,
    h / 2,
    Math.min(w, h) * 0.25,
    w / 2,
    h / 2,
    span * 0.72,
  )
  vig.addColorStop(0, 'rgba(0, 0, 0, 0)')
  vig.addColorStop(1, 'rgba(0, 0, 0, 0.72)')
  g.fillStyle = vig
  g.fillRect(0, 0, w, h)

  // Quadrillage à la maille des fragments, CUIT dans la source : la mosaïque
  // est visible avant même que quoi que ce soit ne se détache, donc le
  // spectateur comprend en quoi la surface va se décomposer.
  g.strokeStyle = 'rgba(3, 7, 18, 0.5)'
  g.lineWidth = 1
  g.beginPath()
  for (let x = cell; x < w; x += cell) {
    g.moveTo(Math.round(x) + 0.5, 0)
    g.lineTo(Math.round(x) + 0.5, h)
  }
  for (let y = cell; y < h; y += cell) {
    g.moveTo(0, Math.round(y) + 0.5)
    g.lineTo(w, Math.round(y) + 0.5)
  }
  g.stroke()
}

function create({ ctx, width, height }: EffectEnv): EffectRunner {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)

  // La maille se DÉDUIT du plafond de fragments : à surface d'écran donnée,
  // c'est la seule façon de garantir le budget quel que soit l'affichage. Le
  // léger facteur de sécurité absorbe les arrondis des `ceil` ci-dessous.
  const cell = Math.max(9, Math.sqrt((width * height) / MAX_FRAGMENTS) * 1.04)
  const cols = Math.ceil(width / cell)
  const rows = Math.ceil(height / cell)

  const src = makeLayer(width, height, dpr)
  paintSource(src, width, height, cell)

  // Lecture UNIQUE des pixels. Tout se joue ici : après ça, plus personne ne
  // touche à l'image source pour connaître une couleur.
  const image = src.getImageData(0, 0, src.canvas.width, src.canvas.height)
  const data = image.data
  const stride = src.canvas.width * 4
  const maxPx = src.canvas.width - 1
  const maxPy = src.canvas.height - 1

  // Chaînes de couleur mises en cache et quantifiées par pas de 8. Deux effets :
  // des milliers de teintes se ramènent à quelques dizaines de chaînes
  // RÉUTILISÉES, et la boucle de rendu n'alloue plus une seule chaîne par image
  // — c'est le piège classique qui fait chuter un rendu canvas à particules.
  const colorCache = new Map<number, string>()
  function colorAt(x: number, y: number): string {
    const px = Math.min(maxPx, Math.max(0, Math.round(x * dpr)))
    const py = Math.min(maxPy, Math.max(0, Math.round(y * dpr)))
    const i = py * stride + px * 4
    const r = data[i] & 0xf8
    const g = data[i + 1] & 0xf8
    const b = data[i + 2] & 0xf8
    const key = (r << 16) | (g << 8) | b
    const hit = colorCache.get(key)
    if (hit !== undefined) return hit
    const made = `rgb(${r},${g},${b})`
    colorCache.set(key, made)
    return made
  }

  const detached = new Uint8Array(cols * rows)
  // Décalage propre à chaque case : les cases ne cèdent pas toutes pile sur la
  // ligne du front. C'est cette irrégularité par case, ajoutée à l'ondulation
  // du front lui-même, qui empêche toute impression de coupe rectiligne.
  const jitter = new Float32Array(cols * rows)
  for (let i = 0; i < jitter.length; i++) {
    jitter[i] = (Math.random() * 2 - 1) * cell * 1.2
  }

  const fragments: Fragment[] = []

  /**
   * Abscisse du front à une ordonnée donnée : position d'ensemble, inclinaison,
   * et deux sinusoïdes de périodes incommensurables. Deux ondes suffisent à
   * casser toute régularité perceptible, là où une seule se lirait comme une
   * vague et trois coûteraient sans rien apporter.
   */
  function frontAt(y: number, front: number): number {
    return (
      front +
      TILT * (y / height - 0.5) +
      Math.sin(y * 0.0115) * 24 +
      Math.sin(y * 0.031 + 1.7) * 11
    )
  }

  function spawn(x: number, y: number, cx: number, cy: number): void {
    const ember = Math.random() < 0.12
    fragments.push({
      x,
      y,
      size: cell * (0.72 + Math.random() * 0.3),
      // Dérive latérale dans le sens du balayage : la poussière est emportée
      // par le front, elle ne part pas dans toutes les directions.
      vx: 0.012 + Math.random() * 0.1,
      vy: -0.1 - Math.random() * 0.24,
      phase: Math.random() * Math.PI * 2,
      swirlSpeed: 0.0025 + Math.random() * 0.0045,
      swirlAmp: 5 + Math.random() * 19,
      life: 1,
      decay: 1 / (1300 + Math.random() * 900),
      color: ember
        ? EMBERS[Math.floor(Math.random() * EMBERS.length)]
        : colorAt(cx, cy),
      ember,
    })
  }

  const EDGE = cell * 2.2

  return {
    frame(elapsed, dt) {
      // Progression du front, légèrement accélérée : la dissolution s'emballe,
      // elle ne balaie pas à vitesse constante comme un essuie-glace.
      const p = Math.min(elapsed / SWEEP_MS, 1)
      const front = p ** 1.3 * (width + EDGE * 2) - EDGE

      const fadeIn = Math.min(elapsed / 220, 1)
      const tail = Math.min((DURATION - elapsed) / 600, 1)
      const presence = Math.max(0, Math.min(fadeIn, tail))

      ctx.globalCompositeOperation = 'source-over'
      ctx.clearRect(0, 0, width, height)

      // 1) La surface intacte, en UN appel.
      ctx.globalAlpha = presence
      ctx.drawImage(src.canvas, 0, 0, width, height)

      // 2) Gommage grossier de la zone morte. `destination-out` retire de
      // l'alpha : le polygone ne peint rien, il perce. À pleine opacité, sinon
      // il subsisterait un voile fantôme derrière le front.
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'destination-out'
      ctx.beginPath()
      ctx.moveTo(-2, -2)
      ctx.lineTo(frontAt(0, front) - EDGE, -2)
      for (let y = 0; y <= height; y += 12) {
        ctx.lineTo(frontAt(y, front) - EDGE, y)
      }
      ctx.lineTo(frontAt(height, front) - EDGE, height + 2)
      ctx.lineTo(-2, height + 2)
      ctx.closePath()
      ctx.fill()

      // 3) Lisière : détachement et gommage case par case. On ne parcourt QUE
      // les colonnes proches du front — inutile de tester deux mille cases par
      // image quand seule une bande de quelques cases change d'état.
      for (let ry = 0; ry < rows; ry++) {
        const cy = ry * cell + cell / 2
        const fx = frontAt(cy, front)
        const from = Math.max(0, Math.floor((fx - EDGE - cell * 2) / cell))
        const to = Math.min(cols - 1, Math.ceil((fx + cell * 2) / cell))
        for (let rx = from; rx <= to; rx++) {
          const idx = ry * cols + rx
          const cx = rx * cell + cell / 2
          if (!detached[idx] && cx + jitter[idx] < fx) {
            detached[idx] = 1
            spawn(rx * cell, ry * cell, cx, cy)
          }
          if (detached[idx]) {
            // +1 px de recouvrement : sans lui, les arrondis laisseraient un
            // fin liseré de surface entre deux cases effacées.
            ctx.fillRect(rx * cell, ry * cell, cell + 1, cell + 1)
          }
        }
      }

      // 4) Physique de la poussière, puis rendu. Mise à jour et compactage en
      // une seule passe : on réécrit sur place les fragments encore vivants,
      // ce qui évite autant de `splice` que de morts.
      let alive = 0
      for (const f of fragments) {
        f.life -= f.decay * dt
        if (f.life <= 0) continue
        f.phase += f.swirlSpeed * dt
        // Ascendance : la cendre monte de plus en plus vite.
        f.vy -= 0.00009 * dt
        f.x += f.vx * dt
        f.y += f.vy * dt
        fragments[alive] = f
        alive++
      }
      fragments.length = alive

      // Passe pleine : le corps de la poussière.
      ctx.globalCompositeOperation = 'source-over'
      for (let i = 0; i < alive; i++) {
        const f = fragments[i]
        if (f.ember) continue
        // Le tourbillon est un DÉCALAGE au dessin, pas une accélération
        // intégrée : le fragment serpente autour de sa trajectoire sans jamais
        // dériver, et surtout on évite un save/rotate/restore par fragment —
        // une rotation propre serait invisible à cette taille et coûterait dix
        // fois plus cher.
        const wob = Math.sin(f.phase) * f.swirlAmp
        // La taille suit la vie : plus le fragment s'éloigne, plus il rapetisse.
        // La perspective est suggérée, rien n'est projeté.
        const s = f.size * (0.32 + 0.68 * f.life)
        ctx.globalAlpha = presence * (f.life > 0.4 ? 1 : f.life / 0.4)
        ctx.fillStyle = f.color
        ctx.fillRect(
          f.x + wob,
          f.y + Math.cos(f.phase) * f.swirlAmp * 0.3,
          s,
          s,
        )
      }

      // Passe additive : une braise sur huit, plus petite et plus vive. C'est
      // ce piqué chaud dispersé dans la cendre froide qui empêche le nuage de
      // paraître plat.
      ctx.globalCompositeOperation = 'lighter'
      for (let i = 0; i < alive; i++) {
        const f = fragments[i]
        if (!f.ember) continue
        const wob = Math.sin(f.phase) * f.swirlAmp
        const s = f.size * (0.32 + 0.68 * f.life) * 0.55
        ctx.globalAlpha = presence * f.life
        ctx.fillStyle = f.color
        ctx.fillRect(
          f.x + wob,
          f.y + Math.cos(f.phase) * f.swirlAmp * 0.3,
          s,
          s,
        )
      }

      // 5) Lisière incandescente. Un dégradé plein cadre ne suivrait pas les
      // ondulations du front ; on pose donc une barre additive par RANGÉE, qui
      // épouse exactement la découpe. Quelques dizaines de `fillRect`, et aucun
      // `shadowBlur` : le flou d'ombre canvas est hors de prix en boucle.
      if (front > -EDGE && front < width + EDGE) {
        ctx.globalAlpha = presence
        ctx.fillStyle = 'rgb(92,46,16)'
        for (let ry = 0; ry < rows; ry++) {
          const fx = frontAt(ry * cell + cell / 2, front)
          if (fx < -cell || fx > width + cell) continue
          ctx.fillRect(fx - cell * 1.6, ry * cell, cell * 2.2, cell + 1)
        }
      }

      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'

      // Sortie anticipée : une fois le front sorti et la dernière poussière
      // éteinte, il n'y a plus rien à animer — inutile d'attendre la durée
      // nominale devant un écran vide.
      if (p >= 1 && alive === 0) return false
      return elapsed < DURATION
    },
  }
}

export const disintegrateEffect: EffectDefinition = {
  id: 'disintegrate',
  label: 'Désintégration',
  hint: 'La surface part en poussière, balayée par un front',
  durationMs: DURATION,
  create,
}
