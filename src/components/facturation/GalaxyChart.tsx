import { useEffect, useRef } from 'react'
import * as echarts from 'echarts/core'
import { GraphChart } from 'echarts/charts'
import { LegendComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

import {
  ISSUER_CATEGORY,
  sqrtScale,
  weightExtent,
  type GalaxyGraph,
  type GalaxyNode,
  type GalaxyNodeType,
} from '#/lib/facturation/galaxy.ts'
import { budgetHint } from '#/lib/facturation/budgetRegistry.ts'
import type { Tag } from '#/lib/facturation/constants.ts'
import { clamp } from '#/lib/utils.ts'

/*
 * Galaxie des imputations — graphe ECharts (series graph, layout 'none'). Les
 * POSITIONS sont calculées en amont (galaxy.ts) et PORTEUSES DE SENS : chaque secteur
 * d'activité occupe une zone, les secteurs thématiquement proches sont côte à côte,
 * un émetteur se pose entre les imputations qu'il touche. Aucun moteur de force :
 * la carte ne dérive jamais et le frame rate reste au plafond.
 *
 * NŒUDS : imputation = SOLEIL, émetteur = PLANÈTE. Les MOTS ne sont pas des nœuds :
 * ils forment une NÉBULEUSE (surface pleine par imputation) dessinée sur un canvas
 * dédié derrière le graphe (voir drawNebula), recalée sur la vue via convertToPixel.
 *
 * DÉPLACEMENT : on peut glisser un nœud ; sitôt relâché (court délai), il revient à
 * sa place logique avec un petit rebond (setOption ciblé, `elasticOut`).
 *
 * LIENS : TOUJOURS visibles (émetteur→imputation), discrets au repos.
 * NOMS : au SURVOL seulement (carte épurée côté texte). Survoler un émetteur révèle son nom
 * + met ses liens en avant (les autres s'estompent) ; survoler une nébuleuse révèle son
 * imputation + ses émetteurs (et voisines partageant un émetteur). Le setOption ne part qu'au
 * CHANGEMENT de cible. Client-only, lecture seule.
 */

echarts.use([GraphChart, TooltipComponent, LegendComponent, CanvasRenderer])

// Palette de DESSIN (Canvas) — présentation. Typée `Record<Tag>` : le compilateur
// impose les 13 domaines et signale toute dérive avec la liste TAGS.
const DOMAIN_HEX: Record<Tag, string> = {
  Technique: '#94a3b8',
  'Énergie & fluides': '#f59e0b',
  Hébergement: '#38bdf8',
  Restauration: '#fb923c',
  'IT & logiciels': '#a78bfa',
  Administratif: '#a1a1aa',
  RH: '#2dd4bf',
  Commercial: '#f472b6',
  Finance: '#34d399',
  Prestataires: '#818cf8',
  Déplacements: '#22d3ee',
  Location: '#a3e635',
  'Revenus annexes': '#fb7185',
}
const ISSUER_HEX = '#cbd5e1' // émetteurs : slate clair, neutre (transverse aux domaines)
const NEUTRAL_HEX = '#64748b'
const colorFor = (category: string): string =>
  category === ISSUER_CATEGORY
    ? ISSUER_HEX
    : ((DOMAIN_HEX as Record<string, string>)[category] ?? NEUTRAL_HEX)

// Utilitaires couleur (les hex de DOMAIN_HEX sont tous `#rrggbb`).
const rgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
/** Éclaircit vers le blanc (t ∈ 0..1) — sheen doux sans cœur « étoile générique ». */
const lighten = (hex: string, t: number): string => {
  const [r, g, b] = rgb(hex)
  const m = (c: number) => Math.round(c + (255 - c) * t)
  return `rgb(${m(r)},${m(g)},${m(b)})`
}
const withAlpha = (hex: string, a: number): string => {
  const [r, g, b] = rgb(hex)
  return `rgba(${r},${g},${b},${a})`
}

/** Récupère (ou crée) l'ensemble associé à `key` dans une Map<string, Set<string>>. */
const add = (m: Map<string, Set<string>>, key: string): Set<string> => {
  const s = new Set<string>()
  m.set(key, s)
  return s
}

const TYPE_LABEL: Record<GalaxyNodeType, string> = {
  issuer: 'Émetteur',
  code: 'Imputation',
  word: 'Mot',
}

// TAILLE = VOLUME. Chaque type a sa plage de tailles (px de diamètre) ; les plages se
// chevauchent peu pour garder la hiérarchie lisible (imputation > émetteur > mot),
// mais À L'INTÉRIEUR d'un type la taille varie avec le volume → les zones qui pèsent
// ressortent, les anecdotiques restent petites.
const SIZE_RANGE: Record<GalaxyNodeType, [number, number]> = {
  code: [16, 40], // imputations
  issuer: [8, 22], // émetteurs
  word: [2, 6], // mots (minimisés)
}

/**
 * Échelle de taille (diamètre px) par type, via `sqrtScale` (même encodage aire ∝
 * volume que les rayons de collision du métier). Normalisée sur les extrêmes présents.
 * Les mots ne sont jamais des nœuds ECharts → pas d'extent calculé pour eux.
 */
function makeSizeOf(nodes: GalaxyNode[]) {
  const ext: Record<GalaxyNodeType, [number, number]> = {
    code: weightExtent(nodes.filter((n) => n.type === 'code')),
    issuer: weightExtent(nodes.filter((n) => n.type === 'issuer')),
    word: [0, 0],
  }
  return (type: GalaxyNodeType, weight: number): number =>
    sqrtScale(weight, ext[type], SIZE_RANGE[type])
}

// Ordre de DESSIN des nœuds ECharts : planètes (émetteurs) sous les soleils
// (imputations) — ECharts peint dans l'ordre du tableau, les derniers par-dessus.
const DRAW_ORDER: Record<GalaxyNodeType, number> = {
  word: 0,
  issuer: 1,
  code: 2,
}

// Échelle des positions normalisées (galaxy.ts, ~[-1.3,1.3]) → pixels de layout.
const SCALE = 190
const ZOOM_LIMIT = { min: 0.3, max: 8 } // bornes de zoom (roam ECharts + suivi manuel)
const RETURN_DELAY = 700 // ms avant retour d'un nœud déplacé (rapide, comportement simple)
const RETURN_DURATION = 650

// Nébuleuse = UNE surface pleine par imputation. On ne dessine pas les mots : on
// calcule le CONTOUR organique qui englobe tous les mots de la zone (enveloppe radiale
// lissée autour du soleil), et on le remplit d'un dégradé. Résultat : une aire
// continue qui remplit l'espace ENTRE les points, sans grain visible.
const NEBULA_BINS = 56 // secteurs angulaires du contour (finesse de l'enveloppe)
const NEBULA_BLUR = 5 // léger flou de compositing → bords doux
const NEBULA_ALPHA = 0.7 // opacité globale de la nappe
const NEBULA_MARGIN = 12 // marge autour des mots extérieurs (px, épaissit l'aire)
const grainRadius = (weight: number): number => 3.5 + Math.sqrt(weight) * 1.4

/** Trace une courbe FERMÉE lisse passant par n points (buffers plats xs/ys réutilisés,
 *  zéro allocation par frame). Midpoints + quadratiques. */
function closedCurve(
  ctx: CanvasRenderingContext2D,
  xs: Float64Array,
  ys: Float64Array,
  n: number,
) {
  if (n < 3) return
  ctx.moveTo((xs[n - 1] + xs[0]) / 2, (ys[n - 1] + ys[0]) / 2)
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    ctx.quadraticCurveTo(xs[i], ys[i], (xs[i] + xs[j]) / 2, (ys[i] + ys[j]) / 2)
  }
  ctx.closePath()
}

/*
 * Métaphore SYSTÈME SOLAIRE — style des NŒUDS ECharts (les mots ne sont pas des nœuds,
 * ils forment la nébuleuse dessinée à part) :
 *   • imputation = SOLEIL — cœur blanc incandescent → couleur du secteur, large
 *     COURONNE (le halo croît avec le volume : une grosse zone rayonne fort) ;
 *   • émetteur = PLANÈTE — sphère ombrée (lumière en haut-gauche, limbe sombre),
 *     légère ombre portée pour le relief.
 */
const starStyle = (type: 'issuer' | 'code', hex: string, size: number) =>
  type === 'issuer'
    ? {
        // Sphère « planète » : reflet clair décentré, terminateur sombre.
        color: {
          type: 'radial' as const,
          x: 0.36,
          y: 0.32,
          r: 0.72,
          colorStops: [
            { offset: 0, color: '#f1f5f9' },
            { offset: 0.5, color: '#aeb8cc' },
            { offset: 1, color: '#6b7690' },
          ],
        },
        borderColor: 'rgba(10,14,26,.4)', // limbe sombre
        borderWidth: 0.6,
        shadowBlur: 5,
        shadowColor: 'rgba(0,0,0,.45)', // ombre portée = relief
        opacity: 1,
      }
    : {
        // Soleil : cœur incandescent, couronne (shadowBlur) indexée sur le volume.
        color: {
          type: 'radial' as const,
          x: 0.5,
          y: 0.5,
          r: 0.5,
          colorStops: [
            { offset: 0, color: '#ffffff' },
            { offset: 0.22, color: lighten(hex, 0.4) },
            { offset: 0.7, color: hex },
            { offset: 1, color: hex },
          ],
        },
        borderWidth: 0,
        shadowBlur: Math.round(size * 0.9),
        shadowColor: withAlpha(hex, 0.75),
        opacity: 1,
      }

/** Échappe le HTML injecté dans les tooltips (les descriptions peuvent contenir & < >). */
const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Tronque proprement une description trop longue pour un tooltip. */
const truncate = (s: string, n: number): string =>
  s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s

interface TooltipParam {
  dataType?: string
  data: {
    source?: string
    target?: string
    name?: string
    value?: number
    typeLabel?: string
    deg?: number
    hint?: string
  }
}
interface RoamParam {
  zoom?: number
}

export function GalaxyChart({
  graph,
  onSelectCode,
}: {
  graph: GalaxyGraph
  /** Appelé au clic sur une nébuleuse (code d'imputation) ; `null` si clic dans le vide. */
  onSelectCode?: (code: string | null) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const nebulaRef = useRef<HTMLCanvasElement>(null)
  // Réf tenue à jour à chaque rendu : le handler de clic (lié une fois) appelle toujours
  // la dernière version sans relancer l'effet (deps [graph]).
  const onSelectRef = useRef(onSelectCode)
  onSelectRef.current = onSelectCode

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const chart = echarts.init(el, undefined, { renderer: 'canvas' })

    // Précalculs partagés.
    const labelById = new Map(graph.nodes.map((n) => [n.id, n.label]))
    const colorById = new Map(
      graph.nodes.map((n) => [n.id, colorFor(n.category)]),
    )
    const deg: Record<string, number> = {}
    for (const l of graph.links) {
      deg[l.source] = (deg[l.source] ?? 0) + 1
      deg[l.target] = (deg[l.target] ?? 0) + 1
    }
    const catColor = new Map<string, string>()
    for (const n of graph.nodes)
      if (!catColor.has(n.category))
        catColor.set(n.category, colorFor(n.category))
    const cats = [...catColor.keys()]
    const catIndex = new Map(cats.map((c, i) => [c, i]))
    // Échelle de taille normalisée sur les volumes présents (par type).
    const sizeOf = makeSizeOf(graph.nodes)

    // Clusters de nébuleuse : une imputation (soleil = centre) + ses mots (points de
    // l'enveloppe). Positions en coordonnées de données. Rendus hors ECharts (canvas
    // dédié, voir plus bas) comme UNE surface pleine par cluster.
    const clusterByCode = new Map<
      string,
      {
        codeId: string
        code: string
        cx: number
        cy: number
        color: string
        pts: { x: number; y: number; r: number }[]
      }
    >()
    for (const n of graph.nodes) {
      if (n.type === 'code' && n.code) {
        clusterByCode.set(n.code, {
          codeId: n.id,
          code: n.code,
          cx: n.x * SCALE,
          cy: n.y * SCALE,
          color: colorFor(n.category),
          pts: [],
        })
      }
    }
    for (const n of graph.nodes) {
      if (n.type === 'word' && n.code) {
        clusterByCode.get(n.code)?.pts.push({
          x: n.x * SCALE,
          y: n.y * SCALE,
          r: grainRadius(n.weight),
        })
      }
    }
    // Stops rgba de la nappe précalculés une fois (invariants de la vue) — évite de
    // reparser le hex à chaque frame de rendu.
    const clusters = [...clusterByCode.values()]
      .filter((c) => c.pts.length > 0)
      .map((c) => ({
        ...c,
        stops: [
          withAlpha(c.color, 0.55),
          withAlpha(c.color, 0.34),
          withAlpha(c.color, 0.08),
        ] as const,
      }))

    // Adjacence du graphe (pour le survol) : émetteur→imputations, imputation→émetteurs,
    // et imputations VOISINES (partageant un émetteur).
    const issuerToCodes = new Map<string, Set<string>>()
    const codeToIssuers = new Map<string, Set<string>>()
    for (const l of graph.links) {
      if (!l.source.startsWith('issuer:')) continue
      ;(issuerToCodes.get(l.source) ?? add(issuerToCodes, l.source)).add(
        l.target,
      )
      ;(codeToIssuers.get(l.target) ?? add(codeToIssuers, l.target)).add(
        l.source,
      )
    }
    const codeNeighbors = new Map<string, Set<string>>()
    for (const codeSet of issuerToCodes.values()) {
      for (const a of codeSet)
        for (const b of codeSet)
          if (a !== b) (codeNeighbors.get(a) ?? add(codeNeighbors, a)).add(b)
    }
    // Positions/rayons écran des émetteurs (hit-test du survol).
    const issuerHits = graph.nodes
      .filter((n) => n.type === 'issuer')
      .map((n) => ({
        id: n.id,
        x: n.x * SCALE,
        y: n.y * SCALE,
        r: sizeOf('issuer', n.weight) / 2 + 4,
      }))

    // Ensemble des ids dont le libellé est révélé (vide = carte au repos).
    let revealed = new Set<string>()

    // Nœuds ECharts = SOLEILS (imputations) + PLANÈTES (émetteurs). Les mots sont la
    // nébuleuse, pas des nœuds. Construits FRAIS à chaque appel (ECharts mutile les
    // items passés à setOption : réutiliser les références gèle le rendu).
    const buildNodes = () =>
      graph.nodes
        .filter((n) => n.type !== 'word')
        .sort((a, b) => DRAW_ORDER[a.type] - DRAW_ORDER[b.type])
        .map((n) => {
          const size = sizeOf(n.type, n.weight)
          return {
            id: n.id,
            name: n.label,
            value: n.weight,
            category: catIndex.get(n.category),
            symbolSize: size,
            typeLabel: TYPE_LABEL[n.type],
            deg: deg[n.id] ?? 0,
            // Description « en clair » de l'imputation (le tooltip explique ce qu'elle couvre).
            hint: n.type === 'code' && n.code ? budgetHint(n.code) : undefined,
            // Position logique : en layout 'none' les x/y des données SONT le layout ;
            // un glisser écarte le nœud, réappliquer ces mêmes x/y l'anime au retour.
            x: n.x * SCALE,
            y: n.y * SCALE,
            // n.type ∈ {issuer, code} ici (les mots sont filtrés hors des nœuds).
            itemStyle: starStyle(
              n.type as 'issuer' | 'code',
              colorById.get(n.id) ?? NEUTRAL_HEX,
              size,
            ),
            label: {
              show: revealed.has(n.id), // noms révélés au survol uniquement
              position: 'right' as const,
              distance: 6,
              // Couleurs = tokens de l'app (foreground / muted-foreground) ; léger halo
              // sombre pour rester lisibles sur le fond étoilé.
              color:
                n.type === 'code'
                  ? '#e2e8f0'
                  : n.type === 'issuer'
                    ? '#94a3b8'
                    : '#64748b',
              fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
              fontWeight: n.type === 'code' ? (600 as const) : (400 as const),
              fontSize: n.type === 'code' ? 12 : n.type === 'issuer' ? 10 : 9,
              textShadowColor: 'rgba(7,10,24,.9)',
              textShadowBlur: 4,
            },
          }
        })
    // Liens émetteur→imputation : TOUJOURS visibles (discrets au repos), mis en avant quand
    // leurs DEUX extrémités sont survolées (le sous-ensemble pointé ressort ; les autres
    // s'estompent). Rayons d'un même soleil / liens d'un même émetteur → pas d'entrelacement.
    const LINK_REST = 0.22 // opacité au repos (tous les liens présents mais légers)
    const LINK_ON = 0.7 // opacité du lien survolé
    const LINK_DIM = 0.06 // opacité des autres liens pendant un survol
    const buildLinks = () =>
      graph.links
        .filter((l) => l.source.startsWith('issuer:'))
        .map((l) => ({
          source: l.source,
          target: l.target,
          lineStyle: {
            color: colorById.get(l.target) ?? '#94a3b8',
            opacity:
              revealed.size === 0
                ? LINK_REST
                : revealed.has(l.source) && revealed.has(l.target)
                  ? LINK_ON
                  : LINK_DIM,
            width: 1.2,
            curveness: 0,
          },
        }))

    // Réinjecte nœuds + liens. `animate` : transition élastique (retour d'un nœud
    // déplacé) ; sinon instantané (révélation au survol).
    const applyNodes = (animate: boolean) =>
      chart.setOption({
        series: [
          {
            animationDurationUpdate: animate ? RETURN_DURATION : 0,
            animationEasingUpdate: 'elasticOut',
            data: buildNodes(),
            links: buildLinks(),
          },
        ],
      } as echarts.EChartsCoreOption)

    let zoom = 1

    chart.setOption({
      // Animation active pour le retour élastique, mais durées à 0 au montage et sur
      // les updates ordinaires (labels) → aucun coût tant qu'on n'anime pas un retour.
      animation: true,
      animationDuration: 0,
      animationDurationUpdate: 0,
      backgroundColor: 'transparent',
      textStyle: {
        fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
      },
      legend: {
        bottom: 10,
        left: 'center',
        icon: 'circle',
        itemWidth: 8,
        itemHeight: 8,
        itemGap: 14,
        textStyle: { color: '#94a3b8', fontSize: 11 }, // muted-foreground
        inactiveColor: '#475569',
        data: cats,
      },
      tooltip: {
        backgroundColor: '#141d2e', // --card (dark)
        borderColor: 'rgba(148,163,184,.16)', // --border (dark)
        borderWidth: 1,
        padding: [6, 10],
        textStyle: { color: '#e2e8f0', fontSize: 12 }, // --foreground (dark)
        extraCssText: 'border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.4)',
        formatter: (p: TooltipParam) => {
          if (p.dataType === 'edge') {
            const s = labelById.get(p.data.source ?? '') ?? p.data.source
            const t = labelById.get(p.data.target ?? '') ?? p.data.target
            return `<span style="color:#94a3b8">Fournisseur → imputation</span><br>${s} → ${t}`
          }
          const d = p.data
          const title = `<b style="font-size:13px">${escapeHtml(d.name ?? '')}</b>`
          // IMPUTATION : on EXPLIQUE d'abord ce qu'elle couvre (description en clair) — le sujet
          // que l'utilisateur veut comprendre au survol. Le détail technique passe au second plan.
          if (d.typeLabel === TYPE_LABEL.code) {
            const desc = d.hint
              ? `<div style="margin-top:5px;max-width:260px;white-space:normal;color:#cbd5e1;line-height:1.45">${escapeHtml(truncate(d.hint, 220))}</div>`
              : `<div style="margin-top:4px;color:#64748b">Pas de description</div>`
            return `${title}<br><span style="color:#94a3b8">Imputation comptable</span>${desc}`
          }
          // ÉMETTEUR : fournisseur + nombre d'imputations qu'il alimente.
          if (d.typeLabel === TYPE_LABEL.issuer) {
            const n = d.deg ?? 0
            return `${title}<br><span style="color:#94a3b8">Fournisseur</span> · relié à ${n} imputation${n > 1 ? 's' : ''}`
          }
          // Repli (mot ou autre) : format compact.
          return `${title}<br><span style="color:#94a3b8">${d.typeLabel}</span> · ${d.value}×`
        },
      },
      series: [
        {
          type: 'graph',
          // 'none' : les positions viennent des données, AUCUN moteur de force
          // (pas de dérive, pas de gel, et surtout `preservedPoints` du mode force
          // n'écrase pas nos x/y au setOption — condition du retour animé). Le
          // glisser natif reste géré par ECharts en layout 'none' (GraphView).
          layout: 'none',
          roam: true,
          draggable: true,
          scaleLimit: ZOOM_LIMIT,
          labelLayout: { hideOverlap: true },
          categories: cats.map((c) => ({
            name: c,
            itemStyle: { color: catColor.get(c) },
          })),
          data: buildNodes(),
          links: buildLinks(), // pilotés par le survol (invisibles au repos)
          emphasis: { disabled: true },
          label: { show: false },
        },
      ],
    } as echarts.EChartsCoreOption)

    // Suivi du zoom (accumulation des facteurs de l'événement roam) → sert au rayon de
    // la nébuleuse. Pas de setOption ici : un setOption pendant une rafale de molette
    // GÈLE ECharts (constaté). La nébuleuse se recale via l'événement 'rendered'.
    const onRoam = (params: RoamParam) => {
      if (typeof params?.zoom === 'number') {
        zoom = clamp(zoom * params.zoom, ZOOM_LIMIT.min, ZOOM_LIMIT.max)
      }
    }
    chart.on('graphroam', onRoam as (p: unknown) => void)

    // Déplacement d'un nœud : au relâcher, on programme son retour élastique à la
    // position logique après un délai. Re-saisir un nœud annule le retour en attente.
    let returnTimer = 0
    let dragging = false
    let downX = 0
    let downY = 0
    const onDown = (p: { dataType?: string }) => {
      if (p?.dataType === 'node') {
        dragging = true
        if (returnTimer) {
          clearTimeout(returnTimer)
          returnTimer = 0
        }
      }
    }
    // Position du mousedown (pour distinguer un CLIC d'un pan/glisser). Le roam d'ECharts
    // absorbe l'événement 'click', d'où cette détection maison au mouseup.
    const onZrDown = (e: { offsetX: number; offsetY: number }) => {
      downX = e.offsetX
      downY = e.offsetY
    }
    const onUp = (e?: { offsetX: number; offsetY: number }) => {
      const mx = e?.offsetX ?? downX
      const my = e?.offsetY ?? downY
      if (dragging) {
        // Retour élastique d'un nœud déplacé.
        dragging = false
        returnTimer = window.setTimeout(() => {
          returnTimer = 0
          applyNodes(true)
        }, RETURN_DELAY)
        return
      }
      // Pas de glisser de nœud : si peu de mouvement → CLIC. Nébuleuse sous le curseur →
      // sélection (remonte le code) ; sinon désélection.
      if (Math.hypot(mx - downX, my - downY) < 5) {
        let picked: string | null = null
        for (const cl of clusterHit) {
          if (Math.hypot(cl.cx - mx, cl.cy - my) <= cl.r) {
            picked = cl.code
            break
          }
        }
        onSelectRef.current?.(picked)
      }
    }
    chart.on('mousedown', onDown as (p: unknown) => void)
    chart.getZr().on('mousedown', onZrDown)
    chart.getZr().on('mouseup', onUp)

    // --- Nébuleuse : UNE surface pleine par imputation, recalée sur la vue ECharts
    //     (pan/zoom) puis compositée avec un léger flou. En layout 'none' la projection
    //     données→pixels est AFFINE : 3 convertToPixel/frame suffisent (origine + deux
    //     unités), le reste est projeté par `proj` — au lieu d'un appel par point. ---
    const off = document.createElement('canvas')
    const octx = off.getContext('2d')
    let nebulaFrame = 0
    // Buffers scratch réutilisés (zéro allocation par frame).
    const B = NEBULA_BINS
    const rad = new Float64Array(B)
    const radTmp = new Float64Array(B)
    const outX = new Float64Array(B)
    const outY = new Float64Array(B)
    // Zones écran des nébuleuses et positions écran des émetteurs, recalculées à chaque
    // rendu — servent au hit-test du survol (sans convertToPixel par événement souris).
    let clusterHit: {
      codeId: string
      code: string
      cx: number
      cy: number
      r: number
    }[] = []
    let issuerScreen: { id: string; x: number; y: number; r: number }[] = []
    const drawNebula = () => {
      nebulaFrame = 0
      const cv = nebulaRef.current
      const nctx = cv?.getContext('2d')
      if (!cv || !nctx || !octx) return
      const w = cv.clientWidth
      const h = cv.clientHeight
      if (!w || !h) return
      if (cv.width !== w || cv.height !== h) {
        cv.width = w
        cv.height = h
        off.width = w
        off.height = h
      }
      // Transform affine de la vue (origine + vecteurs unités x et y, en pixels).
      const o = chart.convertToPixel({ seriesIndex: 0 }, [0, 0]) as
        number[] | null
      const ux = chart.convertToPixel({ seriesIndex: 0 }, [1, 0]) as
        number[] | null
      const uy = chart.convertToPixel({ seriesIndex: 0 }, [0, 1]) as
        number[] | null
      if (!o || !ux || !uy) return // vue pas encore prête
      const axx = ux[0] - o[0]
      const axy = ux[1] - o[1]
      const ayx = uy[0] - o[0]
      const ayy = uy[1] - o[1]
      const projX = (x: number, y: number) => o[0] + x * axx + y * ayx
      const projY = (x: number, y: number) => o[1] + x * axy + y * ayy

      octx.clearRect(0, 0, w, h)
      clusterHit = []
      for (const cl of clusters) {
        const cx = projX(cl.cx, cl.cy)
        const cy = projY(cl.cx, cl.cy)
        // Angles/distances écran des mots par rapport au soleil.
        const pts: { ang: number; d: number }[] = []
        let meanD = 0
        for (const g of cl.pts) {
          const dx = projX(g.x, g.y) - cx
          const dy = projY(g.x, g.y) - cy
          const d = Math.hypot(dx, dy) + g.r * zoom + NEBULA_MARGIN
          pts.push({ ang: Math.atan2(dy, dx), d })
          meanD += d
        }
        if (pts.length === 0) continue
        meanD /= pts.length

        // Enveloppe radiale : rayon max des mots par secteur angulaire, sur un socle
        // (pour rester plein au centre), étalé sur les secteurs voisins.
        const base = meanD * 0.5
        rad.fill(base)
        for (const p of pts) {
          const bi =
            ((Math.floor(((p.ang + Math.PI) / (2 * Math.PI)) * B) % B) + B) % B
          for (let o2 = -2; o2 <= 2; o2++) {
            const b = (((bi + o2) % B) + B) % B
            const k = 1 - Math.abs(o2) * 0.18
            rad[b] = Math.max(rad[b], p.d * k + base * (1 - k))
          }
        }

        // Lissage circulaire (ping-pong rad↔radTmp) → contour organique, pas dentelé.
        for (let pass = 0; pass < 3; pass++) {
          radTmp.set(rad)
          for (let b = 0; b < B; b++) {
            rad[b] =
              (radTmp[(b - 1 + B) % B] + 2 * radTmp[b] + radTmp[(b + 1) % B]) /
              4
          }
        }
        // Contour (buffers plats) + dégradé radial (stops précalculés).
        let maxR = 0
        for (let b = 0; b < B; b++) {
          const a = (b / B) * 2 * Math.PI - Math.PI
          outX[b] = cx + Math.cos(a) * rad[b]
          outY[b] = cy + Math.sin(a) * rad[b]
          if (rad[b] > maxR) maxR = rad[b]
        }
        const grad = octx.createRadialGradient(cx, cy, 0, cx, cy, maxR)
        grad.addColorStop(0, cl.stops[0])
        grad.addColorStop(0.65, cl.stops[1])
        grad.addColorStop(1, cl.stops[2])
        octx.fillStyle = grad
        octx.beginPath()
        closedCurve(octx, outX, outY, B)
        octx.fill()
        clusterHit.push({ codeId: cl.codeId, code: cl.code, cx, cy, r: maxR })
      }
      // Positions écran des émetteurs (pour le hit-test du survol, sans convertToPixel).
      issuerScreen = issuerHits.map((it) => ({
        id: it.id,
        x: projX(it.x, it.y),
        y: projY(it.x, it.y),
        r: it.r,
      }))
      // Compositing : léger flou pour adoucir les bords de l'aire.
      nctx.clearRect(0, 0, w, h)
      nctx.save()
      nctx.globalAlpha = NEBULA_ALPHA
      nctx.filter = `blur(${NEBULA_BLUR}px)`
      nctx.drawImage(off, 0, 0)
      nctx.restore()
      nctx.filter = 'none'
    }
    const scheduleNebula = () => {
      if (!nebulaFrame) nebulaFrame = requestAnimationFrame(drawNebula)
    }
    // Après chaque rendu ECharts (init, pan, zoom, retour), on recale la nébuleuse.
    chart.on('rendered', scheduleNebula)
    scheduleNebula()

    // --- Survol : révèle les noms des voisins de ce qu'on pointe. On teste d'abord les
    //     émetteurs (petites cibles), puis les nébuleuses. Un setOption ne part QUE
    //     quand la cible change (pas à chaque pixel). ---
    const zr = chart.getZr()
    let hoveredKey = ''
    const onMove = (e: { offsetX: number; offsetY: number }) => {
      const mx = e.offsetX
      const my = e.offsetY
      let key = ''
      const next = new Set<string>()
      // 1) émetteur sous le curseur ? Positions écran déjà en cache (issuerScreen),
      //    donc simple hypot — aucun convertToPixel par mouvement de souris.
      let issuerId = ''
      for (const it of issuerScreen) {
        if (Math.hypot(it.x - mx, it.y - my) <= it.r) {
          issuerId = it.id
          break
        }
      }
      if (issuerId) {
        key = `i:${issuerId}`
        next.add(issuerId)
        for (const c of issuerToCodes.get(issuerId) ?? []) next.add(c)
      } else {
        // 2) sinon, nébuleuse (imputation) sous le curseur ?
        for (const cl of clusterHit) {
          if (Math.hypot(cl.cx - mx, cl.cy - my) <= cl.r) {
            key = `c:${cl.codeId}`
            next.add(cl.codeId)
            for (const s of codeToIssuers.get(cl.codeId) ?? []) next.add(s)
            for (const nb of codeNeighbors.get(cl.codeId) ?? []) next.add(nb)
            break
          }
        }
      }
      if (key !== hoveredKey) {
        hoveredKey = key
        revealed = next
        applyNodes(false)
      }
    }
    const onOut = () => {
      if (hoveredKey) {
        hoveredKey = ''
        revealed = new Set()
        applyNodes(false)
      }
    }
    zr.on('mousemove', onMove)
    zr.on('globalout', onOut)

    const ro = new ResizeObserver(() => {
      chart.resize()
      scheduleNebula()
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
      if (returnTimer) clearTimeout(returnTimer)
      if (nebulaFrame) cancelAnimationFrame(nebulaFrame)
      chart.off('graphroam', onRoam as (p: unknown) => void)
      chart.off('mousedown', onDown as (p: unknown) => void)
      chart.off('rendered', scheduleNebula)
      zr.off('mousemove', onMove)
      zr.off('globalout', onOut)
      zr.off('mousedown', onZrDown)
      zr.off('mouseup', onUp)
      chart.dispose()
    }
  }, [graph])

  return (
    <div className="relative h-full w-full">
      {/* Nébuleuse (mots) DERRIÈRE le graphe ; le canvas ECharts (fond transparent)
          dessine soleils, planètes et liens par-dessus. */}
      <canvas
        ref={nebulaRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full"
      />
      <div ref={ref} className="absolute inset-0" />
    </div>
  )
}
