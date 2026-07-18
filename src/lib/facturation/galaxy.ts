import { BUDGET_LINES, budgetLabel } from '#/lib/facturation/constants.ts'
import type { WordPool } from '#/lib/facturation/wordpool.ts'
import type { Issuer } from '#/lib/facturation/issuers.ts'

/*
 * Modèle de graphe pour la « galaxie » — logique PURE (aucun React/DOM, aucune
 * couleur/présentation), testable en Node. Trois niveaux reliés :
 *   émetteurs → imputations (codes) → mots.
 * On lit les nuages APPRIS (pas la graine, qui noierait tout dans du générique) :
 * un mot qui est un émetteur connu devient un nœud « issuer » (partagé, relié à
 * chaque code où il apparaît) ; les autres mots forts de chaque code deviennent des
 * nœuds « word ». Chaque nœud porte son `category` (« Émetteurs » ou le domaine du
 * code) ; la COULEUR de dessin est décidée par la vue (GalaxyChart), pas ici.
 *
 * POSITION = INFORMATION. Les positions ne sont PAS arbitraires : elles émergent
 * d'une RELAXATION DE FORCES déterministe (calculée ici, une fois — la vue affiche
 * des positions figées, aucun moteur ECharts). La chaîne physique est complète :
 *   • chaque MOT tire son imputation d'autant plus fort qu'il est fréquent (poids
 *     = gravité) ; un mot lourd se colle au centre, un mot rare dérive au bord ;
 *   • chaque IMPUTATION, tirée par ses mots et par les émetteurs qu'elle partage
 *     avec d'autres imputations, se rapproche de ce qui lui ressemble et s'éloigne
 *     du reste ;
 *   • chaque ÉMETTEUR se pose au BARYCENTRE PONDÉRÉ des imputations qu'il touche —
 *     tiré vers celles où il revient le plus souvent.
 * Conséquence recherchée : une donnée sans lien réel avec les autres atterrit
 * VRAIMENT loin. Un ancrage thématique FAIBLE (DOMAIN_ORDER) sert d'amorce et de
 * léger biais, pas de cage. Tout est reproductible (hash FNV-1a, aucun Math.random).
 */

/** Catégorie de légende des émetteurs — transverse aux domaines. */
export const ISSUER_CATEGORY = 'Émetteurs'

/*
 * Ordre thématique des secteurs autour du cercle : les voisins de cette liste
 * seront voisins dans l'espace. Continuum du « physique / exploitation » (bâtiment,
 * énergie, hébergement, restauration) vers le « back-office » (IT, administratif,
 * finance, RH). Les côtés opposés du cercle sont donc thématiquement éloignés.
 */
const DOMAIN_ORDER = [
  'Technique',
  'Énergie & fluides',
  'Location',
  'Hébergement',
  'Restauration',
  'Prestataires',
  'Déplacements',
  'Commercial',
  'Revenus annexes',
  'IT & logiciels',
  'Administratif',
  'Finance',
  'RH',
  'Autre',
]
const DOMAIN_RANK = new Map(DOMAIN_ORDER.map((d, i) => [d, i]))

/** Hash déterministe (FNV-1a) → jitter reproductible, jamais de Math.random. */
function hash01(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 4294967295
}

/** Bornes [min,max] des poids d'un ensemble de nœuds (pour normaliser une échelle). */
export function weightExtent(ns: { weight: number }[]): [number, number] {
  const ext: [number, number] = [Infinity, -Infinity]
  for (const n of ns) {
    if (n.weight < ext[0]) ext[0] = n.weight
    if (n.weight > ext[1]) ext[1] = n.weight
  }
  return ext
}

/**
 * Échelle « aire ∝ volume » : mappe `value` de `[inMin,inMax]` vers `[outMin,outMax]`
 * via la RACINE (le diamètre suit √volume → l'aire suit le volume). Extent dégénéré
 * (`inMax ≤ inMin`) → valeur médiane. Source de vérité UNIQUE partagée par les rayons
 * de collision (métier) et les tailles de rendu (vue).
 */
export function sqrtScale(
  value: number,
  [inMin, inMax]: [number, number],
  [outMin, outMax]: [number, number],
): number {
  if (!(inMax > inMin)) return (outMin + outMax) / 2
  const t =
    (Math.sqrt(value) - Math.sqrt(inMin)) /
    (Math.sqrt(inMax) - Math.sqrt(inMin))
  return outMin + t * (outMax - outMin)
}

const TAU = Math.PI * 2
const R_DOMAIN = 0.9 // rayon de l'anneau des secteurs (amorce déterministe)

// Réglages de la relaxation (Fruchterman-Reingold pondéré, auto-étalant). Espace de
// simulation où l'anneau des secteurs vaut ~1 ; on normalise à la fin.
const SIM = {
  iters: 400,
  k: 0.17, // distance de répulsion de référence (répulsion k²/d)
  temp0: 0.1, // amplitude de déplacement initiale (refroidit linéairement)
  tempMin: 0.005,
  gravity: 0.025, // ressort doux vers le centre (borne la carte, évite les fuyards)
  anchor: 0.012, // ancrage secteur TRÈS faible : simple biais thématique, pas une cage
  wordCloud: 0.3, // rayon du disque de mots autour d'une imputation (unités de sim)
} as const

// Mobilité par type : les imputations (lourdes, structurantes) bougent moins que les
// émetteurs, eux-mêmes moins mobiles que les mots (légers, ils orbitent).
const MOBILITY: Record<GalaxyNodeType, number> = {
  code: 0.45,
  issuer: 0.8,
  word: 1,
}

/**
 * Place chaque nœud (`x`,`y`) par relaxation de forces déterministe. On amorce sur
 * l'anneau thématique (départ reproductible et sensé), puis on relâche : ressorts
 * pondérés par le nombre d'occurrences (mot→imputation, émetteur→imputation),
 * répulsion générale, rappel faible au secteur, gravité douce. Les imputations se
 * couplent indirectement via les émetteurs qu'elles partagent.
 */
function layoutGalaxy(nodes: GalaxyNode[], links: GalaxyLink[]): void {
  const N = nodes.length
  if (N === 0) return
  const index = new Map(nodes.map((n, i) => [n.id, i]))

  // --- Amorce : imputations sur l'anneau du secteur, puis émetteurs au barycentre
  //     brut de leurs imputations, puis mots serrés autour de leur imputation. ---
  const domains = [
    ...new Set(nodes.filter((n) => n.type === 'code').map((n) => n.category)),
  ].sort((a, b) => (DOMAIN_RANK.get(a) ?? 99) - (DOMAIN_RANK.get(b) ?? 99))
  const domainAngle = new Map(
    domains.map((d, i) => [d, (i / Math.max(1, domains.length)) * TAU]),
  )
  const px = new Float64Array(N)
  const py = new Float64Array(N)
  const anchorX = new Float64Array(N) // ancre de secteur (imputations seulement)
  const anchorY = new Float64Array(N)
  const hasAnchor = new Uint8Array(N)

  const codeSeed = new Map<string, { x: number; y: number }>()
  for (const d of domains) {
    const a = domainAngle.get(d) ?? 0
    const ax = Math.cos(a) * R_DOMAIN
    const ay = Math.sin(a) * R_DOMAIN
    const codes = nodes.filter((n) => n.type === 'code' && n.category === d)
    codes.forEach((n, j) => {
      const ca = (j / Math.max(1, codes.length)) * TAU
      const r = codes.length === 1 ? 0 : 0.22
      const i = index.get(n.id)!
      px[i] = ax + Math.cos(ca) * r
      py[i] = ay + Math.sin(ca) * r
      anchorX[i] = ax
      anchorY[i] = ay
      hasAnchor[i] = 1
      codeSeed.set(n.id, { x: px[i], y: py[i] })
    })
  }
  // Émetteurs : barycentre d'amorce de leurs imputations (+ décalage haché anti-pile).
  const issuerSeeds = new Map<string, { sx: number; sy: number; k: number }>()
  for (const l of links) {
    const c = codeSeed.get(l.target)
    if (c && l.source.startsWith('issuer:')) {
      const s = issuerSeeds.get(l.source) ?? { sx: 0, sy: 0, k: 0 }
      s.sx += c.x
      s.sy += c.y
      s.k += 1
      issuerSeeds.set(l.source, s)
    }
  }
  for (const n of nodes) {
    const i = index.get(n.id)!
    if (n.type === 'issuer') {
      const s = issuerSeeds.get(n.id)
      const a = hash01(n.id) * TAU
      px[i] = (s ? s.sx / Math.max(1, s.k) : 0) + Math.cos(a) * 0.05
      py[i] = (s ? s.sy / Math.max(1, s.k) : 0) + Math.sin(a) * 0.05
    } else if (n.type === 'word' && n.code) {
      const c = codeSeed.get(`code:${n.code}`)
      const a = hash01(n.id) * TAU
      px[i] = (c?.x ?? 0) + Math.cos(a) * 0.1
      py[i] = (c?.y ?? 0) + Math.sin(a) * 0.1
    }
  }

  // La FORCE ne régit que la STRUCTURE porteuse de sens : imputations ↔ émetteurs.
  // Les mots en sont EXCLUS — un mot n'est relié qu'à son imputation et n'a aucun
  // lien connu avec les autres mots ; le simuler ne produit qu'un anneau rigide.
  // On les disperse ensuite en disque rempli (plus bas), ce qui est à la fois plus
  // organique et plus honnête (leur seule info réelle est le poids).
  const active = nodes
    .map((n, i) => (n.type === 'word' ? -1 : i))
    .filter((i) => i >= 0)

  // Arêtes structurelles (émetteur → imputation) : longueur idéale ∝ occurrences
  // (lien fort = plus court → l'émetteur se cale près de l'imputation dominante).
  let maxIW = 1
  for (const l of links)
    if (l.source.startsWith('issuer:')) maxIW = Math.max(maxIW, l.weight)
  const edges = links
    .filter((l) => l.source.startsWith('issuer:'))
    .map((l) => ({
      a: index.get(l.source)!,
      b: index.get(l.target)!,
      L: SIM.k * (1.1 + 1.0 * (1 - l.weight / maxIW)), // 1.1k (fréquent) .. 2.1k (rare)
    }))

  const mob = nodes.map((n) => MOBILITY[n.type])
  const dx0 = new Float64Array(N) // déplacement accumulé par itération
  const dy0 = new Float64Array(N)
  const k2 = SIM.k * SIM.k

  // --- Boucle Fruchterman-Reingold (imputations + émetteurs seulement) ---
  for (let it = 0; it < SIM.iters; it++) {
    const temp = SIM.temp0 + (SIM.tempMin - SIM.temp0) * (it / SIM.iters)
    dx0.fill(0)
    dy0.fill(0)

    // Répulsion entre paires actives : k²/d.
    for (let ai = 0; ai < active.length; ai++) {
      const i = active[ai]
      for (let aj = ai + 1; aj < active.length; aj++) {
        const j = active[aj]
        let dx = px[i] - px[j]
        let dy = py[i] - py[j]
        let d = Math.sqrt(dx * dx + dy * dy)
        if (d < 1e-4) {
          // Superposition → écart haché déterministe (jamais de Math.random).
          const h = hash01(`${i}:${j}`) * TAU
          dx = Math.cos(h) * 1e-3
          dy = Math.sin(h) * 1e-3
          d = 1e-3
        }
        const f = k2 / d / d
        dx0[i] += dx * f
        dy0[i] += dy * f
        dx0[j] -= dx * f
        dy0[j] -= dy * f
      }
    }

    // Attraction le long des arêtes : d²/L.
    for (const e of edges) {
      const dx = px[e.a] - px[e.b]
      const dy = py[e.a] - py[e.b]
      const d = Math.sqrt(dx * dx + dy * dy) || 1e-4
      const m = (d * d) / e.L
      const ux = (dx / d) * m
      const uy = (dy / d) * m
      dx0[e.a] -= ux
      dy0[e.a] -= uy
      dx0[e.b] += ux
      dy0[e.b] += uy
    }

    // Rappel faible au secteur (imputations) + gravité douce au centre.
    for (const i of active) {
      if (hasAnchor[i]) {
        dx0[i] += (anchorX[i] - px[i]) * SIM.anchor
        dy0[i] += (anchorY[i] - py[i]) * SIM.anchor
      }
      dx0[i] += -px[i] * SIM.gravity
      dy0[i] += -py[i] * SIM.gravity
    }

    // Déplacement limité par la température, pondéré par la mobilité du type.
    for (const i of active) {
      const disp = Math.sqrt(dx0[i] * dx0[i] + dy0[i] * dy0[i]) || 1e-9
      const step = Math.min(disp, temp) * mob[i]
      px[i] += (dx0[i] / disp) * step
      py[i] += (dy0[i] / disp) * step
    }
  }

  // --- Mots : disque REMPLI autour de leur imputation (positions finales). Rayon
  //     porté par le poids (fort → au cœur, rare → au bord), dispersé par hash pour
  //     un rendu organique — jamais d'anneau. sqrt(u) répartit uniformément en aire. ---
  const wordsByCode = groupWordsByCode(nodes)
  for (const [codeId, words] of wordsByCode) {
    const ci = index.get(codeId)
    if (ci === undefined) continue
    let wMax = 1
    for (const w of words) wMax = Math.max(wMax, w.weight)
    for (const n of words) {
      const i = index.get(n.id)!
      const wN = n.weight / wMax // 1 = mot le plus fort de cette imputation
      const jitter = 0.55 + 0.9 * hash01(`${n.id}#r`) // dispersion du rayon
      // Base décroissante avec le poids, répartie en aire (sqrt) → disque plein.
      const r = SIM.wordCloud * (0.2 + Math.sqrt(1 - wN) * 1.05) * jitter
      const a = hash01(n.id) * TAU
      px[i] = px[ci] + Math.cos(a) * r
      py[i] = py[ci] + Math.sin(a) * r
    }
  }

  // --- Normalisation : centre sur le barycentre, échelle sur un rayon ROBUSTE (95ᵉ
  //     centile, pas le maximum) → un nœud très isolé reste loin sans écraser le
  //     reste au centre. ---
  let cx = 0
  let cy = 0
  for (let i = 0; i < N; i++) {
    cx += px[i]
    cy += py[i]
  }
  cx /= N
  cy /= N
  const radii = Array.from({ length: N }, (_, i) =>
    Math.hypot(px[i] - cx, py[i] - cy),
  ).sort((a, b) => a - b)
  const ref = radii[Math.min(N - 1, Math.floor(N * 0.95))] || 1e-6
  const scale = 1.1 / ref
  for (let i = 0; i < N; i++) {
    nodes[i].x = (px[i] - cx) * scale
    nodes[i].y = (py[i] - cy) * scale
  }
}

// Rayons de collision (unités normalisées) : soleils (imputations) et planètes
// (émetteurs) ne doivent pas se chevaucher. Un peu plus larges que le rendu réel →
// marge de sécurité. Les mots (nébuleuse) sont exclus : ils peuvent se superposer.
const COLL_CODE: [number, number] = [0.05, 0.12] // rayon min..max des imputations
const COLL_ISSUER: [number, number] = [0.035, 0.07] // rayon min..max des émetteurs
const COLL_PAD = 0.015 // espace franc entre deux astres
const COLL_ITERS = 60

const collisionRadius = (
  weight: number,
  ext: [number, number],
  range: [number, number],
): number => sqrtScale(weight, ext, range)

/**
 * Écarte deux cercles qui se chevauchent. Renvoie le vecteur de poussée à appliquer à
 * B (et son opposé à A) pour atteindre la distance minimale, ou `null` s'ils ne se
 * chevauchent pas. Cas dégénéré (centres confondus) : direction hachée déterministe.
 * L'appelant décide qui bouge (A, B, ou les deux à demi).
 */
function separate(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  minDist: number,
  seed: string,
): { ux: number; uy: number } | null {
  let dx = bx - ax
  let dy = by - ay
  let d = Math.hypot(dx, dy)
  if (d >= minDist) return null
  if (d < 1e-6) {
    const h = hash01(seed) * TAU
    dx = Math.cos(h)
    dy = Math.sin(h)
    d = 1
  }
  const push = minDist - d
  return { ux: (dx / d) * push, uy: (dy / d) * push }
}

/** Regroupe les mots par imputation. Clé = ID du nœud imputation (`code:<code>`). */
function groupWordsByCode(nodes: GalaxyNode[]): Map<string, GalaxyNode[]> {
  const m = new Map<string, GalaxyNode[]>()
  for (const n of nodes) {
    if (n.type !== 'word' || !n.code) continue
    const key = `code:${n.code}`
    const arr = m.get(key)
    if (arr) arr.push(n)
    else m.set(key, [n])
  }
  return m
}

/**
 * Écarte les IMPUTATIONS (soleils) pour qu'aucune ne se superpose (lisibilité). Chaque
 * imputation est un corps RIGIDE : on la déplace avec toute sa nébuleuse (ses mots
 * suivent). Les émetteurs ne sont PAS traités ici — ils sont placés ensuite par rapport
 * aux nébuleuses (voir placeIssuers). Relaxation itérative en normalisé : on n'écarte
 * que les paires qui se chevauchent, les distances relatives sont préservées au mieux.
 */
function resolveCollisions(nodes: GalaxyNode[]): void {
  const codes = nodes.filter((n) => n.type === 'code')
  if (codes.length < 2) return

  const codeExt = weightExtent(codes)
  const wordsByCode = groupWordsByCode(nodes)
  const issMaxR = COLL_ISSUER[1] // rayon max d'un émetteur

  // Corps rigides : chaque soleil + ses mots. Le rayon d'écartement n'est PAS le petit
  // cercle du soleil mais la PORTÉE du cluster : anneau d'émetteurs (~0,85 × rayon de
  // la nébuleuse) + un émetteur. Deux disques de portée restant disjoints, aucun lien
  // (rayon émetteur→soleil, contenu dans le disque) d'un cluster ne peut en croiser un
  // autre. Les nébuleuses peuvent encore se frôler ; les LIENS, non.
  const bodies = codes.map((n) => {
    const words = wordsByCode.get(n.id) ?? []
    let cr = 0
    for (const w of words) cr = Math.max(cr, Math.hypot(w.x - n.x, w.y - n.y))
    const reach = Math.max(
      collisionRadius(n.weight, codeExt, COLL_CODE),
      cr * 0.85 + issMaxR + COLL_PAD,
    )
    return { node: n, members: [n, ...words], r: reach }
  })

  for (let it = 0; it < COLL_ITERS; it++) {
    let moved = false
    for (let a = 0; a < bodies.length; a++) {
      for (let b = a + 1; b < bodies.length; b++) {
        const A = bodies[a]
        const B = bodies[b]
        const s = separate(
          A.node.x,
          A.node.y,
          B.node.x,
          B.node.y,
          A.r + B.r + COLL_PAD,
          A.node.id + B.node.id,
        )
        if (!s) continue
        // Les deux corps s'écartent à demi (chacun avec sa nébuleuse).
        for (const m of A.members) {
          m.x -= s.ux / 2
          m.y -= s.uy / 2
        }
        for (const m of B.members) {
          m.x += s.ux / 2
          m.y += s.uy / 2
        }
        moved = true
      }
    }
    if (!moved) break
  }
}

/**
 * Place les ÉMETTEURS explicitement PAR RAPPORT aux nébuleuses — la règle que la carte
 * doit rendre lisible :
 *   • émetteur EXCLUSIF (rattaché à une seule imputation) → posé DANS sa nébuleuse
 *     (entre le bord du soleil et le bord de la nappe), réparti en éventail si
 *     plusieurs partagent la même imputation ;
 *   • émetteur PARTAGÉ (plusieurs imputations) → posé DEHORS, au barycentre pondéré
 *     des imputations qu'il relie, repoussé hors de chacune de leurs nébuleuses.
 * Le rayon de chaque nébuleuse est mesuré sur les positions FINALES de ses mots
 * (après collision), donc la règle colle exactement à la surface dessinée.
 */
function placeIssuers(nodes: GalaxyNode[], links: GalaxyLink[]): void {
  const codeById = new Map(
    nodes.filter((n) => n.type === 'code').map((n) => [n.id, n]),
  )
  if (codeById.size === 0) return

  // Rayon réel de chaque nébuleuse = distance max du soleil à ses mots.
  const cloud = new Map<string, number>()
  for (const n of nodes)
    if (n.type === 'word' && n.code) {
      const c = codeById.get(`code:${n.code}`)
      if (!c) continue
      const d = Math.hypot(n.x - c.x, n.y - c.y)
      cloud.set(c.id, Math.max(cloud.get(c.id) ?? 0, d))
    }

  const codeExt = weightExtent([...codeById.values()])
  const issuers = nodes.filter((n) => n.type === 'issuer')
  const issExt = weightExtent(issuers)

  // Imputations liées à chaque émetteur (avec le poids du lien).
  const linkedCodes = new Map<string, { code: GalaxyNode; w: number }[]>()
  for (const l of links) {
    if (!l.source.startsWith('issuer:')) continue
    const c = codeById.get(l.target)
    if (!c) continue
    const arr = linkedCodes.get(l.source) ?? []
    arr.push({ code: c, w: l.weight })
    linkedCodes.set(l.source, arr)
  }

  // Émetteurs exclusifs regroupés par imputation (pour les répartir en éventail).
  const exclusiveByCode = new Map<string, GalaxyNode[]>()

  for (const iss of issuers) {
    const lk = linkedCodes.get(iss.id) ?? []
    if (lk.length <= 1) {
      const c = lk[0]?.code
      if (!c) continue // orphelin : on le laisse où il est
      const arr = exclusiveByCode.get(c.id) ?? []
      arr.push(iss)
      exclusiveByCode.set(c.id, arr)
      continue
    }
    // PARTAGÉ : barycentre pondéré, repoussé hors de chaque nébuleuse liée.
    let sx = 0
    let sy = 0
    let sw = 0
    for (const { code, w } of lk) {
      sx += code.x * w
      sy += code.y * w
      sw += w
    }
    let x = sx / Math.max(1, sw)
    let y = sy / Math.max(1, sw)
    const rIss = collisionRadius(iss.weight, issExt, COLL_ISSUER)
    for (let it = 0; it < 16; it++) {
      let moved = false
      for (const { code } of lk) {
        const clear = (cloud.get(code.id) ?? 0) + rIss + 0.03
        // On repousse l'émetteur (B) hors de la nébuleuse ; le soleil (A) ne bouge pas.
        const s = separate(code.x, code.y, x, y, clear, iss.id + code.id)
        if (s) {
          x += s.ux
          y += s.uy
          moved = true
        }
      }
      if (!moved) break
    }
    iss.x = x
    iss.y = y
  }

  // EXCLUSIFS : disposés sur UN anneau autour de leur soleil, à angles RÉGULIERS
  // (comme les heures d'une horloge), avec une rotation d'ensemble propre à chaque
  // imputation. Les liens deviennent des RAYONS équidistants partant du même centre :
  // ils ne se croisent jamais et ne se frôlent pas (lecture « plan 2D » nette).
  for (const [codeId, list] of exclusiveByCode) {
    const c = codeById.get(codeId)
    if (!c) continue
    const cr = cloud.get(codeId) ?? 0.18
    const sunR = collisionRadius(c.weight, codeExt, COLL_CODE)
    // Ordre stable (poids décroissant, puis id) → angles reproductibles.
    list.sort((a, b) => b.weight - a.weight || (a.id < b.id ? -1 : 1))
    // Anneau unique : au-delà du plus gros émetteur ET vers l'extérieur de la nappe,
    // pour que les rayons soient bien détachés et lisibles.
    let maxInner = 0
    for (const iss of list) {
      const rIss = collisionRadius(iss.weight, issExt, COLL_ISSUER)
      maxInner = Math.max(maxInner, sunR + rIss + COLL_PAD)
    }
    const ringR = Math.max(cr * 0.8, maxInner)
    const off = hash01(codeId) * TAU // rotation d'ensemble déterministe par imputation
    list.forEach((iss, k) => {
      const ang = off + (k / list.length) * TAU
      iss.x = c.x + Math.cos(ang) * ringR
      iss.y = c.y + Math.sin(ang) * ringR
    })
  }
}

/**
 * Garantie FINALE anti-chevauchement des cercles : après placeIssuers, on écarte tout
 * émetteur qui empiéterait sur un soleil (autre que le sien, déjà à bonne distance) ou
 * sur un autre émetteur. Les SOLEILS ne bougent pas ici (déjà figés et non chevauchants,
 * et les émetteurs y sont ancrés) — seuls les émetteurs se déplacent.
 */
function resolveIssuerOverlaps(nodes: GalaxyNode[]): void {
  const codes = nodes.filter((n) => n.type === 'code')
  const issuers = nodes.filter((n) => n.type === 'issuer')
  if (issuers.length === 0) return
  const codeExt = weightExtent(codes)
  const issExt = weightExtent(issuers)
  const codeR = codes.map((n) => collisionRadius(n.weight, codeExt, COLL_CODE))
  const issR = issuers.map((n) =>
    collisionRadius(n.weight, issExt, COLL_ISSUER),
  )

  for (let it = 0; it < COLL_ITERS; it++) {
    let moved = false
    // Émetteur vs soleil — seul l'émetteur bouge (le soleil A reste fixe).
    for (let i = 0; i < issuers.length; i++) {
      const A = issuers[i]
      for (let c = 0; c < codes.length; c++) {
        const s = separate(
          codes[c].x,
          codes[c].y,
          A.x,
          A.y,
          codeR[c] + issR[i] + COLL_PAD,
          A.id + codes[c].id,
        )
        if (s) {
          A.x += s.ux
          A.y += s.uy
          moved = true
        }
      }
    }
    // Émetteur vs émetteur — les deux s'écartent à demi.
    for (let i = 0; i < issuers.length; i++) {
      for (let j = i + 1; j < issuers.length; j++) {
        const A = issuers[i]
        const Bn = issuers[j]
        const s = separate(
          A.x,
          A.y,
          Bn.x,
          Bn.y,
          issR[i] + issR[j] + COLL_PAD,
          A.id + Bn.id,
        )
        if (s) {
          A.x -= s.ux / 2
          A.y -= s.uy / 2
          Bn.x += s.ux / 2
          Bn.y += s.uy / 2
          moved = true
        }
      }
    }
    if (!moved) break
  }
}

export type GalaxyNodeType = 'issuer' | 'code' | 'word'

export interface GalaxyNode {
  id: string
  type: GalaxyNodeType
  label: string
  weight: number // pour la taille du point
  category: string // « Émetteurs » ou le domaine (tag) du code
  code?: string // code d'appartenance (code / word)
  x: number // position logique (repère normalisé ~[-1.3, 1.3])
  y: number
}
export interface GalaxyLink {
  source: string
  target: string
  weight: number // nombre d'occurrences — force du ressort dans la relaxation
}
export interface GalaxyGraph {
  nodes: GalaxyNode[]
  links: GalaxyLink[]
}

const TAG_BY_CODE = new Map(BUDGET_LINES.map((l) => [l.code, l.tags[0] ?? '']))

/**
 * Construit le graphe émetteurs → codes → mots à partir des nuages appris.
 * `topWordsPerCode` borne les mots par code pour rester lisible.
 */
export function buildGalaxy(
  pool: WordPool,
  issuers: Issuer[],
  topWordsPerCode = 12,
  minCount = 2,
): GalaxyGraph {
  const issuerName = new Map(issuers.map((i) => [i.name, i.display]))
  const nodes: GalaxyNode[] = []
  const links: GalaxyLink[] = []
  const issuerNodes = new Map<string, GalaxyNode>()

  for (const [code, cell] of Object.entries(pool.perCode)) {
    // Seuil d'AFFICHAGE : on écarte le bruit à faible count (fautes de frappe, mots
    // OCR parasites) pour ne pas créer de nœuds/liens sans queue ni tête. Purement
    // visuel — la base n'est pas touchée (le nettoyage réel = pruneClouds).
    const top = Object.entries(cell)
      .filter(([, count]) => count >= minCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, topWordsPerCode)
    if (top.length === 0) continue

    const domain = TAG_BY_CODE.get(code) || 'Autre'
    const codeId = `code:${code}`
    nodes.push({
      id: codeId,
      type: 'code',
      label: budgetLabel(code), // libellé lisible plutôt que le code brut
      weight: top.reduce((s, [, n]) => s + n, 0),
      category: domain,
      code,
      x: 0,
      y: 0,
    })

    for (const [token, count] of top) {
      const display = issuerName.get(token)
      if (display !== undefined) {
        // Émetteur connu → nœud partagé, relié à ce code.
        const issuerId = `issuer:${token}`
        let node = issuerNodes.get(issuerId)
        if (!node) {
          node = {
            id: issuerId,
            type: 'issuer',
            label: display,
            weight: 0,
            category: ISSUER_CATEGORY,
            x: 0,
            y: 0,
          }
          issuerNodes.set(issuerId, node)
          nodes.push(node)
        }
        node.weight += count
        links.push({ source: issuerId, target: codeId, weight: count })
      } else {
        const wordId = `word:${code}:${token}`
        nodes.push({
          id: wordId,
          type: 'word',
          label: token,
          weight: count,
          category: domain,
          code,
          x: 0,
          y: 0,
        })
        links.push({ source: codeId, target: wordId, weight: count })
      }
    }
  }

  layoutGalaxy(nodes, links)
  resolveCollisions(nodes) // écarte les soleils qui se chevaucheraient
  placeIssuers(nodes, links) // émetteurs dans/hors nébuleuse selon exclusif/partagé
  resolveIssuerOverlaps(nodes) // garantie finale : aucun cercle ne se chevauche
  return { nodes, links }
}
