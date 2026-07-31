# Étape 4 — Physique : chute, roulement, résultat, nettoyage

## Objectif

Donner vie au dé : monde **cannon-es**, le D20 **tombe du haut**, **roule et rebondit**
dans la zone carrée, s'**immobilise** sur une face, on **lit le nombre du dessus** (au
hasard, décidé par la physique), on l'**affiche**, puis on **libère toutes les
ressources** (aucune fuite au rejeu).

## Contexte

three.js rend, cannon-es simule : à chaque frame on avance le monde puis on recopie
`body.position`/`body.quaternion` vers le `mesh`. Décisions actées : **D2** cannon-es,
**D3** physique libre + lecture de la face (argmax des normales · +Y). Pas de forçage.
Pièges connus : pas de temps fixe (sinon rebonds erratiques), détection d'immobilité,
et surtout **`dispose()` complet** (20 `CanvasTexture` + géométries + matériaux +
renderer) sous peine de fuite du contexte WebGL.

## Fichier(s) impacté(s)

- `src/lib/artefact/effects/dice.ts` (modifié) — monde physique, lancer, lecture,
  résultat, dispose.

## Travail à réaliser

### 1. Monde physique + corps

```ts
const CANNON = await import('cannon-es')
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -40, 0) }) // amplifiée = lancer nerveux
world.allowSleep = true

// Sol
const floorBody = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane() })
floorBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0)
world.addBody(floorBody)

// 4 murs invisibles (plans statiques orientés vers l'intérieur) délimitant le carré
// de côté 2*playHalf -> le dé reste dans le champ de la caméra ortho.
// + éventuellement un plafond invisible si le dé rebondit trop haut.

// Dé : approx. par une forme convexe. Simplest crédible = CANNON.Sphere(r) englobante
// (roulement doux) ; plus fidèle = ConvexPolyhedron construit depuis les sommets de
// l'icosaèdre (rebonds anguleux réalistes). Choisir Sphere pour la simplicité, ou
// ConvexPolyhedron pour le réalisme maximal (voir « pièges »).
const dieBody = new CANNON.Body({ mass: 1, shape: dieShape })
dieBody.allowSleep = true
dieBody.sleepSpeedLimit = 0.15
dieBody.sleepTimeLimit = 0.1
world.addBody(dieBody)
```

### 2. Lancer (chute du haut + spin aléatoire)

```ts
dieBody.position.set((Math.random() - 0.5) * 2, 8, (Math.random() - 0.5) * 2)
dieBody.quaternion.setFromEuler(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28)
dieBody.velocity.set((Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6)
dieBody.angularVelocity.set(
  (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20,
)
```

### 3. Boucle : pas fixe + synchro mesh

```ts
// dans frame(elapsed, dt) :
world.fixedStep()                          // pas fixe 1/60 (stable, indépendant du fps)
die.position.copy(dieBody.position)
die.quaternion.copy(dieBody.quaternion)
renderer.render(scene, camera)
```

### 4. Détection d'immobilité + lecture de la face

Écouter l'événement `sleep` du corps (ou seuil manuel `velocity`+`angularVelocity`
sous epsilon pendant N frames), avec un **timeout de sécurité** (~5 s) qui force la
lecture.

```ts
// À l'arrêt : quelle face pointe le plus vers le haut ?
const up = new THREE.Vector3(0, 1, 0)
let best = -Infinity, bestFace = 0
for (let i = 0; i < 20; i++) {
  const n = faceNormalLocal[i].clone().applyQuaternion(die.quaternion) // normale monde
  const d = n.dot(up)
  if (d > best) { best = d; bestFace = i }
}
const result = faceValue[bestFace]   // même table qu'à l'étape 3
```

`faceNormalLocal[i]` : normales locales des 20 faces (calculées une fois depuis la
géométrie, ou pré-tabulées). Cas rare du dé sur une arête (deux `d` très proches) :
micro-impulsion + re-attendre le sommeil.

### 5. Afficher le résultat + fin

- Surbrillance de la face gagnante (matériau `emissive` monté brièvement) et/ou un
  nombre en fondu. Simplicité self-contained : mettre l'`emissive` du matériau
  `bestFace` puis laisser une courte pause de lecture (~1 s).
- Fin : une fois le résultat affiché et la pause écoulée, `frame` renvoie `false`
  (l'overlay se démonte et appelle `destroy`). Caler `durationMs` pour que
  chargement + lancer + lecture tiennent sous `durationMs + 4000`.

### 6. `destroy()` — libération complète (obligatoire)

```ts
disposeAll = () => {
  cancelAnimationFrame(raf0)
  textures.forEach((t) => t.dispose())      // les 20 CanvasTexture
  geom.dispose()
  materials.forEach((m) => m.dispose())
  floor.geometry.dispose(); floor.material.dispose()
  renderer.dispose()
  renderer.forceContextLoss()               // rend le contexte WebGL au navigateur
  // retirer les listeners (resize, sleep) posés par l'effet
}
```

## Ordre d'exécution

1. Monde cannon-es + sol + 4 murs invisibles + corps du dé.
2. Synchro mesh<-body dans `frame` avec `world.fixedStep()`.
3. Lancer (position haute + vitesses/rotation aléatoires).
4. Détection d'immobilité (`sleep` + timeout) puis lecture de la face (dot · +Y).
5. Affichage du résultat + fin propre (`frame` -> false après pause).
6. `destroy()` complet + vérifier l'absence de fuite au rejeu répété.
7. `npx tsc --noEmit`.

## Critère de validation

- `npx tsc --noEmit` sans erreur.
- Le dé **tombe, roule et rebondit** de façon crédible puis s'immobilise ; le nombre
  lu correspond bien à la face effectivement vers le haut (vérif visuelle sur
  plusieurs lancers).
- Les résultats varient (distribution ~aléatoire sur 1-20, pas de biais évident sur
  ~20 lancers).
- **Aucune fuite** : rejouer l'effet 15-20 fois d'affilée ne provoque pas de perte de
  contexte WebGL (console sans warning « too many WebGL contexts ») — preuve que
  `destroy()` libère tout.
- Le dé reste dans la zone carrée (murs invisibles efficaces), rien ne sort du cadre.
