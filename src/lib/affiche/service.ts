import { supabase } from '#/lib/supabase.ts'
import type {
  AfficheTemplate,
  AfficheTemplateInput,
} from '#/lib/affiche/model.ts'
import type { ColorKey } from '#/lib/poster/config.ts'

/*
 * Service d'accès Supabase pour les modèles d'affiche (table `affiche_templates`).
 *
 * Séparation nette entre la ligne DB (snake_case) et le modèle applicatif
 * (camelCase, = PosterContent + name), avec des mappers purs. Convention d'erreur
 * identique au parking : `{ data, error }` → `if (error) throw error`, l'appelant
 * (le board) `.catch()`.
 *
 * Un modèle porte désormais l'ÉTAT COMPLET de l'affiche : en plus des textes /
 * icône / couleur, les dates-heures et les réglages de taille (mode auto/manuel,
 * polices, espacement). Colonnes ajoutées par supabase/affiche_templates.sql.
 *
 * Lecture ouverte aux porteurs de la page ; écriture réservée aux rôles
 * écriture / gestion (RLS, voir supabase/affiche_templates.sql).
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
  date_start: string
  date_end: string
  time_start: string
  time_end: string
  is_auto_size_mode: boolean
  font_size_icon: number
  font_size_title: number
  font_size_message: number
  font_size_info: number
  gap: number
  sort_order: number
  /** Auteur d'origine, posé/figé par le trigger serveur (null pour les seeds). */
  created_by: string | null
}

/** DB → modèle applicatif (PosterContent + name + id + createdBy). */
export function toAfficheTemplate(row: DbAfficheTemplate): AfficheTemplate {
  return {
    id: row.id,
    name: row.name,
    createdBy: row.created_by ?? null,
    // Contenu textuel + apparence
    titleFr: row.title_fr,
    messageFr: row.message_fr,
    titleEn: row.title_en,
    messageEn: row.message_en,
    selectedIcon: row.icon,
    colorKey: row.color,
    // Dates / horaires. Repli sur '' pour tolérer une base pas encore migrée
    // (colonnes absentes → undefined) : les modèles se chargent quand même.
    dateStart: row.date_start ?? '',
    dateEnd: row.date_end ?? '',
    timeStart: row.time_start ?? '',
    timeEnd: row.time_end ?? '',
    // Réglages de taille (mêmes défauts que le store, cf. afficheStore.ts).
    isAutoSizeMode: row.is_auto_size_mode ?? true,
    fontSizeIcon: row.font_size_icon ?? 140,
    fontSizeTitle: row.font_size_title ?? 56,
    fontSizeMessage: row.font_size_message ?? 26,
    fontSizeInfo: row.font_size_info ?? 18,
    gap: row.gap ?? 25,
  }
}

/** Contenu applicatif → colonnes DB (hors id / created_by / sort_order). Partagé
 * par l'insert et l'update : un modèle enregistre toujours l'état complet. */
function toDbFields(
  input: AfficheTemplateInput,
): Omit<DbAfficheTemplate, 'id' | 'created_by' | 'sort_order'> {
  return {
    name: input.name,
    icon: input.selectedIcon,
    color: input.colorKey,
    title_fr: input.titleFr,
    message_fr: input.messageFr,
    title_en: input.titleEn,
    message_en: input.messageEn,
    date_start: input.dateStart,
    date_end: input.dateEnd,
    time_start: input.timeStart,
    time_end: input.timeEnd,
    is_auto_size_mode: input.isAutoSizeMode,
    font_size_icon: input.fontSizeIcon,
    font_size_title: input.fontSizeTitle,
    font_size_message: input.fontSizeMessage,
    font_size_info: input.fontSizeInfo,
    gap: input.gap,
  }
}

/** Modèle applicatif → ligne DB (insert). L'id est fourni par le client ;
 * `created_by` est OMIS volontairement (posé serveur par le trigger d'estampille,
 * jamais falsifiable côté client). */
export function toDbInsert(
  input: AfficheTemplateInput & { id: string },
  sortOrder = 0,
): Omit<DbAfficheTemplate, 'created_by'> {
  return { id: input.id, ...toDbFields(input), sort_order: sortOrder }
}

/** Contenu applicatif → patch DB (update « Sauvegarder ») : toutes les colonnes
 * de contenu (l'état complet est réécrit). `sort_order` et l'auteur ne bougent
 * pas (l'auteur est refigé serveur). */
export function toDbUpdate(
  input: AfficheTemplateInput,
): Partial<Omit<DbAfficheTemplate, 'id'>> {
  return toDbFields(input)
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

export async function createTemplate(
  row: Omit<DbAfficheTemplate, 'created_by'>,
): Promise<void> {
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
