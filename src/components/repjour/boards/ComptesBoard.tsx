import { useEffect, useState } from 'react'
import { Loader2, Plus, Trash2 } from 'lucide-react'

import { PageContainer } from '#/components/shared/PageContainer.tsx'
import { useAuth } from '#/components/auth/AuthContext.tsx'
import { supabase } from '#/lib/supabase.ts'
import { supabaseSignup } from '#/lib/repjour/supabase-signup.ts'
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
 * Trois opérations d'écriture, reprises À L'IDENTIQUE de la source :
 *   1. CRÉATION : `supabaseSignup.auth.signUp()` (second client, storageKey
 *      distinct, cf. supabase-signup.ts) PUIS insert dans `profiles`. Le signUp
 *      passe par le client de signup pour NE PAS écraser la session de l'admin.
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
    setCreating(true)
    setMessage('')
    try {
      const displayName =
        [firstName, lastName].filter(Boolean).join(' ') || email.split('@')[0]

      // signUp via le CLIENT DE SIGNUP (storageKey distinct) : ne touche PAS à
      // la session de l'admin courant.
      const { data, error } = await supabaseSignup.auth.signUp({
        email,
        password,
        options: { data: { display_name: displayName } },
      })
      if (error) throw error
      if (!data.user) throw new Error('Utilisateur non créé')

      const { error: profileError } = await supabase.from('profiles').insert({
        id: data.user.id,
        email,
        display_name: displayName,
        first_name: firstName,
        last_name: lastName,
        role,
      })
      if (profileError)
        throw new Error('Compte créé mais profil échoué : ' + profileError.message)

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
        `Supprimer le compte de ${name} ? Cela retire son accès au Back Office.`,
      )
    )
      return
    setDeleting(true)
    setMessage('')
    // Supprime la ligne `profiles` (RLS « Admin manages profiles » FOR ALL) :
    // l'utilisateur perd son rôle, donc tout accès. NB : l'identifiant de
    // connexion (auth.users) n'est PAS supprimable avec la clé anon — cela
    // exigerait la clé service_role (interdite côté client) ou le dashboard.
    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('id', editProfile.id)
    if (error) {
      setMessage('Erreur suppression : ' + error.message)
      setDeleting(false)
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

  const isError =
    message.includes('Erreur') ||
    message.includes('requis') ||
    message.includes('critères')

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
