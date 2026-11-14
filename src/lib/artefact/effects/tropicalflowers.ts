import type { EffectDefinition, EffectRunner, SvgEffectEnv } from './types.ts'

/*
 * Fleurs tropicales — une gerbe d'hibiscus, de frangipaniers, de tiarés, de
 * feuilles et de pétales jaillit du bas de l'écran, s'ouvre au sommet de sa
 * course puis redescend en se balançant comme une feuille morte, avant de
 * sortir par le bas.
 *
 * Effet SVG (mode « svg ») : chaque fleur est un petit SVG vectoriel à
 * dégradés, posé dans le calque de l'overlay et déplacé par `transform`.
 * Physique propre à chaque élément :
 *   - montée balistique freinée, gravité proportionnelle à la hauteur d'écran ;
 *   - descente à vitesse limite (les pétales tombent plus lentement que les
 *     fleurs), balancement et bascule qui montent en douceur ;
 *   - pétales fermés pendant la montée, ouverts au sommet, qui frémissent à la
 *     descente ; pistil et feuilles en retard sur le mouvement horizontal.
 * L'effet se termine quand le dernier élément est sorti par le bas.
 */

const DURATION = 7000
const NS_ID = 'tf'
let runs = 0

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)

function rg(id: string, st: (number | string)[]): string {
  let s = `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="20" cy="20" r="19">`
  for (let i = 0; i < st.length; i += 2)
    s += `<stop offset="${st[i]}" stop-color="${st[i + 1]}"/>`
  return s + '</radialGradient>'
}

function lg(id: string, a: string, b: string): string {
  return `<linearGradient id="${id}" x1="0" y1="1" x2="0.3" y2="0"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`
}

function wrap(s: string): string {
  return `<svg viewBox="0 0 40 40" width="100%" height="100%" style="display:block;overflow:visible">${s}</svg>`
}

const TS = 'style="transform-box:view-box;transform-origin:20px 20px"'

// Hibiscus : deux rangées de pétales ondulés + pistil
const HP =
  'M20 20 C10 17 3.5 9.5 8.5 4 C11.5 1 15.5 3.2 20 1.8 C24.5 3.2 28.5 1 31.5 4 C36.5 9.5 30 17 20 20 Z'
const HS = 'M20 20 C10 17 3.5 9.5 8.5 4 C11.5 1 15.5 3.2 20 1.8 Z'

// Frangipanier : pétales en hélice, cœur jaune
const PP =
  'M20 20 C12.5 17.5 8.5 8.5 15.5 3 C23.5 1.5 29.5 8.5 27.5 14.5 C26 18 22.5 19.5 20 20 Z'

type Genre = 'f' | 'h' | 'p' | 't' | 'l' | 'q'

interface Fleur {
  el: HTMLDivElement
  type: Genre
  s: number
  x: number
  y: number
  vx: number
  vy: number
  v0: number
  g: number
  vt: number
  rot: number
  vr: number
  delay: number
  t: number
  fall: number
  ph: number
  fq: number
  amp: number
  rock: number
  tum: number
  tf: number
  ph2: number
  pts: NodeListOf<SVGGElement>
  st: SVGGElement | null
  o: number
  lag: number
  fl: number
}

function create({ layer, width: W, height: H }: SvgEffectEnv): EffectRunner {
  // Identifiants de dégradés propres à ce déclenchement : deux salves ne
  // partagent jamais un `id` dans le document.
  runs += 1
  const P = `${NS_ID}${runs}-`
  const u = (id: string) => `url(#${P}${id})`

  const DEFS =
    '<defs>' +
    rg(P + 'h1', [
      0,
      '#791F1F',
      0.26,
      '#791F1F',
      0.52,
      '#E24B4A',
      1,
      '#F09595',
    ]) +
    rg(P + 'h2', [
      0,
      '#72243E',
      0.26,
      '#72243E',
      0.52,
      '#D4537E',
      1,
      '#F4C0D1',
    ]) +
    rg(P + 'h3', [
      0,
      '#A32D2D',
      0.26,
      '#A32D2D',
      0.52,
      '#F0997B',
      1,
      '#F5C4B3',
    ]) +
    rg(P + 'h4', [
      0,
      '#E24B4A',
      0.26,
      '#E24B4A',
      0.5,
      '#FAC775',
      1,
      '#FAEEDA',
    ]) +
    rg(P + 'p1', [
      0,
      '#EF9F27',
      0.26,
      '#FAC775',
      0.6,
      '#FFFFFF',
      1,
      '#FFFFFF',
    ]) +
    rg(P + 'p2', [
      0,
      '#EF9F27',
      0.26,
      '#FAC775',
      0.6,
      '#F4C0D1',
      1,
      '#ED93B1',
    ]) +
    rg(P + 't1', [0, '#C0DD97', 0.3, '#FFFFFF', 0.8, '#FFFFFF', 1, '#F1EFE8']) +
    lg(P + 'lf', '#0F6E56', '#5DCAA5') +
    lg(P + 'q1', '#D4537E', '#F4C0D1') +
    lg(P + 'q2', '#E24B4A', '#F7C1C1') +
    lg(P + 'q3', '#D3D1C7', '#FFFFFF') +
    lg(P + 'q4', '#D85A30', '#F5C4B3') +
    lg(P + 'q5', '#EF9F27', '#FAEEDA') +
    '</defs>'

  function hibiscus(gid: string, d: string): string {
    let p = ''
    for (let i = 0; i < 5; i++)
      p += `<g transform="rotate(${i * 72 + 44} 20 20)"><g class="pt" ${TS}><path d="${HP}" fill="${d}" transform="translate(20 20) scale(0.93) translate(-20 -20)"/></g></g>`
    for (let i = 0; i < 5; i++)
      p +=
        `<g transform="rotate(${i * 72 + 8} 20 20)"><g class="pt" ${TS}><path d="${HP}" fill="${u(gid)}" stroke="${d}" stroke-width="0.5" stroke-linejoin="round"/>` +
        `<path d="${HS}" fill="#2C2C2A" fill-opacity="0.16"/>` +
        '<ellipse cx="26" cy="7" rx="4.2" ry="2.2" fill="#FFFFFF" fill-opacity="0.28" transform="rotate(28 26 7)"/>' +
        `<path d="M20 17 L20 6 M20 17 L14.5 7 M20 17 L25.5 7 M20 17 L10.5 10 M20 17 L29.5 10" stroke="${d}" stroke-width="0.4" stroke-opacity="0.5" fill="none" stroke-linecap="round"/></g></g>`
    p += `<circle cx="20" cy="20" r="2.4" fill="${d}"/>`
    p +=
      `<g class="st" ${TS}><path d="M20.8 20.6 Q25.8 15.6 30.8 7.6" stroke="#2C2C2A" stroke-opacity="0.2" stroke-width="2" fill="none" stroke-linecap="round"/>` +
      '<path d="M20 20 Q25 15 30 7" stroke="#FAEEDA" stroke-width="1.8" fill="none" stroke-linecap="round"/>' +
      '<circle cx="26.2" cy="11.2" r="1.1" fill="#EF9F27"/><circle cx="28.6" cy="10.6" r="1.1" fill="#FAC775"/><circle cx="27.2" cy="8.6" r="1.1" fill="#EF9F27"/><circle cx="29.8" cy="8.4" r="1" fill="#FAC775"/>' +
      '<circle cx="30.4" cy="5.6" r="0.9" fill="#A32D2D"/><circle cx="31.8" cy="6.8" r="0.9" fill="#A32D2D"/><circle cx="29" cy="5.4" r="0.9" fill="#A32D2D"/></g>'
    return wrap(p)
  }

  function plumeria(gid: string, d: string): string {
    let p = ''
    for (let i = 0; i < 5; i++)
      p +=
        `<g transform="rotate(${i * 72} 20 20)"><g class="pt" ${TS}><path d="${PP}" fill="${u(gid)}" stroke="${d}" stroke-width="0.5" stroke-linejoin="round"/>` +
        '<path d="M20 20 C12.5 17.5 8.5 8.5 15.5 3 C13.5 9 15 15 20 20 Z" fill="#2C2C2A" fill-opacity="0.13"/>' +
        '<path d="M17 3.4 C23.5 2.4 28.6 8.5 27.4 13.5 C26.5 8.5 23 4.6 17 3.4 Z" fill="#FFFFFF" fill-opacity="0.5"/></g></g>'
    p += '<circle cx="20" cy="20" r="1.3" fill="#BA7517"/>'
    return wrap(p)
  }

  // Tiaré : 7 pétales blancs + deux feuilles derrière
  function tiare(): string {
    let p = `<g class="st" ${TS}><path d="M20 20 C10 26 6 34 4 38 C12 37 18 30 20 20 Z" fill="#0F6E56"/><path d="M20 20 C30 25 35 32 37 37 C29 37 22 30 20 20 Z" fill="#1D9E75"/><path d="M20 20 Q11 28 5 37 M20 20 Q29 28 36 36" stroke="#04342C" stroke-opacity="0.4" stroke-width="0.5" fill="none"/></g>`
    for (let i = 0; i < 7; i++)
      p +=
        `<g transform="rotate(${i * 51.43} 20 20)"><g class="pt" ${TS}><path d="M20 20 C15.5 15 15.5 6 20 1.5 C24.5 6 24.5 15 20 20 Z" fill="${u('t1')}" stroke="#B4B2A9" stroke-width="0.45"/>` +
        '<path d="M20 20 C15.5 15 15.5 6 20 1.5 C18.6 7 18.6 14 20 20 Z" fill="#2C2C2A" fill-opacity="0.1"/>' +
        '<path d="M20 18 L20 5" stroke="#D3D1C7" stroke-width="0.4" stroke-linecap="round"/></g></g>'
    p +=
      '<circle cx="20" cy="20" r="2.6" fill="#FAC775" stroke="#BA7517" stroke-width="0.5"/><circle cx="20" cy="20" r="1" fill="#639922"/>'
    return wrap(p)
  }

  function leaf(): string {
    return wrap(
      `<g class="st" style="transform-box:view-box;transform-origin:20px 38px"><path d="M20 2 C31 8 35 24 22 38 C20 39 19 39 18 38 C5 25 9 8 20 2 Z" fill="${u('lf')}" stroke="#0F6E56" stroke-width="0.6"/><path d="M20 2 C9 8 5 25 18 38 C19 39 20 39 20 38 Q21.5 20 20 2 Z" fill="#04342C" fill-opacity="0.22"/><path d="M20 5 Q21.5 20 20 36 M20.5 12 L14 9 M20.8 12 L27 9 M21 19 L12 16 M21 19 L29.5 16 M20.8 26 L13.5 24 M20.8 26 L28 24" stroke="#0F6E56" stroke-width="0.6" fill="none" stroke-linecap="round"/></g>`,
    )
  }

  function petal(gid: string, d: string): string {
    return wrap(
      `<path d="M20 37 C7 29 6 12 19 3 C22 2 24 3 25 4 C36 14 33 29 20 37 Z" fill="${u(gid)}" stroke="${d}" stroke-width="0.8"/><path d="M20 37 C7 29 6 12 19 3 Q17 20 20 37 Z" fill="#2C2C2A" fill-opacity="0.12"/><path d="M20 34 Q19 18 21 6" stroke="${d}" stroke-width="0.7" stroke-opacity="0.5" fill="none" stroke-linecap="round"/>`,
    )
  }

  const FLOWERS: [Genre, () => string][] = [
    ['h', () => hibiscus('h1', '#A32D2D')],
    ['h', () => hibiscus('h2', '#993556')],
    ['h', () => hibiscus('h3', '#D85A30')],
    ['h', () => hibiscus('h4', '#EF9F27')],
    ['p', () => plumeria('p1', '#D3D1C7')],
    ['p', () => plumeria('p2', '#D4537E')],
    ['t', tiare],
    ['t', tiare],
  ]
  const PETALS: [string, string][] = [
    ['q1', '#D4537E'],
    ['q2', '#E24B4A'],
    ['q3', '#B4B2A9'],
    ['q4', '#D85A30'],
    ['q5', '#EF9F27'],
  ]

  const root = document.createElement('div')
  root.style.cssText = 'position:absolute;inset:0;overflow:hidden;'
  root.innerHTML = `<svg width="0" height="0" style="position:absolute">${DEFS}</svg>`
  layer.appendChild(root)

  const parts: Fleur[] = []

  function add(kind: 'f' | 'l' | 'q') {
    const el = document.createElement('div')
    let s: number
    let html: string
    let tum: number
    let vtK: number
    let type: Genre = kind
    if (kind === 'f') {
      const f = FLOWERS[Math.floor(Math.random() * FLOWERS.length)]
      type = f[0]
      s = 30 + Math.random() * 28
      html = f[1]()
      tum = 0.26
      vtK = 0.4 + Math.random() * 0.16
    } else if (kind === 'l') {
      s = 22 + Math.random() * 16
      html = leaf()
      tum = 0.6
      vtK = 0.3 + Math.random() * 0.1
    } else {
      const c = PETALS[Math.floor(Math.random() * PETALS.length)]
      s = 11 + Math.random() * 10
      html = petal(c[0], c[1])
      tum = 0.85
      vtK = 0.2 + Math.random() * 0.12
    }
    el.style.cssText = `position:absolute;left:0;top:0;width:${s}px;height:${s}px;will-change:transform;opacity:0;`
    el.innerHTML = html
    root.appendChild(el)
    const g = H * 2.0
    const peak = H * (0.42 + Math.random() * 0.6)
    const off = Math.random() - 0.5
    const v0 = Math.sqrt(2 * g * peak) * 1.1
    const big = kind === 'f'
    parts.push({
      el,
      type,
      s,
      x: W * (0.5 + off * 0.5),
      y: H + s,
      vx: off * W * 0.55 + (Math.random() - 0.5) * W * 0.35,
      vy: -v0,
      v0,
      g,
      vt: H * vtK,
      rot: Math.random() * 360,
      vr: (Math.random() - 0.5) * 500,
      delay: Math.random() * 0.5,
      t: 0,
      fall: 0,
      ph: Math.random() * 6.28,
      fq: 1.4 + Math.random() * 1.6,
      amp: (big ? 14 : 26) + Math.random() * 22,
      rock: (big ? 16 : 34) + Math.random() * 14,
      tum,
      tf: (big ? 1.6 : 3.2) + Math.random() * 2,
      ph2: Math.random() * 6.28,
      pts: el.querySelectorAll<SVGGElement>('.pt'),
      st: el.querySelector<SVGGElement>('.st'),
      o: 0.3,
      lag: 0,
      fl: 6 + Math.random() * 5,
    })
  }

  // Ordre d'ajout = ordre d'empilement : feuilles derrière, fleurs devant.
  const nF = Math.round(clamp(W / 26, 24, 60))
  const nP = Math.round(nF * 0.85)
  const nL = Math.round(nF * 0.3)
  for (let i = 0; i < nL; i++) add('l')
  for (let i = 0; i < nP; i++) add('q')
  for (let i = 0; i < nF; i++) add('f')

  return {
    frame(_elapsed, dtMs) {
      const dt = Math.min(0.034, dtMs / 1000)
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]
        if (p.delay > 0) {
          p.delay -= dt
          continue
        }
        p.t += dt
        p.vy += p.g * dt
        if (p.vy < 0) {
          p.vy *= 1 - 0.5 * dt
          p.vx *= 1 - 0.5 * dt
        } else {
          p.fall = Math.min(1, p.fall + dt * 1.4)
          p.vy -= p.vy * (p.g / p.vt) * dt
          p.vx *= 1 - 1.6 * dt
          p.vr *= 1 - 2.2 * dt
        }
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.rot += p.vr * dt
        if (p.vy > 0 && p.y > H + p.s * 1.5) {
          p.el.remove()
          parts.splice(i, 1)
          continue
        }

        // Trajectoire : balancement et bascule à la descente
        const e = p.fall * p.fall * (3 - 2 * p.fall)
        const a = p.t * p.fq + p.ph
        const sx = Math.sin(a) * p.amp * e
        const rk = Math.cos(a) * p.rock * e
        const sc =
          1 -
          p.tum * (0.5 - 0.5 * Math.cos(p.t * p.tf + p.ph2)) * (0.35 + 0.65 * e)
        p.el.style.opacity = '1'
        p.el.style.transform = `translate(${(p.x + sx - p.s / 2).toFixed(1)}px,${(p.y - p.s / 2).toFixed(1)}px) rotate(${(p.rot + rk).toFixed(1)}deg) scaleY(${sc.toFixed(3)})`

        // Pistil / feuilles : retard sur le mouvement horizontal
        const hv = p.vx + Math.cos(a) * p.amp * p.fq * e
        p.lag += (clamp(-hv * 0.14, -30, 30) - p.lag) * Math.min(1, dt * 7)
        if (p.st)
          p.st.style.transform =
            p.type === 'l'
              ? `skewX(${(p.lag * 0.6).toFixed(1)}deg)`
              : `rotate(${p.lag.toFixed(1)}deg)`

        // Pétales : fermés à la montée, ouverts au sommet, frémissement à la descente
        if (p.pts.length) {
          const target =
            p.vy < 0
              ? 1 - 0.7 * clamp(-p.vy / (0.65 * p.v0), 0, 1)
              : 1 - 0.14 * clamp(p.vy / p.vt, 0, 1)
          p.o += (target - p.o) * Math.min(1, dt * 9)
          const tw = p.type === 'p' ? clamp(p.vr * 0.035, -16, 16) : 0
          for (let k = 0; k < p.pts.length; k++) {
            const o = clamp(
              p.o + Math.sin(p.t * p.fl + k * 1.9) * 0.08 * e,
              0.2,
              1.06,
            )
            p.pts[k].style.transform =
              `rotate(${tw.toFixed(1)}deg) scale(${(0.72 + 0.28 * o).toFixed(3)},${(0.42 + 0.58 * o).toFixed(3)})`
          }
        }
      }
      return parts.length > 0
    },
    destroy() {
      root.remove()
    },
  }
}

export const tropicalFlowersEffect: EffectDefinition = {
  id: 'tropicalflowers',
  label: 'Fleurs tropicales',
  hint: 'Une gerbe de fleurs jaillit puis retombe en se balançant',
  durationMs: DURATION,
  mode: 'svg',
  create,
}
