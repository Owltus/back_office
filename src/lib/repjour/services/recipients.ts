import { emailSchema } from '#/lib/shared/email.ts'
import { supabase } from '#/lib/supabase.ts'

/*
 * CRUD des destinataires email, sous forme de FABRIQUE liée à une table.
 *
 * Une seule liste aujourd'hui : `server_report_recipients` → bouton « Envoyer
 * via serveur » (Resend, Edge Function send-report). La liste du mailto
 * (`email_recipients`, ex-app repjour) a été RETIRÉE le 2026-09-06 : bouton
 * « Envoyer par email » disparu de DashboardBoard, table droppée
 * (email_recipients_drop_2026-09-06.sql). La fabrique reste : un futur
 * second destinataire réutilise la même implémentation.
 *
 * `fetch` est en LECTURE (préremplissage). Les écritures (`add`/`update`/`remove`)
 * sont soumises aux RLS Supabase (page RepJour « gestion »). Aucun DDL.
 *
 * VALIDATION : le format de l'adresse est vérifié AVANT chaque écriture (une
 * valeur contenant ? & # ; ou , détournait l'ancien mailto:, pentest 2026-07-20,
 * finding 5). La base porte la même contrainte en CHECK — c'est elle qui fait
 * foi, cette validation évite l'aller-retour.
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

/** Destinataires de l'envoi serveur du RepJour (« Envoyer via serveur », Resend). */
export const serverReportRecipients = makeRecipientsService(
  'server_report_recipients',
)
