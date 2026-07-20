import type { EffectDefinition, EffectEnv, EffectRunner } from './types.ts'

/*
 * Glitch numérique — décrochage d'un signal vidéo.
 *
 * On ne peut pas capturer la vraie page (html2canvas coûte bien trop cher pour
 * un effet temps réel, et il faudrait le refaire à chaque image). On PEINT donc
 * notre propre écran — une interface de données synthétique — UNE SEULE FOIS
 * dans un canvas hors écran, puis chaque image se contente d'en recopier des
 * tranches décalées. Tout le coût de dessin est payé au montage ; la boucle ne
 * fait plus que des `drawImage`, qui sont accélérés matériellement.
 *
 * L'aberration chromatique repose sur une identité exacte : une copie ne gardant
 * que le rouge (r,0,0) additionnée d'une copie ne gardant que le cyan (0,g,b)
 * redonne EXACTEMENT (r,g,b). En composant les deux en `lighter` et en les
 * décalant en opposition, les franges rouge et cyan n'apparaissent QU'aux bords
 * des zones désalignées, et l'image redevient d'elle-même normale partout
 * ailleurs. C'est le comportement d'une vraie séparation de couches, pas un
 * filtre coloré posé par-dessus — la différence se voit immédiatement.
 *
 * Le RYTHME prime sur le bruit : un glitch continu ressemble à de la neige et
 * cesse d'être lisible. On alterne donc des salves courtes et violentes avec des
 * plages presque propres, et à l'intérieur même d'une salve certaines images
 * sont volontairement remises à plat — le signal « raccroche » un instant avant
 * de repartir. C'est cette irrégularité, pas l'amplitude, qui rend l'effet
 * crédible.
 */

const DURATION = 6000
/** En dessous de cette hauteur, un déchirement de bande vire au bruit illisible. */
const BAND_MIN = 18
/** Teintes d'accent de la scène — cyan, violet, ambre, vert, magenta. */
const ACCENT = [196, 268, 42, 152, 330]

interface Band {
  y: number
  h: number
  /**
   * Sens et force du décalage, tirés au sort à chaque salve puis STABLES
   * pendant toute sa durée : une bande qui saute au hasard à chaque image ne
   * se lit pas comme un arrachement, seulement comme du grésillement.
   */
  bias: number
}

interface Block {
  x: number
  y: number
  w: number
  h: number
  /** Origine du morceau recopié, pris ailleurs dans la scène. */
  sx: number
  sy: number
  /** Durée de vie en IMAGES : un bloc corrompu clignote, il ne s'anime jamais. */
  ttl: number
  /** Non nul pour un bloc de couleur pleine (saturation d'un décodeur perdu). */
  solid: string | null
}

/**
 * Canvas hors écran à la densité réelle de l'affichage, avec le contexte déjà
 * mis à l'échelle : on peint ensuite en pixels CSS sans jamais y repenser.
 * On récupère l'élément par `g.canvas` quand `drawImage` en a besoin.
 */
function makeLayer(
  w: number,
  h: number,
  dpr: number,
): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(w * dpr))
  canvas.height = Math.max(1, Math.round(h * dpr))
  const g = canvas.getContext('2d')
  if (!g) throw new Error('glitch : contexte 2D hors écran indisponible')
  g.scale(dpr, dpr)
  return g
}

function textLines(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  rows: number,
): void {
  for (let i = 0; i < rows; i++) {
    // Largeurs inégales : c'est ce qui fait lire « du texte » plutôt que « des
    // barres », alors qu'aucune police n'est chargée.
    g.fillStyle = `rgba(150, 180, 232, ${0.12 + Math.random() * 0.22})`
    g.fillRect(x, y + i * 15, w * (0.4 + Math.random() * 0.6), 6)
  }
}

function panel(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  hue: number,
): void {
  g.fillStyle = `hsla(${hue}, 70%, 46%, 0.10)`
  g.fillRect(x, y, w, h)
  g.strokeStyle = `hsla(${hue}, 90%, 62%, 0.5)`
  g.lineWidth = 1
  g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)
  // Liseré épais et saturé sur le bord gauche : ce sont les arêtes FRANCHES et
  // colorées qui produisent les franges rouge/cyan les plus lisibles une fois
  // les couches désalignées. Une scène en dégradés doux ne glitcherait pas.
  g.fillStyle = `hsl(${hue}, 92%, 60%)`
  g.fillRect(x, y, 4, h)
  textLines(g, x + 18, y + 26, w - 36, Math.max(2, Math.floor((h - 40) / 15)))
}

/** La scène à démolir : un tableau de bord dense, peint une seule fois. */
function paintScene(g: CanvasRenderingContext2D, w: number, h: number): void {
  // Fond OPAQUE : l'effet remplace l'écran le temps de la salve. Un fond
  // translucide laisserait transparaître la vraie page derrière les bandes
  // décalées et ruinerait l'illusion d'un signal qui décroche.
  g.fillStyle = '#070c1a'
  g.fillRect(0, 0, w, h)

  // Grille technique très basse en contraste : invisible au repos, elle ne se
  // révèle qu'une fois DÉCALÉE, où les ruptures d'alignement trahissent
  // instantanément le déchirement.
  g.strokeStyle = 'rgba(104, 148, 226, 0.09)'
  g.lineWidth = 1
  g.beginPath()
  for (let x = 0.5; x < w; x += 44) {
    g.moveTo(x, 0)
    g.lineTo(x, h)
  }
  for (let y = 0.5; y < h; y += 44) {
    g.moveTo(0, y)
    g.lineTo(w, y)
  }
  g.stroke()

  const pad = Math.min(64, w * 0.06)
  const inner = w - pad * 2

  // Bandeau de titre.
  g.fillStyle = 'hsl(196, 95%, 62%)'
  g.fillRect(pad, pad, Math.min(340, inner * 0.3), 24)
  g.fillStyle = 'rgba(160, 190, 240, 0.38)'
  g.fillRect(pad, pad + 38, Math.min(520, inner * 0.45), 8)
  g.fillStyle = 'hsla(42, 95%, 60%, 0.75)'
  g.fillRect(w - pad - 96, pad, 96, 10)

  // Trois panneaux d'indicateurs.
  const gap = 22
  const colW = (inner - gap * 2) / 3
  const panelY = pad + 78
  const panelH = Math.max(110, Math.min(160, h * 0.19))
  for (let i = 0; i < 3; i++) {
    panel(g, pad + i * (colW + gap), panelY, colW, panelH, ACCENT[i])
  }

  // Bloc de « texte » long sur la colonne de gauche.
  const listY = panelY + panelH + 34
  const listH = Math.max(60, h - listY - pad - 200)
  textLines(g, pad, listY, inner * 0.42, Math.max(3, Math.floor(listH / 15)))

  // Histogramme : des arêtes verticales nettes, parfaites pour révéler les
  // décalages horizontaux des bandes.
  const chartH = 150
  const chartY = h - pad - chartH
  const chartX = pad + inner * 0.5
  const chartW = inner * 0.5
  const bars = Math.max(6, Math.min(26, Math.floor(chartW / 24)))
  const barW = chartW / bars
  // Un SEUL dégradé réutilisé par toutes les colonnes : elles partagent la même
  // plage verticale, inutile d'en construire un par barre.
  const grad = g.createLinearGradient(0, chartY, 0, chartY + chartH)
  grad.addColorStop(0, 'hsla(196, 100%, 66%, 0.95)')
  grad.addColorStop(1, 'hsla(268, 90%, 52%, 0.25)')
  g.fillStyle = grad
  for (let i = 0; i < bars; i++) {
    const bh = chartH * (0.15 + Math.random() * 0.85)
    g.fillRect(chartX + i * barW + 3, chartY + chartH - bh, barW - 6, bh)
  }
  g.strokeStyle = 'rgba(120, 160, 230, 0.35)'
  g.beginPath()
  g.moveTo(chartX, chartY + chartH + 0.5)
  g.lineTo(chartX + chartW, chartY + chartH + 0.5)
  g.stroke()

  // Points lumineux épars : de petites sources vives dispersées, qui donneront
  // des franges colorées isolées partout dans le cadre.
  for (let i = 0; i < 44; i++) {
    g.fillStyle = `hsla(${ACCENT[i % ACCENT.length]}, 100%, 74%, ${0.22 + Math.random() * 0.5})`
    g.fillRect(Math.random() * w, Math.random() * h, 2, 2)
  }
}

/**
 * Copie de la scène réduite à une seule composante colorée. `multiply` avec du
 * rouge pur annule le vert et le bleu et laisse (r,0,0) ; la scène étant opaque,
 * il n'y a aucun masque d'alpha à restaurer derrière — d'où le choix d'un fond
 * plein plutôt que transparent.
 */
function tintLayer(
  scene: CanvasRenderingContext2D,
  w: number,
  h: number,
  dpr: number,
  color: string,
): HTMLCanvasElement {
  const g = makeLayer(w, h, dpr)
  g.drawImage(scene.canvas, 0, 0, w, h)
  g.globalCompositeOperation = 'multiply'
  g.fillStyle = color
  g.fillRect(0, 0, w, h)
  return g.canvas
}

function create({ ctx, width, height }: EffectEnv): EffectRunner {
  // Plafonné à 2 : au-delà, la mémoire des trois calques hors écran grimpe vite
  // pour un gain visuel nul.
  const dpr = Math.min(window.devicePixelRatio || 1, 2)

  const scene = makeLayer(width, height, dpr)
  paintScene(scene, width, height)
  const redLayer = tintLayer(scene, width, height, dpr, '#ff0000')
  const cyanLayer = tintLayer(scene, width, height, dpr, '#00ffff')

  // Motif de scanlines : une ligne sombre tous les 3 px, construite une fois
  // dans un canvas de 1×3 puis répétée par le moteur. Une boucle de `fillRect`
  // sur toute la hauteur coûterait des centaines d'appels par image.
  const scan = document.createElement('canvas')
  scan.width = 1
  scan.height = 3
  const scanCtx = scan.getContext('2d')
  if (scanCtx) {
    scanCtx.fillStyle = 'rgba(0, 0, 0, 0.34)'
    scanCtx.fillRect(0, 0, 1, 1)
  }
  const scanPattern = ctx.createPattern(scan, 'repeat')

  const bands: Band[] = []
  const blocks: Block[] = []

  function diceBands(): void {
    bands.length = 0
    let y = 0
    while (y < height) {
      const h = Math.min(BAND_MIN + Math.random() * (height / 6), height - y)
      // Un peu plus de la moitié des bandes reste EN PLACE : une image
      // intégralement déchirée devient une bouillie sans échelle. Ce sont les
      // zones intactes qui donnent la mesure du décalage des autres.
      bands.push({
        y,
        h,
        bias: Math.random() < 0.45 ? Math.random() * 2 - 1 : 0,
      })
      y += h
    }
  }
  diceBands()

  /** Une tranche pleine largeur, de la source vers l'écran, à hauteur donnée. */
  function strip(
    layer: HTMLCanvasElement,
    sy: number,
    sh: number,
    dx: number,
    dy: number,
  ): void {
    if (sh <= 0.5) return
    ctx.drawImage(layer, 0, sy * dpr, width * dpr, sh * dpr, dx, dy, width, sh)
  }

  function drawBands(
    layer: HTMLCanvasElement,
    baseDx: number,
    roll: number,
    amp: number,
  ): void {
    for (const b of bands) {
      // Biais stable de la salve + un frémissement d'une image à l'autre, sans
      // lequel la bande paraîtrait simplement figée dans sa nouvelle position.
      const jitter = b.bias === 0 ? 0 : (Math.random() * 2 - 1) * amp * 0.12
      const dx = baseDx + b.bias * amp + jitter

      // Défilement vertical : la source est lue avec un décalage cyclique, donc
      // une bande peut chevaucher le raccord et se lire en deux morceaux.
      let sy = (b.y + roll) % height
      if (sy < 0) sy += height
      const head = Math.min(b.h, height - sy)

      strip(layer, sy, head, dx, b.y)
      strip(layer, 0, b.h - head, dx, b.y + head)

      // Le décalage laisse un vide d'un côté. On recopie la bande translatée
      // d'une largeur d'écran pour le combler : sans ce bouclage, un trou
      // transparent laisserait voir la page et l'écran ne semblerait plus pris.
      if (dx > 0.5 || dx < -0.5) {
        const wrapX = dx > 0 ? dx - width : dx + width
        strip(layer, sy, head, wrapX, b.y)
        strip(layer, 0, b.h - head, wrapX, b.y + head)
      }
    }
  }

  // Horloge des salves. `nextBurst` très bas : l'effet doit FRAPPER dès la
  // première image, un glitch qui s'installe progressivement n'existe pas.
  let nextBurst = 60
  let burstEnd = 0
  let burstLen = 1
  let burstPower = 0
  let roll = 0
  let sweep = 0

  return {
    frame(elapsed, dt) {
      // Dernière fraction de seconde : on enchaîne les salves sans répit, pour
      // finir sur une rupture franche plutôt qu'en s'éteignant mollement.
      const finale = elapsed > DURATION - 640

      if (elapsed >= nextBurst) {
        burstPower = finale
          ? 0.9 + Math.random() * 0.3
          : 0.3 + Math.random() * 0.7
        burstLen = finale ? 90 + Math.random() * 120 : 110 + Math.random() * 430
        burstEnd = elapsed + burstLen
        // Silence variable entre deux salves : c'est cette respiration qui rend
        // la suivante violente. Un intervalle constant se mettrait à ronronner.
        nextBurst = burstEnd + (finale ? 0 : 200 + Math.random() * 780)
        diceBands()
      }

      let env = 0
      if (elapsed < burstEnd) {
        const k = 1 - (burstEnd - elapsed) / burstLen
        // Attaque quasi instantanée puis extinction en courbe : un glitch frappe
        // et se résorbe, jamais l'inverse.
        env = burstPower * Math.min(k / 0.06, 1) * (1 - k) ** 1.4
        // Le signal RACCROCHE par instants au milieu d'une salve. Quelques
        // images remises à plat valent tout le reste : c'est ce hoquet qui
        // sépare un glitch numérique d'un simple bruit analogique.
        if (Math.random() < 0.18) env *= 0.08
      }
      // Tremblement de fond permanent : l'image n'est jamais tout à fait stable.
      const intensity = Math.max(env, 0.035)

      const fadeIn = Math.min(elapsed / 160, 1)
      const fadeOut = Math.min((DURATION - elapsed) / 520, 1)
      const presence = Math.max(0, Math.min(fadeIn, fadeOut))

      ctx.globalCompositeOperation = 'source-over'
      ctx.clearRect(0, 0, width, height)
      ctx.globalAlpha = presence

      ctx.save()
      // Micro-secousse : quelques pixels suffisent, au-delà l'œil décroche.
      ctx.translate(
        (Math.random() * 2 - 1) * 9 * intensity,
        (Math.random() * 2 - 1) * 5 * intensity,
      )

      // Perte de synchro VERTICALE : l'image glisse d'un bloc, mais seulement
      // sur les salves fortes. Le compteur avance en permanence pour que chaque
      // décrochage reparte d'une position différente.
      roll += dt * 1.4
      const rollY = env > 0.45 ? roll % height : 0

      const ab = 1.5 + intensity * 16
      const amp = intensity * width * 0.09

      // Les deux couches se RECOMPOSENT là où elles se superposent : c'est la
      // somme (lighter) qui restitue la couleur d'origine, pas un mélange.
      ctx.globalCompositeOperation = 'lighter'
      drawBands(cyanLayer, ab, rollY, amp)
      drawBands(redLayer, -ab, rollY, amp)

      // Blocs de données corrompues. Plutôt que du bruit aléatoire, on RECOPIE
      // un morceau pris ailleurs dans la scène : c'est exactement ce que produit
      // un macrobloc mal décodé, et l'œil reconnaît aussitôt le motif « vidéo
      // cassée ». Ils sont pris sur la scène NON teintée, ce qui les fait
      // ressortir, nets, sur le fond désaligné.
      if (env > 0.3 && Math.random() < 0.75) {
        const n = 1 + Math.floor(Math.random() * 4)
        for (let i = 0; i < n; i++) {
          const bw = 40 + Math.random() * Math.min(320, width * 0.3)
          const bh = 8 + Math.random() * 46
          blocks.push({
            x: Math.random() * (width - bw),
            y: Math.random() * (height - bh),
            w: bw,
            h: bh,
            sx: Math.random() * (width - bw),
            sy: Math.random() * (height - bh),
            ttl: 1 + Math.floor(Math.random() * 2),
            solid:
              Math.random() < 0.18
                ? `hsl(${ACCENT[Math.floor(Math.random() * ACCENT.length)]}, 100%, ${50 + Math.random() * 30}%)`
                : null,
          })
        }
      }

      ctx.globalCompositeOperation = 'source-over'
      for (let i = blocks.length - 1; i >= 0; i--) {
        const bl = blocks[i]
        if (bl.solid) {
          ctx.fillStyle = bl.solid
          ctx.fillRect(bl.x, bl.y, bl.w, bl.h)
        } else {
          ctx.drawImage(
            scene.canvas,
            bl.sx * dpr,
            bl.sy * dpr,
            bl.w * dpr,
            bl.h * dpr,
            bl.x,
            bl.y,
            bl.w,
            bl.h,
          )
        }
        bl.ttl -= 1
        if (bl.ttl <= 0) blocks.splice(i, 1)
      }

      if (scanPattern) {
        ctx.fillStyle = scanPattern
        ctx.fillRect(0, 0, width, height)
      }

      // Barre de balayage : l'interférence lente qui descend sur un tube
      // cathodique. Elle tourne en permanence, indépendamment des salves — c'est
      // le repère qui prouve que « l'écran » est vivant entre deux décrochages.
      sweep = (sweep + dt * 0.28) % (height + 220)
      const gy = sweep - 220
      const bar = ctx.createLinearGradient(0, gy, 0, gy + 220)
      bar.addColorStop(0, 'rgba(120, 190, 255, 0)')
      bar.addColorStop(0.5, `rgba(120, 190, 255, ${0.05 + intensity * 0.1})`)
      bar.addColorStop(1, 'rgba(120, 190, 255, 0)')
      ctx.globalCompositeOperation = 'lighter'
      ctx.fillStyle = bar
      ctx.fillRect(0, gy, width, 220)

      ctx.restore()
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'

      return elapsed < DURATION
    },
  }
}

export const glitchEffect: EffectDefinition = {
  id: 'glitch',
  label: 'Glitch',
  hint: 'Bandes arrachées, aberration chromatique, salves',
  durationMs: DURATION,
  create,
}
