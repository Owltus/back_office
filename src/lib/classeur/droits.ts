/*
 * Droits PAR CLASSEUR (2026-09-28, plan `plan/classeur-acces-par-classeur`) —
 * miroir TypeScript EXACT de `private.classeur_niveau_de`
 * (`supabase/classeur_acces_2026-09-28.sql`).
 *
 * Niveau effectif = le plus petit de (droit sur la PAGE, droit sur le
 * CLASSEUR) ; gestion de la page et admin : tout. Droit sur le classeur, par
 * priorité : l'exception de la personne (dans les deux sens, créateur
 * compris), sinon créateur → écriture, sinon l'accès pour tous.
 *
 * La sécurité réelle est la RLS : ces fonctions ne servent qu'à MASQUER ce
 * qui échouerait, jamais à autoriser.
 */

export type NiveauClasseur = 'aucun' | 'lecture' | 'ecriture'
export type NiveauPage = 'lecture' | 'ecriture' | 'gestion' | null
export type NiveauEffectif = NiveauClasseur | 'gestion'

export const NIVEAUX_CLASSEUR: readonly NiveauClasseur[] = [
  'aucun',
  'lecture',
  'ecriture',
]

export function estNiveauClasseur(x: unknown): x is NiveauClasseur {
  return x === 'aucun' || x === 'lecture' || x === 'ecriture'
}

/** Niveau de page depuis `can` (l'admin a `gestion` partout). */
export function niveauPage(
  can: (
    page: 'classeur',
    niveau: 'lecture' | 'ecriture' | 'gestion',
  ) => boolean,
): NiveauPage {
  if (can('classeur', 'gestion')) return 'gestion'
  if (can('classeur', 'ecriture')) return 'ecriture'
  if (can('classeur', 'lecture')) return 'lecture'
  return null
}

export interface ClasseurPourDroits {
  created_by: string | null
  acces_tous: NiveauClasseur
}

/** Le niveau effectif — même logique, même ordre que la base. */
export function niveauEffectif(
  page: NiveauPage,
  classeur: ClasseurPourDroits | null | undefined,
  exception: NiveauClasseur | null | undefined,
  userId: string | null | undefined,
): NiveauEffectif {
  if (page === null) return 'aucun'
  if (page === 'gestion') return 'gestion'
  if (!classeur) return 'aucun'
  const createur =
    userId != null &&
    classeur.created_by !== null &&
    classeur.created_by === userId
  const droit: NiveauClasseur =
    exception ?? (createur ? 'ecriture' : classeur.acces_tous)
  if (droit === 'aucun') return 'aucun'
  // Plafond : le droit de page borne le droit sur le classeur.
  if (page === 'lecture') return 'lecture'
  return droit
}

/**
 * Ce que permet un niveau effectif. Réservé à la gestion même pour
 * l'écriture (décision utilisateur du 2026-09-28) : gérer les accès,
 * supprimer le classeur, restaurer un point, vider les points, réordonner
 * la liste des classeurs.
 */
export interface Capacites {
  lire: boolean
  modifier: boolean
  gererAcces: boolean
  supprimerClasseur: boolean
  restaurer: boolean
  viderHistorique: boolean
}

export function capacites(niveau: NiveauEffectif): Capacites {
  const gestion = niveau === 'gestion'
  return {
    lire: niveau !== 'aucun',
    modifier: gestion || niveau === 'ecriture',
    gererAcces: gestion,
    supprimerClasseur: gestion,
    restaurer: gestion,
    viderHistorique: gestion,
  }
}

/** Créer un classeur : écriture sur la page (ou gestion). */
export function peutCreerClasseur(page: NiveauPage): boolean {
  return page === 'ecriture' || page === 'gestion'
}

/** Créer un classeur « privé » : gestion seule (la base force sinon). */
export function peutCreerPrive(page: NiveauPage): boolean {
  return page === 'gestion'
}

/** Réordonner la LISTE des classeurs (ordre partagé) : gestion seule. */
export function peutReordonnerListe(page: NiveauPage): boolean {
  return page === 'gestion'
}

export const LIBELLE_NIVEAU: Record<NiveauEffectif, string> = {
  aucun: 'Aucun accès',
  lecture: 'Lecture',
  ecriture: 'Écriture',
  gestion: 'Gestion',
}
