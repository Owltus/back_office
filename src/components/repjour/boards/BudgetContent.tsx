import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'

import {
  fetchYearBudget,
  fetchBudgetYears,
  upsertBudget,
  deleteYearBudget,
} from '#/lib/repjour/services/daily.ts'
import { MONTHS_LABELS } from '#/lib/repjour/constants.ts'
import { fmt } from '#/lib/repjour/format.ts'
import type { MonthBudget } from '#/lib/repjour/types.ts'
import { Input } from '#/components/ui/input.tsx'
import { Button } from '#/components/ui/button.tsx'

/*
 * Onglet « Budget » de la gestion — porté de la source BudgetContent.
 *
 * Grille d'édition du budget annuel (TTC) mois par mois : sélection de l'année,
 * ajout d'une année, saisie des objectifs (nuitées, TO, PM, RevPAR, room
 * revenue), puis `upsertBudget` (idempotent sur (year, month)) et
 * `deleteYearBudget` (suppression destructive gardée par assertWriteRole + RLS).
 * Édition/suppression gardées par la prop `readOnly` — seul l'admin les voit.
 *
 * Restylé du thème CLAIR source vers le thème DARK du Back Office (tokens
 * shadcn) : bg-white → bg-card, text-secondary → text-muted-foreground,
 * primary → primary, error → destructive, success → emerald (cf. mapping en
 * tête de styles/repjour.css).
 */

const currentYear = new Date().getFullYear()

function emptyBudget(year: number): MonthBudget[] {
  return Array.from({ length: 12 }, (_, i) => ({
    id: 0,
    year,
    month: i + 1,
    nuitees: 0,
    taux_occupation: 0,
    prix_moyen: 0,
    revpar: 0,
    room_revenue: 0,
  }))
}

function mergeBudgets(year: number, existing: MonthBudget[]): MonthBudget[] {
  const template = emptyBudget(year)
  return template.map((t) => {
    const found = existing.find((e) => e.month === t.month)
    return found ?? t
  })
}

export function BudgetContent({ readOnly = false }: { readOnly?: boolean }) {
  const [year, setYear] = useState(currentYear)
  const [years, setYears] = useState<number[]>([])
  const [budgets, setBudgets] = useState<MonthBudget[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [showAddYear, setShowAddYear] = useState(false)
  const [newYear, setNewYear] = useState('')

  // Charger les années existantes au montage.
  useEffect(() => {
    fetchBudgetYears()
      .then((yrs) => {
        const all = yrs.length > 0 ? yrs : [currentYear]
        setYears(all)
        // Sélectionner l'année courante si elle existe, sinon la dernière.
        if (all.includes(currentYear)) {
          setYear(currentYear)
        } else {
          setYear(all[all.length - 1])
        }
      })
      .catch((err) => {
        console.error('[repjour] chargement des années budget échoué', err)
        setYears([currentYear])
      })
  }, [])

  // Charger le budget de l'année sélectionnée.
  useEffect(() => {
    setLoading(true)
    fetchYearBudget(year)
      .then((data) => {
        setBudgets(mergeBudgets(year, data))
      })
      .catch((err) => {
        console.error('[repjour] chargement du budget annuel échoué', err)
        setBudgets(mergeBudgets(year, []))
      })
      .finally(() => setLoading(false))
  }, [year])

  const updateField = (
    month: number,
    field: keyof MonthBudget,
    value: string,
  ) => {
    setBudgets((prev) =>
      prev.map((b) =>
        b.month === month ? { ...b, [field]: parseFloat(value) || 0 } : b,
      ),
    )
  }

  const handleSave = async () => {
    setSaving(true)
    setMessage('')
    try {
      await upsertBudget(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        budgets.map(({ id, ...rest }) => rest),
      )
      setMessage('Budget sauvegardé')
      // Rafraîchir la liste des années.
      const yrs = await fetchBudgetYears()
      setYears(yrs.length > 0 ? yrs : [currentYear])
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteYear = async () => {
    if (!confirm(`Supprimer le budget ${year} ? Cette action est irréversible.`))
      return
    setSaving(true)
    setMessage('')
    try {
      await deleteYearBudget(year)
      const yrs = await fetchBudgetYears()
      const updated = yrs.length > 0 ? yrs : [currentYear]
      setYears(updated)
      setYear(updated[updated.length - 1])
      setMessage(`Budget ${year} supprimé`)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  const handleAddYear = () => {
    const y = parseInt(newYear, 10)
    if (isNaN(y) || y < 2020 || y > 2099) {
      setMessage('Année invalide (2020-2099)')
      return
    }
    if (years.includes(y)) {
      setYear(y)
      setShowAddYear(false)
      setNewYear('')
      return
    }
    setYears((prev) => [...prev, y].sort())
    setYear(y)
    setShowAddYear(false)
    setNewYear('')
    setMessage('')
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-foreground">
          Budget annuel (TTC)
        </h2>

        <div className="flex items-center gap-2">
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            aria-label="Choisir une année"
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>

          {!readOnly &&
            (showAddYear ? (
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  value={newYear}
                  onChange={(e) => setNewYear(e.target.value)}
                  placeholder="2027"
                  className="w-24"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleAddYear()}
                />
                <Button size="sm" onClick={handleAddYear}>
                  OK
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowAddYear(false)
                    setNewYear('')
                  }}
                >
                  Annuler
                </Button>
              </div>
            ) : (
              <button
                onClick={() => {
                  const maxYear =
                    years.length > 0 ? Math.max(...years) : currentYear
                  setNewYear(String(maxYear + 1))
                  setShowAddYear(true)
                }}
                className="rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary"
              >
                + Ajouter une année
              </button>
            ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border bg-card p-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-2 py-2 text-left font-medium text-muted-foreground">
                    Mois
                  </th>
                  <th
                    className={`${readOnly ? 'text-center' : 'text-right'} px-2 py-2 font-medium text-muted-foreground`}
                  >
                    <span className={readOnly ? 'hidden sm:inline' : ''}>
                      Nuitées
                    </span>
                    {readOnly && <span className="sm:hidden">Nuit.</span>}
                  </th>
                  <th
                    className={`${readOnly ? 'text-center' : 'text-right'} px-2 py-2 font-medium text-muted-foreground`}
                  >
                    TO
                  </th>
                  <th
                    className={`${readOnly ? 'text-center' : 'text-right'} px-2 py-2 font-medium text-muted-foreground`}
                  >
                    PM
                  </th>
                  <th
                    className={`${readOnly ? 'text-center' : 'text-right'} px-2 py-2 font-medium text-muted-foreground ${readOnly ? 'hidden sm:table-cell' : ''}`}
                  >
                    RevPAR
                  </th>
                  <th
                    className={`${readOnly ? 'text-center' : 'text-right'} px-2 py-2 font-medium text-muted-foreground`}
                  >
                    <span className={readOnly ? 'hidden sm:inline' : ''}>
                      Room Rev
                    </span>
                    {readOnly && <span className="sm:hidden">CA</span>}
                  </th>
                </tr>
              </thead>
              <tbody>
                {budgets.map((b) => (
                  <tr key={b.month} className="border-b border-border/50">
                    <td className="whitespace-nowrap px-2 py-2 text-xs font-medium text-foreground">
                      {readOnly ? (
                        <>
                          <span className="hidden sm:inline">
                            {MONTHS_LABELS[b.month - 1]}
                          </span>
                          <span className="sm:hidden">
                            {MONTHS_LABELS[b.month - 1]?.slice(0, 3)}
                          </span>
                        </>
                      ) : (
                        MONTHS_LABELS[b.month - 1]
                      )}
                    </td>
                    {readOnly ? (
                      <>
                        <td className="px-2 py-2 text-center text-xs tabular-nums text-foreground">
                          {fmt.nuitees(b.nuitees)}
                        </td>
                        <td className="px-2 py-2 text-center text-xs tabular-nums text-foreground">
                          {fmt.pct(b.taux_occupation)}
                        </td>
                        <td className="px-2 py-2 text-center text-xs tabular-nums text-foreground">
                          {fmt.eur(b.prix_moyen)}
                        </td>
                        <td className="hidden px-2 py-2 text-center text-xs tabular-nums text-foreground sm:table-cell">
                          {fmt.eur(b.revpar)}
                        </td>
                        <td className="px-2 py-2 text-center text-xs tabular-nums text-foreground">
                          {fmt.eurInt(b.room_revenue)}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-1 py-2">
                          <Input
                            type="number"
                            value={b.nuitees || ''}
                            placeholder="0"
                            onChange={(e) =>
                              updateField(b.month, 'nuitees', e.target.value)
                            }
                            className="h-8 text-right text-sm tabular-nums"
                          />
                        </td>
                        <td className="px-1 py-2">
                          <Input
                            type="number"
                            step="0.1"
                            value={b.taux_occupation || ''}
                            placeholder="0"
                            onChange={(e) =>
                              updateField(
                                b.month,
                                'taux_occupation',
                                e.target.value,
                              )
                            }
                            className="h-8 text-right text-sm tabular-nums"
                          />
                        </td>
                        <td className="px-1 py-2">
                          <Input
                            type="number"
                            step="0.1"
                            value={b.prix_moyen || ''}
                            placeholder="0"
                            onChange={(e) =>
                              updateField(b.month, 'prix_moyen', e.target.value)
                            }
                            className="h-8 text-right text-sm tabular-nums"
                          />
                        </td>
                        <td className="px-1 py-2">
                          <Input
                            type="number"
                            step="0.1"
                            value={b.revpar || ''}
                            placeholder="0"
                            onChange={(e) =>
                              updateField(b.month, 'revpar', e.target.value)
                            }
                            className="h-8 text-right text-sm tabular-nums"
                          />
                        </td>
                        <td className="px-1 py-2">
                          <Input
                            type="number"
                            value={b.room_revenue || ''}
                            placeholder="0"
                            onChange={(e) =>
                              updateField(
                                b.month,
                                'room_revenue',
                                e.target.value,
                              )
                            }
                            className="h-8 text-right text-sm tabular-nums"
                          />
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!readOnly && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? 'Sauvegarde...' : 'Sauvegarder'}
                </Button>
                {message && (
                  <span
                    className={`text-sm ${
                      message.includes('Erreur') || message.includes('invalide')
                        ? 'text-destructive'
                        : 'text-emerald-500'
                    }`}
                  >
                    {message}
                  </span>
                )}
              </div>
              <Button
                variant="ghost"
                onClick={handleDeleteYear}
                disabled={saving}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                Supprimer {year}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
