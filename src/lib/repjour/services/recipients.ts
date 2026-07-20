import { emailSchema } from '#/lib/shared/email.ts'
import { supabase } from '#/lib/supabase.ts'

/*
 * CRUD des destinataires email (table `email_recipients`).
 *
 * `fetchRecipients` est en LECTURE (utilisé par email.ts pour préremplir le
 * mailto). Les écritures (`addRecipient`, `updateRecipient`, `deleteRecipient`)
 * sont les SEULES écritures Supabase de l'étape 9 ; elles sont soumises aux RLS
 * Supabase (page RepJour « gestion » depuis le durcissement du 2026-07-20).
 * Aucun DDL.
 *
 * VALIDATION : le format de l'adresse est vérifié AVANT chaque écriture. Une
 * valeur contenant ? & # ; ou , détournerait le mailto: construit dans email.ts
 * (pentest 2026-07-20, finding 5). La base porte la même contrainte en CHECK —
 * c'est elle qui fait foi, cette validation ne fait qu'éviter l'aller-retour.
 */

export type RecipientType = 'to' | 'cc'

export interface EmailRecipient {
  id: number
  email: string
  name: string
  type: RecipientType
  active: boolean
}

export async function fetchRecipients(): Promise<EmailRecipient[]> {
  const { data, error } = await supabase
    .from('email_recipients')
    .select('*')
    .order('name', { ascending: true })
  // On ne relance pas : l'appelant (sendReport) doit pouvoir ouvrir le client
  // mail même sans liste. Mais on ne l'avale plus en silence — un refus RLS
  // renverrait sinon une liste vide indiscernable d'une table vide.
  if (error) console.error('Lecture des destinataires refusée :', error.message)
  return data || []
}

export async function addRecipient(
  email: string,
  name: string,
  type: RecipientType = 'to',
): Promise<void> {
  const parsed = emailSchema.safeParse(email)
  if (!parsed.success) throw new Error('Adresse email invalide')
  const { error } = await supabase
    .from('email_recipients')
    .insert({ email: parsed.data, name: name.trim(), type })
  if (error) throw error
}

export async function updateRecipient(
  id: number,
  updates: Partial<EmailRecipient>,
): Promise<void> {
  const next = { ...updates }
  // `updates` est partiel : ne valider que si l'adresse fait partie du patch
  // (un simple bascule de `active` ne doit pas exiger de revalider l'email).
  if (next.email !== undefined) {
    const parsed = emailSchema.safeParse(next.email)
    if (!parsed.success) throw new Error('Adresse email invalide')
    next.email = parsed.data
  }
  const { error } = await supabase
    .from('email_recipients')
    .update(next)
    .eq('id', id)
  if (error) throw error
}

export async function deleteRecipient(id: number): Promise<void> {
  const { error } = await supabase
    .from('email_recipients')
    .delete()
    .eq('id', id)
  if (error) throw error
}
