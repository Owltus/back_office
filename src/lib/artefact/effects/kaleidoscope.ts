import type { EffectDefinition, EffectEnv, EffectRunner } from './types.ts'

/*
 * Kaléidoscope — un motif unique, replié douze fois par symétrie miroir.
 *
 * Le motif n'est peint qu'UNE fois par image, dans un canvas hors écran, puis
 * blitté douze fois. Peindre les formes directement dans chaque secteur
 * reviendrait à refaire douze fois le même travail de rastérisation pour un
 * résultat identique ; ici la boucle de rendu ne fait plus que douze
 * `drawImage` découpés, ce qui laisse largement la place pour un motif riche.
 *
 * Et comme un secteur ne couvre que 30°, le motif n'est peint que dans le
 * PREMIER QUADRANT : tout ce qu'on dessinerait ailleurs serait immédiatement
 * jeté par le découpage. Les formes sont donc semées en coordonnées POLAIRES,
 * dans la plage angulaire visible — sinon l'essentiel du travail partirait à la
 * poubelle et les secteurs paraîtraient vides.
 *
 * La symétrie repose sur une propriété du nombre PAIR de secteurs. Pour un
 * secteur impair on tourne jusqu'à son bord sortant puis on retourne le plan par
 * `scale(-1, 1)`, qui renvoie tout angle θ sur π−θ. Ce demi-tour parasite tombe
 * pile sur une frontière de secteur (π vaut exactement six secteurs sur douze) :
 * l'image retombe donc dans un secteur impair, chaque secteur est couvert une
 * fois et une seule, et les coutures sont continues sans le moindre ajustement.
 * C'est ce qui distingue un vrai groupe de réflexion d'une simple rotation
 * répétée — sur celle-ci, les raccords se verraient tout de suite.
 *
 * La vitesse ANGULAIRE est ce qu'on module, pas l'angle : on l'intègre avec dt.
 * Piloter l'angle directement ferait des à-coups à chaque changement de régime,
 * alors qu'ici l'accélération puis le ralentissement sont continus par
 * construction.
 */

const DURATION = 7500
/** Nombre PAIR obligatoire : toute la symétrie miroir en dépend. */
const SECTORS = 12
const TAU = Math.PI * 2
const WEDGE = TAU / SECTORS
/** Défilement des teintes, en degrés par seconde. */
const HUE_SPEED = 26
/** Rotation résiduelle : le kaléidoscope ne s'immobilise jamais tout à fait. */
const OMEGA_BASE = 0.00018
/** Pointe de vitesse, en radians par milliseconde (un tour en ~2,4 s). */
const OMEGA_PEAK = 0.0026

interface Shape {
  /** Rayon et angle au repos, plus l'amplitude de leur oscillation. */
  r0: number
  a0: number
  rAmp: number
  aAmp: number
  rSpeed: number
  aSpeed: number
  phase: number
  size: number
  hue: number
  spin: number
  /** 0 disque, 1 anneau, 2 triangle, 3 barre. */
  kind: number
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
  if (!g) throw new Error('kaleidoscope : contexte 2D hors écran indisponible')
  g.scale(dpr, dpr)
  return g
}

function create({ ctx, width, height }: EffectEnv): EffectRunner {
  const cx = width / 2
  const cy = height / 2
  // Rayon nécessaire pour que les secteurs atteignent les coins de l'écran.
  const radius = Math.hypot(width, height) / 2 + 8

  // Densité d'affichage, mais bornée en TAILLE ABSOLUE : sur un grand écran le
  // canvas du motif deviendrait sinon énorme (le rayon suit la diagonale) pour
  // un gain de netteté imperceptible sur un motif fait de dégradés.
  const dpr = Math.min(window.devicePixelRatio || 1, 2, 1600 / radius)
  const motif = makeLayer(radius, radius, dpr)

  const shapes: Shape[] = Array.from({ length: 26 }, () => ({
    // Semées entre −6° et +36° : la plage du secteur, débordée juste ce qu'il
    // faut pour que les formes ENTRENT et SORTENT par les lignes de miroir.
    // C'est ce passage de frontière qui produit les figures symétriques qui
    // s'ouvrent et se referment, la signature du kaléidoscope.
    a0: -0.1 + Math.random() * 0.72,
    r0: radius * (0.06 + Math.random() * 0.86),
    rAmp: radius * (0.03 + Math.random() * 0.16),
    aAmp: 0.05 + Math.random() * 0.3,
    rSpeed: 0.25 + Math.random() * 0.85,
    aSpeed: 0.2 + Math.random() * 0.7,
    phase: Math.random() * TAU,
    size: radius * (0.035 + Math.random() * 0.13),
    hue: Math.random() * 360,
    spin: (Math.random() * 2 - 1) * 1.1,
    kind: Math.floor(Math.random() * 4),
  }))

  /** Le motif source, repeint à chaque image dans le premier quadrant. */
  function paintMotif(t: number): void {
    motif.globalCompositeOperation = 'source-over'
    motif.clearRect(0, 0, radius, radius)
    // Composition additive : les formes se SOMMENT au lieu de se masquer, ce
    // qui donne l'aspect vitrail rétroéclairé et dispense de tout tri par
    // profondeur — l'ordre de dessin n'a plus aucune importance.
    motif.globalCompositeOperation = 'lighter'

    for (const s of shapes) {
      const r = s.r0 + Math.sin(t * s.rSpeed + s.phase) * s.rAmp
      const a = s.a0 + Math.sin(t * s.aSpeed + s.phase * 1.7) * s.aAmp
      const x = Math.cos(a) * r
      const y = Math.sin(a) * r
      // Teintes qui défilent toutes ensemble : la palette entière glisse sur le
      // cercle chromatique, donc l'accord reste juste à chaque instant alors
      // même que les couleurs changent en permanence.
      const hue = (s.hue + t * HUE_SPEED) % 360

      if (s.kind === 0) {
        const grad = motif.createRadialGradient(x, y, 0, x, y, s.size)
        grad.addColorStop(0, `hsla(${hue}, 100%, 70%, 0.95)`)
        grad.addColorStop(0.5, `hsla(${hue}, 98%, 54%, 0.42)`)
        grad.addColorStop(1, `hsla(${hue}, 94%, 46%, 0)`)
        motif.fillStyle = grad
        motif.beginPath()
        motif.arc(x, y, s.size, 0, TAU)
        motif.fill()
      } else if (s.kind === 1) {
        motif.strokeStyle = `hsla(${hue}, 100%, 64%, 0.7)`
        motif.lineWidth = Math.max(2, s.size * 0.17)
        motif.beginPath()
        motif.arc(x, y, s.size * 0.82, 0, TAU)
        motif.stroke()
      } else if (s.kind === 2) {
        motif.save()
        motif.translate(x, y)
        motif.rotate(t * s.spin + s.phase)
        motif.fillStyle = `hsla(${hue}, 100%, 60%, 0.5)`
        motif.beginPath()
        motif.moveTo(s.size, 0)
        motif.lineTo(Math.cos(TAU / 3) * s.size, Math.sin(TAU / 3) * s.size)
        motif.lineTo(Math.cos(-TAU / 3) * s.size, Math.sin(-TAU / 3) * s.size)
        motif.closePath()
        motif.fill()
        motif.restore()
      } else {
        motif.save()
        motif.translate(x, y)
        motif.rotate(t * s.spin + s.phase)
        motif.fillStyle = `hsla(${hue}, 100%, 66%, 0.55)`
        motif.fillRect(-s.size * 1.5, -s.size * 0.12, s.size * 3, s.size * 0.24)
        motif.restore()
      }
    }
    motif.globalCompositeOperation = 'source-over'
  }

  let angle = 0

  return {
    frame(elapsed, dt) {
      const t = elapsed / 1000
      const p = Math.min(elapsed / DURATION, 1)

      // Accélération puis ralentissement, en une seule expression : un demi-arc
      // de sinus vaut 0 aux deux bouts et 1 au milieu. L'exposant resserre la
      // pointe, pour que la montée en vitesse se sente comme un élan.
      angle += (OMEGA_BASE + OMEGA_PEAK * Math.sin(Math.PI * p) ** 1.5) * dt

      // Respiration. Toujours ≥ 1 : en dessous, les secteurs cesseraient
      // d'atteindre les coins de l'écran et laisseraient apparaître des vides.
      const zoom = 1 + 0.11 * (1 - Math.cos(elapsed * 0.00085)) * 0.5

      const presence = Math.max(
        0,
        Math.min(elapsed / 420, (DURATION - elapsed) / 700, 1),
      )

      paintMotif(t)

      ctx.globalCompositeOperation = 'source-over'
      ctx.clearRect(0, 0, width, height)
      ctx.globalAlpha = presence

      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(angle)
      ctx.scale(zoom, zoom)

      for (let k = 0; k < SECTORS; k++) {
        ctx.save()
        if (k % 2 === 0) {
          ctx.rotate(k * WEDGE)
        } else {
          // Bord SORTANT du secteur amené sur l'axe, puis retournement du plan.
          // Le demi-tour induit par `scale(-1, 1)` tombe sur une frontière de
          // secteur, donc l'image atterrit dans un secteur impair : en
          // parcourant tous les k impairs, on les couvre tous, une seule fois.
          ctx.rotate((k + 1) * WEDGE)
          ctx.scale(-1, 1)
        }
        // Découpe construite APRÈS la transformation, donc en coordonnées
        // locales : le même triangle décrit toujours le secteur [0, WEDGE], et
        // c'est la matrice courante qui l'envoie au bon endroit. Sans cette
        // découpe, les copies déborderaient les unes sur les autres.
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.lineTo(radius, 0)
        ctx.arc(0, 0, radius, 0, WEDGE)
        ctx.closePath()
        ctx.clip()
        ctx.drawImage(motif.canvas, 0, 0, radius, radius)
        ctx.restore()
      }
      ctx.restore()

      // Cœur incandescent : dans un vrai kaléidoscope, les douze secteurs
      // convergent au centre et y accumulent la lumière. Sans ce noyau, le
      // point de fuite paraît creux.
      const coreR = Math.min(width, height) * 0.17
      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR)
      const coreHue = (t * HUE_SPEED * 1.6) % 360
      core.addColorStop(0, `hsla(${coreHue}, 100%, 82%, 0.6)`)
      core.addColorStop(0.4, `hsla(${(coreHue + 40) % 360}, 100%, 62%, 0.22)`)
      core.addColorStop(1, `hsla(${(coreHue + 80) % 360}, 100%, 55%, 0)`)
      ctx.globalCompositeOperation = 'lighter'
      ctx.fillStyle = core
      ctx.fillRect(cx - coreR, cy - coreR, coreR * 2, coreR * 2)

      // Fondu circulaire des bords, en `destination-out` : la figure se termine
      // en disque lumineux au lieu de s'arrêter net sur un bord rectangulaire.
      // À opacité PLEINE — sinon le fondu s'affaiblirait avec la présence et
      // les coins réapparaîtraient pendant les transitions.
      ctx.globalAlpha = 1
      const vig = ctx.createRadialGradient(cx, cy, radius * 0.5, cx, cy, radius)
      vig.addColorStop(0, 'rgba(0, 0, 0, 0)')
      vig.addColorStop(1, 'rgba(0, 0, 0, 1)')
      ctx.globalCompositeOperation = 'destination-out'
      ctx.fillStyle = vig
      ctx.fillRect(0, 0, width, height)

      ctx.globalCompositeOperation = 'source-over'

      return elapsed < DURATION
    },
  }
}

export const kaleidoscopeEffect: EffectDefinition = {
  id: 'kaleidoscope',
  label: 'Kaléidoscope',
  hint: 'Motif replié douze fois, teintes qui défilent',
  durationMs: DURATION,
  create,
}
