# Étape 2 — Modèle de galaxie (pur) + palette

## Objectif

Transformer le `WordPool` (nuages + graine) en un modèle de galaxie prêt à dessiner :
des nœuds (mots) rattachés à leur code, colorés par domaine, bornés en densité.
Logique PURE, testable en Node.

## Contexte

Le pool peut avoir jusqu'à 300 tokens/code → illisible. On garde les top-K par code
(D3). Le tag (domaine) vient de `BUDGET_LINES` ; sa couleur hex est définie ici (les
classes Tailwind de `Tag.tsx` ne servent pas en Canvas — D5).

## Fichier(s) impacté(s)

- `src/lib/facturation/galaxy.ts` (nouveau)
- `src/lib/facturation/facturation.test.ts` (tests)

## Travail à réaliser

### 1. Palette hex par domaine (miroir des tags)

```ts
// Couleurs de dessin (Canvas) par domaine — parallèle aux tags de Tag.tsx.
export const TAG_HEX: Record<string, string> = {
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
const NEUTRAL_HEX = '#71717a'
```

### 2. Modèle + transform

```ts
import { BUDGET_LINES, budgetLabel } from '#/lib/facturation/constants.ts'
import type { WordPool } from '#/lib/facturation/wordpool.ts'

export interface GalaxyNode {
  id: string // `${code}:${token}`
  code: string
  token: string
  count: number
  tag: string
  color: string
}
export interface GalaxyCode {
  code: string
  label: string
  tag: string
  color: string
}
export interface GalaxyModel {
  nodes: GalaxyNode[]
  codes: GalaxyCode[]
}

const TAG_BY_CODE = new Map(BUDGET_LINES.map((l) => [l.code, l.tags[0] ?? '']))

/** Top-K mots par code (par count), rattachés à leur domaine + couleur. */
export function buildGalaxy(pool: WordPool, topK = 40): GalaxyModel {
  const nodes: GalaxyNode[] = []
  const codes: GalaxyCode[] = []
  for (const [code, cell] of Object.entries(pool.perCode)) {
    const tag = TAG_BY_CODE.get(code) ?? ''
    const color = TAG_HEX[tag] ?? NEUTRAL_HEX
    codes.push({ code, label: budgetLabel(code), tag, color })
    const top = Object.entries(cell)
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK)
    for (const [token, count] of top)
      nodes.push({ id: `${code}:${token}`, code, token, count, tag, color })
  }
  return { nodes, codes }
}
```

### 3. Tests

```ts
it('buildGalaxy limite à topK mots par code et colore par domaine', () => {
  const pool = { perCode: { FMELECoooo: { a: 5, b: 4, c: 1 } } }
  const g = buildGalaxy(pool, 2)
  expect(g.nodes).toHaveLength(2) // top-2
  expect(g.nodes.map((n) => n.token)).toEqual(['a', 'b'])
  expect(g.codes[0].tag).toBe('Énergie & fluides')
  expect(g.nodes[0].color).toBe(TAG_HEX['Énergie & fluides'])
})
```

## Ordre d'exécution

1. `galaxy.ts` (palette + buildGalaxy).
2. Tests.
3. `npx tsc --noEmit` + `npx vitest run src/lib/facturation`.

## Critère de validation

- Module pur (aucun React/DOM/d3).
- top-K respecté, tag/couleur corrects par code, `label` via budgetLabel.
