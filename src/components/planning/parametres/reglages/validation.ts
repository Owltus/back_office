/*
 * Contrôles de saisie des paramètres du Planning, AVANT l'envoi : les mêmes
 * que le prototype (`api.py`, `TypeShiftIn`, `TypeAbsenceIn`, `PosteIn`) et
 * que les contraintes de la base (migration 20261027110000). La base reste
 * l'autorité ; ici, on dit le problème en clair au lieu d'un refus.
 */

import { COULEUR_VALIDE } from '#/components/planning/parametres/reglages/controles.tsx'
import { presence } from '#/lib/planning/temps.ts'
import { CATEGORIES } from '#/lib/planning/types.ts'
import type { Horaire, Motif, Poste } from '#/lib/planning/types.ts'

export type SaisieHoraire = Omit<Horaire, 'id'>
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

/** Erreurs d'un code horaire (vide : valide). */
export function erreursHoraire(h: SaisieHoraire): string[] {
  const erreurs: string[] = []
  controlerCode(h.code, erreurs)
  controlerNom(h.nom, "à l'horaire", erreurs)
  const heures = heureValide(h.debut) && heureValide(h.fin)
  if (!heureValide(h.debut)) erreurs.push('Heure de début au format HH:MM.')
  if (!heureValide(h.fin))
    erreurs.push('Heure de fin au format HH:MM (ou 24:00).')
  if (h.debut === '24:00')
    erreurs.push("L'horaire ne peut pas commencer à 24:00.")
  if (!entier(h.pause, 0, 180)) erreurs.push('La pause va de 0 à 180 minutes.')
  if (!entier(h.raccourci, 0, 240))
    erreurs.push('La journée courte retire de 0 à 240 minutes.')
  if (!entier(h.raccourci_debut, 0, 240)) {
    erreurs.push('Les minutes retirées au début vont de 0 à 240.')
  } else if (h.raccourci_debut > h.raccourci) {
    erreurs.push(
      'Le raccourci du début ne peut pas dépasser le raccourci total.',
    )
  }
  if (heures && h.debut !== '24:00') {
    const p = presence(h.debut, h.fin)
    if (h.pause >= p)
      erreurs.push("La pause doit être plus courte que l'horaire.")
    else if (h.raccourci >= p - h.pause) {
      erreurs.push('La journée courte doit garder du temps de travail.')
    }
  }
  controlerCouleur(h.couleur, erreurs)
  return erreurs
}

export function erreursMotif(m: SaisieMotif): string[] {
  const erreurs: string[] = []
  controlerCode(m.code, erreurs)
  controlerNom(m.nom, 'au motif', erreurs)
  controlerCouleur(m.couleur, erreurs)
  return erreurs
}

export function erreursPoste(p: SaisiePoste): string[] {
  const erreurs: string[] = []
  controlerNom(p.nom, 'au poste', erreurs)
  if (!CATEGORIES.some((c) => c.code === p.categorie)) {
    erreurs.push('Choisissez la catégorie HCR.')
  }
  controlerCouleur(p.couleur, erreurs)
  return erreurs
}

/** Ce qui part en base : textes rognés, code en majuscules. */
export function nettoyerHoraire(h: SaisieHoraire): SaisieHoraire {
  return { ...h, code: h.code.trim().toUpperCase(), nom: h.nom.trim() }
}

export function nettoyerMotif(m: SaisieMotif): SaisieMotif {
  return { ...m, code: m.code.trim().toUpperCase(), nom: m.nom.trim() }
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
