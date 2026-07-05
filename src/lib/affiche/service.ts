import { supabase } from '#/lib/supabase.ts'
import type { AfficheTemplate } from '#/lib/affiche/model.ts'
import type { ColorKey } from '#/lib/poster/config.ts'

/*
 * Service d'accès Supabase pour les modèles d'affiche (table `affiche_templates`).
 *
 * Séparation nette entre la ligne DB (snake_case) et le modèle applicatif
 * (camelCase), avec des mappers purs. Convention d'erreur identique au parking :
 * `{ data, error }` → `if (error) throw error`, l'appelant (le board) `.catch()`.
 *
 * Lecture ouverte à tous les authentifiés ; écriture réservée aux rôles
 * super_utilisateur / admin (RLS, voir supabase/affiche_templates.sql).
 */

export const AFFICHE_TEMPLATES_TABLE = 'affiche_templates'

/** Ligne DB (snake_case), miroir exact des colonnes. */
export interface DbAfficheTemplate {
  id: string
  name: string
  icon: string
  color: ColorKey
  title_fr: string
  message_fr: string
  title_en: string
  message_en: string
  sort_order: number
}

/** DB → modèle applicatif. */
export function toAfficheTemplate(row: DbAfficheTemplate): AfficheTemplate {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    color: row.color,
    titleFr: row.title_fr,
    messageFr: row.message_fr,
    titleEn: row.title_en,
    messageEn: row.message_en,
  }
}

/** Modèle applicatif → ligne DB (insert). L'id est fourni par le client. */
export function toDbInsert(
  template: AfficheTemplate,
  sortOrder = 0,
): DbAfficheTemplate {
  return {
    id: template.id,
    name: template.name,
    icon: template.icon,
    color: template.color,
    title_fr: template.titleFr,
    message_fr: template.messageFr,
    title_en: template.titleEn,
    message_en: template.messageEn,
    sort_order: sortOrder,
  }
}

/** Patch applicatif (édition) → patch DB (colonnes touchées uniquement). */
export function toDbPatch(
  patch: Partial<Omit<AfficheTemplate, 'id'>>,
): Partial<Omit<DbAfficheTemplate, 'id'>> {
  const out: Partial<Omit<DbAfficheTemplate, 'id'>> = {}
  if (patch.name !== undefined) out.name = patch.name
  if (patch.icon !== undefined) out.icon = patch.icon
  if (patch.color !== undefined) out.color = patch.color
  if (patch.titleFr !== undefined) out.title_fr = patch.titleFr
  if (patch.messageFr !== undefined) out.message_fr = patch.messageFr
  if (patch.titleEn !== undefined) out.title_en = patch.titleEn
  if (patch.messageEn !== undefined) out.message_en = patch.messageEn
  return out
}

export async function fetchTemplates(): Promise<AfficheTemplate[]> {
  const { data, error } = await supabase
    .from(AFFICHE_TEMPLATES_TABLE)
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  if (error) throw error
  return (data as DbAfficheTemplate[]).map(toAfficheTemplate)
}

export async function createTemplate(row: DbAfficheTemplate): Promise<void> {
  const { error } = await supabase.from(AFFICHE_TEMPLATES_TABLE).insert(row)
  if (error) throw error
}

export async function updateTemplate(
  id: string,
  patch: Partial<Omit<DbAfficheTemplate, 'id'>>,
): Promise<void> {
  const { error } = await supabase
    .from(AFFICHE_TEMPLATES_TABLE)
    .update(patch)
    .eq('id', id)
  if (error) throw error
}

export async function deleteTemplate(id: string): Promise<void> {
  const { error } = await supabase
    .from(AFFICHE_TEMPLATES_TABLE)
    .delete()
    .eq('id', id)
  if (error) throw error
}
