# Plan — Lancer de dé 20 (D20) réaliste 3D + physique

## Contexte

Nouvel effet easter-egg : un **dé à 20 faces (D20, style D&D)** tombe du haut de
l'écran, **roule et rebondit avec une vraie physique 3D**, puis s'immobilise sur un
**nombre aléatoire (1-20)**, en vue de dessus (« carré vu de haut »). Exigence
explicite de l'utilisateur : **vraie 3D + vrai moteur physique, le dé roule** — pas
de faux 2D, pas de sprite pré-rendu, pas de CSS.

C'est un chantier plus ambitieux que les effets existants : le moteur d'effets actuel
est **2D `CanvasRenderingContext2D`** (contrat `EffectDefinition`, `create` synchrone,
pas d'accès au `<canvas>`, pas de hook de destruction), or un D20 réaliste réclame
**WebGL (three.js) + un moteur physique (cannon-es)**. Trois contraintes structurent
tout le plan :

- **Bundle** : le registre `EFFECTS` est importé statiquement depuis `__root` (via
  `EasterEggs`). Un `import 'three'` statique atterrirait dans le **bundle racine**
  chargé sur chaque page. three.js + cannon-es **doivent** donc être chargés en
  `import()` **dynamique** dans le fichier de l'effet.
- **CSP** : `connect-src` n'autorise que self + Supabase (aucun CDN). Tout doit être
  same-origin. D'où le choix **from-scratch** (chiffres dessinés en `CanvasTexture`,
  zéro asset à servir) plutôt qu'une lib type dice-box (Babylon + Ammo + dossier
  d'assets).
- **Fuite WebGL** : sans `dispose()`/`destroy()` explicite, chaque lancer fuit un
  contexte WebGL (limite navigateur ~16) et l'effet cesse de marcher après quelques
  lancers. Un hook de destruction est **obligatoire**.

L'effet reste un **easter-egg du registre** (jouable depuis l'onglet « Effets », la
page `/easter-eggs`, et déclenchable au clavier), comme les autres.

## Angles à clarifier

- **D1 — Intégration du rendu WebGL dans un moteur 2D (à trancher).**
  **Option A retenue (recommandée)** : étendre le contrat avec un **mode `webgl`** —
  l'overlay ne prend pas de contexte 2D pour ces effets, il fournit le `<canvas>`
  brut ; l'effet crée son `WebGLRenderer` three.js dessus. Meilleure perf 3D (rendu
  direct, pas de recopie), propre, les 22 effets 2D restent inchangés (mode par
  défaut `2d`). Option B : **three.js offscreen + `drawImage`** sur le ctx 2D fourni
  (zéro modif de l'overlay hormis le hook `destroy`, mais un blit plein écran par
  frame). Option C (**écartée**) : overlay 3D dédié hors registre sur `/artefact` —
  proposée par l'analyse bundle, mais elle **casserait le déclenchement au clavier**
  (l'effet ne serait plus un easter-egg). Concerne les étapes 1 et 4.
- **D2 — Moteur physique.** **cannon-es retenu** (JS pur, ~55 KB gzip, aucune init
  WASM, aucune config Vite, aucun CDN). rapier écarté (WASM ~+0,5 Mo, plugins Vite,
  déterminisme cross-platform inutile pour un effet cosmétique) ; ammo.js écarté
  (~750 KB). Concerne l'étape 4.
- **D3 — Résultat aléatoire.** **Physique libre puis lecture de la face du dessus**
  (le hasard vient de la simulation) — suffisant et 100 % crédible pour un effet sans
  enjeu. Le forçage d'un nombre imposé (re-mapping des matériaux à la fin, invisible)
  reste disponible si un jour on veut « imposer un 20 ». Concerne l'étape 4.
- **D4 — from-scratch vs librairie.** **From-scratch** (three.js + cannon-es,
  numéros en `CanvasTexture` générés au runtime = zéro asset), self-contained
  imposé par la CSP. dice-box / dice-box-threejs écartés (assets à déployer, poids).
  On s'inspire de byWulf (géométrie D20 + lecture de face) et de Codrops (mise en
  scène). Concerne les étapes 2 à 4.
- **D5 — Caméra.** **Orthographique top-down** (« carré vu de haut », lecture nette
  du chiffre, pas de distorsion). Perspective inclinée écartée (déforme les faces en
  bord de zone). Concerne l'étape 3.
- **Question stratégique (non bloquante).** Ajouter three.js (~150-160 KB gzip) +
  cannon-es (~55 KB) pour un easter-egg cosmétique. Comme tout est en `import()`
  dynamique, **l'impact sur le chargement initial est nul** (chunk chargé seulement
  au déclenchement de l'effet) — le coût est donc jugé acceptable. À valider à
  l'étape 5 via `pnpm build` (le chunk `three`/`dice` doit être séparé, hors racine).

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-socle-moteur-webgl.md](./1-socle-moteur-webgl.md) | Contrat + overlay : mode `webgl` + hook `destroy` | — | P1 | 1h30 | Le moteur sait héberger un effet WebGL ; 22 effets 2D intacts | ⚠ |
| 2 | [2-deps-squelette-effet.md](./2-deps-squelette-effet.md) | Dépendances (three, cannon-es) + squelette de l'effet dé (lazy-load, scène vide, enregistré) | 1 | P1 | 1h | Un effet `d20` joue une scène 3D vide ; three en chunk séparé | |
| 3 | [3-de20-scene-topdown.md](./3-de20-scene-topdown.md) | D20 numéroté + mise en scène top-down (sol, murs, lumières, ombres) | 2 | P1 | 2h30 | Un D20 numéroté lisible posé sur le plateau vu de dessus | |
| 4 | [4-physique-lancer-resultat.md](./4-physique-lancer-resultat.md) | Physique cannon-es : chute, roulement, immobilisation, lecture de la face, résultat, `dispose` | 3 | P1 | 3h | Le dé roule et tombe sur un nombre aléatoire ; aucune fuite au rejeu | |
| 5 | [5-validation-globale.md](./5-validation-globale.md) | Validation globale (tsc, build/chunks, visuel, fuite, perf, non-régression) | 4 | P1 | 1h | Effet complet validé et enregistré | ⚠ |

## Ordre d'exécution

Séquentiel strict (chaque étape dépend de la précédente).

- **Avant l'étape 1** : acter **D1** (mode `webgl` vs offscreen blit) — c'est le seul
  choix qui change la forme du contrat et de l'overlay. D2 à D5 sont pré-tranchés
  (cannon-es, physique libre, from-scratch, ortho) et ajustables sans reprise
  structurelle.
- **Étape 1** : socle moteur (contrat + overlay), en gardant les 22 effets 2D
  strictement inchangés (mode `2d` par défaut). C'est l'étape à risque (cœur
  partagé) → audit à la fin.
- **Étapes 2-4** : construction de l'effet dé (deps → scène → physique), validable
  visuellement à chaque étape via l'onglet « Effets ».
- **Étape 5** : validation globale (dont vérification que three/cannon sont bien des
  chunks lazy hors du bundle racine, et absence de fuite WebGL au rejeu).

## Architecture cible

```
src/lib/artefact/effects/
├── types.ts            ← EffectDefinition en union : mode '2d' (défaut) | 'webgl' ;
│                          + destroy?() optionnel sur EffectRunner [modifié]
├── index.ts            ← + import diceEffect, entrée EFFECTS, VALIDATED_EFFECT_IDS [modifié]
├── dice.ts             ← effet D20 : import() DYNAMIQUE de three + cannon-es, scène
│                          top-down, physique, lecture de la face, dispose() [nouveau]
└── … (22 effets 2D, inchangés — mode '2d' implicite)

src/components/shared/
└── EffectOverlay.tsx   ← branche le mode : '2d' -> ctx 2d (inchangé) ; 'webgl' ->
                            fournit le <canvas> brut ; appelle runner.destroy() au
                            cleanup et à l'arrêt naturel [modifié]

package.json            ← + three, cannon-es, (+ @types/three si nécessaire) [modifié]

Chargement : `await import('three')` / `await import('cannon-es')` DANS dice.ts ->
three.js + cannon-es sortent dans un chunk séparé, chargé seulement au déclenchement,
hors du bundle racine (que le registre EFFECTS atteint depuis __root).
```

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|-------------------|-------------------|
| Moteur d'effets (contrat) | `src/lib/artefact/effects/types.ts` | `src/lib/artefact/effects/dice.ts` |
| Moteur d'effets (registre) | `src/lib/artefact/effects/index.ts` | — |
| Overlay / rendu | `src/components/shared/EffectOverlay.tsx` | — |
| Dépendances | `package.json` (+ lockfile) | — |
| **Total** | **4 modifiés** | **1 nouveau** |
