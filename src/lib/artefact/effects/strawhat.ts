import type * as ThreeNS from 'three'

import type { EffectDefinition, EffectRunner, WebglEffectEnv } from './types.ts'

/*
 * Chapeau de paille — effet WebGL (mode 'webgl'), même patron que `dice.ts` :
 * three.js en import() DYNAMIQUE, canvas transparent, `frame`/`destroy` sobres.
 *
 * Le maillage (profil au lathe, tressage, contour d'encre cel-shadé) reprend
 * tel quel le prototype `chapeau-paille-celshading.html` — seule la caméra
 * (plus d'OrbitControls, un seul plan fixe) et l'animation changent.
 *
 * VOL — modèle simplifié mais physique, pas une courbe décorative :
 * - HORIZONTAL (axe X, gauche→droite ou l'inverse) : vitesse qui décroît en
 *   exponentielle (traînée), donc le chapeau avance vite au lancer et ralentit
 *   en approchant la sortie — jamais une vitesse constante irréaliste.
 * - VERTICAL (axe Y) : un vrai vol de frisbee « plane puis décroche ». Tant
 *   que la vitesse horizontale est élevée, la portance dépasse la gravité et
 *   le chapeau monte ; en ralentissant, la portance retombe sous la gravité
 *   et il plonge de plus en plus vite en fin de course — PAS une cloche
 *   symétrique, une vraie montée-puis-décrochage. Le tangage (rotation.x) est
 *   dérivé de la pente réelle de cette courbe (différence finie), donc il
 *   cabre pendant la montée et pique pendant le décrochage sans qu'aucune
 *   valeur ne soit câblée à la main.
 * - DÉRIVE (axe Z, profondeur) : léger virage MONOTONE (jamais un aller-retour
 *   en cloche qui revient à zéro, qui lisait comme un boomerang) façon
 *   effet gyroscopique d'un vrai disque — s'installe progressivement, ne
 *   « rebondit » jamais.
 * - BANKING (rotation.z) : inclinaison quasi CONSTANTE tout le vol (à peine
 *   de vie ajoutée), comme un disque bien lancé — pas d'oscillation rapide.
 *
 * Côté et virage tirés au hasard à chaque déclenchement (jamais deux fois la
 * même traversée), mais toujours dans une enveloppe de vol plausible — pas de
 * lancer quasi vertical ni de courbe qui repart en arrière. Pas de boucle :
 * un déclenchement = une traversée.
 */

const DURATION = 4400
const FLIGHT = 4.4 // s — doit couvrir toute la traversée (converti depuis DURATION)
const SPIN = 10.5 // rad/s — vitesse de rotation propre du chapeau
/** Taille finale : petit sur l'écran, pas un objet qui domine la page. */
const VISUAL_SCALE = 0.42
const FOV_DEG = 36
const CAM_Z = 1.15

const SEG = 48
const R = 0.1765
const CR = 0.552
const CH = 0.660

/** Ease-out exponentiel : la traînée ralentit l'avancée horizontale au fil du vol. */
function decel(p: number, k: number) {
  return (1 - Math.exp(-k * p)) / (1 - Math.exp(-k))
}

const smoothstep = (t: number) => t * t * (3 - 2 * t)

function create({ canvas, width, height, dpr }: WebglEffectEnv): EffectRunner {
  let ready = false
  let destroyed = false
  let start = -1
  const side = Math.random() < 0.5 ? 1 : -1 // entre par la gauche ou par la droite
  const curveDir = Math.random() < 0.5 ? 1 : -1 // sens du virage (effet gyroscopique)
  const heightTilt = (Math.random() * 2 - 1) * 0.12 // légère asymétrie entrée/sortie

  // Portée de la traversée : la demi-diagonale du champ visible à la distance
  // de la caméra, avec une marge — garantit une entrée/sortie hors champ quel
  // que soit l'aspect de la fenêtre (portrait ou paysage) et la dérive de vol.
  const halfH = CAM_Z * Math.tan((FOV_DEG * Math.PI) / 360)
  const halfW = halfH * (width / height)
  const REACH = Math.hypot(halfW, halfH) * 1.5

  const GLIDE_END = 0.62 // fraction du vol où le plané cède la place au décrochage
  const PEAK = REACH * 0.16 // amplitude de la montée
  const DIVE = -PEAK * 0.4 // altitude relative en fin de décrochage
  const CURVE = REACH * 0.14 // amplitude de la dérive latérale

  /** Hauteur relative : montée amortie (smoothstep) puis décrochage accéléré (quadratique). */
  function altitude(p: number) {
    if (p <= GLIDE_END) return PEAK * smoothstep(p / GLIDE_END)
    const q = (p - GLIDE_END) / (1 - GLIDE_END)
    return PEAK - (PEAK - DIVE) * q * q
  }

  // Bande verticale de la traversée : tantôt vers le haut de l'écran, tantôt
  // vers le bas, tantôt au milieu — sinon le passage se rejoue toujours sur
  // la même ligne malgré le côté d'entrée tiré au hasard. Marge réduite de la
  // course de `altitude` (montée + décrochage) pour que le vol reste visible
  // du début à la fin quelle que soit la bande tirée.
  const vSwing = Math.max(0, halfH * 0.85 - Math.max(PEAK, -DIVE) * 1.15)
  const baseY = (Math.random() * 2 - 1) * vSwing
  const baseZ = -0.25 + (Math.random() * 2 - 1) * 0.08

  let renderer: ThreeNS.WebGLRenderer | null = null
  let scene: ThreeNS.Scene | null = null
  let camera: ThreeNS.PerspectiveCamera | null = null
  let hat: ThreeNS.Group | null = null
  let spinner: ThreeNS.Group | null = null
  const disposables: { dispose: () => void }[] = []

  import('three')
    .then((THREE) => {
      if (destroyed) return
      canvas.style.opacity = '1'

      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
      renderer.setPixelRatio(Math.min(dpr, 1.5))
      renderer.setSize(width, height, false)
      renderer.setClearColor(0x000000, 0)
      renderer.toneMapping = THREE.NoToneMapping

      scene = new THREE.Scene()
      camera = new THREE.PerspectiveCamera(36, width / height, 0.01, 100)
      camera.position.set(0, 0.12, 1.15)
      camera.lookAt(0, 0.07, 0)

      const key = new THREE.DirectionalLight(0xfff3da, 1.75)
      key.position.set(4, 6, 4)
      scene.add(key)
      const fill = new THREE.DirectionalLight(0x9dc2ef, 0.45)
      fill.position.set(-5, 1.2, 2)
      scene.add(fill)
      scene.add(new THREE.HemisphereLight(0xfff2dc, 0x5f5140, 0.55))

      // Table de correspondance à 4 paliers : le cœur du cel-shading. Filtrée
      // en NearestFilter pour des marches franches (pas de dégradé lissé).
      const steps = new Uint8Array([70, 135, 200, 255])
      const gradientMap = new THREE.DataTexture(
        steps,
        steps.length,
        1,
        THREE.RedFormat,
      )
      gradientMap.minFilter = gradientMap.magFilter = THREE.NearestFilter
      gradientMap.generateMipmaps = false
      gradientMap.needsUpdate = true
      disposables.push(gradientMap)

      // Profil : calotte (spline), bord (fonction), intérieur grossier. Tout
      // relatif à R, donc R met le chapeau à l'échelle sans le déformer.
      const CROWN = new THREE.SplineCurve(
        [
          [0.0, CH],
          [0.22, 0.644],
          [0.39, 0.572],
          [0.506, 0.43],
          [0.549, 0.22],
          [CR, 0.03],
        ].map((p) => new THREE.Vector2(p[0], p[1])),
      ).getPoints(17)

      const brimY = (u: number) =>
        0.01 - 0.005 * Math.sin(Math.PI * u * 0.9) + 0.009 * u * u
      const BRIM_TOP: ThreeNS.Vector2[] = []
      for (let i = 0; i < 8; i++) {
        const u = i / 7
        BRIM_TOP.push(new THREE.Vector2(0.585 + (1.0 - 0.585) * u, brimY(u)))
      }
      const BRIM_BOT: ThreeNS.Vector2[] = []
      for (let i = 0; i < 7; i++) {
        const u = 1 - i / 6
        BRIM_BOT.push(new THREE.Vector2(0.585 + (0.995 - 0.585) * u, brimY(u) - 0.021))
      }
      const INNER = [
        [0.53, 0.014],
        [0.5, 0.3],
        [0.38, 0.556],
        [0.0, CH - 0.016],
      ].map((p) => new THREE.Vector2(p[0], p[1]))

      // .reverse() indispensable : LatheGeometry veut les points du bas vers
      // le haut, sinon les normales s'inversent et l'objet rend à l'envers.
      const PROFILE = [...CROWN, ...BRIM_TOP, ...BRIM_BOT, ...INNER].reverse()
      const OUTER_START = INNER.length + BRIM_BOT.length

      // Abscisse curviligne depuis le sommet, normalisée sur la SEULE face
      // extérieure — sinon la face intérieure consommerait des anneaux pour
      // rien et le motif de tressage serait faussé.
      function ringLUT(pts: ThreeNS.Vector2[], outerStart: number) {
        const n = pts.length
        const s = new Array(n).fill(0)
        for (let i = n - 2; i >= 0; i--) s[i] = s[i + 1] + pts[i].distanceTo(pts[i + 1])
        const outer = s[outerStart]
        return s.map((v) => v / outer)
      }
      const LUT = ringLUT(PROFILE, OUTER_START)

      // Irrégularité de maille périodique en theta (identique à 0 et 360°, la
      // couture du lathe reste invisible), amortie en carré près de l'axe pour
      // ne pas faire diverger les sommets voisins du pôle.
      function stylize(geo: ThreeNS.BufferGeometry, amp: number) {
        const pos = geo.attributes.position
        const v = new THREE.Vector3()
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i)
          const r = Math.hypot(v.x, v.z)
          const fade = Math.min(1, r / 0.22)
          const a = amp * fade * fade
          if (a < 1e-5) continue
          const th = Math.atan2(v.z, v.x)
          const n1 =
            Math.sin(7 * th + v.y * 31) +
            0.6 * Math.sin(13 * th - v.y * 17) +
            0.4 * Math.sin(23 * th + 2.1)
          const n2 = Math.cos(11 * th - v.y * 23) + 0.5 * Math.cos(19 * th + v.y * 13)
          const rr = r + a * 0.55 * n1
          const tt = th + (a * 1.1 * n1) / Math.max(r, 0.15)
          pos.setXYZ(i, Math.cos(tt) * rr, v.y + a * 0.8 * n2, Math.sin(tt) * rr)
        }
        geo.computeVertexNormals()
      }

      // Couleur par facette via des anneaux concentriques solidaires de la
      // révolution (donc immobiles quand le chapeau tourne) — pas de tirage
      // aléatoire, qui scintillerait à la rotation.
      function weave(
        geo: ThreeNS.BufferGeometry,
        hex: number,
        coils: number,
        lut: number[] | null,
        amp: number,
      ) {
        const g = geo.toNonIndexed()
        const pos = g.attributes.position
        const uv = g.attributes.uv
        const n = pos.count
        const arr = new Float32Array(n * 3)
        // Normales de FACE (identiques sur les 3 sommets d'un triangle) plutôt
        // que les normales lissées héritées de `toNonIndexed` : le shading plat
        // du cel-shading vient de là, sans dépendre du flag `flatShading` du
        // matériau (absent du typage MeshToonMaterial de la version installée).
        const nor = new Float32Array(n * 3)
        const base = new THREE.Color(hex)
        const c = new THREE.Color()
        const a = new THREE.Vector3()
        const b = new THREE.Vector3()
        const d = new THREE.Vector3()
        const e1 = new THREE.Vector3()
        const e2 = new THREE.Vector3()
        const nrm = new THREE.Vector3()

        for (let i = 0; i < n; i += 3) {
          a.fromBufferAttribute(pos, i)
          b.fromBufferAttribute(pos, i + 1)
          d.fromBufferAttribute(pos, i + 2)
          nrm.crossVectors(e1.subVectors(b, a), e2.subVectors(d, a)).normalize()

          let v = (uv.getY(i) + uv.getY(i + 1) + uv.getY(i + 2)) / 3
          if (lut) v = lut[Math.min(lut.length - 1, Math.round(v * (lut.length - 1)))]

          const ring = 0.5 - 0.5 * Math.cos(v * Math.PI * 2 * coils)
          let l = 1 + amp * (ring - 0.5) * 2
          l *= 1 - 0.16 * Math.max(0, -nrm.y)
          c.copy(base).multiplyScalar(l)
          for (let k = 0; k < 3; k++) {
            arr.set([c.r, c.g, c.b], (i + k) * 3)
            nor.set([nrm.x, nrm.y, nrm.z], (i + k) * 3)
          }
        }
        g.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3))
        g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
        return g
      }

      // Fusion en une seule géométrie → un seul draw call ; les UV sont jetés
      // (inutiles sans texture, la couleur porte déjà tressage et matière).
      function merge(geos: ThreeNS.BufferGeometry[]) {
        let total = 0
        geos.forEach((g) => (total += g.attributes.position.count))
        const pos = new Float32Array(total * 3)
        const nor = new Float32Array(total * 3)
        const col = new Float32Array(total * 3)
        let o = 0
        for (const g of geos) {
          pos.set(g.attributes.position.array, o * 3)
          nor.set(g.attributes.normal.array, o * 3)
          col.set(g.attributes.color.array, o * 3)
          o += g.attributes.position.count
          g.dispose()
        }
        const m = new THREE.BufferGeometry()
        m.setAttribute('position', new THREE.BufferAttribute(pos, 3))
        m.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
        m.setAttribute('color', new THREE.BufferAttribute(col, 3))
        return m
      }

      // Contour d'encre : coque inversée, sommets décalés le long des normales
      // LISSÉES puis affichée en BackSide seule, donc ne dépasse que sur le
      // pourtour. Décalage volontairement > à l'amplitude du bruit pour que le
      // corps ne la traverse jamais.
      function inkShell(geo: ThreeNS.BufferGeometry, d: number, hex: number) {
        const s = geo.clone()
        s.computeVertexNormals()
        const p = s.attributes.position
        const nn = s.attributes.normal
        for (let i = 0; i < p.count; i++) {
          p.setXYZ(
            i,
            p.getX(i) + nn.getX(i) * d,
            p.getY(i) + nn.getY(i) * d,
            p.getZ(i) + nn.getZ(i) * d,
          )
        }
        const mesh = new THREE.Mesh(
          s,
          new THREE.MeshBasicMaterial({ color: hex, side: THREE.BackSide }),
        )
        disposables.push(s, mesh.material)
        return mesh
      }

      const latheBody = new THREE.LatheGeometry(PROFILE, SEG)
      const latheClean = new THREE.LatheGeometry(PROFILE, SEG)
      stylize(latheBody, 0.008)

      const bandBody = new THREE.CylinderGeometry(0.557, 0.567, 0.175, SEG, 1, true)
      bandBody.translate(0, 0.125, 0)
      const bandClean = bandBody.clone()
      stylize(bandBody, 0.004)

      hat = new THREE.Group()
      spinner = new THREE.Group()
      spinner.scale.setScalar(R * VISUAL_SCALE)
      hat.add(spinner)
      scene.add(hat)

      spinner.add(inkShell(latheClean, 0.024, 0x3e2a14))
      spinner.add(inkShell(bandClean, 0.016, 0x5a1a10))

      const geo = merge([
        weave(latheBody, 0xefc583, 11, LUT, 0.085),
        weave(bandBody, 0xd8452e, 2, null, 0.045),
      ])
      geo.computeBoundingSphere()
      const material = new THREE.MeshToonMaterial({
        vertexColors: true,
        side: THREE.FrontSide,
        gradientMap,
      })
      disposables.push(geo, material)
      spinner.add(new THREE.Mesh(geo, material))

      ready = true
    })
    .catch((err) => {
      console.error('[strawhat] chargement de la scène 3D échoué', err)
    })

  return {
    frame(elapsed, dt) {
      if (!ready || !renderer || !scene || !camera || !hat || !spinner) {
        return true // patiente le chargement du chunk (borné par le cap de l'overlay)
      }
      if (start < 0) start = elapsed
      const p = Math.min(1, (elapsed - start) / (FLIGHT * 1000))
      const t = elapsed / 1000

      // Horizontal : traînée exponentielle (vite au lancer, plus lent en fin
      // de course). Vertical : plané puis décrochage réel (voir `altitude`).
      // Profondeur : virage monotone qui s'installe progressivement.
      const along = REACH * (2 * decel(p, 1.1) - 1)
      const alt = altitude(p)
      const EPS = 0.01
      // Pente réelle de la courbe d'altitude (différence finie) : le tangage
      // en découle directement, aucune valeur de rotation câblée à la main.
      const slope =
        (altitude(Math.min(1, p + EPS)) - altitude(Math.max(0, p - EPS))) /
        (2 * EPS * Math.max(PEAK, 1e-6))

      hat.position.set(
        side * along,
        0.07 + baseY + alt + heightTilt * (p - 0.5),
        baseZ + curveDir * CURVE * Math.pow(p, 1.6),
      )
      spinner.rotation.y += (dt / 1000) * SPIN
      // Banking quasi constant (à peine de vie) : un disque bien lancé ne se
      // remet pas à osciller en vol. Tangage dérivé de la pente d'altitude.
      hat.rotation.z = side * -0.22 + curveDir * 0.06 + 0.015 * Math.sin(t * 2.2)
      hat.rotation.x = Math.max(-0.5, Math.min(0.5, slope * 0.09))

      renderer.render(scene, camera)
      return p < 1
    },
    destroy() {
      destroyed = true
      canvas.style.opacity = '0'
      for (const d of disposables) d.dispose()
      renderer?.dispose()
      renderer?.forceContextLoss()
      renderer = null
      scene = null
      hat = null
      spinner = null
    },
  }
}

export const strawhatEffect: EffectDefinition = {
  id: 'strawhat',
  label: 'Chapeau de paille',
  hint: 'Le chapeau plane comme un frisbee et traverse l’écran',
  durationMs: DURATION,
  mode: 'webgl',
  create,
}
