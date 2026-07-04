import { useEffect, useState } from 'react'
import { Check, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { cn } from '#/lib/utils.ts'
import {
  addRecipient,
  deleteRecipient,
  fetchRecipients,
  updateRecipient,
  type EmailRecipient,
  type RecipientType,
} from '#/lib/repjour/services/recipients.ts'

interface Props {
  open: boolean
  onClose: () => void
}

/*
 * Gestion des destinataires email — porté de la source RecipientsModal vers la
 * modale shadcn `Dialog`. Le CHROME est restylé en dark via les tokens du Back
 * Office (background/foreground/muted/border…). Les seules écritures Supabase
 * (addRecipient/updateRecipient/deleteRecipient) passent par le service
 * recipients et sont soumises aux RLS admin.
 */

function TypeToggle({
  value,
  onChange,
}: {
  value: RecipientType
  onChange: (v: RecipientType) => void
}) {
  return (
    <div className="flex gap-1 rounded-lg bg-muted p-0.5">
      {(['to', 'cc'] as const).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(t)}
          className={cn(
            'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
            value === t
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {t === 'to' ? 'Destinataire' : 'Copie (CC)'}
        </button>
      ))}
    </div>
  )
}

export function RecipientsModal({ open, onClose }: Props) {
  const [recipients, setRecipients] = useState<EmailRecipient[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  const [showAdd, setShowAdd] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<RecipientType>('to')

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState({
    email: '',
    name: '',
    type: 'to' as RecipientType,
  })

  async function load() {
    const data = await fetchRecipients()
    setRecipients(data)
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    if (open) load()
  }, [open])

  const handleAdd = async () => {
    if (!newEmail) {
      setMessage('Email requis')
      return
    }
    try {
      await addRecipient(newEmail, newName, newType)
      setNewEmail('')
      setNewName('')
      setNewType('to')
      setShowAdd(false)
      setMessage('Destinataire ajouté')
      load()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Erreur')
    }
  }

  const handleToggle = async (r: EmailRecipient) => {
    await updateRecipient(r.id, { active: !r.active })
    load()
  }

  const startEdit = (r: EmailRecipient) => {
    setEditingId(r.id)
    setEditForm({ email: r.email, name: r.name, type: r.type })
  }

  const saveEdit = async () => {
    if (!editingId) return
    try {
      await updateRecipient(editingId, editForm)
      setEditingId(null)
      setMessage('Mis à jour')
      load()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Erreur')
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Supprimer ce destinataire ?')) return
    await deleteRecipient(id)
    load()
  }

  const toRecipients = recipients.filter((r) => r.type === 'to')
  const ccRecipients = recipients.filter((r) => r.type === 'cc')
  const activeCount = recipients.filter((r) => r.active).length

  const renderRow = (r: EmailRecipient) =>
    editingId === r.id ? (
      <div key={r.id} className="space-y-2 rounded-lg bg-muted/50 px-2 py-3">
        <div className="grid grid-cols-2 gap-2">
          <Input
            value={editForm.name}
            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
            placeholder="Nom"
            className="h-8 text-sm"
          />
          <Input
            type="email"
            value={editForm.email}
            onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
            placeholder="Email"
            className="h-8 text-sm"
          />
        </div>
        <TypeToggle
          value={editForm.type}
          onChange={(t) => setEditForm({ ...editForm, type: t })}
        />
        <div className="flex gap-2">
          <Button size="sm" onClick={saveEdit}>
            OK
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
            Annuler
          </Button>
        </div>
      </div>
    ) : (
      <div
        key={r.id}
        className="group -mx-2 flex items-center justify-between rounded-lg px-2 py-2 transition-colors hover:bg-muted/50"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <button
            type="button"
            onClick={() => handleToggle(r)}
            aria-label={r.active ? 'Désactiver' : 'Activer'}
            className={cn(
              'flex size-4 shrink-0 items-center justify-center rounded border-2 transition-colors',
              r.active
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-input',
            )}
          >
            {r.active && <Check className="size-2.5" />}
          </button>
          <div className="min-w-0">
            <p
              className={cn(
                'truncate text-sm',
                r.active
                  ? 'text-foreground'
                  : 'text-muted-foreground line-through',
              )}
            >
              {r.name || r.email}
            </p>
            {r.name && (
              <p className="truncate text-[11px] text-muted-foreground">
                {r.email}
              </p>
            )}
          </div>
        </div>
        <div className="ml-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={() => startEdit(r)}
            title="Modifier"
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => handleDelete(r.id)}
            title="Supprimer"
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>
    )

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
    >
      <DialogContent className="max-h-[85vh] gap-4 overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2 pr-6">
            <div>
              <DialogTitle>Destinataires</DialogTitle>
              <p className="text-xs text-muted-foreground">
                {activeCount} actif{activeCount > 1 ? 's' : ''} sur{' '}
                {recipients.length}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowAdd(true)
                setMessage('')
              }}
            >
              <Plus />
              Ajouter
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {message && (
            <div
              className={cn(
                'rounded-lg px-3 py-2 text-xs',
                message.includes('Erreur') || message.includes('requis')
                  ? 'bg-destructive/10 text-destructive'
                  : 'bg-emerald-500/10 text-emerald-500',
              )}
            >
              {message}
            </div>
          )}

          {/* Formulaire d'ajout inline */}
          {showAdd && (
            <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">
                    Nom
                  </label>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Direction"
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">
                    Email
                  </label>
                  <Input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="nom@okkohotels.com"
                    className="h-8 text-sm"
                  />
                </div>
              </div>
              <TypeToggle value={newType} onChange={setNewType} />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleAdd}>
                  Ajouter
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowAdd(false)}
                >
                  Annuler
                </Button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          ) : recipients.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Aucun destinataire.
            </p>
          ) : (
            <>
              {toRecipients.length > 0 && (
                <div>
                  <p className="mb-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                    Destinataires ({toRecipients.length})
                  </p>
                  <div className="divide-y divide-border">
                    {toRecipients.map(renderRow)}
                  </div>
                </div>
              )}

              {ccRecipients.length > 0 && (
                <div>
                  <p className="mb-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                    En copie — CC ({ccRecipients.length})
                  </p>
                  <div className="divide-y divide-border">
                    {ccRecipients.map(renderRow)}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
