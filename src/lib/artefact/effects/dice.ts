import type * as ThreeNS from 'three'
import type * as CannonNS from 'cannon-es'

import type { EffectDefinition, EffectRunner, WebglEffectEnv } from './types.ts'

/*
 * Lancer de dé 20 (D20, style D&D) — effet WebGL (mode 'webgl'). Patron CANONIQUE
 * (three.js + cannon-es, à la Codrops) : le dé tombe du haut, tumble avec une vraie
 * physique, se pose sur une face, on lit le nombre du dessus, on l'affiche, puis
 * fondu de sortie. Volontairement SIMPLE : pas de murs (le dé lâché près du centre y
 * reste et se pose franchement sur une face — un icosaèdre est stable sur ses faces),
 * donc pas de rebonds parasites = mouvement fluide.
 *
 * three.js + cannon-es en import() DYNAMIQUE (chunk séparé, hors bundle racine). Un
 * atlas de texture + un matériau (1 draw call). Rendu des transforms INTERPOLÉES (pas
 * fixe) = fluide. À l'arrêt, un SNAP aligne la face gagnante pile vers le haut (arrêt
 * bien à plat). destroy() libère tout ; opacité remise à 1 au setup + .catch = pas
 * d'écran blanc silencieux.
 */

const DURATION = 8000
const R = 0.93
const SHOW_MS = 1600 // durée d'affichage du résultat avant le fondu
const FADE_MS = 500

const PHI = (1 + Math.sqrt(5)) / 2
const ICO_VERTS: ReadonlyArray<readonly [number, number, number]> = [
  [-1, PHI, 0],
  [1, PHI, 0],
  [-1, -PHI, 0],
  [1, -PHI, 0],
  [0, -1, PHI],
  [0, 1, PHI],
  [0, -1, -PHI],
  [0, 1, -PHI],
  [PHI, 0, -1],
  [PHI, 0, 1],
  [-PHI, 0, -1],
  [-PHI, 0, 1],
]
const ICO_FACES: ReadonlyArray<readonly [number, number, number]> = [
  [0, 11, 5],
  [0, 5, 1],
  [0, 1, 7],
  [0, 7, 10],
  [0, 10, 11],
  [1, 5, 9],
  [5, 11, 4],
  [11, 10, 2],
  [10, 7, 6],
  [7, 1, 8],
  [3, 9, 4],
  [3, 4, 2],
  [3, 2, 6],
  [3, 6, 8],
  [3, 8, 9],
  [4, 9, 5],
  [2, 4, 11],
  [6, 2, 10],
  [8, 6, 7],
  [9, 8, 1],
]
const VSCALE = R / Math.hypot(1, PHI)

const FACE_COLOR = '#b1121f'
const TEXT_COLOR = '#ffffff'
const RESULT_COLOR = '#ffd54f'

const COLS = 5
const ROWS = 4
const CELL = 128
const TRI: ReadonlyArray<readonly [number, number]> = [
  [0.5, 0.08],
  [0.136, 0.71],
  [0.864, 0.71],
]

/** Taille de police de base des nombres (px dans la cellule d'atlas de 128 px). */
const FONT_BASE = 34
/** Largeur utile du triangle de la face : au-delà, la chaîne est réduite pour tenir. */
const FONT_MAX_W = 46

/*
 * Dessine le nombre `n` (1-20) sur sa face, centré sur le CENTROÏDE du triangle (qui
 * coïncide avec le centre de la cellule d'atlas) et dimensionné selon la CHAÎNE : tous
 * les nombres partagent la même hauteur de glyphe, et les nombres larges (« 20 »…) sont
 * réduits juste ce qu'il faut pour tenir dans le triangle. Centrage vertical précis via
 * les métriques réelles du glyphe (pas d'à-peu-près sur la ligne de base).
 */
function drawCell(g: CanvasRenderingContext2D, n: number, color: string) {
  const i = n - 1
  const x0 = (i % COLS) * CELL
  const y0 = Math.floor(i / COLS) * CELL
  g.fillStyle = FACE_COLOR
  g.fillRect(x0, y0, CELL, CELL)

  const cx = x0 + CELL / 2
  const cy = y0 + CELL / 2
  const s = String(n)

  g.font = `bold ${FONT_BASE}px system-ui, sans-serif`
  const rawW = g.measureText(s).width
  const fontPx =
    rawW > FONT_MAX_W ? Math.floor((FONT_BASE * FONT_MAX_W) / rawW) : FONT_BASE
  g.font = `bold ${fontPx}px system-ui, sans-serif`

  g.fillStyle = color
  g.textAlign = 'center'
  g.textBaseline = 'alphabetic'
  const m = g.measureText(s)
  const asc = m.actualBoundingBoxAscent
  const desc = m.actualBoundingBoxDescent
  g.fillText(s, cx, cy + (asc - desc) / 2)

  // Soulignement des nombres ambigus 6 / 9, calé sous le glyphe.
  if (n === 6 || n === 9) {
    const uw = fontPx * 0.6
    const uy = cy + asc / 2 + fontPx * 0.16
    g.fillRect(cx - uw / 2, uy, uw, Math.max(3, Math.round(fontPx * 0.08)))
  }
}

function create({ canvas, width, height, dpr }: WebglEffectEnv): EffectRunner {
  let ready = false
  let destroyed = false
  let simStart = -1
  let settledAt = -1
  let result = -1

  let renderer: ThreeNS.WebGLRenderer | null = null
  let scene: ThreeNS.Scene | null = null
  let camera: ThreeNS.OrthographicCamera | null = null
  let die: ThreeNS.Mesh | null = null
  let world: CannonNS.World | null = null
  let body: CannonNS.Body | null = null
  let geom: ThreeNS.BufferGeometry | null = null
  let material: ThreeNS.MeshStandardMaterial | null = null
  let atlasCtx: CanvasRenderingContext2D | null = null
  let atlasTex: ThreeNS.CanvasTexture | null = null
  let floorGeom: ThreeNS.PlaneGeometry | null = null
  let floorMat: ThreeNS.ShadowMaterial | null = null
  let entryWall: CannonNS.Body | null = null
  let entryClear: (() => boolean) | null = null
  let entryAdded = false
  let still = 0
  const faceNormals: ThreeNS.Vector3[] = []

  Promise.all([import('three'), import('cannon-es')])
    .then(([THREE, CANNON]) => {
      if (destroyed) return
      canvas.style.opacity = '1'

      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
      })
      renderer.setPixelRatio(Math.min(dpr, 1.5))
      renderer.setSize(width, height, false)
      renderer.setClearColor(0x000000, 0)
      renderer.shadowMap.enabled = true
      renderer.shadowMap.type = THREE.PCFShadowMap

      scene = new THREE.Scene()

      // Vue de DESSUS (orthographique), regard vertical : le dé et la face gagnante
      // sont vus « à plat », sans distorsion. Bornes calées sur l'aspect -> l'arène
      // tient toujours dans le cadre (paysage comme portrait).
      const HALF = 6.5
      const aspect = width / height
      const hy = HALF * Math.max(1, 1 / aspect)
      const hx = hy * aspect
      camera = new THREE.OrthographicCamera(-hx, hx, hy, -hy, 0.1, 100)
      camera.position.set(0, 20, 0)
      camera.up.set(0, 0, -1)
      camera.lookAt(0, 0, 0)

      scene.add(new THREE.AmbientLight(0xffffff, 0.65))
      const key = new THREE.DirectionalLight(0xffffff, 1.15)
      key.position.set(5, 14, 5)
      key.castShadow = true
      key.shadow.mapSize.set(1024, 1024)
      key.shadow.bias = -0.0005
      key.shadow.normalBias = 0.02
      const sc = key.shadow.camera
      sc.left = -8
      sc.right = 8
      sc.top = 8
      sc.bottom = -8
      sc.near = 1
      sc.far = 40
      scene.add(key)

      // Sol : ne montre QUE l'ombre (fond transparent).
      floorGeom = new THREE.PlaneGeometry(60, 60)
      floorMat = new THREE.ShadowMaterial({ opacity: 0.3 })
      const floor = new THREE.Mesh(floorGeom, floorMat)
      floor.rotation.x = -Math.PI / 2
      floor.receiveShadow = true
      scene.add(floor)

      // Atlas des 20 chiffres (une seule texture) + un seul matériau.
      const atlas = document.createElement('canvas')
      atlas.width = COLS * CELL
      atlas.height = ROWS * CELL
      const g2d = atlas.getContext('2d')
      if (!g2d) return
      atlasCtx = g2d
      for (let n = 1; n <= 20; n++) drawCell(g2d, n, TEXT_COLOR)
      atlasTex = new THREE.CanvasTexture(atlas)
      atlasTex.flipY = false
      atlasTex.colorSpace = THREE.SRGBColorSpace
      atlasTex.anisotropy = 4
      material = new THREE.MeshStandardMaterial({
        map: atlasTex,
        roughness: 0.45,
        metalness: 0.15,
      })

      // Géométrie : chaque face mappe ses UV sur le triangle centré de SA cellule.
      const positions: number[] = []
      const uvs: number[] = []
      const scaled = ICO_VERTS.map(
        (v) => new THREE.Vector3(v[0] * VSCALE, v[1] * VSCALE, v[2] * VSCALE),
      )
      ICO_FACES.forEach(([a, b, c], i) => {
        const va = scaled[a]
        const vb = scaled[b]
        const vc = scaled[c]
        positions.push(va.x, va.y, va.z, vb.x, vb.y, vb.z, vc.x, vc.y, vc.z)
        const col = i % COLS
        const row = Math.floor(i / COLS)
        for (const [lx, ly] of TRI) {
          uvs.push((col + lx) / COLS, (row + ly) / ROWS)
        }
        faceNormals.push(
          new THREE.Vector3()
            .addVectors(va, vb)
            .add(vc)
            .multiplyScalar(1 / 3)
            .normalize(),
        )
      })
      geom = new THREE.BufferGeometry()
      geom.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(positions, 3),
      )
      geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
      geom.computeVertexNormals()

      die = new THREE.Mesh(geom, material)
      die.castShadow = true
      scene.add(die)

      world = new CANNON.World({ gravity: new CANNON.Vec3(0, -30, 0) })
      // Matériaux séparés : le SOL est MOU (le dé se pose sans rebond en arrivant) mais
      // les MURS sont REBONDISSANTS — avec une force de lancer forte, le dé se cogne
      // dedans et rebondit avant de s'arrêter, donc il est toujours visible sans qu'on
      // ait à le « pousser ». Frottement au sol modéré (il roule/culbute), quasi nul aux
      // murs.
      const dieMat = new CANNON.Material('die')
      const groundMat = new CANNON.Material('ground')
      const wallMat = new CANNON.Material('wall')
      world.addContactMaterial(
        new CANNON.ContactMaterial(dieMat, groundMat, {
          restitution: 0.1,
          friction: 0.2,
        }),
      )
      world.addContactMaterial(
        new CANNON.ContactMaterial(dieMat, wallMat, {
          restitution: 0.4,
          friction: 0.08,
        }),
      )

      const floorBody = new CANNON.Body({
        type: CANNON.Body.STATIC,
        shape: new CANNON.Plane(),
        material: groundMat,
      })
      floorBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0)
      world.addBody(floorBody)

      // Murs invisibles sur les BORDS DE LA FENÊTRE (le cadre ortho = la zone visible).
      // Le côté par lequel le dé ARRIVE reste OUVERT au départ (son mur est posé juste
      // après l'entrée) : ainsi le dé vient réellement de HORS CHAMP, puis reste confiné
      // et rebondit sur les bords comme sur une table.
      const BX = hx - 0.3
      const BZ = hy - 0.3
      const mkWall = (px: number, pz: number, ay: number) => {
        const w = new CANNON.Body({
          type: CANNON.Body.STATIC,
          shape: new CANNON.Plane(),
          material: wallMat,
        })
        w.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), ay)
        w.position.set(px, 0, pz)
        return w
      }
      const WALLS: [number, number, number][] = [
        [-BX, 0, Math.PI / 2],
        [BX, 0, -Math.PI / 2],
        [0, -BZ, 0],
        [0, BZ, Math.PI],
      ]
      const entrySide = Math.floor(Math.random() * 4)
      WALLS.forEach((w, i) => {
        if (i !== entrySide) world!.addBody(mkWall(w[0], w[1], w[2]))
      })
      const ewall = WALLS[entrySide]
      entryWall = mkWall(ewall[0], ewall[1], ewall[2])
      entryClear = () => {
        if (!body) return true
        const p = body.position
        return entrySide === 0
          ? p.x > -BX + R
          : entrySide === 1
            ? p.x < BX - R
            : entrySide === 2
              ? p.z > -BZ + R
              : p.z < BZ - R
      }

      const cverts = scaled.map((v) => new CANNON.Vec3(v.x, v.y, v.z))
      const cfaces = ICO_FACES.map((f) => [f[0], f[1], f[2]])
      const shape = new CANNON.ConvexPolyhedron({
        vertices: cverts,
        faces: cfaces,
      })
      body = new CANNON.Body({ mass: 1, shape, material: dieMat })
      body.allowSleep = true
      body.sleepSpeedLimit = 0.08
      body.sleepTimeLimit = 0.5
      // Amortissement : saigne l'énergie du roulement pour que le dé FINISSE par se
      // poser à plat (traîne courte) au lieu de micro-rouler longtemps sur les murs.
      body.linearDamping = 0.15
      body.angularDamping = 0.32

      // Arrivée HORS CHAMP : le dé apparaît ENTIÈREMENT hors de l'écran, au-delà du bord
      // d'entrée (position ALÉATOIRE le long de ce bord), puis est projeté DANS la
      // fenêtre avec une force FORTE et FIXE. Assez fort pour toujours entrer franchement,
      // rebondir sur les murs et s'arrêter dans le champ — aucun guidage, aucune poussée
      // corrective.
      const S = 12
      // Rotation CALÉE sur l'avancée (roulement sans glissement : ω = v / R) : le dé
      // ROULE vraiment vers l'intérieur, le frottement l'AIDE au lieu de le freiner —
      // il entre donc toujours franchement. Petite composante verticale pour le style.
      const ROLL = S / R
      let px = 0
      let pz = 0
      let vx = 0
      let vz = 0
      let wx = 0
      let wz = 0
      if (entrySide === 0) {
        px = -(hx + R + 2)
        pz = (Math.random() - 0.5) * (2 * BZ - 4)
        vx = S
        vz = S * 0.15
        wz = -ROLL
      } else if (entrySide === 1) {
        px = hx + R + 2
        pz = (Math.random() - 0.5) * (2 * BZ - 4)
        vx = -S
        vz = -S * 0.15
        wz = ROLL
      } else if (entrySide === 2) {
        px = (Math.random() - 0.5) * (2 * BX - 4)
        pz = -(hy + R + 2)
        vx = S * 0.15
        vz = S
        wx = ROLL
      } else {
        px = (Math.random() - 0.5) * (2 * BX - 4)
        pz = hy + R + 2
        vx = -S * 0.15
        vz = -S
        wx = -ROLL
      }
      // Vitesse PUREMENT HORIZONTALE (pas d'impulsion verticale) : le dé roule au ras
      // du sol, il ne « saute » pas en arrivant. Hauteur de spawn liée à R (juste au-
      // dessus du sol quel que soit son orientation) -> pas de chute, donc pas de bump.
      body.position.set(px, R + 0.1, pz)
      body.velocity.set(vx, 0, vz)
      body.quaternion.setFromEuler(
        Math.random() * 6.28,
        Math.random() * 6.28,
        Math.random() * 6.28,
      )
      body.angularVelocity.set(wx, 3, wz)
      world.addBody(body)

      die.position.set(body.position.x, body.position.y, body.position.z)
      ready = true
    })
    .catch((err) => {
      console.error('[d20] chargement de la scène 3D échoué', err)
    })

  function readResult() {
    if (!die || !atlasCtx || !atlasTex) return
    // Le dé s'est posé NATURELLEMENT à plat (un d20 ne repose que sur une face) : on
    // lit simplement la face du dessus, sans aucun replacement artificiel.
    let best = -Infinity
    let bi = 0
    for (let i = 0; i < 20; i++) {
      const ny = faceNormals[i].clone().applyQuaternion(die.quaternion).y
      if (ny > best) {
        best = ny
        bi = i
      }
    }
    result = bi + 1
    drawCell(atlasCtx, result, RESULT_COLOR)
    atlasTex.needsUpdate = true
  }

  return {
    frame(elapsed, dt) {
      if (!ready || !renderer || !scene || !camera || !die || !world || !body) {
        return true // patiente le chargement du chunk (borné par le cap de l'overlay)
      }
      if (simStart < 0) simStart = elapsed
      const sim = elapsed - simStart

      // Referme le bord d'ENTRÉE UNIQUEMENT quand le dé est bien à l'intérieur (jamais
      // par un délai qui le pousserait s'il était encore au bord) : il ne peut alors plus
      // ressortir par où il est arrivé, et sans le moindre à-coup.
      if (!entryAdded && entryWall && entryClear && entryClear()) {
        world.addBody(entryWall)
        entryAdded = true
      }

      world.step(1 / 60, Math.min(dt, 50) / 1000, 5)
      const ip = body.interpolatedPosition
      const iq = body.interpolatedQuaternion
      die.position.set(ip.x, ip.y, ip.z)
      die.quaternion.set(iq.x, iq.y, iq.z, iq.w)

      // On lit le résultat quand le dé est RÉELLEMENT au repos (lent de façon SOUTENUE
      // ~0,4 s, et pas juste en équilibre passager sur une arête) : à ce moment il est
      // posé à plat tout seul, aucun replacement nécessaire. Fallback dur de sécurité.
      if (result < 0) {
        if (
          body.velocity.length() < 0.12 &&
          body.angularVelocity.length() < 0.12
        ) {
          still++
        } else {
          still = 0
        }
        if ((still >= 45 && sim > 1200) || sim > 7000) {
          body.sleep()
          readResult()
          settledAt = elapsed
        }
      }

      renderer.render(scene, camera)

      // Résultat affiché SHOW_MS, puis fondu de sortie propre.
      if (result >= 0) {
        const t = elapsed - settledAt
        if (t > SHOW_MS) {
          canvas.style.opacity = String(
            Math.max(0, 1 - (t - SHOW_MS) / FADE_MS),
          )
          if (t > SHOW_MS + FADE_MS) return false
        }
      }
      return sim < 11000
    },
    destroy() {
      destroyed = true
      canvas.style.opacity = '0'
      geom?.dispose()
      material?.dispose()
      atlasTex?.dispose()
      floorGeom?.dispose()
      floorMat?.dispose()
      renderer?.dispose()
      renderer?.forceContextLoss()
      renderer = null
      scene = null
      world = null
      body = null
    },
  }
}

export const diceEffect: EffectDefinition = {
  id: 'd20',
  label: 'Lancer de dé 20',
  hint: 'Un D20 tombe, roule et s’arrête sur un nombre au hasard',
  durationMs: DURATION,
  mode: 'webgl',
  create,
}
