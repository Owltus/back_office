/* --------------------------------------------------------------------------
 * Petit-déjeuner (PDJ) — détail financier PAR CHAMBRE d'un jour, groupé par étage.
 *
 * Deux entrées :
 *   - In-House (une ligne par chambre) : code PDJ via `addons`, DÛ (inclus au tarif,
 *     `breakfasts_included`) et SERVI (réellement pris, coché sur la page,
 *     `breakfasts_served`) → compta factuelle (dû) vs réelle (servi) ;
 *   - `tarifs` : prix unitaire TTC par code, DÉTECTÉ dans l'Addon (cf. tarif.ts,
 *     rien en dur → suit le prix réel, même s'il change).
 *
 * CA = nb × tarif du code, HT = ÷ 1,10 par PDJ. Aucune division « revenu ÷ nb de
 * chambres » (c'était la cause des prix absurdes). L'Addon du jour sert de CONTRÔLE
 * : on compare le nb de PDJ en chambre au nb facturé (revenu ÷ tarif) → alertes
 * (rendent visible un décalage de date ou une anomalie). Aucune donnée nominative.
 * ------------------------------------------------------------------------ */

import { fromTTC } from '#/lib/repjour/constants.ts'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Code petit-déjeuner d'une chambre depuis sa colonne `addons` : GROUP d'abord,
 * puis PDJBB (sinon 'PDJ' capterait aussi PDJBB/PDJGROUP), sinon PDJ. null si pas
 * de PDJ. Aligné sur les codes de l'Addon (PDJ / PDJBB / PDJGROUP10).
 */
export function breakfastCode(addons: string | null): string | null {
  const a = (addons ?? '').toUpperCase()
  if (!a.includes('PDJ')) return null
  if (a.includes('PDJGROUP')) return 'PDJGROUP10'
  if (a.includes('PDJBB')) return 'PDJBB'
  return 'PDJ'
}

/** Détail d'une chambre. `code` null = chambre occupée SANS PDJ (client potentiel
 *  qui n'a pas pris de petit-déjeuner). Le CA de la chambre (`htCa`) est FACTURÉ dès
 *  qu'un PDJ est inclus, même si la case n'est pas encore cochée (dû = facturé). */
export interface PdjRoomDetail {
  room: number
  origin: string
  code: string | null
  /** Dû : PDJ inclus (facturé même sans passage). */
  included: number
  /** Servi : réellement pris (coché sur la page). */
  served: number
  /** CA facturé de la chambre = inclus (dû) + extras, au tarif. */
  htCa: number
}

export interface PdjFloor {
  floor: number
  rooms: PdjRoomDetail[]
  /** CA facturé de l'étage (Σ htCa). */
  htCa: number
}

export interface PdjBreakdown {
  floors: PdjFloor[]
  /** Tarifs détectés utilisés (pour affichage). */
  tarifs: { code: string; ttc: number }[]
  /** Nb de PDJ inclus (dû, facturé). */
  totalDuNb: number
  /** Nb de PDJ servis (réel, coché). */
  totalServiNb: number
  /** Nb d'extras (servis au-delà des inclus). */
  totalExtraNb: number
  /** Chambres occupées SANS PDJ (clients potentiels sans petit-déjeuner). */
  sansPdj: number
  /** CA facturé des inclus HT (dû, hors extras). */
  totalHtDu: number
  /** CA facturé total HT (inclus dû + extras) = la card « CA PDJ ». */
  totalCaHt: number
  /** Facturé par l'Addon mais NON rattaché à une chambre (groupes postés en bloc) :
   * par code, l'excédent (facturé − en chambre). Rend le total réconcilié à l'Addon. */
  nonVentile: { code: string; nb: number; ht: number }[]
  /** Total facturé Addon HT = inclus dû chambres + non ventilé (≈ revenu Addon ÷ 1,1). */
  totalHtFacture: number
  /** Alertes de cohérence In-House ↔ Addon (chambre sans facturation, tarif manquant…). */
  alerts: string[]
}

interface InHouseRow {
  room: number
  addons: string | null
  breakfasts_included: number
  breakfasts_served: number
  channel: string | null
  /** Ligne saisie à la main sur la page (day-use…) : 'inclus' | 'extra' | null.
   *  Un inclus manuel n'a pas de code dans `addons` → valorisé au tarif PDJ. */
  manual_kind?: string | null
}
interface AddonRow {
  code: string
  revenue_ttc: number
}

/** CA petit-déjeuner d'un jour = inclus + extra, PAR CHAMBRE, au tarif détecté.
 * SOURCE UNIQUE du CA, partagée par la fiche, les cartes du board, le PDF et
 * l'analytique — pour que le chiffre soit IDENTIQUE partout. Le batch groupe non
 * ventilé (facturé par le PMS sans chambre) n'entre PAS : le CA ne compte que ce
 * qui est rattaché à une chambre (inclus vert) plus les extras. HT = tarif ÷ 1,10
 * PAR PDJ. `tarifs` vient de la détection Addon (tarif.ts). */
export interface PdjCA {
  /** Σ des PDJ inclus (chambres à code, groupe compris). */
  inclusNb: number
  /** Σ des extras (servis au-delà des inclus). */
  extraNb: number
  /** HT des inclus (Σ inclus × tarif du code ÷ 1,10). */
  includedHt: number
  /** HT des extras (Σ extra × tarif PDJ ÷ 1,10). */
  extrasHt: number
  /** CA total HT = inclus + extra. */
  totalHt: number
}

/** Ligne minimale pour le CA : ce que portent aussi bien le board (PdjDayRow) que
 *  l'analytique (couverts allégés). Pas besoin de `room` ici. */
interface CaRow {
  addons: string | null
  breakfasts_included: number
  breakfasts_served: number
  manual_kind?: string | null
  channel?: string | null
}

export function computePdjCA(
  rows: CaRow[],
  tarifs: Map<string, number>,
): PdjCA {
  const unitHt = (code: string): number => {
    const p = tarifs.get(code)
    return p != null ? round2(fromTTC(p)) : 0
  }
  let inclusNb = 0
  let extraNb = 0
  let includedHt = 0
  for (const r of rows) {
    let code = breakfastCode(r.addons)
    // Inclus manuel (day-use, absent de l'Addon) → valorisé au tarif PDJ.
    if (!code && r.manual_kind === 'inclus') code = 'PDJ'
    if (code && r.breakfasts_included > 0) {
      inclusNb += r.breakfasts_included
      includedHt += round2(r.breakfasts_included * unitHt(code))
    }
    extraNb += Math.max(0, r.breakfasts_served - r.breakfasts_included)
  }
  const extrasHt = round2(extraNb * unitHt('PDJ'))
  return {
    inclusNb,
    extraNb,
    includedHt: round2(includedHt),
    extrasHt,
    totalHt: round2(round2(includedHt) + extrasHt),
  }
}

/** Détail financier d'UNE chambre pour le mode « détail financier » de la feuille :
 *  origine (OTA), code PDJ affiché, prix HT facturé (inclus dû + extras). Même règle
 *  que computePdjCA / pdjRoomBreakdown → le prix reste cohérent avec la card. */
export function roomFinance(
  row: CaRow,
  tarifs: Map<string, number>,
): { origin: string; code: string | null; htCa: number } {
  const unitHt = (c: string): number => {
    const p = tarifs.get(c)
    return p != null ? round2(fromTTC(p)) : 0
  }
  let code = breakfastCode(row.addons)
  if (!code && row.manual_kind === 'inclus') code = 'PDJ'
  const included =
    code && row.breakfasts_included > 0 ? row.breakfasts_included : 0
  const extra = Math.max(0, row.breakfasts_served - included)
  const htCa = round2(
    round2(included * unitHt(code ?? 'PDJ')) + round2(extra * unitHt('PDJ')),
  )
  return {
    origin: (row.channel ?? '').trim() || 'Direct',
    code: code ?? (extra > 0 ? 'PDJ' : null),
    htCa,
  }
}

export function pdjRoomBreakdown(
  rows: InHouseRow[],
  tarifs: Map<string, number>,
  addonDay: AddonRow[],
): PdjBreakdown {
  const unitHt = (code: string): number => {
    const p = tarifs.get(code)
    return p != null ? round2(fromTTC(p)) : 0
  }

  const byFloor = new Map<number, PdjRoomDetail[]>()
  const duByCode = new Map<string, number>()
  const missingTarif = new Set<string>()
  let totalDuNb = 0
  let totalServiNb = 0
  let totalExtraNb = 0
  let sansPdj = 0
  let totalHtDu = 0
  let totalCaHt = 0

  // TOUTES les chambres occupées sont listées, même sans PDJ (client potentiel qui
  // n'a pas pris de petit-déjeuner). Le CA d'une chambre est FACTURÉ dès qu'un PDJ
  // est inclus (dû), indépendamment du cochage « servi ».
  for (const r of rows) {
    let code = breakfastCode(r.addons)
    if (!code && r.manual_kind === 'inclus') code = 'PDJ'
    const included = code && r.breakfasts_included > 0 ? r.breakfasts_included : 0
    const served = r.breakfasts_served
    const extra = Math.max(0, served - included)
    if (code && !tarifs.has(code)) missingTarif.add(code)

    const htInclus = round2(included * unitHt(code ?? 'PDJ'))
    const htExtra = round2(extra * unitHt('PDJ'))
    const htCa = round2(htInclus + htExtra)

    // Code d'affichage : le code PDJ ; sinon 'PDJ' si un extra a été servi sans
    // inclus (walk-in) ; sinon null = chambre sans PDJ (client potentiel).
    const displayCode = code ?? (extra > 0 ? 'PDJ' : null)
    if (displayCode === null) sansPdj += 1

    totalDuNb += included
    totalServiNb += served
    totalExtraNb += extra
    totalHtDu += htInclus
    totalCaHt += htCa
    if (code) duByCode.set(code, (duByCode.get(code) ?? 0) + included)

    const floor = Math.floor(r.room / 100)
    const list = byFloor.get(floor) ?? []
    list.push({
      room: r.room,
      origin: (r.channel ?? '').trim() || 'Direct',
      code: displayCode,
      included,
      served,
      htCa,
    })
    byFloor.set(floor, list)
  }

  const floors: PdjFloor[] = [...byFloor.entries()]
    .map(([floor, roomsF]) => ({
      floor,
      rooms: roomsF.sort((a, b) => a.room - b.room),
      htCa: round2(roomsF.reduce((s, r) => s + r.htCa, 0)),
    }))
    .sort((a, b) => a.floor - b.floor)

  // --- Réconciliation In-House (dû) vs Addon (facturé = revenu ÷ tarif) ---------
  // Facturé > en chambre  → excédent NON VENTILÉ (groupe posté en bloc) : une ligne.
  // En chambre > facturé  → chambres sans facturation Addon : ANOMALIE → alerte.
  const alerts: string[] = []
  for (const code of missingTarif) {
    alerts.push(`${code} : tarif non détecté dans l'Addon.`)
  }
  const revByCode = new Map<string, number>()
  for (const a of addonDay) {
    revByCode.set(a.code, (revByCode.get(a.code) ?? 0) + a.revenue_ttc)
  }
  const nonVentile: { code: string; nb: number; ht: number }[] = []
  let totalHtFacture = totalHtDu
  for (const [code, revenue] of revByCode) {
    const price = tarifs.get(code)
    if (price == null || price <= 0) continue
    const factures = Math.round(revenue / price)
    const enChambre = duByCode.get(code) ?? 0
    if (factures > enChambre) {
      // Excédent facturé sans chambre (typiquement un groupe posté en bloc).
      const nb = factures - enChambre
      const ht = round2(fromTTC(nb * price))
      nonVentile.push({ code, nb, ht })
      totalHtFacture += ht
    } else if (enChambre - factures >= 3) {
      // Des chambres consomment mais ne sont pas facturées dans l'Addon.
      alerts.push(
        `${code} : ${enChambre} en chambre mais ${factures} facturés (Addon) — chambres sans facturation à vérifier.`,
      )
    }
  }
  nonVentile.sort((a, b) => a.code.localeCompare(b.code))

  const usedTarifs = [...tarifs.entries()]
    .filter(([code]) => duByCode.has(code) || revByCode.has(code))
    .map(([code, ttc]) => ({ code, ttc }))
    .sort((a, b) => a.code.localeCompare(b.code))

  return {
    floors,
    tarifs: usedTarifs,
    totalDuNb,
    totalServiNb,
    totalExtraNb,
    sansPdj,
    totalHtDu: round2(totalHtDu),
    totalCaHt: round2(totalCaHt),
    nonVentile,
    totalHtFacture: round2(totalHtFacture),
    alerts,
  }
}
