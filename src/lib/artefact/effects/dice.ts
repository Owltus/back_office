import type * as ThreeNS from 'three'
import type * as CannonNS from 'cannon-es'

import type { EffectDefinition, EffectRunner, WebglEffectEnv } from './types.ts'

/*
 * Lancer de dé 20 (D20, style D&D) — effet WebGL (mode 'webgl'). Un icosaèdre
 * numéroté tombe du haut, ROULE et rebondit avec une vraie physique, puis
 * s'immobilise sur un nombre aléatoire (1-20) lu sur la face du dessus. Vue de
 * dessus (caméra orthographique), fond transparent (la page reste visible).
 *
 * three.js (rendu) + cannon-es (physique) sont chargés en import() DYNAMIQUE : ils
 * sortent dans un chunk séparé, jamais dans le bundle racine (que le registre des
 * effets atteint depuis __root). Le contrat 'webgl' (types.ts) fournit le <canvas>
 * brut ; l'effet crée son propre WebGLRenderer. `destroy()` libère tout — sinon
 * fuite du contexte WebGL au rejeu.
 *
 * OPTIMISATION : les 20 chiffres vivent dans UN SEUL atlas de texture (grille 5x4)
 * et le dé utilise UN SEUL matériau -> un seul draw call (au lieu de 20 matériaux /
 * 20 textures). Chaque face mappe ses UV sur un triangle CENTRÉ SUR LE CENTROÏDE de
 * sa cellule -> le chiffre est bien centré sur la face.
 *
 * Résultat : physique LIBRE puis lecture de la face (le hasard vient de la
 * simulation). Géométrie et corps physique partagent EXACTEMENT les mêmes 12
 * sommets / 20 faces (nombre d'or) : le visuel colle à la physique.
 */

const DURATION = 7000
const R = 1.4
const PLAY_HALF = 4.5

// Icosaèdre régulier : 12 sommets (nombre d'or) et 20 faces (winding CCW -> normales
// sortantes). Partagés par le mesh three.js ET le ConvexPolyhedron cannon-es.
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
// Facteur d'échelle : tous les sommets bruts ont la même longueur -> rayon R.
const VSCALE = R / Math.hypot(1, PHI)

const FACE_COLOR = '#b1121f'
const TEXT_COLOR = '#ffffff'
const RESULT_COLOR = '#ffd54f'

// Atlas des chiffres : grille 5x4 de cellules carrées.
const COLS = 5
const ROWS = 4
const CELL = 128
// Triangle équilatéral CENTRÉ sur le centroïde de la cellule (coords locales [0,1]).
// Son centroïde vaut (0.5, 0.5) -> le chiffre dessiné au centre tombe pile dessus.
const TRI: ReadonlyArray<readonly [number, number]> = [
  [0.5, 0.08],
  [0.136, 0.71],
  [0.864, 0.71],
]

/** Dessine le chiffre `n` (1-20) dans sa cellule de l'atlas, couleur au choix. */
function drawCell(g: CanvasRenderingContext2D, n: number, color: string) {
  const i = n - 1
  const x0 = (i % COLS) * CELL
  const y0 = Math.floor(i / COLS) * CELL
  g.fillStyle = FACE_COLOR
  g.fillRect(x0, y0, CELL, CELL)
  g.fillStyle = color
  g.font = 'bold 42px system-ui, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(String(n), x0 + CELL / 2, y0 + CELL / 2 + 1)
  // Souligner 6 et 9 pour lever l'ambiguïté (convention des dés).
  if (n === 6 || n === 9)
    g.fillRect(x0 + CELL / 2 - 13, y0 + CELL / 2 + 22, 26, 4)
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
  const faceNormals: ThreeNS.Vector3[] = []

  // Chargement + construction de la scène et du monde physique, à la demande.
  Promise.all([import('three'), import('cannon-es')]).then(
    ([THREE, CANNON]) => {
      // L'effet a pu être coupé pendant le chargement : ne rien construire, sinon on
      // fuit un contexte WebGL jamais libéré (destroy est déjà passé).
      if (destroyed) return

      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
      })
      // Plein écran : on plafonne le pixel-ratio (le fill-rate coûte cher, un dé
      // reste net à 1.5) — optimisation clé du rendu WebGL plein cadre.
      renderer.setPixelRatio(Math.min(dpr, 1.5))
      renderer.setSize(width, height, false)
      renderer.setClearColor(0x000000, 0)
      renderer.shadowMap.enabled = true
      renderer.shadowMap.type = THREE.PCFShadowMap

      scene = new THREE.Scene()

      // Caméra orthographique au-dessus, regardant vers le bas (carré vu de dessus).
      const halfV = 6
      const aspect = width / height
      camera = new THREE.OrthographicCamera(
        -halfV * aspect,
        halfV * aspect,
        halfV,
        -halfV,
        0.1,
        100,
      )
      camera.position.set(0, 20, 0)
      camera.up.set(0, 0, -1)
      camera.lookAt(0, 0, 0)

      // Lumières + ombre portée (ce qui « vend » le relief vu de dessus).
      scene.add(new THREE.AmbientLight(0xffffff, 0.6))
      const key = new THREE.DirectionalLight(0xffffff, 1.15)
      key.position.set(5, 14, 5)
      key.castShadow = true
      key.shadow.mapSize.set(1024, 1024)
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
      atlasTex.flipY = false // canvas y == v : mapping direct
      atlasTex.colorSpace = THREE.SRGBColorSpace
      atlasTex.anisotropy = 4
      material = new THREE.MeshStandardMaterial({
        map: atlasTex,
        roughness: 0.45,
        metalness: 0.15,
      })

      // Géométrie du D20 : chaque face mappe ses UV sur le triangle centré de SA
      // cellule d'atlas (numéro centré). Un seul matériau -> pas de groupes.
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

      // Monde physique.
      world = new CANNON.World({ gravity: new CANNON.Vec3(0, -35, 0) })
      world.defaultContactMaterial.restitution = 0.3
      world.defaultContactMaterial.friction = 0.35

      const floorBody = new CANNON.Body({
        type: CANNON.Body.STATIC,
        shape: new CANNON.Plane(),
      })
      floorBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0)
      world.addBody(floorBody)

      // 4 murs invisibles -> le dé reste dans le carré visible.
      const wall = (px: number, pz: number, axisY: number) => {
        const w = new CANNON.Body({
          type: CANNON.Body.STATIC,
          shape: new CANNON.Plane(),
        })
        w.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), axisY)
        w.position.set(px, 0, pz)
        world!.addBody(w)
      }
      wall(-PLAY_HALF, 0, Math.PI / 2)
      wall(PLAY_HALF, 0, -Math.PI / 2)
      wall(0, -PLAY_HALF, 0)
      wall(0, PLAY_HALF, Math.PI)

      // Corps du dé : ConvexPolyhedron sur les MÊMES sommets/faces que le mesh.
      const cverts = scaled.map((v) => new CANNON.Vec3(v.x, v.y, v.z))
      const cfaces = ICO_FACES.map((f) => [f[0], f[1], f[2]])
      const shape = new CANNON.ConvexPolyhedron({
        vertices: cverts,
        faces: cfaces,
      })
      body = new CANNON.Body({ mass: 1, shape })
      body.allowSleep = true
      body.sleepSpeedLimit = 0.15
      body.sleepTimeLimit = 0.12

      // Lancer : chute du haut + vitesses et rotation aléatoires.
      const rnd = (m: number) => (Math.random() - 0.5) * m
      body.position.set(rnd(3), 8, rnd(3))
      body.quaternion.setFromEuler(rnd(6.28), rnd(6.28), rnd(6.28))
      body.velocity.set(rnd(6), -2, rnd(6))
      body.angularVelocity.set(rnd(16), rnd(16), rnd(16))
      world.addBody(body)

      die.position.set(body.position.x, body.position.y, body.position.z)

      ready = true
    },
  )

  function readResult() {
    if (!die || !atlasCtx || !atlasTex) return
    const up = { x: 0, y: 1, z: 0 }
    let best = -Infinity
    let bi = 0
    for (let i = 0; i < 20; i++) {
      const n = faceNormals[i].clone().applyQuaternion(die.quaternion)
      const d = n.x * up.x + n.y * up.y + n.z * up.z
      if (d > best) {
        best = d
        bi = i
      }
    }
    result = bi + 1
    // Surlignage discret : on redessine le chiffre gagnant en doré dans l'atlas
    // (un seul matériau -> on met juste la texture à jour).
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
      // Pas FIXE (1/60) + temps réel écoulé -> cannon-es calcule des transforms
      // INTERPOLÉES. On rend l'interpolation (pas les positions brutes du pas de
      // physique) : le mouvement est fluide quel que soit le framerate.
      world.step(1 / 60, Math.min(dt, 50) / 1000, 5)
      const ip = body.interpolatedPosition
      const iq = body.interpolatedQuaternion
      die.position.set(ip.x, ip.y, ip.z)
      die.quaternion.set(iq.x, iq.y, iq.z, iq.w)

      if (result < 0) {
        const lin = body.velocity.length()
        const ang = body.angularVelocity.length()
        if ((lin < 0.2 && ang < 0.2 && sim > 900) || sim > 5500) {
          body.sleep() // fige le dé (surtout si l'arrêt vient du timeout)
          readResult()
          settledAt = elapsed
        }
      }

      renderer.render(scene, camera)

      // Tout est mesuré depuis simStart (post-chargement) : un chargement lent ne
      // rogne jamais le lancer ni l'affichage du résultat ; le cap de l'overlay
      // (durationMs + 4000) reste le garde-fou ultime.
      if (result >= 0) return elapsed - settledAt < 1400
      return sim < 7500
    },
    destroy() {
      destroyed = true
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
  hint: 'Un D20 tombe et roule jusqu’à un nombre au hasard',
  durationMs: DURATION,
  mode: 'webgl',
  create,
}
