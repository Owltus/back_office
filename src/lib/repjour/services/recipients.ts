import { supabase } from '#/lib/supabase.ts'

/*
 * CRUD des destinataires email (table `email_recipients`).
 *
 * `fetchRecipients` est en LECTURE (utilisé par email.ts pour préremplir le
 * mailto). Les écritures (`addRecipient`, `updateRecipient`, `deleteRecipient`)
 * sont les SEULES écritures Supabase de l'étape 9 ; elles sont soumises aux RLS
 * Supabase (admin). Aucun DDL.
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
  const { data } = await supabase
    .from('email_recipients')
    .select('*')
    .order('name', { ascending: true })
  return data || []
}

export async function addRecipient(
  email: string,
  name: string,
  type: RecipientType = 'to',
): Promise<void> {
  const { error } = await supabase
    .from('email_recipients')
    .insert({ email, name, type })
  if (error) throw error
}

export async function updateRecipient(
  id: number,
  updates: Partial<EmailRecipient>,
): Promise<void> {
  const { error } = await supabase
    .from('email_recipients')
    .update(updates)
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
