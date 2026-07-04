import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'

import { useAuth } from '#/components/auth/AuthContext.tsx'
import { Logo } from '#/components/Logo.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Label } from '#/components/ui/label.tsx'

export const Route = createFileRoute('/login')({
  component: LoginPage,
  head: () => ({ meta: [{ title: 'Connexion — Back Office' }] }),
})

function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { signIn, user } = useAuth()
  const navigate = useNavigate()

  // Dès qu'une session existe (déjà connecté au montage, ou après une connexion
  // réussie), on quitte la page de login vers l'accueil de l'application.
  // L'authentification globale suffit ici : pas besoin d'attendre le rôle.
  useEffect(() => {
    if (user) {
      navigate({ to: '/', replace: true })
    }
  }, [user, navigate])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await signIn(email, password)
    } catch {
      setError('Email ou mot de passe incorrect')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-4">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
            <Logo className="size-8" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Back Office</h1>
        </div>

        <div className="rounded-2xl border border-border bg-card p-7 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="email">Adresse email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nom@okkohotels.com"
                autoComplete="email"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Mot de passe</Label>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="rounded-lg bg-destructive/10 px-3 py-2.5 text-center text-sm text-destructive">
                {error}
              </div>
            )}

            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Connexion…
                </>
              ) : (
                'Se connecter'
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
