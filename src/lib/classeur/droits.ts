/*
 * Droits PAR CLASSEUR — miroir TypeScript des policies de
 * `supabase/classeur_proprietaire_2026-09-26.sql`, sur le modèle de la page
 * Affichage (décision utilisateur du 2026-09-26) :
 *
 *   lecture   consulter et imprimer tous les classeurs ;
 *   ecriture  créer des classeurs ; modifier (chapitres, éléments, points de
 *             restauration, suppression douce) SEULEMENT les siens ;
 *   gestion   tout, y compris la suppression physique et l'ordre de la liste.
 *
 * La sécurité réelle est la RLS ; ces fonctions servent à MASQUER ce qui
 * échouerait (jamais à l'autoriser). Un classeur sans auteur (`created_by`
 * NULL, compte supprimé) n'appartient à personne : gestion seule.
 */

export interface NiveauxClasseur {
  /** `can('classeur', 'ecriture')` */
  ecriture: boolean
  /** `can('classeur', 'gestion')` */
  gestion: boolean
}

/** `true` si l'utilisateur est l'auteur du classeur. */
export function estProprietaire(
  classeur: { created_by: string | null } | null | undefined,
  userId: string | null | undefined,
): boolean {
  return (
    classeur != null &&
    classeur.created_by !== null &&
    userId != null &&
    classeur.created_by === userId
  )
}

/** Peut modifier CE classeur : gestion, ou écriture ET propriétaire. */
export function peutModifierClasseur(
  niveaux: NiveauxClasseur,
  classeur: { created_by: string | null } | null | undefined,
  userId: string | null | undefined,
): boolean {
  if (niveaux.gestion) return true
  return niveaux.ecriture && estProprietaire(classeur, userId)
}

/**
 * Peut réordonner la LISTE des classeurs : l'ordre est partagé, donc il faut
 * pouvoir écrire chacun d'eux — gestion, ou écriture quand tous sont à soi.
 */
export function peutReordonnerClasseurs(
  niveaux: NiveauxClasseur,
  classeurs: ReadonlyArray<{ created_by: string | null }>,
  userId: string | null | undefined,
): boolean {
  if (niveaux.gestion) return true
  if (!niveaux.ecriture || classeurs.length === 0) return false
  return classeurs.every((c) => estProprietaire(c, userId))
}
