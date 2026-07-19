import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  Ban,
  CheckCircle2,
  Eraser,
  Loader2,
  RotateCcw,
  Sparkles,
} from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog.tsx'
import { Button } from '#/components/ui/button.tsx'
import { useFacturationModel } from '#/components/facturation/useFacturationModel.ts'
import { useFacturationCuration } from '#/components/facturation/useFacturationCuration.ts'
import { reviewQueue, type Anomaly } from '#/lib/facturation/anomalies.ts'
import { budgetLabel } from '#/lib/facturation/constants.ts'

/*
 * Modal « Contrôle des imputations » : curation du modèle appris, calculée À LA VOLÉE depuis
 * le cache. Le système DÉTECTE et PROPOSE ; l'utilisateur VALIDE (human-in-the-loop). Sections :
 *   - Anomalies : outlier émetteur→code (imputation marginale) → désapprendre ou bannir ;
 *     codes confusables (nuages trop proches) → inspection dans la galaxie.
 *   - Associations apprises : TOUS les couples émetteur→code, avec « Désapprendre » (oubli
 *     complet de l'association) — pour corriger une imputation faite par erreur.
 *   - Vocabulaire appris : les codes ayant un nuage de mots, avec « Réinitialiser » (efface
 *     tout le vocabulaire d'un code pollué).
 *   - Interdictions en vigueur : couples déjà bannis (denylist), avec « Lever l'interdiction ».
 * Aucun SQL requis côté utilisateur. Ouvert depuis l'atelier. Lecture seule sauf actions.
 */

type Kind = 'forget' | 'ban' | 'unban' | 'reset'

const pct = (x: number): string => `${Math.round(x * 100)} %`

function OutlierCard({
  data,
  issuerName,
  busy,
  onUnlearn,
  onBan,
}: {
  data: Extract<Anomaly, { kind: 'issuer-outlier' }>['data']
  issuerName: string
  busy: Kind | null
  onUnlearn: () => void
  onBan: () => void
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-col gap-1">
        <span className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
          Imputation marginale
        </span>
        <p className="text-sm text-foreground">
          <span className="font-semibold">{issuerName}</span> a été imputé{' '}
          <span className="font-semibold">{budgetLabel(data.code)}</span> une
          seule fois ({pct(data.share)}), alors qu'il va d'habitude sur{' '}
          <span className="font-semibold">{budgetLabel(data.dominant)}</span>.
        </p>
        <p className="font-mono text-[11px] text-muted-foreground">
          {data.code} · {data.count} confirmation · dominant {data.dominant}
        </p>
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onUnlearn}
          disabled={busy !== null}
        >
          {busy === 'forget' ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RotateCcw className="size-4" />
          )}
          Désapprendre
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onBan}
          disabled={busy !== null}
          className="text-destructive hover:text-destructive"
        >
          {busy === 'ban' ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Ban className="size-4" />
          )}
          Bannir ce couple
        </Button>
      </div>
    </div>
  )
}

function ConfusableCard({
  data,
  onClose,
}: {
  data: Extract<Anomaly, { kind: 'confusable-codes' }>['data']
  onClose: () => void
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-col gap-1">
        <span className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
          Nuages ressemblants
        </span>
        <p className="text-sm text-foreground">
          <span className="font-semibold">{budgetLabel(data.a)}</span> et{' '}
          <span className="font-semibold">{budgetLabel(data.b)}</span> partagent{' '}
          {pct(data.cosine)} de vocabulaire — risque de confusion à
          l'imputation.
        </p>
        <p className="font-mono text-[11px] text-muted-foreground">
          {data.a} · {data.b}
        </p>
      </div>
      <Button asChild variant="outline" size="sm" className="w-fit">
        <Link to="/facturation/galaxie" onClick={onClose}>
          <Sparkles className="size-4" />
          Inspecter dans la galaxie
        </Link>
      </Button>
    </div>
  )
}

function DenyCard({
  issuerName,
  code,
  busy,
  onUnban,
}: {
  issuerName: string
  code: string
  busy: boolean
  onUnban: () => void
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
      <div className="min-w-0 flex-1">
        <span className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
          Interdiction
        </span>
        <p className="text-sm text-foreground">
          <span className="font-semibold">{issuerName}</span> ne sera jamais
          imputé <span className="font-semibold">{budgetLabel(code)}</span>.
        </p>
        <p className="font-mono text-[11px] text-muted-foreground">{code}</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={onUnban}
        disabled={busy}
        className="shrink-0"
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <RotateCcw className="size-4" />
        )}
        Lever l'interdiction
      </Button>
    </div>
  )
}

/* Ligne compacte : une association émetteur→code apprise, avec « Désapprendre » (oubli
 * complet). Sert à corriger une imputation faite par erreur (ex. maintenance → alimentaire). */
function AssocRow({
  issuerName,
  code,
  count,
  busy,
  onForget,
}: {
  issuerName: string
  code: string
  count: number
  busy: boolean
  onForget: () => void
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-foreground">
          <span className="font-semibold">{issuerName}</span> →{' '}
          {budgetLabel(code)}
        </p>
        <p className="font-mono text-[11px] text-muted-foreground">
          {code} · {count}×
        </p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onForget}
        disabled={busy}
        className="shrink-0 text-muted-foreground hover:text-destructive"
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <RotateCcw className="size-4" />
        )}
        Désapprendre
      </Button>
    </div>
  )
}

/* Ligne compacte : le vocabulaire appris d'un code, avec « Réinitialiser » (efface tout le
 * nuage de mots du code — remise à zéro d'une imputation polluée). */
function CloudRow({
  code,
  words,
  busy,
  onReset,
}: {
  code: string
  words: number
  busy: boolean
  onReset: () => void
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-foreground">{budgetLabel(code)}</p>
        <p className="font-mono text-[11px] text-muted-foreground">
          {code} · {words} mot{words > 1 ? 's' : ''}
        </p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onReset}
        disabled={busy}
        className="shrink-0 text-muted-foreground hover:text-destructive"
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Eraser className="size-4" />
        )}
        Réinitialiser
      </Button>
    </div>
  )
}

export function RevueDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { serverPool, issuers, issuerCodes, issuerDenylist } =
    useFacturationModel()
  const { banIssuerCode, forgetIssuerCode, resetCodeCloud, unbanIssuerCode } =
    useFacturationCuration()

  const issuerName = useMemo(() => {
    const m = new Map(issuers.map((i) => [i.name, i.display]))
    return (key: string): string => m.get(key) ?? key
  }, [issuers])

  const anomalies = useMemo(
    () => reviewQueue(serverPool, issuerCodes),
    [serverPool, issuerCodes],
  )

  // Toutes les associations émetteur→code apprises (aplaties), plus fréquentes d'abord.
  const assocs = useMemo(() => {
    const out: { issuer: string; code: string; count: number }[] = []
    for (const [issuer, cell] of Object.entries(issuerCodes.perIssuer))
      for (const [code, count] of Object.entries(cell))
        if (count > 0) out.push({ issuer, code, count })
    return out.sort(
      (a, b) => b.count - a.count || a.issuer.localeCompare(b.issuer),
    )
  }, [issuerCodes])

  // Codes ayant un vocabulaire appris (nuage de mots), les plus riches d'abord.
  const clouds = useMemo(() => {
    const out: { code: string; words: number }[] = []
    for (const [code, cell] of Object.entries(serverPool.perCode)) {
      const words = Object.keys(cell).length
      if (words > 0) out.push({ code, words })
    }
    return out.sort((a, b) => b.words - a.words || a.code.localeCompare(b.code))
  }, [serverPool])

  // Interdictions en vigueur (denylist aplatie), triées pour un ordre stable.
  const denies = useMemo(() => {
    const out: { issuer: string; code: string }[] = []
    for (const [issuer, set] of Object.entries(issuerDenylist.perIssuer))
      for (const code of set) out.push({ issuer, code })
    return out.sort(
      (a, b) =>
        a.issuer.localeCompare(b.issuer) || a.code.localeCompare(b.code),
    )
  }, [issuerDenylist])

  const nothing =
    anomalies.length === 0 &&
    assocs.length === 0 &&
    clouds.length === 0 &&
    denies.length === 0

  // État par carte : action en cours, ou erreur d'action. Clé = identité de la ligne.
  const [busy, setBusy] = useState<Record<string, Kind>>({})
  const [errors, setErrors] = useState<Record<string, boolean>>({})

  async function run(id: string, kind: Kind, fn: () => Promise<void>) {
    setBusy((b) => ({ ...b, [id]: kind }))
    setErrors((e) => ({ ...e, [id]: false }))
    try {
      await fn()
    } catch {
      setErrors((e) => ({ ...e, [id]: true }))
    } finally {
      setBusy((b) => {
        const { [id]: _drop, ...rest } = b
        return rest
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-[46rem] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-4 py-3">
          <DialogTitle className="text-base">
            Contrôle des imputations
          </DialogTitle>
          <DialogDescription className="text-xs tabular-nums">
            {anomalies.length} anomalie{anomalies.length > 1 ? 's' : ''} ·{' '}
            {denies.length} interdiction{denies.length > 1 ? 's' : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4">
          {nothing ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-sm text-muted-foreground">
              <CheckCircle2 className="size-8 text-emerald-500/70" />
              Le modèle appris est cohérent — rien à corriger pour l'instant.
            </div>
          ) : (
            <>
              {/* Section Anomalies. */}
              {anomalies.length > 0 && (
                <section className="flex flex-col gap-3">
                  <h2 className="text-sm font-semibold text-foreground">
                    Anomalies à examiner
                  </h2>
                  <div className="grid gap-3 md:grid-cols-2">
                    {anomalies.map((a) => {
                      if (a.kind === 'issuer-outlier') {
                        const id = `outlier:${a.data.issuerKey}:${a.data.code}`
                        return (
                          <div key={id} className="flex flex-col gap-1">
                            <OutlierCard
                              data={a.data}
                              issuerName={issuerName(a.data.issuerKey)}
                              busy={busy[id] ?? null}
                              onUnlearn={() =>
                                run(id, 'forget', () =>
                                  forgetIssuerCode(
                                    a.data.issuerKey,
                                    a.data.code,
                                  ),
                                )
                              }
                              onBan={() =>
                                run(id, 'ban', () =>
                                  banIssuerCode(a.data.issuerKey, a.data.code),
                                )
                              }
                            />
                            {errors[id] && (
                              <p className="px-1 text-[11px] text-destructive">
                                Action impossible (droits ou base
                                indisponibles).
                              </p>
                            )}
                          </div>
                        )
                      }
                      const id = `confusable:${a.data.a}:${a.data.b}`
                      return (
                        <ConfusableCard
                          key={id}
                          data={a.data}
                          onClose={() => onOpenChange(false)}
                        />
                      )
                    })}
                  </div>
                </section>
              )}

              {/* Section Associations apprises (émetteur→code) : liste complète. */}
              {assocs.length > 0 && (
                <section className="flex flex-col gap-2">
                  <h2 className="text-sm font-semibold text-foreground">
                    Associations apprises
                  </h2>
                  <p className="-mt-1 text-xs text-muted-foreground">
                    Ce que chaque émetteur a appris à imputer. « Désapprendre »
                    efface l'association — utile si elle a été créée par erreur.
                  </p>
                  <div className="flex flex-col gap-2">
                    {assocs.map(({ issuer, code, count }) => {
                      const id = `assoc:${issuer}:${code}`
                      return (
                        <div key={id} className="flex flex-col gap-1">
                          <AssocRow
                            issuerName={issuerName(issuer)}
                            code={code}
                            count={count}
                            busy={busy[id] === 'forget'}
                            onForget={() =>
                              run(id, 'forget', () =>
                                forgetIssuerCode(issuer, code),
                              )
                            }
                          />
                          {errors[id] && (
                            <p className="px-1 text-[11px] text-destructive">
                              Action impossible (droits ou base indisponibles).
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </section>
              )}

              {/* Section Vocabulaire appris par code (nuages de mots). */}
              {clouds.length > 0 && (
                <section className="flex flex-col gap-2">
                  <h2 className="text-sm font-semibold text-foreground">
                    Vocabulaire appris
                  </h2>
                  <p className="-mt-1 text-xs text-muted-foreground">
                    Les mots retenus par code. « Réinitialiser » efface tout le
                    vocabulaire d'un code (remise à zéro d'une imputation
                    polluée).
                  </p>
                  <div className="flex flex-col gap-2">
                    {clouds.map(({ code, words }) => {
                      const id = `cloud:${code}`
                      return (
                        <div key={id} className="flex flex-col gap-1">
                          <CloudRow
                            code={code}
                            words={words}
                            busy={busy[id] === 'reset'}
                            onReset={() =>
                              run(id, 'reset', () => resetCodeCloud(code))
                            }
                          />
                          {errors[id] && (
                            <p className="px-1 text-[11px] text-destructive">
                              Action impossible (droits ou base indisponibles).
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </section>
              )}

              {/* Section Interdictions en vigueur (denylist). */}
              {denies.length > 0 && (
                <section className="flex flex-col gap-3">
                  <h2 className="text-sm font-semibold text-foreground">
                    Interdictions en vigueur
                  </h2>
                  <p className="-mt-1 text-xs text-muted-foreground">
                    Couples émetteur↔code que vous avez bannis. Lever
                    l'interdiction rend l'imputation de nouveau possible.
                  </p>
                  <div className="grid gap-3 md:grid-cols-2">
                    {denies.map(({ issuer, code }) => {
                      const id = `unban:${issuer}:${code}`
                      return (
                        <div key={id} className="flex flex-col gap-1">
                          <DenyCard
                            issuerName={issuerName(issuer)}
                            code={code}
                            busy={busy[id] === 'unban'}
                            onUnban={() =>
                              run(id, 'unban', () =>
                                unbanIssuerCode(issuer, code),
                              )
                            }
                          />
                          {errors[id] && (
                            <p className="px-1 text-[11px] text-destructive">
                              Action impossible (droits ou base indisponibles).
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
