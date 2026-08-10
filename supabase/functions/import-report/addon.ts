// Importeur « Addon Production » (montants petits-déjeuners) pour l'Edge Function
// « import-report ».
//
// Portage AUTONOME (Deno, service_role) du parseur métier navigateur
// src/lib/pdj/addon.ts (Étape 2). Le code Edge tourne dans un contexte Deno
// séparé : il NE peut PAS importer src/lib (pas d'alias `#/`, pas de React). On
// recopie donc la logique à l'identique — même pattern que pdj.ts ↔ csv.ts.
//
// Écrit dans public.pdj_addon_production (upsert idempotent par (service_date,
// code)). Ne stocke QUE des agrégats par code (aucune PII). N'envoie AUCUN
// e-mail : un import Addon ne déclenche jamais l'auto-envoi RepJour (voir
// index.ts, condition `touchedRepjour`).

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'

// Table cible (cf. src/lib/pdj/service.ts — PDJ_ADDON_TABLE).
const PDJ_ADDON_TABLE = 'pdj_addon_production'

// ---------------------------------------------------------------------------
// Types.
// ---------------------------------------------------------------------------

/** Ligne agrégée d'un code addon (miroir de AddonProductionRow, addon.ts). */
interface AddonProductionRow {
  code: string // normalisé upper/trim (ex. 'PDJ', 'PDJBB')
  count: number // Total Count = nb de réservations
  revenue: number // Total Revenue (TTC)
}

/** Résultat du parsing (miroir de ParsedAddonProduction, addon.ts). */
interface ParsedAddonProduction {
  businessDate: string | null // 'YYYY-MM-DD' BRUT lu du contenu (date métier « clôture »)
  rows: AddonProductionRow[] // uniquement les codes petit-déjeuner
}

/** Ligne DB écrite à l'import (snake_case, miroir de AddonProductionDbRow). */
interface AddonProductionDbRow {
  service_date: string
  code: string
  total_count: number
  revenue_ttc: number
  source_file: string
}

// ---------------------------------------------------------------------------
// Utilitaires de parsing (portés tels quels depuis src/lib/pdj/csv.ts).
// ---------------------------------------------------------------------------

// Découpe une ligne CSV en gérant les guillemets et guillemets échappés ("").
// (recopié de csv.ts:46 / pdj.ts:37 — parseCsvLine, non exporté côté Edge)
function parseCsvLine(line: string, separator: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === separator && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += char
    }
  }
  result.push(current)
  return result
}

/** petit-déjeuner = code commençant par 'PDJ' (matche PDJ et PDJBB). Miroir de
 * isBreakfastCode (src/lib/pdj/addon.ts). Écarte parking, taxe, bar… */
function isBreakfastCode(code: string): boolean {
  return code.trim().toUpperCase().startsWith('PDJ')
}

/** Jour du petit-déjeuner = date métier « clôture » + 1 jour. Source UNIQUE de
 * la règle côté Edge (miroir de breakfastServiceDate, src/lib/pdj/addon.ts, et du
 * Point de correction n°1). La date brute Addon (ex. 2026-08-09) désigne le
 * petit-déjeuner servi LE LENDEMAIN (2026-08-10), jour sous lequel le In-House et
 * le board rangent la journée. Calcul en UTC pur (déterministe, indépendant du
 * fuseau serveur), comme extractReportDate côté repjour.ts. 'YYYY-MM-DD' →
 * 'YYYY-MM-DD'. */
function breakfastServiceDate(businessDate: string): string {
  const [y, m, d] = businessDate.split('-').map((s) => parseInt(s, 10))
  const date = new Date(Date.UTC(y, m - 1, d))
  date.setUTCDate(date.getUTCDate() + 1)
  const yy = date.getUTCFullYear()
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(date.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

// ---------------------------------------------------------------------------
// Parsing du CSV Addon Production (porté de parseAddonProduction, addon.ts).
// ---------------------------------------------------------------------------
//
// Structure réelle du fichier :
//   Hotel Code,Hotel Name,Generated Date,Generated Time,Report Name
//   4401NACH,Okko Hotels Nantes Centre Ville,10-08-2026,12:05:02,Addon Production
//   Date Range,Total number,Total Revenue,Average revenue
//   2026-08-09 - 2026-08-09,25,877.00,35.08
//   "",Total Count,Total Revenue,Average revenue,2026-08-09,""
//   PDJ,22,817.00,37.14,22,817.00
//   PDJBB,3,60.00,20.00,3,60.00
//
// La ligne d'en-tête des codes porte « Total Count » ET « Total Revenue » (la
// ligne « Date Range » ne porte que « Total number » → pas de collision). La date
// métier BRUTE est le token date de CETTE ligne (col 4), PAS « Generated Date »
// (qui est J+1). Les lignes code exposent [code, Total Count, Total Revenue, …] :
// seules les colonnes 0..2 sont utiles.
function parseAddonProduction(content: string): ParsedAddonProduction {
  // Retrait d'un BOM éventuel en tête (export PMS/Windows) : sinon il se colle au
  // premier champ et casse la détection.
  const clean = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content
  const rawLines = clean.split('\n').filter((l) => l.trim())

  // TROUVER la ligne d'en-tête des codes (« Total Count » + « Total Revenue »)
  // sans supposer un index fixe (préambule variable). On teste les deux
  // séparateurs (, puis ;) et on retient celui qui découpe bien l'en-tête.
  const isCodeHeader = (cells: string[]) => {
    const norm = cells.map((c) => c.trim().toLowerCase())
    return norm.includes('total count') && norm.includes('total revenue')
  }
  let separator = ','
  let headerIdx = -1
  outer: for (let i = 0; i < rawLines.length; i++) {
    for (const sep of [',', ';']) {
      const cells = parseCsvLine(rawLines[i], sep)
      if (isCodeHeader(cells)) {
        separator = sep
        headerIdx = i
        break outer
      }
    }
  }
  // Sans en-tête des codes, le fichier n'est pas un Addon Production exploitable :
  // ni date ni lignes. L'appelant lèvera sur businessDate null.
  if (headerIdx === -1) return { businessDate: null, rows: [] }

  // Date métier : PRIORITÉ au token date de la ligne d'en-tête des codes (col 4).
  const headerCells = parseCsvLine(rawLines[headerIdx], separator)
  let businessDate: string | null = null
  for (const cell of headerCells) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(cell.trim())) {
      businessDate = cell.trim()
      break
    }
  }
  // Repli : la ligne « Date Range » (ex. « 2026-08-09 - 2026-08-09 ») → borne
  // gauche. Robuste si la col date de l'en-tête manque sur un export altéré.
  if (!businessDate) {
    for (const line of rawLines) {
      const m = line.match(/(\d{4}-\d{2}-\d{2})\s*-\s*\d{4}-\d{2}-\d{2}/)
      if (m) {
        businessDate = m[1]
        break
      }
    }
  }

  // Lignes suivantes = lignes code. On ne garde que les codes petit-déjeuner
  // (isBreakfastCode) → écarte parking/taxe/bar et le pied de page éventuel.
  const rows: AddonProductionRow[] = []
  for (const line of rawLines.slice(headerIdx + 1)) {
    const parts = parseCsvLine(line, separator)
    const code = (parts[0] ?? '').replace(/"/g, '').trim()
    if (!code || !isBreakfastCode(code)) continue
    const count = parseInt((parts[1] ?? '').replace(/"/g, '').trim(), 10)
    const revenue = parseFloat(
      (parts[2] ?? '').replace(/"/g, '').replace(',', '.').trim(),
    )
    rows.push({
      code: code.toUpperCase(),
      count: isNaN(count) ? 0 : count,
      revenue: isNaN(revenue) ? 0 : revenue,
    })
  }

  return { businessDate, rows }
}

// ---------------------------------------------------------------------------
// Point d'entrée de l'Edge Function.
// ---------------------------------------------------------------------------

/**
 * Importe un CSV « Addon Production » dans `pdj_addon_production` (upsert
 * idempotent par (service_date, code)). La date métier est lue du CONTENU puis
 * alignée +1 jour (jour du petit-déjeuner). Renvoie le nombre de lignes upsertées.
 *
 * @param admin  client Supabase service_role (bypass RLS).
 * @param csv    contenu texte du CSV.
 * @param filename  nom du fichier (conservé dans `source_file` pour la traçabilité).
 * @param dryRun  si true : parse et valide SANS écrire.
 * @throws Error si la date métier est introuvable ou en cas d'erreur base —
 *   message court, sans détail interne.
 */
export async function importAddon(
  admin: SupabaseClient,
  csv: string,
  filename: string,
  dryRun = false,
): Promise<number> {
  const parsed = parseAddonProduction(csv)
  if (!parsed.businessDate) {
    throw new Error('Date métier introuvable dans le CSV Addon Production.')
  }

  // Alignement +1 jour (Point de correction n°1) : la date métier « clôture »
  // devient le jour du petit-déjeuner (jour du board / du In-House).
  const serviceDate = breakfastServiceDate(parsed.businessDate)

  const mapped: AddonProductionDbRow[] = parsed.rows.map((r) => ({
    service_date: serviceDate,
    code: r.code,
    total_count: r.count,
    revenue_ttc: r.revenue,
    source_file: filename,
  }))

  // Dédoublonnage final par (service_date, code) : une clé de conflit répétée
  // dans un même lot ferait échouer l'upsert Postgres ON CONFLICT. Le dernier
  // gagne (ordre du fichier).
  const byKey = new Map<string, AddonProductionDbRow>()
  for (const r of mapped) byKey.set(`${r.service_date}|${r.code}`, r)
  const deduped = [...byKey.values()]

  // Dry-run : parsing + dédoublonnage faits (throw ci-dessus si date absente),
  // aucune écriture. Sinon, upsert par lots.
  if (!dryRun) {
    const CHUNK = 1000
    for (let i = 0; i < deduped.length; i += CHUNK) {
      const { error } = await admin
        .from(PDJ_ADDON_TABLE)
        .upsert(deduped.slice(i, i + CHUNK), {
          onConflict: 'service_date,code',
        })
      if (error) {
        // Détail Postgres brut UNIQUEMENT dans les logs serveur ; message renvoyé
        // NEUTRE (le compte rendu part au Worker, ne pas y exposer noms de tables /
        // contraintes / structure interne).
        console.error('Écriture pdj_addon_production échouée :', error.message)
        throw new Error(
          'Écriture des données Addon échouée. Réessaie dans un instant.',
        )
      }
    }
  }

  return deduped.length
}
