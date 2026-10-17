import { messageConnexion } from '#/lib/auth/messages.ts'

/*
 * Changement de mot de passe depuis /profil (audit du 2026-10-17) : le
 * mot de passe ACTUEL est exigé avant `updateUser({ password })`. Sans cela,
 * une session laissée ouverte sur le poste partagé de la réception suffisait
 * à changer le mot de passe du compte et à en évincer le titulaire.
 *
 * Vérification par `signInWithPassword` avec l'e-mail du compte. En cas
 * d'échec, auth-js ne touche PAS à la session en cours ; en cas de succès,
 * il la remplace par une session du MÊME compte (SIGNED_IN, même id : la
 * revalidation bornée d'AuthContext, rien de plus).
 */

export interface ClientVerification {
  signInWithPassword: (identifiants: {
    email: string
    password: string
  }) => Promise<{ error: unknown }>
}

export type VerificationMotDePasse =
  { ok: true } | { ok: false; message: string }

const ACTUEL_INCORRECT =
  'Mot de passe actuel incorrect : mot de passe non modifié.'

/** Message d'un échec de vérification du mot de passe actuel. */
export function messageMotDePasseActuel(err: unknown): string {
  // Panne, trop de tentatives : mêmes messages que la page de connexion ;
  // tout autre refus (invalid_credentials) = mot de passe actuel faux.
  const message = messageConnexion(err)
  return message === 'Email ou mot de passe incorrect'
    ? ACTUEL_INCORRECT
    : message
}

/** Vérifie le mot de passe actuel du compte ; ne lève jamais. */
export async function verifierMotDePasseActuel(
  client: ClientVerification,
  email: string | null | undefined,
  motDePasse: string,
): Promise<VerificationMotDePasse> {
  if (motDePasse === '') {
    return {
      ok: false,
      message: 'Saisissez votre mot de passe actuel pour le modifier.',
    }
  }
  if (!email) {
    return {
      ok: false,
      message: 'Compte sans adresse e-mail : mot de passe non modifié.',
    }
  }
  try {
    const { error } = await client.signInWithPassword({
      email,
      password: motDePasse,
    })
    return error
      ? { ok: false, message: messageMotDePasseActuel(error) }
      : { ok: true }
  } catch (err) {
    return { ok: false, message: messageMotDePasseActuel(err) }
  }
}
