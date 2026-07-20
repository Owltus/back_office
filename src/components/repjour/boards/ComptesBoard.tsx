import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'

import { PageContainer } from '#/components/shared/PageContainer.tsx'
import { PageHeader } from '#/components/shared/PageHeader.tsx'
import { SkeletonList } from '#/components/shared/skeleton/SkeletonList.tsx'
import { Tip } from '#/components/shared/Tip.tsx'
import { useAuth } from '#/components/auth/AuthContext.tsx'
import { supabase } from '#/lib/supabase.ts'
import { isPasswordValid } from '#/lib/repjour/password.ts'
import type { Profile } from '#/lib/repjour/types.ts'
import {
  GRADES,
  GRADE_LABELS,
  LEVEL_LABELS,
  PAGES,
  gradeOf,
} from '#/lib/permissions/index.ts'
import type {
  Grade,
  PageKey,
  PageLevel,
  PagePermissions,
} from '#/lib/permissions/index.ts'
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
 * Gestion des comptes (admin) — grades + droits PAR PAGE.
 *
 * Deux grades : `admin` (accès total partout + administration) et `utilisateur`
 * (accès défini page par page). Pour un utilisateur, l'admin ouvre chaque page
 * de la navbar à un niveau (Lecture / Écriture / Gestion) via la matrice.
 *
 * Écritures :
 *   1. CRÉATION : Edge Function `create-user` (service_role) PUIS insert
 *      `profiles` (grade `utilisateur` par défaut, AUCUNE permission — l'admin
 *      les ouvre ensuite en modifiant le compte). L'inscription publique reste
 *      DÉSACTIVÉE.
 *   2. GRADE : RPC serveur `set_user_grade` (gardée admin). Les noms restent un
 *      update direct de `profiles`.
 *   3. DROITS PAR PAGE : RPC `set_page_permission` / `remove_page_permission`
 *      (gardées admin), appliquées IMMÉDIATEMENT à chaque changement.
 *   4. MOT DE PASSE : RPC serveur `admin_update_password` (consommée).
 *
 * La sécurité réelle est la RLS Supabase ; ce gating d'UI est ergonomique.
 */

const GRADE_DESCRIPTIONS: Record<Grade, string> = {
  utilisateur: 'Accès défini page par page',
  admin: 'Accès total à toutes les pages',
}

// L'erreur d'une Edge Function (FunctionsHttpError) porte le corps de la réponse
// dans `context` (un objet Response). On en extrait le message métier `{ error }`
// pour l'afficher tel quel plutôt qu'un « Edge Function returned a non-2xx… ».
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

function GradeSelect({
  value,
  onChange,
}: {
  value: Grade
  onChange: (v: Grade) => void
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as Grade)}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {GRADES.map((g) => (
          <SelectItem key={g} value={g}>
            {GRADE_LABELS[g]} — {GRADE_DESCRIPTIONS[g]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** Une ligne de la matrice : une page + un sélecteur de niveau (ou « aucun »). */
function PermRow({
  page,
  level,
  disabled,
  onChange,
}: {
  page: (typeof PAGES)[number]
  level: PageLevel | undefined
  disabled: boolean
  onChange: (next: PageLevel | null) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <page.icon className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate text-sm text-foreground">{page.label}</span>
      </div>
      <Select
        value={level ?? 'none'}
        disabled={disabled}
        onValueChange={(v) => onChange(v === 'none' ? null : (v as PageLevel))}
      >
        <SelectTrigger className="w-40 shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Aucun accès</SelectItem>
          <SelectItem value="lecture">{LEVEL_LABELS.lecture}</SelectItem>
          <SelectItem value="ecriture">{LEVEL_LABELS.ecriture}</SelectItem>
          <SelectItem value="gestion">{LEVEL_LABELS.gestion}</SelectItem>
        </SelectContent>
      </Select>
    </div>
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
  const [grade, setGrade] = useState<Grade>('utilisateur')
  const [creating, setCreating] = useState(false)

  const [editProfile, setEditProfile] = useState<Profile | null>(null)
  const [editForm, setEditForm] = useState({
    first_name: '',
    last_name: '',
    grade: 'utilisateur' as Grade,
  })
  const [editPerms, setEditPerms] = useState<PagePermissions>({})
  const [permBusy, setPermBusy] = useState<PageKey | null>(null)
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
    setGrade('utilisateur')
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

      // Grade à la création (aucune permission par page : l'admin les ouvre
      // ensuite en modifiant le compte).
      const { error: profileError } = await supabase.from('profiles').insert({
        id: data.userId,
        email: normalizedEmail,
        display_name: displayName,
        first_name: firstName,
        last_name: lastName,
        role: grade,
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

  const openEdit = async (p: Profile) => {
    setEditProfile(p)
    setEditForm({
      first_name: p.first_name || '',
      last_name: p.last_name || '',
      grade: gradeOf(p.role),
    })
    setEditPerms({})
    setEditPassword('')
    setConfirmEditPassword('')
    setMessage('')
    // Droits par page du compte (l'admin les voit via la policy SELECT self-or-admin).
    const { data } = await supabase
      .from('user_page_permissions')
      .select('page, level')
      .eq('user_id', p.id)
    const map: PagePermissions = {}
    for (const row of (data ?? []) as Array<{ page: PageKey; level: PageLevel }>) {
      map[row.page] = row.level
    }
    setEditPerms(map)
  }

  // Applique IMMÉDIATEMENT un changement de droit sur une page (RPC serveur).
  const changePerm = async (pageKey: PageKey, next: PageLevel | null) => {
    if (!editProfile) return
    setPermBusy(pageKey)
    setMessage('')
    const { error } =
      next === null
        ? await supabase.rpc('remove_page_permission', {
            p_user: editProfile.id,
            p_page: pageKey,
          })
        : await supabase.rpc('set_page_permission', {
            p_user: editProfile.id,
            p_page: pageKey,
            p_level: next,
          })
    if (error) {
      setMessage('Erreur droits : ' + error.message)
    } else {
      setEditPerms((prev) => {
        const nextPerms = { ...prev }
        if (next === null) delete nextPerms[pageKey]
        else nextPerms[pageKey] = next
        return nextPerms
      })
    }
    setPermBusy(null)
  }

  const saveEdit = async () => {
    if (!editProfile) return
    setSavingEdit(true)
    setMessage('')

    const displayName =
      [editForm.first_name, editForm.last_name].filter(Boolean).join(' ') ||
      editProfile.display_name

    // 1. Noms (update direct de profiles).
    const { error } = await supabase
      .from('profiles')
      .update({
        first_name: editForm.first_name,
        last_name: editForm.last_name,
        display_name: displayName,
      })
      .eq('id', editProfile.id)

    if (error) {
      setMessage('Erreur profil : ' + error.message)
      setSavingEdit(false)
      return
    }

    // 2. Grade (canal serveur gardé) — seulement s'il a changé.
    if (gradeOf(editProfile.role) !== editForm.grade) {
      const { error: gradeError } = await supabase.rpc('set_user_grade', {
        p_user: editProfile.id,
        p_grade: editForm.grade,
      })
      if (gradeError) {
        setMessage('Erreur grade : ' + gradeError.message)
        setSavingEdit(false)
        return
      }
    }

    // 3. Mot de passe (optionnel).
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
    // Suppression définitive via l'Edge Function `delete-user` (service_role) :
    // elle retire la ligne `profiles` PUIS supprime l'identité `auth.users`. Un
    // simple delete de `profiles` laisserait l'identifiant de connexion actif →
    // l'utilisateur pourrait toujours se connecter (c'était le bug). Si des
    // données repjour bloquent la suppression dure, elle replie sur un ban et le
    // signale via `warning`.
    const { data, error } = await supabase.functions.invoke<{
      warning?: string
    }>('delete-user', {
      body: { userId: editProfile.id },
    })
    if (error) {
      setMessage('Erreur suppression : ' + (await readFunctionError(error)))
      setDeleting(false)
      return
    }
    setDeleting(false)
    setEditProfile(null)
    if (data?.warning) setMessage(data.warning)
    loadProfiles()
  }

  const badgeClass = (g: Grade) =>
    g === 'admin' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'

  // Le seul message de succès commence par « Compte créé pour » ; tout le reste
  // (validation, erreurs serveur, annulation) est une erreur → style rouge.
  const isError = !message.startsWith('Compte créé pour')

  return (
    <PageContainer>
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <PageHeader
          title="Comptes"
          actions={
            <Tip label="Créer un compte utilisateur">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  resetCreate()
                  setShowCreate(true)
                }}
              >
                <Plus />
                Ajouter un compte
              </Button>
            </Tip>
          }
        />

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
          <SkeletonList rows={6} />
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
                    gradeOf(p.role),
                  )}`}
                >
                  {GRADE_LABELS[gradeOf(p.role)]}
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
              Grade du compte
            </label>
            <GradeSelect value={grade} onChange={setGrade} />
            <p className="mt-1.5 text-xs text-muted-foreground">
              Les accès aux pages se règlent après création, en modifiant le
              compte.
            </p>
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
                  Grade du compte
                </label>
                <GradeSelect
                  value={editForm.grade}
                  onChange={(v) => setEditForm({ ...editForm, grade: v })}
                />
              </div>

              {/* Matrice des droits par page — uniquement pour un grade utilisateur
                  (un admin a « Gestion » partout par nature). Appliquée en direct. */}
              {editForm.grade === 'admin' ? (
                <div className="rounded-lg bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
                  Accès total à toutes les pages (administrateur).
                </div>
              ) : (
                <div className="space-y-2.5">
                  <label className="block text-sm text-muted-foreground">
                    Accès par page
                    <span className="ml-1 text-xs">
                      (appliqué immédiatement)
                    </span>
                  </label>
                  <div className="space-y-2 rounded-lg border border-border p-3">
                    {PAGES.map((page) => (
                      <PermRow
                        key={page.key}
                        page={page}
                        level={editPerms[page.key]}
                        disabled={permBusy === page.key}
                        onChange={(next) => changePerm(page.key, next)}
                      />
                    ))}
                  </div>
                </div>
              )}

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
