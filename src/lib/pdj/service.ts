import { supabase } from '#/lib/supabase.ts'
import type { DbPdjRow, ManualKind } from '#/lib/pdj/csv.ts'
import type { InHouseCoverRow } from '#/lib/pdj/amounts.ts'

/*
 * Service d'accès Supabase pour les petits-déjeuners (table `pdj_breakfasts`).
 *
 * Lecture ouverte à tous les authentifiés ; écriture (import, saisie « servi »,
 * purge) réservée aux rôles super_utilisateur / admin (RLS, voir
 * supabase/pdj_breakfasts.sql). Convention d'erreur : `{ data, error }` →
 * `if (error) throw error`, l'appelant `.catch()`.
 */

export const PDJ_TABLE = 'pdj_breakfasts'

/** Table « Addon Production » : production PDJ agrégée par (jour de service, code). */
export const PDJ_ADDON_TABLE = 'pdj_addon_production'

/** Vue d'agrégation « un jour × un code » (supabase/pdj_daily_agg.sql) : quelques
 * centaines de lignes au lieu des ~11 700 de la table. Alimente l'analytique et
 * les moyennes/jour du board. La grille du jour (cochage live) NE passe PAS par
 * là — elle reste sur `fetchDay`. */
export const PDJ_AGG_VIEW = 'pdj_daily_agg'

/** Ligne de la vue `pdj_daily_agg` : un (jour de service, code) pré-agrégé.
 * `extra` / `no_show` sont sommés PAR CHAMBRE côté base (greatest avant somme) —
 * on ne peut donc pas les redériver des totaux, ils sont fournis tels quels. */
export interface PdjAggRow {
  service_date: string
  /** Code PDJ (PDJ / PDJBB / PDJGROUP10) ou `null` = chambre sans PDJ. */
  code: string | null
  /** Chambres occupées (une ligne source par chambre → count). */
  rooms: number
  /** Clients cumulés. */
  guests: number
  /** PDJ inclus (dû facturé) cumulés. */
  included: number
  /** PDJ servis (saisis) cumulés. */
  served: number
  /** Extras : Σ max(0, servi − inclus) par chambre. */
  extra: number
  /** Non servis : Σ max(0, inclus − servi) par chambre. */
  no_show: number
}

/** Ligne DB complète (lecture) : champs d'import + consommation + id. */
export interface PdjDayRow extends DbPdjRow {
  id: string
  breakfasts_served: number
  served: boolean
}

/** Dates de service DISTINCTES (années dispo de l'analytique, sélecteur de jour
 * du board). Lues depuis la VUE `pdj_daily_agg` : au plus quelques lignes par jour
 * (une par code), soit ~10× moins que la table brute — la liste des ~230 dates
 * tient dans une seule page au lieu d'une douzaine de pages en série. Paginé par
 * sécurité (si l'historique grandit), puis dédupliqué. */
export async function fetchServiceDates(): Promise<string[]> {
  const PAGE = 1000
  const dates: string[] = []
  let offset = 0
  for (;;) {
    const { data, error } = await supabase
      .from(PDJ_AGG_VIEW)
      .select('service_date')
      .order('service_date', { ascending: false })
      .range(offset, offset + PAGE - 1)
    if (error) throw error
    const rows = (data ?? []) as { service_date: string }[]
    dates.push(...rows.map((r) => r.service_date))
    if (rows.length < PAGE) break
    offset += rows.length
  }
  return [...new Set(dates)]
}

/** Date de service la plus ANCIENNE (In-House), ou null si aucune. Sert à borner
 * d'autres features sur la disponibilité des rapports In-House — la caisse
 * remonte jusque-là (on peut saisir une caisse pour tout jour ayant un In-House).
 * Une seule ligne lue (LIMIT 1). */
export async function fetchOldestServiceDate(): Promise<string | null> {
  const { data, error } = await supabase
    .from(PDJ_TABLE)
    .select('service_date')
    .order('service_date', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data ? (data as { service_date: string }).service_date : null
}

/** Toutes les lignes d'un jour de service, triées par chambre. */
export async function fetchDay(serviceDate: string): Promise<PdjDayRow[]> {
  const { data, error } = await supabase
    .from(PDJ_TABLE)
    .select('*')
    .eq('service_date', serviceDate)
    .order('room', { ascending: true })
  if (error) throw error
  return data as PdjDayRow[]
}

/**
 * Toutes les lignes sur une plage de jours (bornes incluses), triées par date.
 * Lecture seule dédiée à la vue analytique : agrégation ensuite côté client
 * (par mois). Bornes au format 'YYYY-MM-DD'.
 *
 * PAGINÉ : une ligne par (jour, chambre) → une plage large (un mois, a fortiori
 * une année) dépasse vite le plafond de 1000 lignes de l'API. Sans pagination,
 * on ne récupérait que les 1000 premières dates (⇒ seuls les premiers mois
 * apparaissaient dans l'analytique). On lit page par page jusqu'à une page
 * incomplète.
 */
export async function fetchRange(
  from: string,
  to: string,
): Promise<PdjDayRow[]> {
  const PAGE = 1000
  const all: PdjDayRow[] = []
  let offset = 0
  for (;;) {
    const { data, error } = await supabase
      .from(PDJ_TABLE)
      .select('*')
      .gte('service_date', from)
      .lte('service_date', to)
      .order('service_date', { ascending: true })
      .order('room', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error) throw error
    const rows = (data ?? []) as PdjDayRow[]
    all.push(...rows)
    if (rows.length < PAGE) break
    offset += rows.length
  }
  return all
}

/**
 * Lignes AGRÉGÉES (une par jour × code) sur une plage de jours, depuis la vue
 * `pdj_daily_agg`. Remplace `fetchRange` pour l'analytique et les moyennes/jour :
 * on lit ~4 lignes/jour au lieu d'une par chambre (~40/jour). Bornes 'YYYY-MM-DD'
 * incluses. Paginé (tiny), trié par date puis code.
 */
export async function fetchDailyAgg(
  from: string,
  to: string,
): Promise<PdjAggRow[]> {
  const PAGE = 1000
  const all: PdjAggRow[] = []
  let offset = 0
  for (;;) {
    const { data, error } = await supabase
      .from(PDJ_AGG_VIEW)
      .select('*')
      .gte('service_date', from)
      .lte('service_date', to)
      .order('service_date', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error) throw error
    const rows = (data ?? []) as PdjAggRow[]
    all.push(...rows)
    if (rows.length < PAGE) break
    offset += rows.length
  }
  return all
}

/**
 * Import idempotent (upsert sur la clé métier). Le payload n'inclut PAS les
 * colonnes de consommation → un réimport ne réinitialise pas la saisie du staff
 * (`ON CONFLICT DO UPDATE` ne touche que les colonnes fournies).
 *
 * Découpé en lots pour encaisser un dépôt en masse (des dizaines de jours d'un
 * coup) sans payload démesuré. Les lignes doivent être dédoublonnées par
 * (service_date, room) en amont (cf. `mergeCsvFiles`) : une clé de conflit
 * répétée dans un même lot ferait échouer l'upsert.
 */
export async function importRows(rows: DbPdjRow[]): Promise<void> {
  const CHUNK = 1000
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase
      .from(PDJ_TABLE)
      .upsert(rows.slice(i, i + CHUNK), { onConflict: 'service_date,room' })
    if (error) throw error
  }
}

/**
 * Supprime toutes les lignes d'UN jour de service (ce jour uniquement, via
 * `.eq('service_date', …)` — jamais un autre jour). Réservé super/admin (RLS).
 */
export async function deleteDay(serviceDate: string): Promise<void> {
  const { error } = await supabase
    .from(PDJ_TABLE)
    .delete()
    .eq('service_date', serviceDate)
  if (error) throw error
}

/**
 * Supprime les agrégats Addon Production d'UN jour (ce jour uniquement, via
 * `.eq('service_date', …)` — jamais un autre jour). Miroir de `deleteDay` pour la
 * seconde source ; appelé conjointement à la suppression d'un jour. Gestion (RLS).
 */
export async function deleteAddonProductionDay(
  serviceDate: string,
): Promise<void> {
  const { error } = await supabase
    .from(PDJ_ADDON_TABLE)
    .delete()
    .eq('service_date', serviceDate)
  if (error) throw error
}

/** Met à jour la consommation d'une chambre pour un jour (saisie staff, D4).
 *
 * `.select('id')` est ESSENTIEL : un UPDATE dont les lignes échouent au prédicat
 * `USING` d'une policy RLS (ex. jour hors fenêtre J-3) ne renvoie PAS d'erreur —
 * il modifie simplement 0 ligne (`error: null`). Sans lire les lignes affectées,
 * un rejet RLS passerait pour un succès. On lève donc une erreur si 0 ligne. */
export async function setServed(
  serviceDate: string,
  room: number,
  breakfastsServed: number,
): Promise<void> {
  const { data, error } = await supabase
    .from(PDJ_TABLE)
    .update({
      breakfasts_served: breakfastsServed,
      served: breakfastsServed > 0,
    })
    .eq('service_date', serviceDate)
    .eq('room', room)
    .select('id')
  if (error) throw error
  if (!data || data.length === 0) {
    throw new Error(
      `Aucune ligne modifiée (${serviceDate}, chambre ${room}) : jour hors fenêtre d'écriture ou droit insuffisant.`,
    )
  }
}

/**
 * Saisie MANUELLE d'un PDJ dans une chambre non check-in (day-use, no-show
 * revenu…). Contrairement à `setServed` (UPDATE d'une ligne existante), ceci
 * CRÉE la ligne au besoin (upsert sur la clé métier) et pose `manual_kind` :
 *  - `inclus` → `breakfasts_included = breakfastsServed` (compte dans les inclus) ;
 *  - `extra`  → `breakfasts_included = 0` (compte dans les extras).
 * Tout décocher (`breakfastsServed <= 0`) SUPPRIME la ligne manuelle → la chambre
 * redevient vide (le `not manual_kind is null` protège les vraies lignes d'import).
 */
export async function setManualServe(
  serviceDate: string,
  room: number,
  breakfastsServed: number,
  kind: ManualKind,
): Promise<void> {
  if (breakfastsServed <= 0) {
    const { error } = await supabase
      .from(PDJ_TABLE)
      .delete()
      .eq('service_date', serviceDate)
      .eq('room', room)
      .not('manual_kind', 'is', null)
    if (error) throw error
    return
  }
  const { error } = await supabase.from(PDJ_TABLE).upsert(
    {
      service_date: serviceDate,
      room,
      breakfasts_served: breakfastsServed,
      served: true,
      breakfasts_included: kind === 'inclus' ? breakfastsServed : 0,
      manual_kind: kind,
    },
    { onConflict: 'service_date,room' },
  )
  if (error) throw error
}

/**
 * Purge RGPD : anonymise (guest_name = null) tous les jours STRICTEMENT
 * antérieurs à `oldestKept` ('YYYY-MM-DD' calculé côté client pour éviter le
 * piège du fuseau UTC en base), en conservant toutes les stats. En passant LA
 * VEILLE, on garde les noms d'aujourd'hui ET de J-1 (fenêtre nécessaire au
 * rapprochement parking↔PDJ) et on purge à partir de J-2. Idempotent (ne touche
 * que les lignes encore nommées). Barré par la RLS pour le rôle `utilisateur`.
 */
export async function purgeOldGuestNames(oldestKept: string): Promise<void> {
  const { error } = await supabase
    .from(PDJ_TABLE)
    .update({ guest_name: null, purged_at: new Date().toISOString() })
    .lt('service_date', oldestKept)
    .not('guest_name', 'is', null)
  if (error) throw error
}

/* --------------------------------------------------------------------------
 * Addon Production (table `pdj_addon_production`).
 *
 * Production PDJ agrégée par (jour de service, code produit) : Total Count et
 * chiffre d'affaires TTC. Alimente le calcul des montants HT de la journée
 * (voir amounts.ts). `service_date` est DÉJÀ le jour de service (date métier
 * « clôture » + 1, via `breakfastServiceDate`) : c'est l'appelant qui applique
 * l'alignement +1 avant l'upsert, jamais ce service.
 * ------------------------------------------------------------------------ */

/** Ligne DB complète (lecture) de la production Addon : import + id. */
export interface PdjAddonRow {
  id: string
  service_date: string
  code: string
  total_count: number
  revenue_ttc: number
  source_file: string | null
}

/** Payload d'upsert d'une ligne Addon (sans id ni estampillage serveur). */
export interface AddonProductionDbRow {
  service_date: string
  code: string
  total_count: number
  revenue_ttc: number
  source_file: string
}

/** Toutes les lignes Addon d'UN jour de service. Non paginé : au plus quelques
 * codes par jour. Miroir de `fetchDay`. */
export async function fetchAddonProduction(
  serviceDate: string,
): Promise<PdjAddonRow[]> {
  const { data, error } = await supabase
    .from(PDJ_ADDON_TABLE)
    .select('*')
    .eq('service_date', serviceDate)
  if (error) throw error
  return data as PdjAddonRow[]
}

/**
 * Import idempotent (upsert sur la clé métier `(service_date, code)`). Le code
 * est normalisé (`trim().toUpperCase()`) — cohérent avec l'Edge et la clé de
 * conflit. Déduplication préalable par `service_date|code` (le DERNIER gagne) :
 * une clé de conflit répétée dans un même lot ferait échouer l'upsert. Découpé
 * en lots de 1000 (calque `importRows`). N'écrit PAS les colonnes d'estampillage
 * (`updated_at`, posé par le trigger).
 */
export async function importAddonProduction(
  rows: AddonProductionDbRow[],
): Promise<void> {
  const deduped = new Map<string, AddonProductionDbRow>()
  for (const row of rows) {
    const code = row.code.trim().toUpperCase()
    deduped.set(`${row.service_date}|${code}`, { ...row, code })
  }
  const payload = [...deduped.values()]

  const CHUNK = 1000
  for (let i = 0; i < payload.length; i += CHUNK) {
    const { error } = await supabase
      .from(PDJ_ADDON_TABLE)
      .upsert(payload.slice(i, i + CHUNK), {
        onConflict: 'service_date,code',
      })
    if (error) throw error
  }
}

/** Toutes les lignes Addon, tous jours confondus (paginé). Sert au repère
 * « moyenne par jour ». */
export async function fetchAllAddonProduction(): Promise<PdjAddonRow[]> {
  const PAGE = 1000
  const out: PdjAddonRow[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(PDJ_ADDON_TABLE)
      .select('*')
      .range(from, from + PAGE - 1)
    if (error) throw error
    const rows = (data ?? []) as PdjAddonRow[]
    out.push(...rows)
    if (rows.length < PAGE) break
  }
  return out
}

/** Lignes In-House (colonnes utiles au calcul) de TOUS les jours (paginé). Sert
 * aux repères « moyenne par jour » (total HT et taux de captage). */
export async function fetchAllInHouseCovers(): Promise<InHouseCoverRow[]> {
  const PAGE = 1000
  const cols =
    'service_date,addons,adults,children,guests,breakfasts_served,breakfasts_included'
  const out: InHouseCoverRow[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(PDJ_TABLE)
      .select(cols)
      .range(from, from + PAGE - 1)
    if (error) throw error
    const rows = (data ?? []) as unknown as InHouseCoverRow[]
    out.push(...rows)
    if (rows.length < PAGE) break
  }
  return out
}
