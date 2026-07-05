import { useEffect, useState } from 'react'
import { Loader2, Plus, Trash2 } from 'lucide-react'

import { PageContainer } from '#/components/shared/PageContainer.tsx'
import { useAuth } from '#/components/auth/AuthContext.tsx'
import { supabase } from '#/lib/supabase.ts'
import { isPasswordValid } from '#/lib/repjour/password.ts'
import { ROLE_LABELS } from '#/lib/repjour/roles.ts'
import type { Profile, UserRole } from '#/lib/repjour/types.ts'
import { PasswordInput } from '#/components/repjour/PasswordInput.tsx'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog.tsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Button } from '#/components/ui/button.tsx'

/*
 * Gestion des comptes (admin) — porté de la source AccountsPage.
 *
 * Trois opérations d'écriture :
 *   1. CRÉATION : Edge Function `create-user` (service_role côté serveur) PUIS
 *      insert dans `profiles`. L'inscription publique Supabase reste DÉSACTIVÉE :
 *      la fonction crée l'identifiant `auth.users` via l'API Admin et vérifie
 *      côté serveur que l'appelant est admin (cf. supabase/functions/create-user).
 *      L'insert `profiles` reste ici, sous la session de l'admin, pour garder le
 *      trigger anti-escalade de rôle sur son chemin habituel.
 *   2. ÉDITION : update de la ligne `profiles`.
 *   3. MOT DE PASSE : RPC serveur `admin_update_password` (CONSOMMÉE, jamais
 *      redéfinie ; le trigger anti-escalade de rôle reste intact côté base).
 *
 * Aucun DDL. La clé anon reste soumise aux RLS ; le gating admin de la route est
 * ergonomique, la sécurité réelle est la RLS Supabase.
 *
 * Restylé du thème CLAIR source vers le thème DARK du Back Office (tokens shadcn,
 * modale custom → shadcn Dialog, <select> → shadcn Select).
 */

const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  utilisateur: 'Lecture seule',
  super_utilisateur: 'Import + lecture',
  admin: 'Accès complet',
}

const ROLES: UserRole[] = ['utilisateur', 'super_utilisateur', 'admin']

// L'erreur d'une Edge Function (FunctionsHttpError) porte le corps de la réponse
// dans `context` (un objet Response). On en extrait le message métier `{ error }`
// pour l'afficher tel quel plutôt qu'un « Edge Function returned a non-2xx… ».
// Partagé par la création (`create-user`) et la révocation (`delete-user`).
async function readFunctionError(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response }).context
  if (ctx && typeof ctx.json === 'function') {
    try {
      const parsed = (await ctx.json()) as { error?: string }
      if (parsed.error) return parsed.error
    } catch {
      // corps non-JSON : on retombe sur le message générique ci-dessous
    }
  }
  return error instanceof Error ? error.message : 'Opération échouée'
}

function RoleSelect({
  value,
  onChange,
}: {
  value: UserRole
  onChange: (v: UserRole) => void
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as UserRole)}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ROLES.map((r) => (
          <SelectItem key={r} value={r}>
            {ROLE_LABELS[r]} — {ROLE_DESCRIPTIONS[r]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function ComptesBoard() {
  const { user } = useAuth()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [deleting, setDeleting] = useState(false)

  const [showCreate, setShowCreate] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [role, setRole] = useState<UserRole>('utilisateur')
  const [creating, setCreating] = useState(false)

  const [editProfile, setEditProfile] = useState<Profile | null>(null)
  const [editForm, setEditForm] = useState({
    first_name: '',
    last_name: '',
    role: 'utilisateur' as UserRole,
  })
  const [editPassword, setEditPassword] = useState('')
  const [confirmEditPassword, setConfirmEditPassword] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  async function loadProfiles() {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: true })
    setProfiles(data || [])
    setLoading(false)
  }

  useEffect(() => {
    loadProfiles()
  }, [])

  const resetCreate = () => {
    setEmail('')
    setPassword('')
    setConfirmPassword('')
    setFirstName('')
    setLastName('')
    setRole('utilisateur')
    setMessage('')
  }

  const handleCreate = async () => {
    if (!email || !password) {
      setMessage('Email et mot de passe requis')
      return
    }
    if (!isPasswordValid(password)) {
      setMessage('Le mot de passe ne respecte pas les critères')
      return
    }
    if (password !== confirmPassword) {
      setMessage('Les mots de passe ne correspondent pas')
      return
    }
    setCreating(true)
    setMessage('')
    try {
      // Email normalisé (minuscule) pour aligner `auth.users` et `profiles`.
      const normalizedEmail = email.trim().toLowerCase()
      const displayName =
        [firstName, lastName].filter(Boolean).join(' ') ||
        normalizedEmail.split('@')[0]

      // Création du compte via l'Edge Function admin (service_role côté serveur).
      // Fonctionne alors que l'inscription publique reste DÉSACTIVÉE, et n'est
      // accessible qu'aux admins (contrôle côté serveur). `functions.invoke`
      // transmet automatiquement le JWT de la session de l'admin.
      const { data, error } = await supabase.functions.invoke<{
        userId: string
      }>('create-user', {
        body: { email: normalizedEmail, password, displayName },
      })
      if (error) throw new Error(await readFunctionError(error))
      if (!data?.userId) throw new Error('Utilisateur non créé')

      const { error: profileError } = await supabase.from('profiles').insert({
        id: data.userId,
        email: normalizedEmail,
        display_name: displayName,
        first_name: firstName,
        last_name: lastName,
        role,
      })
      if (profileError) {
        // Compte auth créé mais profil KO → on annule le compte orphelin côté
        // serveur (best-effort) pour ne pas bloquer un nouvel essai (409).
        try {
          await supabase.functions.invoke('create-user', {
            body: { rollbackUserId: data.userId },
          })
        } catch {
          // annulation impossible : l'orphelin persiste, le réessai le signalera
        }
        throw new Error(
          'Profil non créé (' +
            profileError.message +
            '). Compte annulé, réessayez.',
        )
      }

      resetCreate()
      setShowCreate(false)
      setMessage(`Compte créé pour ${displayName}`)
      loadProfiles()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setCreating(false)
    }
  }

  const openEdit = (p: Profile) => {
    setEditProfile(p)
    setEditForm({
      first_name: p.first_name || '',
      last_name: p.last_name || '',
      role: p.role,
    })
    setEditPassword('')
    setConfirmEditPassword('')
    setMessage('')
  }

  const saveEdit = async () => {
    if (!editProfile) return
    setSavingEdit(true)
    setMessage('')

    const displayName =
      [editForm.first_name, editForm.last_name].filter(Boolean).join(' ') ||
      editProfile.display_name

    const { error } = await supabase
      .from('profiles')
      .update({
        first_name: editForm.first_name,
        last_name: editForm.last_name,
        display_name: displayName,
        role: editForm.role,
      })
      .eq('id', editProfile.id)

    if (error) {
      setMessage('Erreur profil : ' + error.message)
      setSavingEdit(false)
      return
    }

    if (editPassword.trim()) {
      if (!isPasswordValid(editPassword)) {
        setMessage('Le mot de passe ne respecte pas les critères')
        setSavingEdit(false)
        return
      }
      if (editPassword !== confirmEditPassword) {
        setMessage('Les mots de passe ne correspondent pas')
        setSavingEdit(false)
        return
      }
      // Changement de mot de passe par un admin : RPC serveur consommée
      // (jamais redéfinie ici).
      const { error: pwError } = await supabase.rpc('admin_update_password', {
        target_user_id: editProfile.id,
        new_password: editPassword,
      })
      if (pwError) {
        setMessage('Erreur mot de passe : ' + pwError.message)
        setSavingEdit(false)
        return
      }
    }

    setSavingEdit(false)
    setEditProfile(null)
    loadProfiles()
  }

  const handleDelete = async () => {
    if (!editProfile) return
    // Garde-fou : on ne supprime jamais son propre compte (évite l'auto-exclusion).
    if (editProfile.id === user?.id) {
      setMessage('Vous ne pouvez pas supprimer votre propre compte')
      return
    }
    const name =
      [editProfile.first_name, editProfile.last_name]
        .filter(Boolean)
        .join(' ') ||
      editProfile.display_name ||
      editProfile.email
    if (
      !window.confirm(
        `Supprimer le compte de ${name} ? Il ne pourra plus se connecter (accès révoqué).`,
      )
    )
      return
    setDeleting(true)
    setMessage('')
    // 1) Révocation de l'accès via l'Edge Function `delete-user` (service_role
    //    côté serveur) : elle bannit l'identité `auth.users`. Un simple delete de
    //    `profiles` laisserait l'identifiant de connexion actif → l'utilisateur
    //    pourrait toujours se connecter (c'était le bug).
    const { error } = await supabase.functions.invoke('delete-user', {
      body: { userId: editProfile.id },
    })
    if (error) {
      setMessage('Erreur suppression : ' + (await readFunctionError(error)))
      setDeleting(false)
      return
    }
    // 2) Accès coupé → on retire la ligne `profiles` sous la session admin (RLS
    //    « Admin manages profiles »), pour que le compte quitte la gestion. Si ce
    //    retrait échoue, l'accès reste révoqué (le ban précède) ; un réessai est
    //    sans danger (ban idempotent).
    const { error: profileErr } = await supabase
      .from('profiles')
      .delete()
      .eq('id', editProfile.id)
    if (profileErr) {
      setMessage(
        'Accès révoqué, mais retrait du profil échoué : ' + profileErr.message,
      )
      setDeleting(false)
      loadProfiles()
      return
    }
    setDeleting(false)
    setEditProfile(null)
    loadProfiles()
  }

  const badgeClass = (r: UserRole) =>
    r === 'admin'
      ? 'bg-primary/10 text-primary'
      : r === 'super_utilisateur'
        ? 'bg-cyan-400/10 text-cyan-400'
        : 'bg-muted text-muted-foreground'

  // Le seul message de succès commence par « Compte créé pour » ; tout le reste
  // (validation, erreurs serveur, annulation) est une erreur → style rouge.
  const isError = !message.startsWith('Compte créé pour')

  return (
    <PageContainer>
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-foreground">Comptes</h1>
          <Button
            onClick={() => {
              resetCreate()
              setShowCreate(true)
            }}
          >
            <Plus />
            Ajouter un compte
          </Button>
        </div>

        {/* Feedback hors modale (ex. « Compte créé pour … » après fermeture de
            la modale de création, dont le message interne n'est plus visible). */}
        {message && !showCreate && !editProfile && (
          <div
            className={`rounded-lg px-4 py-2.5 text-sm ${
              isError
                ? 'bg-destructive/10 text-destructive'
                : 'bg-emerald-500/10 text-emerald-500'
            }`}
          >
            {message}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="size-8 animate-spin text-primary" />
          </div>
        ) : profiles.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
            Aucun compte. Cliquez sur « Ajouter un compte » pour commencer.
          </div>
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {profiles.map((p) => (
              <button
                key={p.id}
                onClick={() => openEdit(p)}
                className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-accent/40"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {[p.first_name, p.last_name].filter(Boolean).join(' ') ||
                      p.display_name ||
                      '(sans nom)'}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {p.email}
                  </p>
                </div>
                <span
                  className={`ml-3 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${badgeClass(
                    p.role,
                  )}`}
                >
                  {ROLE_LABELS[p.role]}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Modale de création */}
      <Dialog
        open={showCreate}
        onOpenChange={(o) => {
          if (!o) setShowCreate(false)
        }}
      >
        <DialogContent className="max-h-[90vh] gap-4 overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nouveau compte</DialogTitle>
          </DialogHeader>

          {message && (
            <div
              className={`rounded-lg px-4 py-2.5 text-sm ${
                isError
                  ? 'bg-destructive/10 text-destructive'
                  : 'bg-emerald-500/10 text-emerald-500'
              }`}
            >
              {message}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">
                Prénom
              </label>
              <Input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Jean"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">
                Nom
              </label>
              <Input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Dupont"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm text-muted-foreground">
              Email
            </label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nom@okkohotels.com"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-muted-foreground">
              Mot de passe
            </label>
            <PasswordInput
              value={password}
              onChange={setPassword}
              confirmValue={confirmPassword}
              onConfirmChange={setConfirmPassword}
              placeholder="Mot de passe"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-muted-foreground">
              Rôle d'accès
            </label>
            <RoleSelect value={role} onChange={setRole} />
          </div>

          <DialogFooter className="pt-2">
            <Button variant="ghost" onClick={() => setShowCreate(false)}>
              Annuler
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? 'Création...' : 'Créer le compte'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modale d'édition */}
      <Dialog
        open={!!editProfile}
        onOpenChange={(o) => {
          if (!o) setEditProfile(null)
        }}
      >
        <DialogContent className="max-h-[90vh] gap-4 overflow-y-auto sm:max-w-lg">
          {editProfile && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {[editProfile.first_name, editProfile.last_name]
                    .filter(Boolean)
                    .join(' ') || editProfile.email}
                </DialogTitle>
              </DialogHeader>

              {message && (
                <div className="rounded-lg bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
                  {message}
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                {editProfile.email}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm text-muted-foreground">
                    Prénom
                  </label>
                  <Input
                    type="text"
                    value={editForm.first_name}
                    onChange={(e) =>
                      setEditForm({ ...editForm, first_name: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-muted-foreground">
                    Nom
                  </label>
                  <Input
                    type="text"
                    value={editForm.last_name}
                    onChange={(e) =>
                      setEditForm({ ...editForm, last_name: e.target.value })
                    }
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm text-muted-foreground">
                  Rôle d'accès
                </label>
                <RoleSelect
                  value={editForm.role}
                  onChange={(v) => setEditForm({ ...editForm, role: v })}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-muted-foreground">
                  Nouveau mot de passe
                </label>
                <PasswordInput
                  value={editPassword}
                  onChange={setEditPassword}
                  confirmValue={confirmEditPassword}
                  onConfirmChange={setConfirmEditPassword}
                  placeholder="Laisser vide pour ne pas changer"
                  optional
                />
              </div>

              <DialogFooter className="pt-2 sm:justify-between">
                {editProfile.id !== user?.id ? (
                  <Button
                    variant="destructive"
                    onClick={handleDelete}
                    disabled={savingEdit || deleting}
                  >
                    <Trash2 />
                    {deleting ? 'Suppression...' : 'Supprimer'}
                  </Button>
                ) : (
                  <span />
                )}
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => setEditProfile(null)}>
                    Annuler
                  </Button>
                  <Button onClick={saveEdit} disabled={savingEdit}>
                    {savingEdit ? 'Enregistrement...' : 'Enregistrer'}
                  </Button>
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </PageContainer>
  )
}
