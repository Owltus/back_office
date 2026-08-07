import { emailSchema } from '#/lib/shared/email.ts'
import { supabase } from '#/lib/supabase.ts'

/*
 * CRUD des destinataires email, sous forme de FABRIQUE liée à une table.
 *
 * Deux listes INDÉPENDANTES partagent exactement le même CRUD :
 *   - `email_recipients`         → bouton « Envoyer par email » (mailto, email.ts) ;
 *   - `server_report_recipients` → bouton « Envoyer via serveur » (Resend, Edge
 *     Function send-report).
 * Une seule implémentation, deux instances → aucune divergence de comportement.
 *
 * `fetch` est en LECTURE (préremplissage). Les écritures (`add`/`update`/`remove`)
 * sont soumises aux RLS Supabase (page RepJour « gestion »). Aucun DDL.
 *
 * VALIDATION : le format de l'adresse est vérifié AVANT chaque écriture. Pour
 * `email_recipients`, une valeur contenant ? & # ; ou , détournerait le mailto:
 * construit dans email.ts (pentest 2026-07-20, finding 5). La base porte la même
 * contrainte en CHECK — c'est elle qui fait foi, cette validation évite l'aller-retour.
 */

export type RecipientType = 'to' | 'cc'

export interface EmailRecipient {
  id: number
  email: string
  name: string
  type: RecipientType
  active: boolean
}

export interface RecipientsService {
  fetch: () => Promise<EmailRecipient[]>
  add: (email: string, name: string, type?: RecipientType) => Promise<void>
  update: (id: number, updates: Partial<EmailRecipient>) => Promise<void>
  remove: (id: number) => Promise<void>
}

/** Construit le CRUD des destinataires pour une table donnée. */
export function makeRecipientsService(table: string): RecipientsService {
  return {
    async fetch() {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .order('name', { ascending: true })
      // On ne relance pas : l'appelant doit pouvoir continuer même sans liste.
      // Mais on ne l'avale plus en silence — un refus RLS renverrait sinon une
      // liste vide indiscernable d'une table vide.
      if (error)
        console.error('Lecture des destinataires refusée :', error.message)
      return data || []
    },

    async add(email, name, type = 'to') {
      const parsed = emailSchema.safeParse(email)
      if (!parsed.success)
        throw new Error("Cette adresse email n'est pas valide.")
      const { error } = await supabase
        .from(table)
        .insert({ email: parsed.data, name: name.trim(), type })
      if (error) throw error
    },

    async update(id, updates) {
      const next = { ...updates }
      // `updates` est partiel : ne valider que si l'adresse fait partie du patch
      // (une simple bascule de `active` ne doit pas exiger de revalider l'email).
      if (next.email !== undefined) {
        const parsed = emailSchema.safeParse(next.email)
        if (!parsed.success)
          throw new Error("Cette adresse email n'est pas valide.")
        next.email = parsed.data
      }
      const { error } = await supabase.from(table).update(next).eq('id', id)
      if (error) throw error
    },

    async remove(id) {
      const { error } = await supabase.from(table).delete().eq('id', id)
      if (error) throw error
    },
  }
}

// --- Instances ---------------------------------------------------------------

/** Destinataires du mailto (« Envoyer par email »). */
export const emailRecipients = makeRecipientsService('email_recipients')

/** Destinataires de l'envoi serveur du RepJour (« Envoyer via serveur », Resend). */
export const serverReportRecipients = makeRecipientsService(
  'server_report_recipients',
)

/** Destinataires de l'envoi du PDJ par e-mail (Resend, send-report kind='pdj').
 * Liste INDÉPENDANTE de celle du RepJour — aucune adresse partagée. */
export const pdjReportRecipients = makeRecipientsService('pdj_report_recipients')

// --- Compat : les appelants historiques (email.ts, RecipientsModal) importent
// ces fonctions nommées, liées à `email_recipients`. Conservées à l'identique.
export const fetchRecipients = emailRecipients.fetch
export const addRecipient = emailRecipients.add
export const updateRecipient = emailRecipients.update
export const deleteRecipient = emailRecipients.remove
