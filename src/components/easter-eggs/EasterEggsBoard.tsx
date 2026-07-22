import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Pencil, Play, Plus, Trash2, X } from 'lucide-react'

import { useEffectTrigger } from '#/components/shared/EffectOverlay.tsx'
import { PageContainer } from '#/components/shared/PageContainer.tsx'
import { PageHeader } from '#/components/shared/PageHeader.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Label } from '#/components/ui/label.tsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { Switch } from '#/components/ui/switch.tsx'
import { EFFECTS, VALIDATED_EFFECT_IDS } from '#/lib/artefact/effects/index.ts'
import {
  createEasterEgg,
  deleteEasterEgg,
  fetchEasterEggs,
  updateEasterEgg,
} from '#/lib/easter-eggs/service.ts'
import { cn } from '#/lib/utils.ts'

import type { ReactNode } from 'react'
import type { EasterEgg } from '#/lib/easter-eggs/types.ts'

/*
 * Page admin /easter-eggs — gère les déclencheurs clavier (mot-clé → effet).
 * Formulaire d'ajout inline en tête, puis une COLONNE de cards jouables : cliquer
 * une card lance son effet ; l'interrupteur l'active/désactive, le crayon la passe
 * en édition INLINE (mot-clé + effet), la corbeille supprime. Le runtime
 * `EasterEggs` remonte ensuite les actifs sur toute l'app. Seuls les effets
 * validés sont proposés (les autres restent réservés aux tests dans Artefact).
 */

const VALIDATED_EFFECTS = EFFECTS.filter((e) => VALIDATED_EFFECT_IDS.has(e.id))
const DEFAULT_EFFECT_ID = VALIDATED_EFFECTS[0]?.id ?? EFFECTS[0].id

function effectLabel(id: string): string {
  return EFFECTS.find((e) => e.id === id)?.label ?? id
}

/*
 * Champ de formulaire : label au-dessus du contrôle. L'espacement est porté par
 * le label (`mb-1.5`), PAS par un `space-y` sur le conteneur : Radix ajoute après
 * son trigger un <select> natif caché ; un `space-y` l'espacerait aussi et
 * décalerait la hauteur du champ (donc son alignement avec les autres).
 */
function Field({
  label,
  htmlFor,
  className,
  children,
}: {
  label: string
  htmlFor: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor} className="mb-1.5 block">
        {label}
      </Label>
      {children}
    </div>
  )
}

/** Select des effets — restreint aux effets validés. */
function EffectSelect({
  id,
  value,
  onChange,
}: {
  id?: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {VALIDATED_EFFECTS.map((effect) => (
          <SelectItem key={effect.id} value={effect.id}>
            {effect.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function EasterEggsBoard() {
  const queryClient = useQueryClient()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['easter-eggs', 'all'],
    queryFn: fetchEasterEggs,
  })
  const { trigger, overlay } = useEffectTrigger()

  const [keyword, setKeyword] = useState('')
  const [effectId, setEffectId] = useState(DEFAULT_EFFECT_ID)
  const [editingId, setEditingId] = useState<string | null>(null)

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['easter-eggs'] })
  const createMut = useMutation({
    mutationFn: (input: { keyword: string; effectId: string }) =>
      createEasterEgg({ ...input, enabled: true }),
    onSuccess: () => {
      setKeyword('')
      setEffectId(DEFAULT_EFFECT_ID)
      invalidate()
    },
  })
  const updateMut = useMutation({
    mutationFn: (vars: {
      id: string
      patch: Partial<{ keyword: string; effectId: string; enabled: boolean }>
    }) => updateEasterEgg(vars.id, vars.patch),
    onSuccess: () => {
      setEditingId(null)
      invalidate()
    },
  })
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteEasterEgg(id),
    onSuccess: invalidate,
  })

  const eggs = data ?? []
  const trimmed = keyword.trim()
  const canAdd = trimmed.length > 0 && !createMut.isPending

  return (
    <PageContainer>
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <PageHeader
          title="Easter eggs"
          meta="Taper un mot-clé n'importe où dans l'app lance un effet. Clique une carte pour l'essayer."
        />

        {/* Aperçu jouable des effets validés — candidats pour un déclencheur.
            Petites cartes en flex-wrap : la liste s'étoffera avec le temps. */}
        <div className="space-y-2.5">
          <p className="text-xs font-medium text-muted-foreground">
            Effets disponibles — clique pour jouer
          </p>
          <div className="flex flex-wrap gap-2">
            {VALIDATED_EFFECTS.map((effect) => (
              <button
                key={effect.id}
                type="button"
                onClick={() => trigger(effect)}
                title={`Jouer « ${effect.label} »`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm transition-colors hover:border-primary/50 hover:bg-accent/40"
              >
                <Play className="size-3.5 fill-current text-primary" />
                {effect.label}
              </button>
            ))}
          </div>
        </div>

        {/* Ajout d'un déclencheur (inline) */}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (canAdd) createMut.mutate({ keyword: trimmed, effectId })
          }}
          className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-end"
        >
          <Field
            label="Mot déclencheur"
            htmlFor="egg-keyword"
            className="flex-1"
          >
            <Input
              id="egg-keyword"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="ex. chloé"
              autoComplete="off"
            />
          </Field>
          <Field label="Effet" htmlFor="egg-effect" className="flex-1">
            <EffectSelect
              id="egg-effect"
              value={effectId}
              onChange={setEffectId}
            />
          </Field>
          <Button type="submit" disabled={!canAdd}>
            <Plus />
            Ajouter
          </Button>
        </form>

        {createMut.isError && (
          <p className="text-sm text-destructive">
            Ajout impossible — ce mot-clé existe peut-être déjà.
          </p>
        )}

        {/* Liste en une colonne */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-[74px] rounded-xl" />
            ))}
          </div>
        ) : isError ? (
          <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
            Impossible de charger les easter eggs. Vérifie que la migration{' '}
            <code className="text-foreground">supabase/easter_eggs.sql</code> a
            bien été exécutée.
          </p>
        ) : eggs.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Aucun easter egg pour l'instant — ajoute un mot déclencheur
            ci-dessus.
          </p>
        ) : (
          <div className="space-y-3">
            {eggs.map((egg) =>
              editingId === egg.id ? (
                <EasterEggEditor
                  key={egg.id}
                  egg={egg}
                  pending={updateMut.isPending}
                  onSave={(patch) => updateMut.mutate({ id: egg.id, patch })}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <EasterEggCard
                  key={egg.id}
                  egg={egg}
                  onPlay={() => {
                    const effect = EFFECTS.find((e) => e.id === egg.effectId)
                    if (effect) trigger(effect)
                  }}
                  onEdit={() => setEditingId(egg.id)}
                  onDelete={() => deleteMut.mutate(egg.id)}
                  onToggle={(enabled) =>
                    updateMut.mutate({ id: egg.id, patch: { enabled } })
                  }
                />
              ),
            )}
          </div>
        )}
      </div>
      {overlay}
    </PageContainer>
  )
}

function EasterEggCard({
  egg,
  onPlay,
  onEdit,
  onDelete,
  onToggle,
}: {
  egg: EasterEgg
  onPlay: () => void
  onEdit: () => void
  onDelete: () => void
  onToggle: (enabled: boolean) => void
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onPlay}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onPlay()
        }
      }}
      className={cn(
        'group flex cursor-pointer items-center gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-accent/30',
        !egg.enabled && 'opacity-55',
      )}
    >
      {/* Pastille de lecture — signale que la carte est jouable. */}
      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
        <Play className="size-4 fill-current" />
      </div>

      <div className="min-w-0 flex-1">
        <code className="font-mono text-base font-semibold text-foreground">
          {egg.keyword}
        </code>
        <div className="truncate text-sm text-muted-foreground">
          {effectLabel(egg.effectId)}
        </div>
      </div>

      {/* Contrôles : chacun stoppe la propagation pour ne pas jouer l'effet. */}
      <div className="flex shrink-0 items-center gap-1">
        <Switch
          checked={egg.enabled}
          onCheckedChange={onToggle}
          onClick={(e) => e.stopPropagation()}
          aria-label={egg.enabled ? 'Actif' : 'Inactif'}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={(e) => {
            e.stopPropagation()
            onEdit()
          }}
          title="Modifier"
        >
          <Pencil />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          title="Supprimer"
        >
          <Trash2 />
        </Button>
      </div>
    </div>
  )
}

function EasterEggEditor({
  egg,
  pending,
  onSave,
  onCancel,
}: {
  egg: EasterEgg
  pending: boolean
  onSave: (patch: { keyword: string; effectId: string }) => void
  onCancel: () => void
}) {
  const [keyword, setKeyword] = useState(egg.keyword)
  const [effectId, setEffectId] = useState(egg.effectId)
  const trimmed = keyword.trim()

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (trimmed) onSave({ keyword: trimmed, effectId })
      }}
      className="flex flex-col gap-3 rounded-xl border border-primary/40 bg-card p-4 sm:flex-row sm:items-end"
    >
      <Field
        label="Mot déclencheur"
        htmlFor={`edit-keyword-${egg.id}`}
        className="flex-1"
      >
        <Input
          id={`edit-keyword-${egg.id}`}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          autoComplete="off"
          autoFocus
        />
      </Field>
      <Field label="Effet" htmlFor={`edit-effect-${egg.id}`} className="flex-1">
        <EffectSelect
          id={`edit-effect-${egg.id}`}
          value={effectId}
          onChange={setEffectId}
        />
      </Field>
      <div className="flex gap-1">
        <Button
          type="submit"
          size="icon"
          disabled={!trimmed || pending}
          title="Enregistrer"
        >
          <Check />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={onCancel}
          title="Annuler"
        >
          <X />
        </Button>
      </div>
    </form>
  )
}
