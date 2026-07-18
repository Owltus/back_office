import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, X } from 'lucide-react'

import { PageContainer } from '#/components/shared/PageContainer.tsx'
import { GalaxyChart } from '#/components/facturation/GalaxyChart.tsx'
import { Starfield } from '#/components/facturation/Starfield.tsx'
import { useFacturationModel } from '#/components/facturation/useFacturationModel.ts'
import { buildGalaxy, type GalaxyNodeType } from '#/lib/facturation/galaxy.ts'
import { budgetLabel } from '#/lib/facturation/constants.ts'

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
  const { serverPool, issuers, issuerCodes } = useFacturationModel()
  const { graph, counts } = useMemo(() => {
    const g = buildGalaxy(serverPool, issuers, WORDS_PER_CODE, 2, issuerCodes)
    const c: Record<GalaxyNodeType, number> = { issuer: 0, code: 0, word: 0 }
    for (const n of g.nodes) c[n.type]++
    return { graph: g, counts: c }
  }, [serverPool, issuers, issuerCodes])
  const empty = graph.nodes.length === 0

  // Code sélectionné (clic sur une nébuleuse) → panneau latéral listant SES mots appris.
  const [selectedCode, setSelectedCode] = useState<string | null>(null)
  const selected = useMemo(() => {
    const cell = selectedCode ? serverPool.perCode[selectedCode] : undefined
    if (!selectedCode || !cell) return null
    const words = Object.entries(cell).sort((a, b) => b[1] - a[1])
    const total = words.reduce((s, [, n]) => s + n, 0)
    return { code: selectedCode, words, total }
  }, [selectedCode, serverPool])

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
            <GalaxyChart graph={graph} onSelectCode={setSelectedCode} />
          )}
        </div>

        {/* Panneau latéral droit : mots appris de la nébuleuse sélectionnée. */}
        {selected && (
          <div className="absolute top-4 right-4 bottom-10 z-10 flex w-72 max-w-[calc(100%-2rem)] flex-col rounded-2xl border border-white/10 bg-[#0a0d1c]/80 backdrop-blur">
            <div className="flex items-start justify-between gap-2 border-b border-white/10 p-4">
              <div className="min-w-0">
                <p className="text-[10px] tracking-[0.22em] text-slate-400 uppercase">
                  Nébuleuse
                </p>
                <h2 className="truncate text-sm font-bold text-slate-100">
                  {budgetLabel(selected.code)}
                </h2>
                <p className="mt-0.5 font-mono text-[11px] text-slate-500">
                  {selected.code}
                </p>
                <p className="mt-1 text-xs text-slate-400 tabular-nums">
                  {selected.words.length} mots · {selected.total} occurrences
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCode(null)}
                aria-label="Fermer"
                className="shrink-0 rounded p-1 text-slate-400 transition-colors hover:bg-white/10 hover:text-slate-200"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <div className="flex flex-wrap gap-1.5">
                {selected.words.map(([token, n]) => (
                  <span
                    key={token}
                    className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-slate-200"
                  >
                    {token}
                    <span className="text-[10px] text-slate-500 tabular-nums">
                      {n}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

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
            molette : zoom · glisser : déplacer · survoler : voisins · cliquer :
            mots · légende : filtrer
          </div>
        )}
      </div>
    </PageContainer>
  )
}
