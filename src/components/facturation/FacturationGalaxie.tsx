import { useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'

import { PageContainer } from '#/components/shared/PageContainer.tsx'
import { GalaxyChart } from '#/components/facturation/GalaxyChart.tsx'
import { Starfield } from '#/components/facturation/Starfield.tsx'
import { useFacturationModel } from '#/components/facturation/useFacturationModel.ts'
import { buildGalaxy, type GalaxyNodeType } from '#/lib/facturation/galaxy.ts'

/*
 * Page pleine « Galaxie des imputations » : graphe ECharts (émetteurs → imputations
 * → mots) sur fond étoilé + nébuleuses. Lit le modèle APPRIS (nuages serveur +
 * dictionnaire d'émetteurs) en cache ; lecture seule.
 */

const WORDS_PER_CODE = 24 // plus de contenu réel des factures qu'à la valeur par défaut

const NEBULAE = [
  { cls: 'top-[12%] left-[8%] size-80 opacity-20', color: '#5B9BFF' },
  { cls: 'top-[28%] right-[10%] size-96 opacity-[.15]', color: '#C77DFF' },
  { cls: 'bottom-[8%] left-[36%] size-80 opacity-[.13]', color: '#4DD9E8' },
]

export function FacturationGalaxie() {
  const { serverPool, issuers } = useFacturationModel()
  const { graph, counts } = useMemo(() => {
    const g = buildGalaxy(serverPool, issuers, WORDS_PER_CODE)
    const c: Record<GalaxyNodeType, number> = { issuer: 0, code: 0, word: 0 }
    for (const n of g.nodes) c[n.type]++
    return { graph: g, counts: c }
  }, [serverPool, issuers])
  const empty = graph.nodes.length === 0

  return (
    <PageContainer fillHeight>
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-[#070a18]">
        <Starfield />

        {/* Nébuleuses (fond flou décoratif). */}
        <div className="pointer-events-none absolute inset-0 z-[1]">
          {NEBULAE.map((n) => (
            <div
              key={n.cls}
              className={`absolute rounded-full blur-3xl ${n.cls}`}
              style={{
                background: `radial-gradient(circle,${n.color},transparent 70%)`,
              }}
            />
          ))}
        </div>

        {/* Le graphe (au-dessus des fonds). */}
        <div className="absolute inset-0 z-[2]">
          {empty ? (
            <div className="flex h-full w-full items-center justify-center px-6 text-center text-sm text-slate-400">
              Pas encore de données apprises — tamponnez des factures pour
              peupler la galaxie.
            </div>
          ) : (
            <GalaxyChart graph={graph} />
          )}
        </div>

        {/* Panneau (au-dessus du graphe). */}
        <div className="absolute top-4 left-4 z-10 w-64 max-w-[calc(100%-2rem)] rounded-2xl border border-white/10 bg-[#0a0d1c]/70 p-4 backdrop-blur">
          <Link
            to="/facturation"
            className="mb-2 inline-flex items-center gap-1 text-xs text-slate-400 transition-colors hover:text-slate-200"
          >
            <ArrowLeft className="size-3.5" />
            Retour
          </Link>
          <p className="text-[10px] tracking-[0.22em] text-slate-400 uppercase">
            Facturation
          </p>
          <h1 className="text-lg leading-tight font-bold text-slate-100">
            Galaxie des imputations
          </h1>
          <p className="mt-1 text-xs text-slate-400 tabular-nums">
            {counts.issuer} émetteurs · {counts.code} imputations ·{' '}
            {counts.word} mots
          </p>
        </div>

        {!empty && (
          <div className="pointer-events-none absolute right-4 bottom-3 z-10 rounded-full border border-white/10 bg-[#0a0d1c]/70 px-3 py-1 text-[11px] text-slate-400">
            molette : zoom · glisser : déplacer · survoler : voisins · légende :
            filtrer
          </div>
        )}
      </div>
    </PageContainer>
  )
}
