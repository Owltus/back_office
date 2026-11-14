import type { EffectDefinition, EffectRunner, SvgEffectEnv } from './types.ts'

/*
 * Joggeuse — une coureuse traverse le bas de l'écran, partie de la gauche ou de
 * la droite au hasard, et sort de l'autre côté, avec un petit nuage de
 * poussière à chaque pose de pied.
 *
 * Effet SVG (mode « svg »). Le personnage est animé par une vraie foulée :
 *   - appui (36 % du cycle) : pied verrouillé au sol, pose talon, à plat, puis
 *     poussée sur l'avant du pied ;
 *   - retour de jambe : trajectoire de la cheville interpolée (Hermite),
 *     raccordée en vitesse à l'appui des deux côtés ;
 *   - genou par cinématique inverse, bassin qui rebondit, tronc penché qui se
 *     tord (bassin avec la jambe qui avance, épaules en sens inverse), bras en
 *     opposition, queue de cheval qui ondule en retard sur la foulée.
 * L'effet se termine quand la coureuse est sortie de l'écran.
 */

const DURATION = 9000
const NS = 'http://www.w3.org/2000/svg'
const D = Math.PI / 180
const TAU = 6.2832

// Couleurs
const SK = '#EBC0A0'
const SKD = '#D19E7C'
const SKF = '#D9AC8C'
const TOP = '#5F5E5A'
const TOPD = '#444441'
const LG = '#2C2C2A'
const HAIR = '#2A1B12'
const SHOE = '#FFFFFF'
const SHOE_EDGE = '#888780'
const SOLE = '#E8E6DF'
const WATCH = '#FFFFFF'

// Foulée : fraction du cycle en appui, position du pied à la pose, distance
// parcourue par le corps pendant l'appui, hauteur du bassin et rebond.
const ST = 0.36
const X0 = 15
const TRAVEL = 50.7
const V = TRAVEL / ST
const HC = 55
const HA = 2.6
// Queue de cheval : nombre de points, longueur d'un segment, demi-largeurs
const NP = 6
const SEG = 5.2
const PW = [3.4, 3.7, 3.4, 2.8, 2, 1.1]

// --- Interpolation (courbes lisses, sans à-coups) ---
function hm(a: number, ma: number, b: number, mb: number, u: number): number {
  const u2 = u * u
  const u3 = u2 * u
  return (
    (2 * u3 - 3 * u2 + 1) * a +
    (u3 - 2 * u2 + u) * ma +
    (-2 * u3 + 3 * u2) * b +
    (u3 - u2) * mb
  )
}

interface Courbe {
  K: [number, number][]
  m: number[]
}

function mk(K: [number, number][]): Courbe {
  const n = K.length
  const d: number[] = []
  const m: number[] = []
  for (let i = 0; i < n - 1; i++)
    d.push((K[i + 1][1] - K[i][1]) / (K[i + 1][0] - K[i][0]))
  m[0] = d[0]
  m[n - 1] = d[n - 2]
  for (let i = 1; i < n - 1; i++)
    m[i] = d[i - 1] * d[i] <= 0 ? 0 : (2 * d[i - 1] * d[i]) / (d[i - 1] + d[i])
  return { K, m }
}

function pe(C: Courbe, f: number): number {
  const K = C.K
  let i = 0
  while (i < K.length - 2 && K[i + 1][0] <= f) i++
  const h = K[i + 1][0] - K[i][0]
  const u = Math.max(0, Math.min(1, (f - K[i][0]) / h))
  return hm(K[i][1], C.m[i] * h, K[i + 1][1], C.m[i + 1] * h, u)
}

// Hauteur du bassin : au plus bas en milieu d'appui, au plus haut en vol
function hipH(f: number): number {
  return HC - HA * Math.cos(2 * TAU * (f - ST / 2))
}

// --- Appui : le pied est verrouillé au sol ---
const PST = mk([
  [0, -10],
  [0.06, 0],
  [0.18, 0],
  [0.27, 20],
  [ST, 55],
])

function stance(f: number): [number, number, number] {
  const p = pe(PST, f) * D
  const X = X0 - V * f
  const h = hipH(f)
  const c = Math.cos(p)
  const s = Math.sin(p)
  if (p >= 0) return [X + 11 - 11 * c + 6.5 * s, h - 11 * s - 6.5 * c, p] // avant-pied
  return [X - 4 + 4 * c + 6.5 * s, h + 4 * s - 6.5 * c, p] // talon
}

interface Jambe {
  kx: number
  ky: number
  ax: number
  ay: number
  ux: number
  uy: number
  neu: number
  p: number
}

// Cinématique inverse : position de la cheville -> genou
function ik(x: number, y: number): Jambe {
  let d = Math.sqrt(x * x + y * y)
  if (d > 51.8) {
    x *= 51.8 / d
    y *= 51.8 / d
    d = 51.8
  }
  const th = Math.atan2(x, y) + Math.acos(d / 52)
  const kx = 26 * Math.sin(th)
  const ky = 26 * Math.cos(th)
  const ux = (x - kx) / 26
  const uy = (y - ky) / 26
  return { kx, ky, ax: x, ay: y, ux, uy, neu: Math.atan2(-ux, uy), p: 0 }
}

// --- Retour de jambe : cheville en l'air, raccordée en vitesse à l'appui ---
const a0 = stance(ST)
const a1 = stance(0)
const E = 0.004
const b0 = stance(ST - E)
const b1 = stance(E)
const SW: [number, number, number][] = [
  [ST, a0[0], a0[1]],
  [0.45, -33.1, 34.9],
  [0.54, -31.4, 24.5],
  [0.63, -22.4, 24.8],
  [0.72, -10.6, 33.5],
  [0.8, 9.6, 41.5],
  [0.88, 25.3, 42.1],
  [0.94, 22.5, 46.3],
  [1, a1[0], a1[1]],
]
const MX: number[] = []
const MY: number[] = []
{
  const n = SW.length
  MX[0] = (a0[0] - b0[0]) / E
  MY[0] = (a0[1] - b0[1]) / E
  MX[n - 1] = (b1[0] - a1[0]) / E
  MY[n - 1] = (b1[1] - a1[1]) / E
  for (let i = 1; i < n - 1; i++) {
    const dt = SW[i + 1][0] - SW[i - 1][0]
    MX[i] = (SW[i + 1][1] - SW[i - 1][1]) / dt
    MY[i] = (SW[i + 1][2] - SW[i - 1][2]) / dt
  }
}

function swing(f: number): [number, number] {
  let i = 0
  while (i < SW.length - 2 && SW[i + 1][0] <= f) i++
  const h = SW[i + 1][0] - SW[i][0]
  const u = (f - SW[i][0]) / h
  return [
    hm(SW[i][1], MX[i] * h, SW[i + 1][1], MX[i + 1] * h, u),
    hm(SW[i][2], MY[i] * h, SW[i + 1][2], MY[i + 1] * h, u),
  ]
}

// Angle de la cheville en l'air (par rapport au tibia), raccordé à l'appui
const R0 = (a0[2] - ik(a0[0], a0[1]).neu) / D
const R1 = (a1[2] - ik(a1[0], a1[1]).neu) / D
const REL = mk([
  [ST, R0],
  [0.47, 25],
  [0.63, 20],
  [0.8, 5],
  [0.92, -3],
  [1, R1],
])

// rx : décalage avant/arrière de la hanche dû à la rotation du bassin
function leg(f: number, rx: number): Jambe {
  f = f - Math.floor(f)
  if (f < ST) {
    const a = stance(f)
    const J = ik(a[0] - rx, a[1])
    J.p = a[2]
    return J
  }
  const w = swing(f)
  const J = ik(w[0] - rx, w[1])
  J.p = J.neu + pe(REL, f) * D
  return J
}

function leanOf(f: number): number {
  return (9 + 1.2 * Math.sin(2 * TAU * (f - 0.06))) * D
}

// --- Dessin du personnage ---
const n2 = (v: number) => v.toFixed(2)
const Pt = (x: number, y: number) => `${n2(x)} ${n2(y)}`

function ln(id: string, c: string, w: number): string {
  return `<line data-id="${id}" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`
}
function pt(id: string, fill: string): string {
  return `<path data-id="${id}" fill="${fill}"/>`
}
// Disque (articulation), tracé dans le même sens que les membres pour fusionner
function circ(x: number, y: number, r: number): string {
  return `M${Pt(x - r, y)}a${r} ${r} 0 1 1 ${2 * r} 0a${r} ${r} 0 1 1 ${-2 * r} 0Z`
}
// Membre effilé entre deux articulations de rayons différents
function cap(
  x1: number,
  y1: number,
  r1: number,
  x2: number,
  y2: number,
  r2: number,
): string {
  const dx = x2 - x1
  const dy = y2 - y1
  const L = Math.sqrt(dx * dx + dy * dy) || 1
  const nx = dy / L
  const ny = -dx / L
  return (
    `M${Pt(x1 + nx * r1, y1 + ny * r1)}L${Pt(x2 + nx * r2, y2 + ny * r2)}L${Pt(x2 - nx * r2, y2 - ny * r2)}` +
    `L${Pt(x1 - nx * r1, y1 - ny * r1)}Z${circ(x1, y1, r1)}${circ(x2, y2, r2)}`
  )
}
// Cuisse : large en haut, galbe devant et derrière
function thighD(hx: number, hy: number, kx: number, ky: number): string {
  const dx = kx - hx
  const dy = ky - hy
  const L = Math.sqrt(dx * dx + dy * dy) || 1
  const ux = dx / L
  const uy = dy / L
  const nx = uy
  const ny = -ux
  const r1 = 6.6
  const r2 = 4.6
  return (
    `M${Pt(hx + nx * r1, hy + ny * r1)}` +
    `Q${Pt(hx + ux * L * 0.45 + nx * 7.2, hy + uy * L * 0.45 + ny * 7.2)} ${Pt(kx + nx * r2, ky + ny * r2)}` +
    `L${Pt(kx - nx * r2, ky - ny * r2)}` +
    `Q${Pt(hx + ux * L * 0.38 - nx * 7.6, hy + uy * L * 0.38 - ny * 7.6)} ${Pt(hx - nx * (r1 + 0.5), hy - ny * (r1 + 0.5))}` +
    `Z${circ(hx, hy, r1)}${circ(kx, ky, r2)}`
  )
}
// Mollet : galbe à l'arrière, cheville fine ; le legging s'arrête au-dessus
function shinD(kx: number, ky: number, ax: number, ay: number): string {
  const dx = ax - kx
  const dy = ay - ky
  const L = Math.sqrt(dx * dx + dy * dy) || 1
  const ux = dx / L
  const uy = dy / L
  const nx = uy
  const ny = -ux
  const r1 = 4.6
  const r2 = 3
  const ex = ax - ux * 4
  const ey = ay - uy * 4
  return (
    `M${Pt(kx + nx * r1, ky + ny * r1)}L${Pt(ex + nx * r2, ey + ny * r2)}L${Pt(ex - nx * r2, ey - ny * r2)}` +
    `Q${Pt(kx + ux * L * 0.3 - nx * (r1 + 2.6), ky + uy * L * 0.3 - ny * (r1 + 2.6))} ${Pt(kx - nx * r1, ky - ny * r1)}` +
    `Z${circ(ex, ey, r2)}`
  )
}
// Reflet le long de l'avant de la jambe (volume du legging noir)
function sheenD(
  hx: number,
  hy: number,
  kx: number,
  ky: number,
  ax: number,
  ay: number,
): string {
  const dx = kx - hx
  const dy = ky - hy
  const L = Math.sqrt(dx * dx + dy * dy) || 1
  const ux = dx / L
  const uy = dy / L
  const nx = uy
  const ny = -ux
  const d2x = ax - kx
  const d2y = ay - ky
  const L2 = Math.sqrt(d2x * d2x + d2y * d2y) || 1
  const vx = d2x / L2
  const vy = d2y / L2
  const mx = vy
  const my = -vx
  return (
    `M${Pt(hx + ux * 6 + nx * 4.4, hy + uy * 6 + ny * 4.4)}` +
    `Q${Pt(hx + ux * L * 0.5 + nx * 5, hy + uy * L * 0.5 + ny * 5)} ${Pt(kx - ux * 3 + nx * 2.8, ky - uy * 3 + ny * 2.8)}` +
    `M${Pt(kx + vx * 5 + mx * 2.6, ky + vy * 5 + my * 2.6)}L${Pt(ax - vx * 7 + mx * 1.5, ay - vy * 7 + my * 1.5)}`
  )
}
// Buste : t = décalage des épaules, b = décalage du bassin (torsion du tronc)
function torsoD(t: number, b: number): string {
  return (
    `M${Pt(-8.4 + b * 0.6, 3)}` +
    `Q${Pt(-9.8 + (t + b) * 0.3, -16)} ${Pt(-7.6 + t, -35)}` +
    `Q${Pt(-6.6 + t, -41.6)} ${Pt(-1 + t, -42.6)}` +
    `L${Pt(4.6 + t, -42.2)}` +
    `Q${Pt(9.2 + t, -40.6)} ${Pt(10 + t * 0.9, -34.5)}` +
    `Q${Pt(13 + t * 0.7, -27)} ${Pt(10.6 + t * 0.5, -19)}` +
    `Q${Pt(8 + (t + b) * 0.3, -10)} ${Pt(9.4 + b * 0.6, 3)}Z`
  )
}
function legM(p: string, skin: string): string {
  return (
    ln(p + 'an', skin, 5.8) +
    pt(p + 'th', LG) +
    pt(p + 'sn', LG) +
    `<path data-id="${p}hl" fill="none" stroke="#5A5855" stroke-width="1" stroke-linecap="round" stroke-opacity="0.75"/>` +
    `<g data-id="${p}shoe">` +
    `<path d="M-5.2 4.8 L-5.6 -1 Q-5.4 -4.6 -2 -4.8 L2.6 -4.4 Q5.5 -1 10.5 1.2 Q14 2.6 14 4.8 Z" fill="${SHOE}" stroke="${SHOE_EDGE}" stroke-width="0.6" stroke-linejoin="round"/>` +
    `<path d="M-5.8 4.4 L14.2 4.4 Q14.6 6.6 12.6 6.6 L-4.6 6.6 Q-6 6.6 -5.8 4.4 Z" fill="${SOLE}" stroke="${SHOE_EDGE}" stroke-width="0.5"/>` +
    '<path d="M1.5 -3.4 L5.2 0.2 M-0.5 -3.6 L3.2 0" stroke="#B4B2A9" stroke-width="0.8" stroke-linecap="round" fill="none"/></g>'
  )
}
function armM(p: string, skin: string, sleeve: string): string {
  return pt(p + 'ua', skin) + pt(p + 'fa', skin) + pt(p + 'sl', sleeve)
}
function head(): string {
  return (
    // Cou
    `<line x1="1.5" y1="-40" x2="3.4" y2="-51" stroke="${SK}" stroke-width="6.6" stroke-linecap="round"/>` +
    `<path d="M5.6 -49.4 Q2.5 -47 -0.6 -48.6 L0.8 -44.5 L5.4 -45 Z" fill="${SKD}" fill-opacity="0.55"/>` +
    // Crâne + profil
    `<circle cx="3.5" cy="-60" r="10.5" fill="${SK}"/>` +
    `<path d="M8.5 -69.6 Q12.9 -67.6 13.7 -63.6 L13.4 -62.3 Q15.4 -60.4 16.5 -58.6 Q16.6 -57.4 14.2 -57.2 L14.9 -55.9 Q14.4 -55.2 13.8 -55 Q14.7 -54.2 14.3 -53.4 Q14.3 -50.8 11.6 -49.7 Q8 -48.7 3.6 -50.2 L3 -60 Z" fill="${SK}"/>` +
    `<path d="M14.2 -57.2 Q13.2 -57.3 12.8 -58.1" fill="none" stroke="${SKD}" stroke-width="0.7" stroke-linecap="round"/>` +
    // Pommette rosée et taches de rousseur
    '<circle cx="8.2" cy="-57.8" r="2.8" fill="#D85A30" fill-opacity="0.16"/>' +
    '<circle cx="9.2" cy="-59.4" r="0.3" fill="#B07A55"/><circle cx="10.4" cy="-58.8" r="0.3" fill="#B07A55"/>' +
    '<circle cx="11.6" cy="-59.3" r="0.3" fill="#B07A55"/><circle cx="12.4" cy="-58.5" r="0.28" fill="#B07A55"/>' +
    // Sourire léger
    '<path d="M14.5 -55.6 Q12.8 -55 11.4 -55.9 Q12.2 -53.9 14.1 -53.8 Q14.5 -54.5 14.5 -55.6 Z" fill="#FFFFFF" stroke="#A85B4E" stroke-width="0.7" stroke-linejoin="round"/>' +
    `<path d="M10.9 -56.8 Q10.4 -56 10.7 -55.1" fill="none" stroke="${SKD}" stroke-width="0.5" stroke-linecap="round"/>` +
    // Œil plissé par le sourire
    '<path d="M8.5 -61.4 Q10.5 -63.3 12.6 -61.7 Q10.5 -60.6 8.5 -61.4 Z" fill="#FFFFFF"/><circle cx="11" cy="-61.7" r="1" fill="#2C2C2A"/>' +
    `<path d="M8.2 -61.6 Q10.5 -63.7 12.9 -61.9" fill="none" stroke="${HAIR}" stroke-width="0.9" stroke-linecap="round"/>` +
    `<path d="M8.3 -61.7 L7.4 -62.3" fill="none" stroke="${HAIR}" stroke-width="0.6" stroke-linecap="round"/>` +
    `<path d="M8.8 -60.4 Q10.5 -59.9 12.2 -60.6" fill="none" stroke="${SKD}" stroke-width="0.5" stroke-linecap="round"/>` +
    // Sourcil
    `<path d="M8.4 -64.9 Q10.5 -66.2 12.8 -65.2" fill="none" stroke="${HAIR}" stroke-width="0.9" stroke-linecap="round"/>` +
    // Cheveux tirés en arrière
    `<path d="M-7 -60 A10.5 10.5 0 0 1 9.4 -69.2 Q5.6 -67.6 3.4 -64.6 Q1.9 -62.6 1.6 -60.6 Q-1 -57.4 -6.3 -55.3 Z" fill="${HAIR}"/>` +
    '<path d="M7.6 -68.9 Q0.5 -68.6 -5.2 -63.8 M4.6 -66 Q-0.4 -65.6 -5.4 -62.6 M2.4 -62.6 Q-1.6 -62.6 -5.6 -61.6" fill="none" stroke="#6B4A36" stroke-width="0.7" stroke-linecap="round" stroke-opacity="0.65"/>' +
    // Oreille + boucle d'oreille
    `<ellipse cx="0.6" cy="-58.8" rx="1.9" ry="2.9" fill="${SK}" stroke="${SKD}" stroke-width="0.6"/>` +
    `<path d="M0.2 -60 Q1.4 -59 0.6 -57.4" fill="none" stroke="${SKD}" stroke-width="0.6" stroke-linecap="round"/>` +
    '<path d="M0.7 -56.6 Q2.7 -53.5 0.7 -52.4 Q-1.3 -53.5 0.7 -56.6 Z" fill="#D3D1C7" stroke="#888780" stroke-width="0.45"/>' +
    '<circle cx="0.2" cy="-54" r="0.5" fill="#FFFFFF"/>' +
    // Élastique
    '<circle cx="-6.4" cy="-63.2" r="2.3" fill="#5F5E5A"/>'
  )
}
function build(W: number, H: number): string {
  return (
    `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="position:absolute;left:0;top:0;overflow:visible">` +
    '<g data-id="dust"></g><g data-id="g">' +
    armM('f', SKF, TOPD) +
    legM('f', SKF) +
    `<path data-id="pony" fill="${HAIR}" stroke="${HAIR}" stroke-width="1.8" stroke-linejoin="round"/>` +
    '<path data-id="ponyh" fill="none" stroke="#6B4A36" stroke-width="0.9" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="0.6"/>' +
    '<g data-id="torso">' +
    pt('tfar', TOPD) +
    `<path data-id="tnear" fill="${TOP}" stroke="${TOPD}" stroke-width="0.8" stroke-linejoin="round"/>` +
    `<path data-id="tseam" fill="none" stroke="${TOPD}" stroke-width="1" stroke-opacity="0.8" stroke-linecap="round"/>` +
    head() +
    '</g>' +
    // Bassin (legging taille haute)
    `<path d="M-8.8 -5.5 Q-13.2 2 -9.6 9.5 Q0 13.5 8.8 9 Q11.6 3 9.6 -5.5 Q0 -7.6 -8.8 -5.5 Z" fill="${LG}"/>` +
    '<path d="M-8.6 -5.2 Q0 -7.4 9.4 -5.2" fill="none" stroke="#5A5855" stroke-width="1.2" stroke-linecap="round" stroke-opacity="0.8"/>' +
    legM('n', SK) +
    armM('n', SK, TOP) +
    '<line data-id="watchb" stroke="#888780" stroke-width="6.6" stroke-linecap="butt"/>' +
    `<line data-id="watch" stroke="${WATCH}" stroke-width="5.8" stroke-linecap="butt"/>` +
    '</g></svg>'
  )
}

function set(el: Element, x1: number, y1: number, x2: number, y2: number) {
  el.setAttribute('x1', x1.toFixed(2))
  el.setAttribute('y1', y1.toFixed(2))
  el.setAttribute('x2', x2.toFixed(2))
  el.setAttribute('y2', y2.toFixed(2))
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
  const root = document.createElement('div')
  root.style.cssText = 'position:absolute;inset:0;overflow:hidden;'
  root.innerHTML = build(W, H)
  layer.appendChild(root)
  const e: Record<string, Element> = {}
  root.querySelectorAll('[data-id]').forEach((n) => {
    e[n.getAttribute('data-id') ?? ''] = n
  })

  const dir = Math.random() < 0.5 ? 1 : -1
  const sc = 1.2
  const T = 0.66
  const margin = 70 * sc
  let x = dir > 0 ? -margin : W + margin
  let cycle = Math.random()
  const v = (V * sc) / T
  const dust: Poussiere[] = []

  function drawLeg(pre: string, L: Jambe, rx: number) {
    const kx = L.kx + rx
    const ky = L.ky
    const ax = L.ax + rx
    const ay = L.ay
    e[pre + 'th'].setAttribute('d', thighD(rx, 0, kx, ky))
    e[pre + 'sn'].setAttribute('d', shinD(kx, ky, ax, ay))
    e[pre + 'hl'].setAttribute('d', sheenD(rx, 0, kx, ky, ax, ay))
    set(
      e[pre + 'an'],
      ax - L.ux * 6,
      ay - L.uy * 6,
      ax - L.ux * 0.5,
      ay - L.uy * 0.5,
    )
    e[pre + 'shoe'].setAttribute(
      'transform',
      `translate(${ax.toFixed(2)},${ay.toFixed(2)}) rotate(${(L.p / D).toFixed(2)})`,
    )
  }

  function drawArm(pre: string, f: number, sx: number, sy: number) {
    const w = Math.sin(TAU * (f - 0.2))
    const u = (30 * w - 4) * D
    const fa = u + (92 + 20 * w) * D
    const ex = sx + 19 * Math.sin(u)
    const ey = sy + 19 * Math.cos(u)
    const wx = ex + 16 * Math.sin(fa)
    const wy = ey + 16 * Math.cos(fa)
    e[pre + 'ua'].setAttribute('d', cap(sx, sy, 4.4, ex, ey, 3.2))
    // Manche courte : couvre l'épaule et la moitié du bras
    e[pre + 'sl'].setAttribute(
      'd',
      cap(sx, sy, 5.1, sx + (ex - sx) * 0.5, sy + (ey - sy) * 0.5, 4.5),
    )
    e[pre + 'fa'].setAttribute(
      'd',
      cap(ex, ey, 3.2, wx, wy, 2.5) +
        circ(wx + 2.6 * Math.sin(fa), wy + 2.6 * Math.cos(fa), 3.3),
    )
    if (pre === 'n') {
      const dx = wx - ex
      const dy = wy - ey
      set(
        e.watchb,
        ex + dx * 0.735,
        ey + dy * 0.735,
        ex + dx * 0.925,
        ey + dy * 0.925,
      )
      set(
        e.watch,
        ex + dx * 0.75,
        ey + dy * 0.75,
        ex + dx * 0.91,
        ey + dy * 0.91,
      )
    }
  }

  // Queue de cheval : ondulation calée sur la foulée, la pointe en retard
  function ponyDraw(f: number, lean: number) {
    const ax = -6.4
    const ay = -63.2
    let px = ax * Math.cos(lean) - ay * Math.sin(lean)
    let py = ax * Math.sin(lean) + ay * Math.cos(lean)
    const P: [number, number][] = [[px, py]]
    for (let i = 1; i < NP; i++) {
      const ang =
        0.42 +
        0.13 * i -
        (0.09 + 0.065 * i) * Math.cos(2 * TAU * (f - 0.47) - i * 0.42)
      px -= SEG * Math.cos(ang)
      py += SEG * Math.sin(ang)
      P.push([px, py])
    }
    const Lg: string[] = []
    const R: string[] = []
    const C: string[] = []
    for (let i = 0; i < NP; i++) {
      const a = P[Math.max(0, i - 1)]
      const b = P[Math.min(NP - 1, i + 1)]
      const dx = b[0] - a[0]
      const dy = b[1] - a[1]
      const d = Math.sqrt(dx * dx + dy * dy) || 1
      const nx = -dy / d
      const ny = dx / d
      const w = PW[i]
      Lg.push(
        `${(P[i][0] + nx * w).toFixed(2)} ${(P[i][1] + ny * w).toFixed(2)}`,
      )
      R.push(
        `${(P[i][0] - nx * w).toFixed(2)} ${(P[i][1] - ny * w).toFixed(2)}`,
      )
      C.push(
        `${(P[i][0] + nx * w * 0.35).toFixed(2)} ${(P[i][1] + ny * w * 0.35).toFixed(2)}`,
      )
    }
    e.pony.setAttribute('d', `M${Lg.join(' L')} L${R.reverse().join(' L')} Z`)
    e.ponyh.setAttribute('d', `M${C.slice(1, NP - 1).join(' L')}`)
  }

  // Petit nuage de poussière à chaque pose de pied
  function puff(L: Jambe) {
    const fx = x + dir * L.ax * sc
    for (let i = 0; i < 3; i++) {
      const c = document.createElementNS(NS, 'circle')
      c.setAttribute('fill', '#B4B2A9')
      e.dust.appendChild(c)
      dust.push({
        el: c,
        x: fx - dir * Math.random() * 8,
        y: H - 3,
        vx: -dir * (25 + Math.random() * 60),
        vy: -(10 + Math.random() * 35),
        r: ((2 + Math.random() * 2.5) * sc) / 1.2,
        t: 0,
        life: 0.35 + Math.random() * 0.3,
      })
    }
  }

  return {
    frame(_elapsed, dtMs) {
      const dt = Math.min(0.05, dtMs / 1000)
      const f0 = cycle
      cycle += dt / T
      x += dir * v * dt
      const f = cycle - Math.floor(cycle)
      // Torsion du tronc : le bassin tourne avec la jambe qui avance, les
      // épaules en sens inverse
      const q = Math.cos(TAU * (f - 0.92))
      const rx = 2.4 * q
      const tw = -3.2 * q
      const A = leg(f, rx)
      const B = leg(f + 0.5, -rx)
      const hy = H - hipH(f) * sc
      e.g.setAttribute(
        'transform',
        `translate(${x.toFixed(2)},${hy.toFixed(2)}) scale(${dir * sc},${sc})`,
      )
      drawLeg('n', A, rx)
      drawLeg('f', B, -rx)
      const lean = leanOf(f)
      const sx = Math.cos(lean) + 38 * Math.sin(lean)
      const sy = Math.sin(lean) - 38 * Math.cos(lean)
      e.torso.setAttribute('transform', `rotate(${(lean / D).toFixed(2)})`)
      e.tfar.setAttribute('d', torsoD(-tw, -rx))
      e.tnear.setAttribute('d', torsoD(tw, rx))
      e.tseam.setAttribute(
        'd',
        `M${Pt(-7.4 + tw, -31)}Q${Pt(-2 + tw * 0.7, -23)} ${Pt(-8.4 + rx * 0.5, -8)}`,
      )
      drawArm('n', f, sx + tw, sy)
      drawArm('f', f + 0.5, sx - tw, sy)
      ponyDraw(f, lean)

      if (Math.floor(cycle) > Math.floor(f0)) puff(A)
      if (Math.floor(cycle + 0.5) > Math.floor(f0 + 0.5)) puff(B)
      for (let m = dust.length - 1; m >= 0; m--) {
        const d = dust[m]
        d.t += dt
        if (d.t >= d.life) {
          d.el.remove()
          dust.splice(m, 1)
          continue
        }
        d.x += d.vx * dt
        d.y += d.vy * dt
        d.vx *= 1 - 3 * dt
        d.vy *= 1 - 3 * dt
        const u = d.t / d.life
        d.el.setAttribute('cx', d.x.toFixed(1))
        d.el.setAttribute('cy', d.y.toFixed(1))
        d.el.setAttribute('r', (d.r * (1 + u * 1.8)).toFixed(1))
        d.el.setAttribute('opacity', (0.45 * (1 - u)).toFixed(3))
      }

      return !(
        (dir > 0 && x > W + margin + 10) ||
        (dir < 0 && x < -margin - 10)
      )
    },
    destroy() {
      root.remove()
    },
  }
}

export const joggerEffect: EffectDefinition = {
  id: 'jogger',
  label: 'Joggeuse',
  hint: 'Une coureuse traverse le bas de l’écran au petit trot',
  durationMs: DURATION,
  mode: 'svg',
  create,
}
