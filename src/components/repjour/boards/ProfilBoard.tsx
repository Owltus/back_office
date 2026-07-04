import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'

import { PageContainer } from '#/components/shared/PageContainer.tsx'
import { PasswordInput } from '#/components/repjour/PasswordInput.tsx'
import { useAuth } from '#/components/auth/AuthContext.tsx'
import { supabase } from '#/lib/supabase.ts'
import { isPasswordValid } from '#/lib/repjour/password.ts'
import { ROLE_LABELS } from '#/lib/repjour/roles.ts'
import { Input } from '#/components/ui/input.tsx'
import { Button } from '#/components/ui/button.tsx'

/*
 * Profil personnel (tous rôles) — porté de la source ProfilePage.
 *
 * Deux écritures, reprises À L'IDENTIQUE de la source :
 *   1. update de SA PROPRE ligne `profiles` (prénom / nom / display_name) ;
 *   2. changement de SON PROPRE mot de passe via `supabase.auth.updateUser`
 *      (self-service, PAS la RPC admin).
 *
 * S'appuie sur `useAuth` (user / profile / refreshProfile). Aucun DDL. Restylé
 * du thème CLAIR source vers le thème DARK du Back Office (tokens shadcn).
 */
export function ProfilBoard() {
  const { user, profile, refreshProfile } = useAuth()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    if (profile) {
      setFirstName(profile.first_name)
      setLastName(profile.last_name)
    }
  }, [profile])

  const initials = (profile?.display_name || profile?.email || '?')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const handleSave = async () => {
    if (!user) return
    setSaving(true)
    setMessage('')

    try {
      const displayName = `${firstName} ${lastName}`.trim()
      const { error } = await supabase
        .from('profiles')
        .update({
          first_name: firstName,
          last_name: lastName,
          display_name: displayName,
        })
        .eq('id', user.id)

      if (error) throw error

      if (newPassword.trim()) {
        if (!isPasswordValid(newPassword)) {
          setMessage('Le mot de passe ne respecte pas les critères')
          setSaving(false)
          return
        }
        const { error: pwError } = await supabase.auth.updateUser({
          password: newPassword,
        })
        if (pwError) throw pwError
        setNewPassword('')
      }

      await refreshProfile()
      setMessage('Profil mis à jour')
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : 'Erreur lors de la mise à jour',
      )
    } finally {
      setSaving(false)
    }
  }

  const isError = message.includes('Erreur') || message.includes('critères')

  return (
    <PageContainer>
      <div className="mx-auto w-full max-w-lg space-y-6">
        {/* Identité */}
        <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-6">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-full border-2 border-primary bg-background text-xl font-bold text-primary">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="truncate text-lg font-bold text-foreground">
              {profile?.display_name || '—'}
            </p>
            <p className="truncate text-sm text-muted-foreground">
              {profile?.email}
            </p>
            <span className="mt-1 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {profile?.role ? ROLE_LABELS[profile.role] : ''}
            </span>
          </div>
        </div>

        {/* Informations personnelles */}
        <div className="space-y-4 rounded-xl border border-border bg-card p-6">
          <h2 className="text-sm font-semibold text-foreground">
            Informations personnelles
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                Prénom
              </label>
              <Input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                Nom
              </label>
              <Input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Mot de passe */}
        <div className="space-y-4 rounded-xl border border-border bg-card p-6">
          <h2 className="text-sm font-semibold text-foreground">
            Modifier le mot de passe
          </h2>
          <PasswordInput
            value={newPassword}
            onChange={setNewPassword}
            placeholder="Nouveau mot de passe"
            optional
          />
        </div>

        {message && (
          <div
            className={`rounded-lg px-4 py-3 text-sm ${
              isError
                ? 'bg-destructive/10 text-destructive'
                : 'bg-emerald-500/10 text-emerald-500'
            }`}
          >
            {message}
          </div>
        )}

        <Button
          onClick={handleSave}
          disabled={saving}
          size="lg"
          className="w-full"
        >
          {saving && <Loader2 className="size-4 animate-spin" />}
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </Button>
      </div>
    </PageContainer>
  )
}
