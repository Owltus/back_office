import { isOutageError } from '#/lib/backendHealth.ts'

/*
 * Messages d'authentification pour l'utilisateur (revue du 2026-09-28).
 *
 * Avant : toute erreur de connexion devenait « Email ou mot de passe
 * incorrect » — pendant une panne, le personnel croyait son mot de passe
 * faux ; et les refus de GoTrue sur le profil s'affichaient en anglais, en
 * VERT (la couleur se devinait au texte).
 */

interface ErreurAuth {
  status?: unknown
  code?: unknown
}

function champs(err: unknown): ErreurAuth {
  return typeof err === 'object' && err !== null ? err : {}
}

/** Message d'un échec de connexion. */
export function messageConnexion(err: unknown): string {
  if (isOutageError(err)) {
    return 'Service injoignable pour le moment. Réessayez dans un instant.'
  }
  const { status, code } = champs(err)
  if (status === 429 || code === 'over_request_rate_limit') {
    return 'Trop de tentatives. Patientez quelques minutes.'
  }
  return 'Email ou mot de passe incorrect'
}

/** Message d'un refus de changement de mot de passe par le serveur. */
export function messageMotDePasse(err: unknown): string {
  if (isOutageError(err)) {
    return 'Service injoignable : mot de passe non modifié. Réessayez.'
  }
  const { code } = champs(err)
  if (code === 'same_password') {
    return 'Le nouveau mot de passe doit être différent de l’ancien.'
  }
  if (code === 'weak_password') {
    return 'Mot de passe refusé : trop faible ou trop courant.'
  }
  if (code === 'reauthentication_needed') {
    return 'Reconnectez-vous avant de changer de mot de passe.'
  }
  return 'Mot de passe non modifié. Réessayez.'
}
