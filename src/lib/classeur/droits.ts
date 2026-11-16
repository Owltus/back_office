/*
 * Droits PAR CLASSEUR — miroir TypeScript EXACT de `private.classeur_niveau_de`
 * et de `private.classeur_garde` (migration
 * `20261116120000_classeur_visibilite`, demande utilisateur du 2026-11-16).
 *
 * Chaque classeur a un TYPE :
 *   public   la page décide : lecture, écriture (tout compte en écriture
 *            modifie tous les publics), gestion ;
 *   privé    son AUTEUR seul (pas la gestion des autres) ;
 *   gestion  la gestion de la page seule.
 * L'admin a tout, partout. Les exceptions par personne du 2026-09-28 ne sont
 * plus lues.
 *
 * Niveau `gestion` sur un classeur = le GÉRER (supprimer, réordonner,
 * restaurer, purger) : admin, gestion de la page sur un public ou un gestion,
 * auteur d'un privé qui a l'écriture sur la page.
 *
 * La sécurité réelle est la RLS : ces fonctions ne servent qu'à MASQUER ce
 * qui échouerait, jamais à autoriser.
 */

export type NiveauClasseur = 'aucun' | 'lecture' | 'ecriture'
export type NiveauPage = 'lecture' | 'ecriture' | 'gestion' | null
export type NiveauEffectif = NiveauClasseur | 'gestion'
export type Visibilite = 'public' | 'prive' | 'gestion'

export const VISIBILITES: readonly Visibilite[] = ['public', 'prive', 'gestion']

export function estVisibilite(x: unknown): x is Visibilite {
  return x === 'public' || x === 'prive' || x === 'gestion'
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

/** Qui regarde : son niveau de page, son identifiant, s'il est admin. */
export interface Moi {
  page: NiveauPage
  userId: string | null | undefined
  admin: boolean
}

export interface ClasseurPourDroits {
  created_by: string | null
  visibilite: Visibilite
}

/** Gestion de la page, ou admin. */
export function aLaGestion(moi: Moi): boolean {
  return moi.admin || moi.page === 'gestion'
}

function estAuteur(moi: Moi, classeur: ClasseurPourDroits): boolean {
  return (
    moi.userId != null &&
    classeur.created_by !== null &&
    classeur.created_by === moi.userId
  )
}

/** Le niveau effectif — même logique, même ordre que la base. */
export function niveauEffectif(
  moi: Moi,
  classeur: ClasseurPourDroits | null | undefined,
): NiveauEffectif {
  if (moi.page === null) return 'aucun'
  // Classeur introuvable : rien, même pour l'admin (la base rend 'aucun').
  if (!classeur) return 'aucun'
  if (moi.admin) return 'gestion'
  switch (classeur.visibilite) {
    case 'prive':
      if (!estAuteur(moi, classeur)) return 'aucun'
      return moi.page === 'lecture' ? 'lecture' : 'gestion'
    case 'gestion':
      return moi.page === 'gestion' ? 'gestion' : 'aucun'
    case 'public':
      return moi.page
  }
  return 'aucun'
}

/**
 * Ce que permet un niveau effectif sur un classeur : le modifier, puis le
 * gérer (supprimer, restaurer un point, vider les points).
 */
export interface Capacites {
  lire: boolean
  modifier: boolean
  supprimerClasseur: boolean
  restaurer: boolean
  viderHistorique: boolean
}

export function capacites(niveau: NiveauEffectif): Capacites {
  const gestion = niveau === 'gestion'
  return {
    lire: niveau !== 'aucun',
    modifier: gestion || niveau === 'ecriture',
    supprimerClasseur: gestion,
    restaurer: gestion,
    viderHistorique: gestion,
  }
}

/**
 * Changer le TYPE d'un classeur vers `cible` : l'auteur (public <-> privé) et
 * la gestion ; vers ou depuis Gestion, la gestion seule.
 */
export function peutChangerType(
  moi: Moi,
  classeur: ClasseurPourDroits,
  cible: Visibilite,
): boolean {
  if (cible === classeur.visibilite) return false
  const niveau = niveauEffectif(moi, classeur)
  if (niveau === 'aucun' || niveau === 'lecture') return false
  if (cible === 'gestion' || classeur.visibilite === 'gestion')
    return aLaGestion(moi)
  return aLaGestion(moi) || estAuteur(moi, classeur)
}

/** Changer l'AUTEUR : l'auteur et la gestion (qui voient le classeur). */
export function peutChangerAuteur(
  moi: Moi,
  classeur: ClasseurPourDroits,
): boolean {
  const niveau = niveauEffectif(moi, classeur)
  if (niveau === 'aucun' || niveau === 'lecture') return false
  return aLaGestion(moi) || estAuteur(moi, classeur)
}

/**
 * Qui peut être l'auteur d'un classeur de ce type : un compte en écriture ou
 * en gestion sur la page (la gestion seule pour un classeur de gestion).
 * `niveauPersonne` : son niveau de page (`gestion` pour un admin).
 */
export function peutEtreAuteur(
  niveauPersonne: 'lecture' | 'ecriture' | 'gestion' | null,
  visibilite: Visibilite,
): boolean {
  if (niveauPersonne === 'gestion') return true
  return niveauPersonne === 'ecriture' && visibilite !== 'gestion'
}

/** Créer un classeur : écriture sur la page (ou gestion). */
export function peutCreerClasseur(page: NiveauPage): boolean {
  return page === 'ecriture' || page === 'gestion'
}

/** Types qu'un compte peut donner à un classeur qu'il crée. */
export function typesCreables(moi: Moi): Visibilite[] {
  if (aLaGestion(moi)) return ['public', 'prive', 'gestion']
  if (peutCreerClasseur(moi.page)) return ['public', 'prive']
  return []
}

/** Réordonner la LISTE des classeurs (ordre partagé) : gestion seule. */
export function peutReordonnerListe(page: NiveauPage): boolean {
  return page === 'gestion'
}

/* ------------------------------------------------------------ tableaux --- */

/**
 * Les tableaux de la page (demande utilisateur du 2026-11-16) : Publics,
 * Mes privés, Gestion (gestion de la page) ; l'admin a en plus les Privés
 * des autres.
 */
export type Section = 'public' | 'mesPrives' | 'privesAutres' | 'gestion'

export function sectionsVisibles(moi: Moi): Section[] {
  const s: Section[] = ['public', 'mesPrives']
  if (moi.admin) s.push('privesAutres')
  if (aLaGestion(moi)) s.push('gestion')
  return s
}

export function sectionDe(moi: Moi, classeur: ClasseurPourDroits): Section {
  if (classeur.visibilite === 'public') return 'public'
  if (classeur.visibilite === 'gestion') return 'gestion'
  return estAuteur(moi, classeur) ? 'mesPrives' : 'privesAutres'
}

/** Ce qu'il faut écrire pour ranger un classeur dans une section. */
export interface Rangement {
  visibilite: Visibilite
  /** Présent : l'auteur change aussi. */
  created_by?: string
}

/**
 * Le rangement qu'un glisser-déposer vers `cible` écrirait, ou `null` s'il
 * n'est pas permis. Déposer dans « Mes privés » rend le classeur privé ET à
 * soi (la base refuse que l'on se cache un classeur) ; « Privés des
 * autres » (admin) garde l'auteur.
 */
export function rangementVers(
  moi: Moi,
  classeur: ClasseurPourDroits,
  cible: Section,
): Rangement | null {
  if (sectionDe(moi, classeur) === cible) return null
  if (!sectionsVisibles(moi).includes(cible)) return null
  switch (cible) {
    case 'public':
      return peutChangerType(moi, classeur, 'public')
        ? { visibilite: 'public' }
        : null
    case 'gestion':
      return peutChangerType(moi, classeur, 'gestion')
        ? { visibilite: 'gestion' }
        : null
    case 'privesAutres':
      // Admin seul (section visible) ; un classeur à soi n'a pas d'autre auteur.
      return estAuteur(moi, classeur) || classeur.created_by === null
        ? null
        : { visibilite: 'prive' }
    case 'mesPrives': {
      if (moi.userId == null) return null
      if (estAuteur(moi, classeur))
        return peutChangerType(moi, classeur, 'prive')
          ? { visibilite: 'prive' }
          : null
      if (!peutChangerAuteur(moi, classeur)) return null
      if (classeur.visibilite === 'gestion' && !aLaGestion(moi)) return null
      return { visibilite: 'prive', created_by: moi.userId }
    }
  }
}

export const LIBELLE_NIVEAU: Record<NiveauEffectif, string> = {
  aucun: 'Aucun accès',
  lecture: 'Lecture',
  ecriture: 'Écriture',
  gestion: 'Gestion',
}

export const LIBELLE_VISIBILITE: Record<Visibilite, string> = {
  public: 'Public',
  prive: 'Privé',
  gestion: 'Gestion',
}
