import type { EffectDefinition, EffectRunner, SvgEffectEnv } from './types.ts'

/*
 * Barre de musculation — une barre chargée tombe du haut de l'écran, un peu de
 * travers (un côté touche avant l'autre), rebondit sur le bas de la fenêtre dans
 * un petit nuage de magnésie, s'immobilise, puis roule vers l'avant et sort par
 * le bas.
 *
 * Effet SVG (mode « svg »). Chargement tiré au hasard mais réaliste : même
 * charge des deux côtés, le disque le plus lourd (le plus grand) contre
 * l'épaulement, puis des disques de plus en plus légers vers l'extérieur, le
 * plus gros seul pouvant être doublé, le collier de serrage en dernier.
 *
 * Physique : deux extrémités liées par un ressort (la barre), chacune soumise à
 * la gravité et rebondissant au sol ; au choc, les disques s'écrasent un instant
 * et la barre fléchit (deux oscillateurs amortis). Intégration en deux demi-pas
 * par image pour la stabilité du ressort raide.
 */

const DURATION = 6000
const NS = 'http://www.w3.org/2000/svg'
let runs = 0

/** Longueur de barre entre les deux piles de disques. */
const L = 300
/** Longueur du manchon (partie qui reçoit les disques). */
const SLEEVE = 92
const FACE = '#2C2C2A'
const SIDE = '#161615'
const EDGE = '#5F5E5A'
// Disques (fonte) : kg -> [épaisseur, rayon]. Le diamètre diminue avec le poids.
const SPEC: Record<string, [number, number]> = {
  25: [15, 54],
  20: [13, 49],
  15: [12, 43],
  10: [10, 36],
  5: [8, 29],
  2.5: [7, 23],
  1.25: [6, 18],
}
const ORDER = [25, 20, 15, 10, 5, 2.5, 1.25]

type Disque = [number, number, string, string]

function randomLoad(): Disque[] {
  const firsts = [25, 25, 20, 20, 15, 10]
  const first = firsts[Math.floor(Math.random() * firsts.length)]
  const list = [first]
  if (first >= 20 && Math.random() < 0.35) list.push(first)
  for (let i = ORDER.indexOf(first) + 1; i < ORDER.length; i++) {
    if (list.length < 5 && Math.random() < 0.45) list.push(ORDER[i])
  }
  const out: Disque[] = list.map((kg) => [SPEC[kg][0], SPEC[kg][1], FACE, SIDE])
  out.push([10, 13, '#D3D1C7', '#5F5E5A']) // collier de serrage
  return out
}

function plate(
  P: string,
  x0: number,
  t: number,
  r: number,
  c: string,
  d: string,
): string {
  const rx = r * 0.24
  const big = r > 20
  const steel = c !== FACE
  const stroke = steel ? '#5F5E5A' : EDGE
  // Tranche du disque : un seul tracé arrondi, l'ombrage suit la même forme
  const body = `M${x0} ${-r} L${x0 + t} ${-r} L${x0 + t} ${r} L${x0} ${r} A${rx} ${r} 0 0 1 ${x0} ${-r} Z`
  // Repères sur la tranche et la face : ils tournent quand la barre roule
  const th = Math.random() * 6.28
  let marks = ''
  let dots = ''
  if (!steel) {
    for (let i = 0; i < 4; i++)
      marks += `<line data-m="${[x0, t, r, rx, (th + i * 1.5708).toFixed(3)].join(',')}" stroke="#888780" stroke-width="1.6" stroke-linecap="round"/>`
    if (big)
      for (let i = 0; i < 2; i++)
        dots += `<circle data-f="${[x0 + t, r, rx, (th + i * 3.1416).toFixed(3)].join(',')}" r="2" fill="#B4B2A9"/>`
  }
  return (
    `<path d="${body}" fill="${d}"/>` +
    `<path d="${body}" fill="url(#${P}cyl)"/>` +
    marks +
    `<ellipse cx="${x0 + t}" cy="0" rx="${rx}" ry="${r}" fill="${c}" stroke="${stroke}" stroke-width="1"/>` +
    (big
      ? `<ellipse cx="${x0 + t}" cy="0" rx="${rx * 0.66}" ry="${r * 0.66}" fill="url(#${P}face)" stroke="${EDGE}" stroke-width="1.4"/>`
      : '') +
    dots +
    `<ellipse cx="${x0 + t}" cy="0" rx="${Math.max(2.2, rx * 0.3)}" ry="${Math.max(7, r * 0.2)}" fill="#D3D1C7" stroke="#5F5E5A" stroke-width="0.8"/>`
  )
}

interface Repere {
  el: SVGElement
  x0: number
  t: number
  r: number
  rx: number
  th: number
}
interface Point {
  el: SVGElement
  cx: number
  r: number
  rx: number
  th: number
}
interface Poussiere {
  el: SVGCircleElement
  x: number
  y: number
  vx: number
  vy: number
  r: number
  t: number
  life: number
}

function create({ layer, width: W, height: H }: SvgEffectEnv): EffectRunner {
  runs += 1
  const P = `bb${runs}-`
  const k = Math.max(0.6, Math.min(1.3, W / 900))
  const PLATES = randomLoad()

  let sL = ''
  let sR = ''
  let tot = 0
  let bigT = 0
  // le plus grand disque est toujours le premier (à l'intérieur)
  const rMax = PLATES[0][1]
  for (const p of PLATES) {
    tot += p[0]
    if (p[1] === rMax) bigT += p[0]
  }
  let x = -L / 2 - tot
  for (let i = PLATES.length - 1; i >= 0; i--) {
    const p = PLATES[i]
    sL += plate(P, x, p[0], p[1], p[2], p[3])
    x += p[0]
  }
  x = L / 2
  for (const q of PLATES) {
    sR += plate(P, x, q[0], q[1], q[2], q[3])
    x += q[0]
  }
  const end = L / 2 + SLEEVE
  const ex = (L / 2 + bigT / 2) * k
  const steel = 'stroke="#888780" stroke-linecap="round"'

  const root = document.createElement('div')
  root.style.cssText = 'position:absolute;inset:0;overflow:hidden;'
  root.innerHTML =
    `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="position:absolute;left:0;top:0;overflow:visible">` +
    '<defs>' +
    `<linearGradient id="${P}cyl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0.3"/><stop offset="0.16" stop-color="#fff" stop-opacity="0.34"/><stop offset="0.45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.45"/></linearGradient>` +
    `<linearGradient id="${P}face" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.22"/><stop offset="0.5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.3"/></linearGradient>` +
    '</defs>' +
    `<g data-id="g"><g transform="scale(${k})">` +
    `<g data-id="sl"><line x1="${-end}" y1="0" x2="${-L / 2}" y2="0" stroke-width="11" ${steel}/>${sL}</g>` +
    `<path data-id="bar" fill="none" stroke-width="7.5" ${steel}/>` +
    '<path data-id="barh" fill="none" stroke="#F1EFE8" stroke-width="2" stroke-linecap="round" stroke-opacity="0.8"/>' +
    `<g data-id="sr">${sR}` +
    `<line x1="${L / 2 + tot}" y1="0" x2="${end}" y2="0" stroke-width="11" ${steel}/>` +
    `<line x1="${L / 2 + tot + 4}" y1="-2.5" x2="${end - 2}" y2="-2.5" stroke="#F1EFE8" stroke-width="2" stroke-linecap="round" stroke-opacity="0.8"/></g>` +
    '</g></g><g data-id="dust"></g></svg>'
  layer.appendChild(root)

  const q = <T extends Element>(id: string) =>
    root.querySelector(`[data-id="${id}"]`) as T
  const G = q<SVGGElement>('g')
  const sides = [q<SVGGElement>('sl'), q<SVGGElement>('sr')]
  const bar = q<SVGPathElement>('bar')
  const barh = q<SVGPathElement>('barh')
  const dg = q<SVGGElement>('dust')
  const marks: Repere[] = Array.from(
    root.querySelectorAll<SVGElement>('[data-m]'),
  ).map((el) => {
    const a = (el.getAttribute('data-m') ?? '').split(',').map(Number)
    return { el, x0: a[0], t: a[1], r: a[2], rx: a[3], th: a[4] }
  })
  const dots: Point[] = Array.from(
    root.querySelectorAll<SVGElement>('[data-f]'),
  ).map((el) => {
    const a = (el.getAttribute('data-f') ?? '').split(',').map(Number)
    return { el, cx: a[0], r: a[1], rx: a[2], th: a[3] }
  })

  // Place les repères selon l'angle de rotation phi (en radians)
  function updateMarks(phi: number) {
    for (const m of marks) {
      const b = m.th + phi
      const c = Math.cos(b)
      if (c <= 0.08) {
        m.el.setAttribute('visibility', 'hidden')
        continue
      }
      const y = m.r * Math.sin(b)
      const e = m.rx * c
      m.el.setAttribute('visibility', 'visible')
      m.el.setAttribute('x1', (m.x0 - e + 1.5).toFixed(1))
      m.el.setAttribute('x2', (m.x0 + m.t - e - 0.5).toFixed(1))
      m.el.setAttribute('y1', y.toFixed(1))
      m.el.setAttribute('y2', y.toFixed(1))
      m.el.setAttribute('stroke-opacity', Math.min(1, c * 1.4).toFixed(2))
    }
    for (const m of dots) {
      const b = m.th + phi
      m.el.setAttribute('cx', (m.cx - m.rx * 0.83 * Math.cos(b)).toFixed(1))
      m.el.setAttribute('cy', (m.r * 0.83 * Math.sin(b)).toFixed(1))
    }
  }
  updateMarks(0)

  // La barre part légèrement de travers : un côté touche avant l'autre
  const tilt = (Math.random() < 0.5 ? -1 : 1) * (50 + Math.random() * 50)
  const g = H * 5
  const yF = H - rMax * k
  let yl = -rMax * k - 60 - (tilt > 0 ? tilt : 0)
  let yr = -rMax * k - 60 - (tilt < 0 ? -tilt : 0)
  let vl = 0
  let vr = 0
  const sq = [0, 0]
  const sqv = [0, 0]
  let fx = 0
  let fv = 0
  let rest = 0
  let roll = 0
  let rollV = 0
  const dust: Poussiere[] = []

  // Choc au sol : écrasement des disques, flexion de la barre, nuage de magnésie
  function impact(side: number, speed: number) {
    const ref = H * 2.5
    sqv[side] += (speed / ref) * 2.6
    fv += (speed / ref) * 500
    const n = Math.round(Math.min(16, Math.max(3, (speed / ref) * 13)))
    const cx = W / 2 + (side ? 1 : -1) * ex
    const pw = speed / ref + 0.3
    for (let i = 0; i < n; i++) {
      const c = document.createElementNS(NS, 'circle')
      const dir = Math.random() < 0.5 ? -1 : 1
      c.setAttribute('fill', '#B4B2A9')
      dg.appendChild(c)
      dust.push({
        el: c,
        x: cx + dir * (20 + Math.random() * 30) * k,
        y: H - 3,
        vx: dir * (40 + Math.random() * 150) * pw,
        vy: -(15 + Math.random() * 80) * pw,
        r: (3 + Math.random() * 4) * k,
        t: 0,
        life: 0.5 + Math.random() * 0.45,
      })
    }
  }

  function end1(
    y: number,
    v: number,
    side: number,
    dt: number,
  ): [number, number] {
    v += g * dt
    y += v * dt
    if (y >= yF) {
      y = yF
      if (v > H * 0.15) {
        impact(side, v)
        v = -v * 0.42
      } else v = 0
    }
    return [y, v]
  }

  return {
    frame(_elapsed, dtMs) {
      const dt = Math.min(0.034, dtMs / 1000)
      for (let n = 0; n < 2; n++) {
        const h = dt / 2
        // Les deux extrémités sont liées par la barre
        const cl = (yr - yl) * 26 + (vr - vl) * 3
        vl += cl * h
        vr -= cl * h
        ;[yl, vl] = end1(yl, vl, 0, h)
        ;[yr, vr] = end1(yr, vr, 1, h)
        for (let i = 0; i < 2; i++) {
          sqv[i] += (-900 * sq[i] - 16 * sqv[i]) * h
          sq[i] += sqv[i] * h
        }
        fv += (-2600 * fx - 10 * fv) * h
        fx += fv * h
      }

      const cy = (yl + yr) / 2
      const ang = (Math.atan2(yr - yl, 2 * ex) * 180) / Math.PI
      G.setAttribute(
        'transform',
        `translate(${(W / 2).toFixed(1)},${(cy + roll).toFixed(1)}) rotate(${ang.toFixed(2)})`,
      )

      const f = Math.max(-18, Math.min(18, fx))
      const hl = L / 2
      bar.setAttribute('d', `M${-hl} 0 Q0 ${(f * 2).toFixed(1)} ${hl} 0`)
      barh.setAttribute(
        'd',
        `M${-hl + 4} -2.2 Q0 ${(f * 2 - 2.2).toFixed(1)} ${hl - 4} -2.2`,
      )

      for (let j = 0; j < 2; j++) {
        const s = Math.max(-0.04, Math.min(0.14, sq[j]))
        sides[j].setAttribute(
          'transform',
          `translate(0,${(rMax * s).toFixed(2)}) scale(${(1 + s * 0.35).toFixed(3)},${(1 - s).toFixed(3)})`,
        )
      }

      for (let m = dust.length - 1; m >= 0; m--) {
        const p = dust[m]
        p.t += dt
        if (p.t >= p.life) {
          p.el.remove()
          dust.splice(m, 1)
          continue
        }
        p.vx *= 1 - 2.5 * dt
        p.vy *= 1 - 2.5 * dt
        p.x += p.vx * dt
        p.y += p.vy * dt
        const u = p.t / p.life
        p.el.setAttribute('cx', p.x.toFixed(1))
        p.el.setAttribute('cy', p.y.toFixed(1))
        p.el.setAttribute('r', (p.r * (1 + u * 2.2)).toFixed(1))
        p.el.setAttribute('opacity', (0.5 * (1 - u)).toFixed(3))
      }

      // Sortie : une fois la barre immobile, elle roule vers l'avant (vers le
      // spectateur) et quitte l'écran par le bas, sans fondu.
      const still =
        yl >= yF - 0.5 && yr >= yF - 0.5 && Math.abs(vl) < 5 && Math.abs(vr) < 5
      rest = still ? rest + dt : 0
      if (rest > 1.8) {
        rollV += 260 * k * dt
        roll += rollV * dt
        updateMarks(roll / (rMax * k))
        if (roll > 2 * rMax * k + 20) return false
      }
      return true
    },
    destroy() {
      root.remove()
    },
  }
}

export const barbellEffect: EffectDefinition = {
  id: 'barbell',
  label: 'Barre de musculation',
  hint: 'Une barre chargée tombe, rebondit puis roule hors de l’écran',
  durationMs: DURATION,
  mode: 'svg',
  create,
}
