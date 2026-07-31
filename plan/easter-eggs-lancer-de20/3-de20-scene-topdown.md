# Étape 3 — D20 numéroté + mise en scène top-down

## Objectif

Construire le **D20 visible** (icosaèdre avec les 20 faces numérotées 1-20, lisibles)
et la **mise en scène « carré vu de dessus »** : caméra orthographique au-dessus, sol
qui reçoit l'ombre, lumières, et une zone de jeu carrée centrée dans le viewport.

## Contexte

Le rendu est statique à cette étape (pas encore de physique) : un D20 posé, bien
éclairé, lisible d'en haut. On s'inspire de byWulf (géométrie D20 + numérotation par
matériaux) et de Codrops (sol, lumières, ombres). Tout est généré au runtime
(`CanvasTexture`) → zéro asset (contrainte CSP).

## Fichier(s) impacté(s)

- `src/lib/artefact/effects/dice.ts` (modifié) — géométrie, matériaux, caméra, sol,
  lumières.

## Travail à réaliser

### 1. Caméra orthographique top-down

Regarde vers `-Y`. Cadrer une zone carrée centrée quel que soit le ratio du viewport.

```ts
const view = Math.min(width, height)         // côté du carré en px CSS
const aspect = width / height
const half = 6                               // demi-taille du monde visible (unités)
camera = new THREE.OrthographicCamera(
  -half * aspect, half * aspect, half, -half, 0.1, 100,
)
camera.position.set(0, 20, 0)
camera.up.set(0, 0, -1)                       // « haut » de l'image = -Z
camera.lookAt(0, 0, 0)
```

### 2. Sol + lumières + ombres

```ts
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap

const key = new THREE.DirectionalLight(0xffffff, 1.1)
key.position.set(4, 12, 4)
key.castShadow = true
scene.add(key, new THREE.AmbientLight(0xffffff, 0.5))

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 40),
  new THREE.ShadowMaterial({ opacity: 0.28 }), // sol transparent, ne montre QUE l'ombre
)
floor.rotation.x = -Math.PI / 2
floor.receiveShadow = true
scene.add(floor)
```

Le `ShadowMaterial` garde le fond de l'overlay transparent (l'effet est superposé à
la page) tout en posant une ombre portée crédible sous le dé.

### 3. Géométrie D20 + numérotation par matériaux

`IcosahedronGeometry` = 20 faces triangulaires. Un **matériau par face** (20 groupes),
chaque matériau portant une `CanvasTexture` du chiffre.

```ts
const geom = new THREE.IcosahedronGeometry(1.4, 0)
// 3 sommets par face non indexée -> un groupe (start=i*3, count=3, materialIndex=i)
for (let i = 0; i < 20; i++) geom.addGroup(i * 3, 3, i)

const faceValue = [/* table faceIndex -> valeur affichée, cohérente avec les textures */]
const textures = []
const materials = faceValue.map((v) => {
  const tex = makeNumberTexture(v)   // <canvas> + fillText, new THREE.CanvasTexture
  textures.push(tex)
  return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0.1 })
})
const die = new THREE.Mesh(geom, materials)
die.castShadow = true
scene.add(die)
```

`makeNumberTexture(v)` : un `document.createElement('canvas')` (ex. 128x128), fond de
la couleur du dé, `fillText` centré avec le chiffre, éventuellement une petite marge ;
`new THREE.CanvasTexture(canvas)`. Conserver `faceValue` et la même table servira à
l'étape 4 pour traduire l'index de la face du dessus en nombre affiché.

Astuce lisibilité top-down : orienter le texte de chaque face vers l'extérieur (le
mapping UV d'`IcosahedronGeometry` place la texture sur le triangle ; ajuster la
rotation du texte dans le canvas si les chiffres apparaissent tournés).

### 4. Zone de jeu carrée

Les murs physiques (étape 4) délimiteront un carré de côté `2 * playHalf` centré en
`(0,0)` dans le plan `XZ`, dimensionné pour tenir dans le champ ortho (`playHalf <
half`). Poser ici la constante partagée `playHalf` (ex. `half * 0.8`).

## Ordre d'exécution

1. Caméra ortho top-down + resize cohérent (recalcul des bornes ortho).
2. Sol (`ShadowMaterial`) + lumières + ombres.
3. `makeNumberTexture` + géométrie D20 + 20 matériaux + mesh.
4. Poser `die` au centre, légèrement en hauteur, statique ; vérifier la lisibilité.
5. `npx tsc --noEmit`.

## Critère de validation

- `npx tsc --noEmit` sans erreur.
- Au déclenchement, un **D20 numéroté** est visible de dessus, chiffres lisibles, avec
  une ombre portée sur le sol ; le fond reste transparent (page visible derrière).
- La zone tient dans le viewport quel que soit le ratio (test large et étroit).
- Les 20 faces portent des chiffres distincts 1-20 (pas de doublon, table
  `faceValue` cohérente).
