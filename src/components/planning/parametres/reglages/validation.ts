/*
 * Contrôles de saisie des paramètres du Planning, AVANT l'envoi : les mêmes
 * que le prototype (`api.py`, `TypeShiftIn`, `TypeAbsenceIn`, `PosteIn`) et
 * que les contraintes de la base (migration 20261027110000). La base reste
 * l'autorité ; ici, on dit le problème en clair au lieu d'un refus.
 */

import { COULEUR_VALIDE } from '#/components/planning/parametres/reglages/controles.tsx'
import { momentPropose, nomHoraire } from '#/lib/planning/affichage.ts'
import { MOMENTS_HOTEL, momentDeLHoraire } from '#/lib/planning/moment.ts'
import type { RegleEtablissement } from '#/lib/planning/reglesEtablissement.ts'
import { JOUR_MAX_LOI } from '#/lib/planning/regles.ts'
import { heuresLisibles, minutes, presence } from '#/lib/planning/temps.ts'

import type { Horaire, Motif, Poste } from '#/lib/planning/types.ts'

/** Saisie d'un horaire : ni code (retiré le 2026-10-31) ni nom (écrit par
 * l'app, `nomHoraire`, à l'enregistrement). */
export type SaisieHoraire = Omit<Horaire, 'id' | 'nom'>
export type SaisieMotif = Omit<Motif, 'id'>
export type SaisiePoste = Omit<Poste, 'id'>

const HEURE = /^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$/

export function heureValide(h: string): boolean {
  return HEURE.test(h)
}

/** « 7:30 » → « 07:30 », « 730 » → « 07:30 », « 7h » → « 07:00 » ; sinon
 * la saisie telle quelle (le contrôle dira ce qui ne va pas). */
export function normaliserHeure(saisie: string): string {
  const t = saisie.trim().toLowerCase().replace('h', ':')
  const avecDeuxPoints = /^(\d{1,2}):(\d{2}|)$/.exec(t)
  if (avecDeuxPoints)
    return `${avecDeuxPoints[1].padStart(2, '0')}:${avecDeuxPoints[2] || '00'}`
  const heureSeule = /^(\d{1,2})$/.exec(t)
  if (heureSeule) return `${heureSeule[1].padStart(2, '0')}:00`
  const compact = /^(\d{1,2})(\d{2})$/.exec(t)
  if (compact) return `${compact[1].padStart(2, '0')}:${compact[2]}`
  return saisie.trim()
}

function entier(v: number, min: number, max: number): boolean {
  return Number.isInteger(v) && v >= min && v <= max
}

function controlerNom(nom: string, quoi: string, erreurs: string[]) {
  const n = nom.trim()
  if (!n) erreurs.push(`Donnez un nom ${quoi}.`)
  else if (n.length > 80) erreurs.push('Le nom fait 80 caractères au plus.')
}

function controlerCode(code: string, erreurs: string[]) {
  const c = code.trim()
  if (c.length < 1 || c.length > 4)
    erreurs.push('Le code fait de 1 à 4 caractères.')
}

function controlerCouleur(couleur: string, erreurs: string[]) {
  if (!COULEUR_VALIDE.test(couleur)) erreurs.push('Choisissez une couleur.')
}

/** Heures complètes et utilisables (la proposition du moment, le doublon). */
function heuresCompletes(h: Pick<SaisieHoraire, 'debut' | 'fin'>): boolean {
  return heureValide(h.debut) && heureValide(h.fin) && h.debut !== '24:00'
}

/** Même heure de la journée : une fin à 24:00 vaut une fin à 00:00 (plus
 * strict que l'index unique de la base, qui compare les valeurs). */
const memeHeure = (a: string, b: string) =>
  minutes(a) % (24 * 60) === minutes(b) % (24 * 60)

/** L'horaire déjà enregistré qui a ces heures (hors celui qu'on règle). */
export function horaireAuxMemesHeures<
  T extends Pick<Horaire, 'id' | 'debut' | 'fin'>,
>(
  h: Pick<SaisieHoraire, 'debut' | 'fin'>,
  horaires: readonly T[],
  id: number | null,
): T | undefined {
  if (!heuresCompletes(h)) return undefined
  return horaires.find(
    (x) =>
      x.id !== id && memeHeure(x.debut, h.debut) && memeHeure(x.fin, h.fin),
  )
}

/** Erreurs d'un horaire (vide : valide). `horaires` et `id` : les horaires
 * enregistrés et celui qu'on règle (null : nouveau), pour refuser deux
 * horaires aux mêmes heures avant l'envoi. */
export function erreursHoraire(
  h: SaisieHoraire,
  horaires: ReadonlyArray<Pick<Horaire, 'id' | 'debut' | 'fin'>> = [],
  id: number | null = null,
): string[] {
  const erreurs: string[] = []
  const heures = heureValide(h.debut) && heureValide(h.fin)
  if (!heureValide(h.debut)) erreurs.push('Heure de début au format HH:MM.')
  if (!heureValide(h.fin))
    erreurs.push('Heure de fin au format HH:MM (ou 24:00).')
  if (h.debut === '24:00')
    erreurs.push("L'horaire ne peut pas commencer à 24:00.")
  if (!entier(h.pause, 0, 180)) erreurs.push('La pause va de 0 à 180 minutes.')
  // Plus de raccourci depuis le 2026-11-02 : une journée étoile est un autre
  // horaire, de 7 h (`etoile.ts`).
  if (heures && h.debut !== '24:00') {
    const p = presence(h.debut, h.fin)
    if (h.pause >= p)
      erreurs.push("La pause doit être plus courte que l'horaire.")
  }
  if (horaireAuxMemesHeures(h, horaires, id))
    erreurs.push('Cet horaire existe déjà.')
  controlerCouleur(h.couleur, erreurs)
  return erreurs
}

/** Heures d'un nouvel horaire : 09:00-17:45, ou la première heure pleine
 * suivante qui n'est pas déjà prise (un nouvel horaire ne s'ouvre pas sur
 * un doublon). */
export function heuresLibres(
  horaires: ReadonlyArray<Pick<Horaire, 'id' | 'debut' | 'fin'>>,
): { debut: string; fin: string } {
  const hhmm = (m: number) => {
    const x = ((m % 1440) + 1440) % 1440
    return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`
  }
  for (let decalage = 0; decalage < 24; decalage++) {
    const debut = 9 * 60 + decalage * 60
    const h = { debut: hhmm(debut), fin: hhmm(debut + 8 * 60 + 45) }
    if (!horaireAuxMemesHeures(h, horaires, null)) return h
  }
  return { debut: '09:00', fin: '17:45' }
}

/**
 * Change les heures (ou la pause) d'un horaire en cours de réglage : le
 * moment suit TOUJOURS les heures (`momentPropose` ; décision du 2026-11-05,
 * il n'est plus modifiable).
 */
export function changerHeures(
  h: SaisieHoraire,
  maj: Partial<Pick<SaisieHoraire, 'debut' | 'fin' | 'pause'>>,
  /** Limites des moments de l'établissement (`lireRegles`). */
  l?: RegleEtablissement['moments'],
): Partial<SaisieHoraire> {
  const suite = { ...h, ...maj }
  if (!heuresCompletes(suite) || !Number.isFinite(suite.pause)) return maj
  // Des heures changées : le moment repart du calcul (plus « à la main »).
  return {
    ...maj,
    periode: momentPropose(suite, l),
    moment_force: false,
    extra: false,
  }
}

/** Le moment montré dans le volet : celui des heures dès qu'elles sont
 * complètes (2026-11-05), sinon le dernier connu (heure en cours de frappe). */
export function momentDeLaSaisie(
  h: SaisieHoraire,
  l?: RegleEtablissement['moments'],
): SaisieHoraire['periode'] {
  return heuresCompletes(h) && Number.isFinite(h.pause)
    ? momentDeLHoraire(h, l)
    : h.periode
}

/** Le moment est-il celui que les heures proposent ? */
export function momentEstPropose(
  h: SaisieHoraire,
  l?: RegleEtablissement['moments'],
): boolean {
  return (
    heuresCompletes(h) &&
    Number.isFinite(h.pause) &&
    h.periode === momentPropose(h, l)
  )
}

/** Code court proposé d'après le nom (U10 du 2026-11-01) : les initiales
 * des mots (« Congé payé » → « CP »), ou les deux premières lettres d'un mot
 * seul (« Maladie » → « MA »). Jamais vide : « AB » faute de lettres. */
export function codePropose(nom: string): string {
  const mots = nom
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .split(/[^A-Z]+/)
    .filter((m) => m.length > 1 || /^[A-Z]$/.test(m))
    .filter((m) => !['DE', 'DU', 'LA', 'LE', 'LES', 'D', 'L', 'ET'].includes(m))
  if (!mots.length) return 'AB'
  if (mots.length === 1) return mots[0].slice(0, 2)
  return mots
    .map((m) => m[0])
    .join('')
    .slice(0, 4)
}

export function erreursMotif(m: SaisieMotif): string[] {
  const erreurs: string[] = []
  // Un code vide est proposé d'après le nom à l'enregistrement.
  if (m.code.trim()) controlerCode(m.code, erreurs)
  controlerNom(m.nom, 'au motif', erreurs)
  controlerCouleur(m.couleur, erreurs)
  return erreurs
}

export function erreursPoste(p: SaisiePoste): string[] {
  const erreurs: string[] = []
  controlerNom(p.nom, 'au poste', erreurs)
  const max = p.jour_max_minutes
  if (max !== undefined && !(max >= 60 && max <= JOUR_MAX_LOI)) {
    erreurs.push(
      `La durée max d'un service va de 1 h à ${heuresLisibles(JOUR_MAX_LOI)}, comme le veut la loi.`,
    )
  }
  controlerCouleur(p.couleur, erreurs)
  return erreurs
}

/** Ce qui part en base : le nom (obligatoire en base) écrit par l'app
 * d'après les heures et le moment, jamais saisi. */
export function nettoyerHoraire(
  h: SaisieHoraire,
  l?: RegleEtablissement['moments'],
): Omit<Horaire, 'id'> {
  const periode = momentDeLHoraire(h, l)
  return {
    ...h,
    periode,
    moment_force: !!h.moment_force,
    extra: !!h.extra,
    nom: nomHoraire({ ...h, periode }, l ?? MOMENTS_HOTEL),
  }
}

export function nettoyerMotif(m: SaisieMotif): SaisieMotif {
  const nom = m.nom.trim()
  const code = m.code.trim().toUpperCase() || codePropose(nom)
  return { ...m, code, nom }
}

export function nettoyerPoste(p: SaisiePoste): SaisiePoste {
  return { ...p, nom: p.nom.trim() }
}

/** Deux saisies identiques (pour savoir si une carte est modifiée). */
export function memes<T extends object>(a: T, b: T): boolean {
  const cles = Object.keys(a) as Array<keyof T>
  return (
    cles.length === Object.keys(b).length &&
    cles.every((k) => JSON.stringify(a[k]) === JSON.stringify(b[k]))
  )
}
