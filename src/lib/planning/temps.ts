/*
 * Le temps du planning (prototype `semaine.py` : `bornes`, `minute_reelle`,
 * `horaire_de`…). Deux repères :
 *   - minutes « murales » : l'heure d'horloge depuis le lundi 00:00, sans
 *     changement d'heure (un shift 23:00 → 07:00 du lundi vaut 1380 → 1860) ;
 *   - minutes RÉELLES : le temps réellement écoulé depuis le lundi 00:00 à
 *     Paris, changement d'heure compris (la nuit du passage à l'heure d'hiver
 *     dure 9 h, celle du passage à l'heure d'été 7 h). Le solveur et le
 *     vérificateur ne travaillent qu'en minutes réelles.
 *
 * Fuseau : règle de l'Union européenne, codée ici (Europe/Paris depuis 1996) :
 * heure d'été du dernier dimanche de mars 01:00 UTC au dernier dimanche
 * d'octobre 01:00 UTC. Pure, identique en navigateur, en worker et en test.
 */

export const MINUTES_PAR_JOUR = 24 * 60
const MS_MINUTE = 60_000
const MS_JOUR = 86_400_000

/** « 07:30 » → 450. « 24:00 » → 1440. */
export function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(':')
  return Number(h) * 60 + Number(m)
}

/** 450 → « 07:30 » (sur 24 h, sauf 1440 → « 24:00 »). */
export function hhmm(total: number): string {
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** « 15:45 » avancé de 60 minutes → « 14:45 » (sur 24 h). */
export function avancer(heure: string, de: number): string {
  const total =
    (((minutes(heure) - de) % MINUTES_PAR_JOUR) + MINUTES_PAR_JOUR) %
    MINUTES_PAR_JOUR
  return hhmm(total)
}

/** Minutes de présence de debut à fin (fin <= debut : le lendemain). */
export function presence(debut: string, fin: string): number {
  const [d, f] = bornesMurales(0, debut, fin)
  return f - d
}

/** Début et fin murales depuis le lundi ; un shift qui finit avant de
 * commencer déborde sur le lendemain, « 24:00 » est le lendemain à minuit. */
export function bornesMurales(
  jour: number,
  debut: string,
  fin: string,
): [number, number] {
  const d = jour * MINUTES_PAR_JOUR + minutes(debut)
  const f = jour * MINUTES_PAR_JOUR + minutes(fin)
  return [d, f <= d ? f + MINUTES_PAR_JOUR : f]
}

// ------------------------------------------------------------------ dates

/** « 2026-10-26 » → jours depuis le 1970-01-01 (UTC). */
export function versJour(iso: string): number {
  const [a, m, j] = iso.split('-').map(Number)
  return Math.round(Date.UTC(a, m - 1, j) / MS_JOUR)
}

export function versIso(jour: number): string {
  return new Date(jour * MS_JOUR).toISOString().slice(0, 10)
}

export function ajouterJours(iso: string, n: number): string {
  return versIso(versJour(iso) + n)
}

/** 0 = lundi … 6 = dimanche. */
export function jourDeLaSemaine(iso: string): number {
  return (new Date(versJour(iso) * MS_JOUR).getUTCDay() + 6) % 7
}

export function lundiDe(iso: string): string {
  return ajouterJours(iso, -jourDeLaSemaine(iso))
}

/** Écart en jours entre deux dates (b - a). */
export function ecartJours(a: string, b: string): number {
  return versJour(b) - versJour(a)
}

/** Date du jour à Paris (AAAA-MM-JJ). */
export function aujourdhuiParis(maintenant: Date = new Date()): string {
  const ms = maintenant.getTime()
  return new Date(ms + decalageParis(ms) * MS_MINUTE).toISOString().slice(0, 10)
}

// ---------------------------------------------------------- fuseau Paris

function dernierDimanche(annee: number, mois: number): number {
  // mois : 0 = janvier. Le dernier jour du mois, puis on recule au dimanche.
  const dernier = Date.UTC(annee, mois + 1, 0)
  const jour = new Date(dernier).getUTCDay()
  return dernier - jour * MS_JOUR
}

/** Décalage de Paris (minutes) à un instant UTC donné : 60 ou 120. */
export function decalageParis(msUtc: number): number {
  const annee = new Date(msUtc).getUTCFullYear()
  const ete = dernierDimanche(annee, 2) + 3_600_000 // 01:00 UTC
  const hiver = dernierDimanche(annee, 9) + 3_600_000
  return msUtc >= ete && msUtc < hiver ? 120 : 60
}

/**
 * Minutes réellement écoulées depuis le lundi 00:00 (heure de Paris) jusqu'à
 * cette heure d'horloge. Comme Python `fold=0` (PEP 495) : une heure qui
 * n'existe pas (02:30 au passage à l'heure d'été) est lue avec le décalage
 * d'avant le changement (donc 03:30 heure d'été) ; une heure qui existe deux
 * fois (02:30 au passage à l'heure d'hiver) est la première.
 */
export function minuteReelle(lundi: string, minutesMurales: number): number {
  const origine = instantParis(versJour(lundi) * MS_JOUR)
  const instant = instantParis(
    versJour(lundi) * MS_JOUR + minutesMurales * MS_MINUTE,
  )
  return Math.round((instant - origine) / MS_MINUTE)
}

/** Instant UTC (ms) d'une heure murale de Paris donnée comme « naïve » (ms). */
function instantParis(mural: number): number {
  const avant = decalageParis(mural - 12 * 3_600_000)
  const apres = decalageParis(mural + 12 * 3_600_000)
  const valides = [...new Set([avant, apres])].filter(
    (o) => decalageParis(mural - o * MS_MINUTE) === o,
  )
  if (valides.length === 0) return mural - avant * MS_MINUTE // trou : décalage d'avant
  // Ambiguë : la première occurrence, celle du plus grand décalage.
  return mural - Math.max(...valides) * MS_MINUTE
}

/** Début et fin en minutes réelles depuis le lundi de `lundi`. `jour` peut
 * sortir de 0..6 (semaines voisines, dans le repère de cette semaine). */
export function bornes(
  lundi: string,
  jour: number,
  debut: string,
  fin: string,
): [number, number] {
  const [d, f] = bornesMurales(jour, debut, fin)
  return [minuteReelle(lundi, d), minuteReelle(lundi, f)]
}

export const NUIT_DEBUT = 22 * 60 // R-NUIT-MINEUR : 22 h → 6 h
export const NUIT_FIN = 6 * 60

/** Empiète sur une plage 22 h → 6 h, sur des minutes (murales ou non) ;
 * `jour` = jour du planning où le shift est écrit. */
export function toucheLaNuitMinutes(
  jour: number,
  debut: number,
  fin: number,
): boolean {
  for (let j = jour - 1; j <= Math.floor(fin / MINUTES_PAR_JOUR); j++) {
    const nd = j * MINUTES_PAR_JOUR + NUIT_DEBUT
    const nf = (j + 1) * MINUTES_PAR_JOUR + NUIT_FIN
    if (debut < nf && nd < fin) return true
  }
  return false
}

/** Plage de nuit des mineurs, lue sur l'heure d'horloge. */
export function toucheLaNuit(
  jour: number,
  debut: string,
  fin: string,
): boolean {
  const [d, f] = bornesMurales(jour, debut, fin)
  return toucheLaNuitMinutes(jour, d, f)
}

/** Début et fin d'un shift posé avec ce code horaire, en version courte ou
 * non : la version courte commence `raccourci_debut` plus tard et finit le
 * reste plus tôt. La nuit courte de 23:00 commence à « 24:00 » (le lendemain
 * à minuit), comme sur les plannings imprimés. */
export function horaireDe(
  h: { debut: string; fin: string; raccourci: number; raccourci_debut: number },
  court: boolean,
): { debut: string; fin: string } {
  if (!(court && h.raccourci)) return { debut: h.debut, fin: h.fin }
  const debut = h.raccourci_debut
    ? hhmm(minutes(h.debut) + h.raccourci_debut)
    : h.debut
  return { debut, fin: avancer(h.fin, h.raccourci - h.raccourci_debut) }
}

/** « 7 h 45 » ; « 8 h » pour une heure ronde. */
export function heuresLisibles(total: number): string {
  const signe = total < 0 ? '-' : ''
  const a = Math.abs(total)
  const h = Math.floor(a / 60)
  const m = a % 60
  return m ? `${signe}${h} h ${String(m).padStart(2, '0')}` : `${signe}${h} h`
}

/** Affichage d'une heure : « 24:00 » (minuit en fin de journée) s'écrit
 * « 00:00 » sur la carte. */
export function heureAffichee(h: string): string {
  return h === '24:00' ? '00:00' : h
}
