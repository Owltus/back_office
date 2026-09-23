import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'

import { PageContainer } from '#/components/shared/PageContainer.tsx'
import { FormeProfil } from '#/components/shared/skeleton/PageShapes.tsx'
import { PasswordInput } from '#/components/repjour/PasswordInput.tsx'
import { useAuth } from '#/components/auth/AuthContext.tsx'
import {
  movedBy,
  PageOrderList,
} from '#/components/comptes/PageOrderList.tsx'
import { orderedPages } from '#/lib/permissions/navigation.ts'
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
  const { user, profile, permissions, grade, refreshProfile, applyPageOrder } =
    useAuth()
  // Hydratation immédiate depuis le profil déjà en cache (évite le flash de
  // formulaire vide au premier frame) ; l'effet ci-dessous re-synchronise si le
  // profil arrive après coup (chargement en arrière-plan).
  const [firstName, setFirstName] = useState(() => profile?.first_name ?? '')
  const [lastName, setLastName] = useState(() => profile?.last_name ?? '')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

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
        if (newPassword !== confirmNewPassword) {
          setMessage('Les mots de passe ne correspondent pas')
          setSaving(false)
          return
        }
        const { error: pwError } = await supabase.auth.updateUser({
          password: newPassword,
        })
        if (pwError) throw pwError
        setNewPassword('')
        setConfirmNewPassword('')
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

  // Ordre de MES pages — la tête est ma page d'accueil. Écriture directe sur ma
  // propre ligne : la policy `Users update own profile` l'autorise déjà (elle
  // ne fige que `role` et `email`), aucune RPC n'est nécessaire.
  //
  // OPTIMISTE : la liste et la barre de navigation se réorganisent AU CLIC, pas
  // à la réponse du serveur — attendre l'aller-retour donnait une interface qui
  // semblait ne rien faire pendant une demi-seconde. En cas d'échec, on remet
  // l'ordre précédent et on le dit. Même schéma que la saisie PDJ et le
  // planning parking.
  const myPages = orderedPages(permissions, grade, profile?.page_order)
  const moveMyPage = (index: number, delta: -1 | 1) => {
    if (!user) return
    const previous = profile?.page_order ?? null
    const next = movedBy(
      myPages.map((p) => p.key),
      index,
      delta,
    )
    applyPageOrder(next)
    setMessage('')
    void supabase
      .from('profiles')
      .update({ page_order: next })
      .eq('id', user.id)
      .then(({ error }) => {
        if (error) {
          applyPageOrder(previous)
          setMessage("Erreur : l'ordre des pages n'a pas pu être enregistré")
        }
      })
  }

  const isError =
    message.includes('Erreur') ||
    message.includes('critères') ||
    message.includes('correspondent')
  // Profil pas encore chargé (chargement en arrière-plan) : squelette-reflet
  // plutôt qu'une carte d'identité vide (initiales « ? », nom « — »).
  //
  // ⚠ DÉLÈGUE à `FormeProfil` depuis le 2026-09-24. Les deux silhouettes de
  // cette page étaient toutes deux incomplètes, chacune à sa façon : celle du
  // squelette de route dessinait un PageHeader que la page ne rend PAS (ligne
  // fantôme de 36 px) et n'avait qu'une carte de formulaire sur trois ; celle
  // qui vivait ici oubliait la carte « Ordre de mes pages ». Une seule, et
  // complète.
  if (!profile) {
    return (
      <PageContainer>
        <FormeProfil />
      </PageContainer>
    )
  }

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

        {/* Ordre de mes pages */}
        <div className="space-y-4 rounded-xl border border-border bg-card p-6">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Ordre de mes pages
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              La première page de la liste est celle qui s'ouvre à la connexion.
              L'ordre s'applique aussi à la barre de navigation.
            </p>
          </div>
          <PageOrderList pages={myPages} onMove={moveMyPage} />
        </div>

        {/* Mot de passe */}
        <div className="space-y-4 rounded-xl border border-border bg-card p-6">
          <h2 className="text-sm font-semibold text-foreground">
            Modifier le mot de passe
          </h2>
          <PasswordInput
            value={newPassword}
            onChange={setNewPassword}
            confirmValue={confirmNewPassword}
            onConfirmChange={setConfirmNewPassword}
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
