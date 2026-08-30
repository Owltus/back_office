import type * as ThreeNS from 'three'

import type { EffectDefinition, EffectRunner, WebglEffectEnv } from './types.ts'

/*
 * Verre de pastis — effet WebGL (mode 'webgl'), même patron que `strawhat.ts` /
 * `dice.ts` : three.js en import() DYNAMIQUE, canvas TRANSPARENT, `frame`/`destroy`
 * sobres. Reprend le prototype `verre-pastis.html` (scène cel-shadée à contours
 * d'encre : verre soufflé, glaçons flottants avec vraie physique de
 * collision/flottaison, jet d'eau qui tombe et se trouble au contact du pastis,
 * bulles, éclaboussures, ondulations à l'impact), MINIATURISÉE et ANCRÉE en bas à
 * gauche de l'écran plutôt que jouée plein cadre : le canvas de l'overlay est
 * redimensionné à la taille du widget et positionné par style inline, et la scène
 * y est rendue sur-échantillonnée 2× (traits fins nets malgré la miniature).
 *
 * PAS DE FOND (ni ciel, ni dalle, ni halo) : exactement le traitement de
 * `strawhat.ts`/`dice.ts`, les deux autres effets WebGL déjà validés de ce
 * registre — un objet cel-shadé avec contour d'encre clair se lit très bien en
 * flottant sur la page, sans backdrop. Deux solutions de fond ont été essayées et
 * rejetées : un rectangle opaque plein cadre (mauvaise intégration, lit comme un
 * bloc noir plaqué sur la page) et un halo radial derrière le verre (aura visible,
 * artificielle). Le verre lui-même reste en partie translucide (shader à base de
 * Fresnel) : il teinte ce qu'il y a derrière plutôt que de le cacher, ce qui est
 * le comportement normal d'un objet en verre superposé à une page.
 *
 * COULEURS : les DEUX palettes du prototype (THEMES light/dark), reprises À
 * L'IDENTIQUE — ce sont les couleurs d'origine, pensées par palette entière pour
 * un fond clair ou sombre. La palette est choisie AU DÉCLENCHEMENT selon le thème
 * réel de la page (classe `dark` sur <html>, cf. src/styles.css) : sur le dark
 * navy actuel c'est la palette sombre (contours d'encre crème clair, comme le
 * prototype sur son fond nuit), et si un thème clair arrive un jour la palette
 * claire (contours encre foncée) prendra le relais sans rien retoucher. Ni
 * couleurs inventées, ni dérivation depuis les tokens CSS (essayée : rendu
 * moins fidèle) — uniquement les palettes de l'auteur, sélectionnées comme le
 * fait son propre `setTheme`. Seuls bg/sky/table/grain sont omis : ils ne
 * concernent que le fond, qui n'existe pas ici.
 *
 * Autre différence avec le prototype : un SEUL cycle (fondu d'entrée, verser,
 * fondu de sortie) au lieu de reboucler indéfiniment.
 */

const DURATION_S = 11.0
const DURATION = DURATION_S * 1000

// ---------- Palettes du prototype (verre-pastis.html, THEMES) — valeurs exactes,
// moins bg/sky/table/grain qui ne servent qu'au fond plein cadre ----------
interface PastisPalette {
  outline: number
  water: number
  glass: number
  pastis: number
  pastisTop: number
  louche: number
  loucheTop: number
  bubble: number
  iceBase: number
  iceEdge: number
  iceLine: number
  iceShine: number
  iceTint: number
}
const THEMES: { light: PastisPalette; dark: PastisPalette } = {
  light: {
    outline: 0x2b2622,
    water: 0xcfe3f0,
    glass: 0xecf4f6,
    pastis: 0xc99a30,
    pastisTop: 0xd9ac42,
    louche: 0xe6d080,
    loucheTop: 0xf1e3a2,
    bubble: 0xfff6cc,
    iceBase: 0xa8cfe3,
    iceEdge: 0x85b8d6,
    iceLine: 0xf2f9fc,
    iceShine: 0xffffff,
    iceTint: 0xdfeef7,
  },
  dark: {
    outline: 0xf0e6d2,
    water: 0x9fc4dc,
    glass: 0x2b3238,
    pastis: 0xb98a24,
    pastisTop: 0xd0a238,
    louche: 0xd8bf68,
    loucheTop: 0xe8d68e,
    bubble: 0xffeda8,
    iceBase: 0x6f97ad,
    iceEdge: 0x517d96,
    iceLine: 0xdcecf5,
    iceShine: 0xf6fbfe,
    iceTint: 0xbcd6e6,
  },
}

// ---------- Petit widget, pied du verre collé au bas de la page (CSS px) ----------
const WIDGET_MARGIN_X = 20
const WIDGET_W = 210
const WIDGET_H = 290

// ---------- Maths pures (aucune dépendance three.js) ----------
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x))
const ss = (a: number, b: number, x: number) => {
  const u = clamp((x - a) / (b - a), 0, 1)
  return u * u * (3 - 2 * u)
}
const noise = (t: number, s: number) =>
  Math.sin(t * 1.3 + s) * 0.5 +
  Math.sin(t * 2.9 + s * 1.7) * 0.3 +
  Math.sin(t * 5.3 + s * 2.3) * 0.2

// ---------- Profil intérieur du verre (rayon du liquide selon la hauteur) ----------
const innerWall: [number, number][] = [
  [0, 1.14],
  [0.35, 1.16],
  [0.6, 1.22],
  [0.75, 1.29],
  [0.95, 1.44],
  [1.09, 1.72],
  [1.17, 2.05],
  [1.18, 2.4],
  [1.12, 2.78],
  [1.05, 3.06],
]
function rAt(y: number): number {
  for (let i = 1; i < innerWall.length; i++) {
    const [r0, y0] = innerWall[i - 1]
    const [r1, y1] = innerWall[i]
    if (y <= y1) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0)
  }
  return innerWall[innerWall.length - 1][0]
}

// ---------- Conservation de volume -> niveau (table précalculée) ----------
const L0 = 1.5
const L1 = 2.55
const volY: number[] = []
const volV: number[] = []
{
  let acc = 0
  for (let y = L0 + 0.01; y <= 2.6; y += 0.01) {
    const r = rAt(y)
    acc += Math.PI * r * r * 0.01
    volY.push(y)
    volV.push(acc)
  }
}
const VG_FULL = (() => {
  for (let i = 0; i < volY.length; i++) if (volY[i] >= L1) return volV[i]
  return volV[volV.length - 1]
})()
function levelFromVol(v: number): number {
  if (v <= 0) return L0
  for (let i = 0; i < volV.length; i++) if (volV[i] >= v) return volY[i]
  return volY[volY.length - 1]
}

const GRAV = 9.5
const QMAX = VG_FULL / 4.7

// ---------- Jet vertical ----------
const STREAM_Z = 0.42
const SRC_Y = 5.4
const V0 = 1.6
const fallDist = (d: number) => V0 * d + 0.5 * GRAV * d * d

// ---------- Timeline (cycle unique : fondu d'entrée, versement, fondu de sortie) ----------
const T_HOLD0 = 1.2
const T_HIT = 1.5
const T_END = 6.5
const T_FADE = 0.6
const T_ON = T_HOLD0
const T_OFF = T_END - 0.5

interface IceCube {
  root: ThreeNS.Object3D
  outline: ThreeNS.Mesh
  pivot: ThreeNS.Object3D
  restY: number
  off: number
  rad: number
  topH: number
  x0: number
  z0: number
  x: number
  z: number
  y: number
  vx: number
  vy: number
  vz: number
  vr: number
  yaw: number
  ry: number
  restRot: [number, number]
  rx: number
  rz: number
  seed: number
  k: number
  dip: number
  targetY: number
  fx: number
  fz: number
  tq: number
}

interface Bubble {
  mesh: ThreeNS.Mesh
  x: number
  z: number
  s: number
  seed: number
}

interface Splash {
  mesh: ThreeNS.Mesh
  a: number
  r: number
  ph: number
  f: number
}

interface Ripple {
  mesh: ThreeNS.Mesh
  period: number
  offset: number
}

function create({ canvas, width, height }: WebglEffectEnv): EffectRunner {
  let ready = false
  let destroyed = false
  let renderFrame: ((t: number, dt: number) => void) | null = null
  let cleanupScene: (() => void) | null = null

  // Palette figée au déclenchement selon le thème réel de la page — même critère
  // que la variante Tailwind `dark` de l'app (classe sur <html>, src/styles.css).
  const PAL = document.documentElement.classList.contains('dark')
    ? THEMES.dark
    : THEMES.light

  import('three')
    .then((THREE) => {
      if (destroyed) return

      const disposables: { dispose: () => void }[] = []
      const track = <T extends { dispose: () => void }>(d: T): T => {
        disposables.push(d)
        return d
      }

      const LIGHT_DIR = new THREE.Vector3(4.5, 9, 2.5)
      const v3 = (hex: number) =>
        new THREE.Vector3(
          ((hex >> 16) & 255) / 255,
          ((hex >> 8) & 255) / 255,
          (hex & 255) / 255,
        )
      const V = (x: number, y: number) => new THREE.Vector2(x, y)

      function toonRamp(levels: number[]) {
        const tex = new THREE.DataTexture(
          new Uint8Array(levels),
          levels.length,
          1,
          THREE.RedFormat,
        )
        tex.minFilter = tex.magFilter = THREE.NearestFilter
        tex.needsUpdate = true
        return track(tex)
      }
      const ramp2 = toonRamp([205, 255])

      const lineMat = track(new THREE.MeshBasicMaterial({ color: PAL.outline }))

      const hullVert = `
        uniform vec3 uLight; uniform float uBase; uniform float uVar;
        void main() {
          vec3 nW = normalize(mat3(modelMatrix) * normal);
          float lit = dot(nW, normalize(uLight)) * 0.5 + 0.5;
          float wob = 0.5 + 0.5 * sin(position.x * 7.0 + position.y * 5.0) * sin(position.z * 6.0 + position.y * 9.0);
          float k = uBase * (0.75 + uVar * (1.0 - lit)) * (0.85 + 0.3 * wob);
          vec4 w = modelMatrix * vec4(position + normal * k, 1.0);
          gl_Position = projectionMatrix * viewMatrix * w;
        }`
      const hullFrag = `uniform vec3 uColor; void main() { gl_FragColor = vec4(uColor, 1.0); }`
      function hullMaterial(base: number, variation: number) {
        return track(
          new THREE.ShaderMaterial({
            uniforms: {
              uLight: { value: LIGHT_DIR.clone().normalize() },
              uBase: { value: base },
              uVar: { value: variation },
              uColor: { value: v3(PAL.outline) },
            },
            vertexShader: hullVert,
            fragmentShader: hullFrag,
            side: THREE.BackSide,
          }),
        )
      }
      const hull = (geometry: ThreeNS.BufferGeometry, base: number, variation: number) =>
        new THREE.Mesh(geometry, hullMaterial(base, variation))

      function ring(radius: number, y: number, tube?: number) {
        const geo = track(new THREE.TorusGeometry(radius, tube || 0.015, 6, 160))
        const m = new THREE.Mesh(geo, lineMat)
        m.rotation.x = Math.PI / 2
        m.position.y = y
        return m
      }

      function roundedRect<T extends ThreeNS.Path>(
        w: number,
        h: number,
        r: number,
        PathClass: new () => T,
      ): T {
        const s = new PathClass()
        const x = -w / 2
        const y = -h / 2
        s.moveTo(x + r, y)
        s.lineTo(x + w - r, y)
        s.quadraticCurveTo(x + w, y, x + w, y + r)
        s.lineTo(x + w, y + h - r)
        s.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
        s.lineTo(x + r, y + h)
        s.quadraticCurveTo(x, y + h, x, y + h - r)
        s.lineTo(x, y + r)
        s.quadraticCurveTo(x, y, x + r, y)
        return s
      }

      function roundedBox(w: number, h: number, d: number, radius: number, segs: number) {
        const seg = segs * 2 + 1
        const rad = Math.min(w / 2, h / 2, d / 2, radius)
        const g = new THREE.BoxGeometry(1, 1, 1, seg, seg, seg).toNonIndexed()
        const pos = g.attributes.position
        const nor = g.attributes.normal
        const box = new THREE.Vector3(w, h, d).multiplyScalar(0.5).subScalar(rad)
        const p = new THREE.Vector3()
        const n = new THREE.Vector3()
        const hs = 0.5 / seg
        for (let i = 0; i < pos.count; i++) {
          p.fromBufferAttribute(pos, i)
          n.copy(p)
          n.x -= Math.sign(n.x) * hs
          n.y -= Math.sign(n.y) * hs
          n.z -= Math.sign(n.z) * hs
          n.normalize()
          pos.setXYZ(
            i,
            box.x * Math.sign(p.x) + n.x * rad,
            box.y * Math.sign(p.y) + n.y * rad,
            box.z * Math.sign(p.z) + n.z * rad,
          )
          nor.setXYZ(i, n.x, n.y, n.z)
        }
        return g
      }

      // ---------- Scène des contours ----------
      const outlineScene = new THREE.Scene()
      const outlineGroup = new THREE.Group()
      outlineGroup.position.y = 0.006
      outlineScene.add(outlineGroup)

      // ---------- Scène principale (fond transparent, pas de ciel ni de dalle) ----------
      const scene = new THREE.Scene()

      const key = new THREE.DirectionalLight(0xffffff, 1.5)
      key.position.copy(LIGHT_DIR)
      scene.add(key, key.target)
      scene.add(new THREE.HemisphereLight(0xffffff, 0xe0d5c2, 1.6))

      // ---------- Le verre ----------
      const glassGroup = new THREE.Group()
      glassGroup.position.y = 0.006
      scene.add(glassGroup)

      const outerProfile = [
        V(0, 0), V(0.92, 0), V(1.02, 0.03), V(0.98, 0.09), V(0.78, 0.13), V(0.5, 0.19), V(0.3, 0.29),
        V(0.2, 0.45), V(0.17, 0.62), V(0.17, 0.82), V(0.21, 0.96), V(0.32, 1.05), V(0.52, 1.12),
        V(0.76, 1.24), V(0.96, 1.44), V(1.1, 1.72), V(1.18, 2.05), V(1.19, 2.4), V(1.13, 2.78),
        V(1.06, 3.06), V(1.01, 3.24),
      ]
      const glassGeo = track(new THREE.LatheGeometry(outerProfile, 128))

      const glassDepthMat = track(new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide }))
      const glassDepth = new THREE.Mesh(glassGeo, glassDepthMat)
      glassDepth.renderOrder = 5
      outlineGroup.add(glassDepth)
      const glassHull = hull(glassGeo, 0.026, 0.9)
      glassHull.renderOrder = 6
      outlineGroup.add(glassHull)

      glassGroup.add(ring(1.01, 3.24))

      const glassFillMat = track(
        new THREE.ShaderMaterial({
          uniforms: {
            uColor: { value: v3(PAL.glass) },
            uAMin: { value: 0.22 },
            uAMax: { value: 0.58 },
            uLevel: { value: 0 },
          },
          vertexShader: `
            varying vec3 vN; varying vec3 vW;
            void main() {
              vec4 w = modelMatrix * vec4(position, 1.0);
              vW = w.xyz;
              vN = normalize(mat3(modelMatrix) * normal);
              gl_Position = projectionMatrix * viewMatrix * w;
            }`,
          fragmentShader: `
            uniform vec3 uColor; uniform float uAMin; uniform float uAMax; uniform float uLevel;
            varying vec3 vN; varying vec3 vW;
            void main() {
              if (vW.y < uLevel && vW.y > 1.141) discard;
              vec3 N = normalize(vN);
              vec3 Vd = normalize(cameraPosition - vW);
              float fres = pow(1.0 - max(dot(N, Vd), 0.0), 1.6);
              gl_FragColor = vec4(uColor, mix(uAMin, uAMax, fres));
            }`,
          transparent: true,
          depthWrite: false,
        }),
      )
      const glassFill = new THREE.Mesh(glassGeo, glassFillMat)
      glassFill.renderOrder = 8
      glassGroup.add(glassFill)

      // ---------- Le pastis ----------
      const innerWallV = innerWall
      function liquidProfile(level: number) {
        const pts = innerWallV.filter(([, y]) => y < level - 0.015).map(([r, y]) => V(r, y))
        pts.push(V(rAt(level), level), V(0, level))
        return pts
      }

      const PASTIS_BODY = new THREE.Color(PAL.pastis)
      const PASTIS_TOP = new THREE.Color(PAL.pastisTop)
      const LOUCHE_BODY = new THREE.Color(PAL.louche)
      const LOUCHE_TOP = new THREE.Color(PAL.loucheTop)

      const liquidMat = track(new THREE.MeshToonMaterial({ color: PAL.pastis, gradientMap: ramp2 }))
      const liquidTopMat = track(
        new THREE.MeshToonMaterial({ color: PAL.pastisTop, gradientMap: ramp2, side: THREE.DoubleSide }),
      )
      const liquidTopGeo = track(new THREE.CircleGeometry(1, 96))
      const liquid = new THREE.Mesh(track(new THREE.LatheGeometry(liquidProfile(L0), 96)), liquidMat)
      const liquidTop = new THREE.Mesh(liquidTopGeo, liquidTopMat)
      liquidTop.rotation.x = -Math.PI / 2
      const levelRing = ring(1, 0)
      glassGroup.add(liquid, liquidTop, levelRing)

      let curLevel = -1
      function setLevel(level: number) {
        if (Math.abs(level - curLevel) < 0.0005) return
        curLevel = level
        liquid.geometry.dispose()
        liquid.geometry = new THREE.LatheGeometry(liquidProfile(level), 96)
        const r = rAt(level)
        liquidTop.scale.set(r, r, 1)
        liquidTop.position.y = level + 0.0015
        levelRing.geometry.dispose()
        levelRing.geometry = new THREE.TorusGeometry(r, 0.015, 6, 160)
        levelRing.position.y = level + 0.002
      }
      function setColor(u: number) {
        liquidMat.color.copy(PASTIS_BODY).lerp(LOUCHE_BODY, u)
        liquidTopMat.color.copy(PASTIS_TOP).lerp(LOUCHE_TOP, u)
      }

      // ---------- Glaçons ----------
      const iceVert = `
        varying vec3 vN; varying vec3 vW;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vW = w.xyz;
          vN = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * w;
        }`
      const iceFrag = `
        uniform vec3 uBase; uniform vec3 uEdge; uniform vec3 uLight; uniform float uAMin; uniform float uAMax;
        varying vec3 vN; varying vec3 vW;
        void main() {
          vec3 N = normalize(vN);
          vec3 Vd = normalize(cameraPosition - vW);
          float ndv = max(dot(N, Vd), 0.0);
          float fres = pow(1.0 - ndv, 2.0);
          vec3 L = normalize(uLight);
          float d = dot(N, L) * 0.5 + 0.5;
          float tone = floor(d * 3.0 + 0.5) / 3.0;
          vec3 col = mix(uBase, vec3(1.0), 0.75 * tone);
          col = mix(col, uEdge, fres * 0.5);
          vec3 H = normalize(L + Vd);
          col += pow(max(dot(N, H), 0.0), 6.0) * 0.18;
          float glint = smoothstep(0.45, 0.6, pow(max(dot(N, H), 0.0), 48.0));
          col = mix(col, vec3(1.0), glint * 0.7);
          gl_FragColor = vec4(col, mix(uAMin, uAMax, fres));
        }`
      const iceMat = track(
        new THREE.ShaderMaterial({
          uniforms: {
            uBase: { value: v3(PAL.iceBase) },
            uEdge: { value: v3(PAL.iceEdge) },
            uLight: { value: LIGHT_DIR.clone().normalize() },
            uAMin: { value: 0.8 },
            uAMax: { value: 0.93 },
          },
          vertexShader: iceVert,
          fragmentShader: iceFrag,
          transparent: true,
          depthWrite: true,
        }),
      )
      const edgeMat = track(new THREE.MeshBasicMaterial({ color: PAL.iceLine }))
      const hiMat = track(new THREE.MeshBasicMaterial({ color: PAL.iceShine, transparent: true, opacity: 0.85, depthWrite: false }))
      const ghostPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0)
      const ghostMat = track(
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.45,
          depthTest: false,
          depthWrite: false,
          clippingPlanes: [ghostPlane],
        }),
      )
      const ICE_TINT = new THREE.Color(PAL.iceTint)

      function edgeTubes(w: number, h: number, d: number, r: number) {
        const g = new THREE.Group()
        const c = 0.293 * r
        const ext = 0.35 * r
        const rad = 0.008
        const X = w / 2 - c + 0.003
        const Y = h / 2 - c + 0.003
        const Z = d / 2 - c + 0.003
        const lx = w - 2 * r + 2 * ext
        const ly = h - 2 * r + 2 * ext
        const lz = d - 2 * r + 2 * ext
        const add = (len: number, rot: [number, number, number], pos: [number, number, number]) => {
          const geo = track(new THREE.CylinderGeometry(rad, rad, len, 8))
          const m = new THREE.Mesh(geo, edgeMat)
          m.rotation.set(rot[0], rot[1], rot[2])
          m.position.set(pos[0], pos[1], pos[2])
          g.add(m)
        }
        for (const sy of [-1, 1]) for (const sz of [-1, 1]) add(lx, [0, 0, Math.PI / 2], [0, sy * Y, sz * Z])
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(ly, [0, 0, 0], [sx * X, 0, sz * Z])
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) add(lz, [Math.PI / 2, 0, 0], [sx * X, sy * Y, 0])
        return g
      }
      function shine(w: number, h: number) {
        const geo = track(new THREE.ShapeGeometry(roundedRect(w, h, Math.min(w, h) * 0.5, THREE.Shape), 6))
        const m = new THREE.Mesh(geo, hiMat)
        m.renderOrder = 4
        return m
      }

      const iceGroup = new THREE.Group()
      glassGroup.add(iceGroup)

      function makeIce(w: number, h: number, d: number, cfg: { restY: number; off: number; rad: number; topH: number }): IceCube {
        const geo = roundedBox(w, h, d, 0.11, 3)
        const P = geo.attributes.position
        const Nn = geo.attributes.normal
        for (let i = 0; i < P.count; i++) {
          const x = P.getX(i)
          const y = P.getY(i)
          const z = P.getZ(i)
          const b = ((Math.sin(x * 31 + y * 17) + Math.sin(y * 29 + z * 13) + Math.sin(z * 37 + x * 11)) / 3) * 0.005
          P.setXYZ(i, x + Nn.getX(i) * b, y + Nn.getY(i) * b, z + Nn.getZ(i) * b)
        }
        track(geo)
        const root = new THREE.Object3D()
        const body = new THREE.Mesh(geo, iceMat)
        body.renderOrder = 3
        const ghost = new THREE.Mesh(geo, ghostMat)
        ghost.renderOrder = 2
        const s1 = shine(0.26, 0.06)
        s1.rotation.set(-Math.PI / 2, 0, 0.6)
        s1.position.set(-0.05, h / 2 + 0.004, 0.05)
        const s2 = shine(0.07, 0.07)
        s2.rotation.set(-Math.PI / 2, 0, 0)
        s2.position.set(0.13, h / 2 + 0.004, -0.09)
        const s3 = shine(0.28, 0.055)
        s3.rotation.set(0, 0, 0.8)
        s3.position.set(0.03, 0.02, d / 2 + 0.004)
        root.add(edgeTubes(w, h, d, 0.11), ghost, body, s1, s2, s3)
        const outline = hull(geo, 0.019, 0.8)
        outlineGroup.add(outline)
        const shape = roundedRect(w + 0.03, d + 0.03, 0.12, THREE.Shape)
        shape.holes.push(roundedRect(w - 0.012, d - 0.012, 0.1, THREE.Path))
        const lm = track(
          new THREE.MeshBasicMaterial({ color: PAL.outline, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
        )
        const lineGeo = track(new THREE.ShapeGeometry(shape, 8))
        const line = new THREE.Mesh(lineGeo, lm)
        line.rotation.x = -Math.PI / 2
        const pivot = new THREE.Object3D()
        pivot.add(line)
        iceGroup.add(root, pivot)
        return {
          root,
          outline,
          pivot,
          restY: cfg.restY,
          off: cfg.off,
          rad: cfg.rad,
          topH: cfg.topH,
          x0: 0,
          z0: 0,
          x: 0,
          z: 0,
          y: cfg.restY,
          vx: 0,
          vy: 0,
          vz: 0,
          vr: 0,
          yaw: 0,
          ry: 0,
          restRot: [0, 0],
          rx: 0,
          rz: 0,
          seed: 0,
          k: 0,
          dip: 0,
          targetY: cfg.restY,
          fx: 0,
          fz: 0,
          tq: 0,
        }
      }
      const ices: IceCube[] = [
        makeIce(0.66, 0.56, 0.62, { restY: 1.7, off: 0.09, rad: 0.36, topH: 0.28 }),
        makeIce(0.58, 0.52, 0.6, { restY: 1.68, off: 0.11, rad: 0.34, topH: 0.26 }),
      ]

      // ---------- Petites bulles ----------
      const bubbleGeo = track(new THREE.SphereGeometry(1, 10, 8))
      const bubbleMat = track(new THREE.MeshBasicMaterial({ color: PAL.bubble }))
      const bubbles: Bubble[] = []
      for (let i = 0; i < 10; i++) {
        const mesh = new THREE.Mesh(bubbleGeo, bubbleMat)
        const s = 0.021 + Math.random() * 0.02
        mesh.scale.setScalar(s)
        glassGroup.add(mesh)
        bubbles.push({ mesh, x: 0, z: 0, s, seed: Math.random() * 10 })
      }

      let Vg = 0
      let agitS = 0

      function resetAll() {
        Vg = 0
        agitS = 0
        const spots: { x: number; z: number }[] = []
        for (const ice of ices) {
          let x = 0.4
          let z = 0
          let ok = false
          let tries = 0
          while (!ok && tries++ < 30) {
            const a = Math.random() * Math.PI * 2
            const r = 0.22 + Math.random() * 0.28
            x = Math.cos(a) * r
            z = Math.sin(a) * r
            ok = spots.every((sp) => Math.hypot(x - sp.x, z - sp.z) > 0.8)
          }
          if (!ok && spots.length) {
            const a = Math.atan2(spots[0].z, spots[0].x) + Math.PI
            x = Math.cos(a) * 0.45
            z = Math.sin(a) * 0.45
          }
          spots.push({ x, z })
          const rc = Math.hypot(x, z) + 1e-4
          const nx = x / rc
          const nz = z / rc
          const restRot: [number, number] = [
            -0.15 * nz + (Math.random() - 0.5) * 0.06,
            0.15 * nx + (Math.random() - 0.5) * 0.06,
          ]
          const yaw = Math.random() * Math.PI * 2
          Object.assign(ice, {
            x0: x, z0: z, x, z, y: ice.restY,
            vx: 0, vy: 0, vz: 0, vr: 0,
            yaw, ry: yaw, restRot, rx: restRot[0], rz: restRot[1],
            seed: Math.random() * 20, k: 0, dip: 0,
          })
        }
        for (const b of bubbles) {
          const a = Math.random() * Math.PI * 2
          const r = 0.15 + Math.random() * 0.55
          b.x = Math.cos(a) * r
          b.z = Math.sin(a) * r
          b.seed = Math.random() * 10
        }
      }
      resetAll()

      function stepIce(level: number, t: number, dt: number, qn: number, impact: ThreeNS.Vector3) {
        const agit = agitS
        for (const ice of ices) {
          const d = level + ice.off - ice.restY
          const k = ss(-0.05, 0.2, d)
          ice.k = k
          ice.targetY = ice.restY + Math.max(0, k * d)
          ice.fx = 0
          ice.fz = 0
          ice.tq = 0
          ice.dip = 0
          if (k > 0.01) {
            if (qn > 0.02) {
              const dx = ice.x - impact.x
              const dz = ice.z - impact.z
              const dist = Math.hypot(dx, dz) + 1e-3
              const fall = 1 / (1 + (dist / 0.4) ** 2)
              ice.fx += (dx / dist) * 0.85 * qn * fall
              ice.fz += (dz / dist) * 0.85 * qn * fall
              ice.tq += 0.7 * qn * fall
              ice.dip = (0.09 * qn) / (1 + (dist / 0.24) ** 2)
            }
            const amp = 0.25 * agit + 0.03
            ice.fx += amp * noise(t * 0.9, ice.seed)
            ice.fz += amp * noise(t * 0.9, ice.seed + 7.7)
            ice.tq += (0.35 * agit + 0.05) * noise(t * 0.7, ice.seed + 3.3)
          }
        }
        const [a, b] = ices
        {
          const dx = b.x - a.x
          const dz = b.z - a.z
          const dist = Math.hypot(dx, dz) + 1e-4
          const minD = a.rad + b.rad
          if (dist < minD) {
            const nx = dx / dist
            const nz = dz / dist
            const f = (minD - dist) * 30
            a.fx -= nx * f
            a.fz -= nz * f
            b.fx += nx * f
            b.fz += nz * f
            const rel = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz
            if (rel < 0) {
              const j = -rel * 0.35
              a.vx -= nx * j
              a.vz -= nz * j
              b.vx += nx * j
              b.vz += nz * j
            }
            const tang = (b.vx - a.vx) * -nz + (b.vz - a.vz) * nx
            a.tq += tang * 1.5
            b.tq -= tang * 1.5
          }
        }
        for (const ice of ices) {
          const limit = rAt(ice.y - 0.2) - 0.45
          const rc = Math.hypot(ice.x, ice.z)
          if (rc > limit) {
            const nx = ice.x / rc
            const nz = ice.z / rc
            const pen = rc - limit
            ice.fx -= nx * pen * 40
            ice.fz -= nz * pen * 40
            const vn = ice.vx * nx + ice.vz * nz
            if (vn > 0) {
              ice.vx -= nx * vn * 0.7
              ice.vz -= nz * vn * 0.7
            }
          }
          const k = ice.k
          const drag = Math.exp(-(2.5 + 30 * (1 - k)) * dt)
          ice.vx = (ice.vx + ice.fx * dt) * drag
          ice.vz = (ice.vz + ice.fz * dt) * drag
          ice.x += ice.vx * dt
          ice.z += ice.vz * dt
          ice.vr = (ice.vr + ice.tq * dt) * Math.exp(-(1.5 + 30 * (1 - k)) * dt)
          ice.ry += ice.vr * dt
          const bob = k * (0.015 + 0.03 * agit) * noise(t * 1.4, ice.seed + 9)
          const goal = ice.targetY + bob - ice.dip * k
          ice.vy += ((goal - ice.y) * 40 - ice.vy * 8) * dt
          ice.y += ice.vy * dt
          const trx = ice.restRot[0] * (1 - k) + k * (-ice.vz * 0.4 + 0.06 * noise(t * 1.1, ice.seed + 5))
          const trz = ice.restRot[1] * (1 - k) + k * (ice.vx * 0.4 + 0.06 * noise(t * 1.2, ice.seed + 6))
          const s = 1 - Math.exp(-5 * dt)
          ice.rx += (trx - ice.rx) * s
          ice.rz += (trz - ice.rz) * s

          ice.root.position.set(ice.x, ice.y, ice.z)
          ice.root.rotation.set(ice.rx, ice.ry, ice.rz)
          ice.outline.position.copy(ice.root.position)
          ice.outline.rotation.copy(ice.root.rotation)
          ice.pivot.position.set(ice.x, level + 0.003, ice.z)
          ice.pivot.rotation.y = ice.ry
          ice.pivot.visible = k > 0.6 && Math.abs(level - ice.y) < 0.24
        }
      }

      const streamGeo = track(new THREE.CylinderGeometry(1, 1, 1, 12, 24, true))
      const streamBase = streamGeo.attributes.position.array.slice()

      const streamMat = track(
        new THREE.ShaderMaterial({
          uniforms: { uColor: { value: new THREE.Color(PAL.water) } },
          vertexShader: `
            varying vec2 vUv;
            void main() {
              vUv = uv;
              gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
            }`,
          fragmentShader: `
            uniform vec3 uColor;
            varying vec2 vUv;
            void main() {
              float a = smoothstep(1.0, 0.66, vUv.y);
              gl_FragColor = vec4(uColor, a);
            }`,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      )
      const streamHullMat = track(
        new THREE.ShaderMaterial({
          uniforms: {
            uLight: { value: LIGHT_DIR.clone().normalize() },
            uBase: { value: 0.017 },
            uVar: { value: 0.5 },
            uColor: { value: v3(PAL.outline) },
          },
          vertexShader: `
            uniform vec3 uLight; uniform float uBase; uniform float uVar;
            varying vec2 vUv;
            void main() {
              vUv = uv;
              vec3 nW = normalize(mat3(modelMatrix) * normal);
              float lit = dot(nW, normalize(uLight)) * 0.5 + 0.5;
              float wob = 0.5 + 0.5 * sin(position.x * 7.0 + position.y * 5.0) * sin(position.z * 6.0 + position.y * 9.0);
              float k = uBase * (0.75 + uVar * (1.0 - lit)) * (0.85 + 0.3 * wob);
              vec4 w = modelMatrix * vec4(position + normal * k, 1.0);
              gl_Position = projectionMatrix * viewMatrix * w;
            }`,
          fragmentShader: `
            uniform vec3 uColor;
            varying vec2 vUv;
            void main() {
              float a = smoothstep(1.0, 0.66, vUv.y);
              gl_FragColor = vec4(uColor, a);
            }`,
          side: THREE.BackSide,
          transparent: true,
          depthWrite: false,
        }),
      )
      const stream = new THREE.Mesh(streamGeo, streamMat)
      stream.frustumCulled = false
      stream.renderOrder = 4.6
      const streamHull = new THREE.Mesh(streamGeo, streamHullMat)
      streamHull.frustumCulled = false
      streamHull.renderOrder = 4.5
      stream.add(streamHull)
      stream.visible = false
      glassGroup.add(stream)

      function updateStream(iX: number, topY: number, botY: number, t: number, Q: number) {
        const pos = streamGeo.attributes.position
        const len = Math.max(0.05, topY - botY)
        const P: { x: number; y: number; z: number }[] = []
        const NX: number[] = []
        const NY: number[] = []
        const R: number[] = []
        for (let i = 0; i <= 24; i++) {
          const s = i / 24
          const y = topY - s * len
          const drop = Math.max(0, SRC_Y - y)
          const sp = Math.sqrt(V0 * V0 + 2 * GRAV * drop)
          const sN = clamp((SRC_Y - y) / 3.6, 0, 1)
          P.push({
            x: iX - 0.02 * sN * sN + noise(t * 5 - sN * 6, 3.1) * 0.018 * sN,
            y,
            z: STREAM_Z + noise(t * 4.5 - sN * 5, 8.4) * 0.018 * sN,
          })
          R.push(sp)
        }
        for (let i = 0; i <= 24; i++) {
          const a = P[Math.max(0, i - 1)]
          const b = P[Math.min(24, i + 1)]
          const tx = b.x - a.x
          const ty = b.y - a.y
          const l = Math.hypot(tx, ty) + 1e-6
          NX.push(-ty / l)
          NY.push(tx / l)
          const s = i / 24
          let r = 0.13 * Math.sqrt(Q / Math.max(1.2, R[i]))
          r *= 1 + 0.07 * noise(t * 3, s * 6 + 2) + 0.05 * Math.sin(s * 16 + t * 12)
          R[i] = Math.max(0.002, r)
        }
        for (let i = 0; i < pos.count; i++) {
          const bx = streamBase[i * 3]
          const by = streamBase[i * 3 + 1]
          const bz = streamBase[i * 3 + 2]
          const ri = Math.round((0.5 - by) * 24)
          const c = P[ri]
          const r = R[ri]
          pos.setXYZ(i, c.x + NX[ri] * r * bx, c.y + NY[ri] * r * bx, c.z + r * bz)
        }
        pos.needsUpdate = true
      }

      // ---------- Éclaboussures et ondes à l'impact ----------
      const splashGeo = track(new THREE.SphereGeometry(1, 8, 6))
      const splashMat = track(new THREE.MeshBasicMaterial({ color: PAL.water }))
      const splashes: Splash[] = []
      for (let i = 0; i < 6; i++) {
        const mesh = new THREE.Mesh(splashGeo, splashMat)
        mesh.scale.setScalar(0.025)
        mesh.add(hull(splashGeo, 0.5, 0.3))
        mesh.visible = false
        glassGroup.add(mesh)
        splashes.push({
          mesh,
          a: (i / 6) * Math.PI * 2 + Math.random(),
          r: 0.08 + Math.random() * 0.08,
          ph: Math.random() * 6.28,
          f: 6 + Math.random() * 3,
        })
      }

      const rippleMat = track(
        new THREE.MeshBasicMaterial({ color: PAL.outline, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      )
      const ripples: Ripple[] = []
      ;([[0.8, 0], [0.95, 0.33], [1.1, 0.66]] as [number, number][]).forEach(([period, offset]) => {
        const geo = new THREE.RingGeometry(0.05, 0.06, 64)
        const mesh = new THREE.Mesh(geo, rippleMat)
        mesh.rotation.x = -Math.PI / 2
        mesh.visible = false
        glassGroup.add(mesh)
        ripples.push({ mesh, period, offset })
      })

      // ---------- Rendu : le canvas EST le widget ----------
      // Le canvas de l'overlay (plein écran par classes) est redimensionné et ancré
      // en bas à gauche par style INLINE (prioritaire sur les classes) : le backing
      // store ne couvre que le widget — fini le framebuffer plein écran dont on ne
      // dessinait qu'un coin (l'ancien montage viewport/scissor), et le rectangle
      // suit le bord bas-gauche tout seul quand la fenêtre change de taille.
      const widgetW = Math.min(WIDGET_W, Math.max(60, width - WIDGET_MARGIN_X * 2))
      const widgetH = Math.min(WIDGET_H, Math.max(80, height))
      canvas.style.position = 'absolute'
      canvas.style.left = `${WIDGET_MARGIN_X}px`
      canvas.style.bottom = '0'
      canvas.style.width = `${widgetW}px`
      canvas.style.height = `${widgetH}px`

      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
      // Sur-échantillonnage 2× DÉLIBÉRÉ (pas le devicePixelRatio) : la scène du
      // prototype a des traits sub-pixel à cette taille miniature (contours d'encre,
      // arêtes des glaçons, anneaux) — rendue 2× puis réduite par le navigateur,
      // elle reste nette même sur un écran en densité 1, là où le dpr natif
      // crénelait. Le canvas ne fait que ~200×300 px CSS : le coût est dérisoire.
      renderer.setPixelRatio(2)
      renderer.setSize(widgetW, widgetH, false)
      renderer.setClearColor(0x000000, 0)
      renderer.toneMapping = THREE.NoToneMapping
      renderer.autoClear = false
      renderer.localClippingEnabled = true

      const VIEW_H = 7.0
      // Bord bas du cadre = 0 (le pied du verre) : aucun vide entre le verre et le
      // bas du widget, lui-même collé au bas de la page (bottom: 0).
      const TARGET_Y = VIEW_H / 2
      const halfW = (VIEW_H / 2) * (widgetW / widgetH)
      const camera = new THREE.OrthographicCamera(-halfW, halfW, VIEW_H / 2, -VIEW_H / 2, 0.1, 200)
      camera.position.set(0, TARGET_Y, 20)
      camera.lookAt(0, TARGET_Y, 0)

      function frameImpl(t: number, dt: number) {
        const srcX = 0.14 + 0.06 * noise(t * 0.6, 9.2)
        const impX = srcX - 0.02
        const impZ = STREAM_Z

        const frontY = t >= T_ON ? SRC_Y - fallDist(t - T_ON) : SRC_Y
        const tailY = t >= T_OFF ? SRC_Y - fallDist(t - T_OFF) : SRC_Y

        const hitY0 = levelFromVol(Vg)
        const Qbase = QMAX * ss(T_ON, T_HIT, t) * (1 + 0.12 * noise(t * 2.5, 4.4))
        const delivering = frontY <= hitY0 + 0.03 && tailY > hitY0 + 0.03
        let Q = delivering ? Qbase : 0
        if (Vg >= VG_FULL) Q = 0
        Vg = Math.min(VG_FULL, Vg + Q * dt)
        const qn = Q / QMAX
        agitS = Math.max(agitS * Math.exp(-dt / 1.5), Math.min(1, qn * 1.3))

        const level = levelFromVol(Vg) + qn * 0.006 * noise(t * 4.0, 1.0)
        setLevel(level)
        const louche = ss(0.05, 0.42, Vg / VG_FULL)
        setColor(louche)
        ghostPlane.constant = level - 0.01
        ghostMat.color.copy(liquidMat.color).lerp(ICE_TINT, 0.55)
        glassFillMat.uniforms.uLevel.value = level + 0.026

        let hitY = level
        for (const ice of ices) if (Math.hypot(ice.x - impX, ice.z - STREAM_Z) < 0.35) hitY = Math.max(hitY, ice.y + ice.topH)
        const impact = new THREE.Vector3(impX, hitY, impZ)

        const topY = clamp(tailY, hitY, SRC_Y)
        const botY = clamp(frontY, hitY, SRC_Y)
        stream.visible = t >= T_ON && topY - botY > 0.07 && Qbase > 0.03 * QMAX
        if (stream.visible) updateStream(srcX, topY, botY, t, Qbase)
        const hitting = qn > 0.12

        for (const sp of splashes) {
          sp.mesh.visible = hitting
          if (!hitting) continue
          const rr2 = sp.r * (1 + 0.4 * noise(t * 2.0, sp.ph))
          sp.mesh.position.set(
            impX + Math.cos(sp.a + t * 0.7) * rr2,
            hitY + 0.02 + Math.abs(Math.sin(t * sp.f + sp.ph)) * (0.05 + 0.1 * qn) * (0.7 + 0.5 * Math.abs(noise(t, sp.ph + 1))),
            impZ + Math.sin(sp.a + t * 0.7) * rr2,
          )
        }

        const maxR = Math.min(0.4, rAt(level) - Math.hypot(impX, impZ) - 0.03)
        ripples.forEach((rp, i) => {
          const show = hitting && maxR > 0.1 && hitY < level + 0.03
          rp.mesh.visible = show
          if (!show) return
          const ph = (((t - T_HIT) / rp.period) + rp.offset) % 1
          const r = 0.04 + ph * (maxR - 0.04) * (0.85 + 0.15 * noise(t, i * 2.0))
          rp.mesh.geometry.dispose()
          rp.mesh.geometry = new THREE.RingGeometry(r - 0.01, r + 0.01, 64)
          rp.mesh.position.set(impX, level + 0.004, impZ)
        })

        stepIce(level, t, dt, qn, impact)

        const rr = rAt(level) - 0.06
        for (const b of bubbles) {
          let fx = 0.03 * noise(t * 0.6, b.seed)
          let fz = 0.03 * noise(t * 0.6, b.seed + 3)
          if (hitting) {
            const dx = b.x - impX
            const dz = b.z - impZ
            const dist = Math.hypot(dx, dz) + 1e-3
            const push = (0.4 * qn) / (1 + (dist / 0.3) ** 2)
            fx += (dx / dist) * push
            fz += (dz / dist) * push
          }
          b.x += fx * dt
          b.z += fz * dt
          const rc = Math.hypot(b.x, b.z)
          if (rc > rr) {
            b.x *= rr / rc
            b.z *= rr / rc
          }
          b.mesh.visible = louche > 0.5
          b.mesh.position.set(b.x, level + b.s * 0.55 + Math.sin(t * 2 + b.seed) * 0.004, b.z)
        }

        // Fondus d'entrée et de sortie du prototype, transposés : pas de fond à
        // masquer (canvas transparent), donc en CSS sur le canvas lui-même plutôt
        // que via le plan `fadePlane` peint dans la scène.
        const fade = Math.min(t / T_FADE, (DURATION_S - t) / T_FADE, 1)
        canvas.style.opacity = String(clamp(fade, 0, 1))

        renderer.clear()
        renderer.render(scene, camera)
        renderer.render(outlineScene, camera)
      }

      cleanupScene = () => {
        for (const rp of ripples) rp.mesh.geometry.dispose()
        liquid.geometry.dispose()
        levelRing.geometry.dispose()
        for (const d of disposables) d.dispose()
        renderer.dispose()
        renderer.forceContextLoss()
      }

      renderFrame = frameImpl
      ready = true
    })
    .catch((err) => {
      console.error('[pastis] chargement de la scène 3D échoué', err)
    })

  return {
    frame(elapsed, dt) {
      if (!ready || !renderFrame) return true // patiente le chargement du chunk
      const t = elapsed / 1000
      if (t > DURATION_S) return false
      renderFrame(t, Math.min(dt, 50) / 1000)
      return t < DURATION_S
    },
    destroy() {
      destroyed = true
      canvas.style.opacity = '0'
      cleanupScene?.()
    },
  }
}

export const pastisEffect: EffectDefinition = {
  id: 'pastis',
  label: 'Verre de pastis',
  hint: 'Un pastis se verse, se trouble et se glace, à la santé de tous',
  durationMs: DURATION,
  mode: 'webgl',
  create,
}
