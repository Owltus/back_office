/*
 * « Tous » ou « Seulement ceux-ci » (plan `planning-coherence-2026-10-28`,
 * étape 3) : une liste vide n'ouvre plus tout en silence, le choix est
 * écrit. En base rien ne change (D11) : une liste vide veut dire « tous »,
 * et le mode « Seulement ceux-ci » garde toujours au moins un élément.
 *
 * Le mode se DÉDUIT de la liste (vide = tous) : il ne peut pas se
 * désynchroniser d'un brouillon annulé ou d'une relecture. Seule la
 * sélection mise de côté par « Tous » vit à part, le temps de la séance.
 */

export type ModeListe = 'tous' | 'certains'

export function modeDe(choisis: readonly number[]): ModeListe {
  return choisis.length ? 'certains' : 'tous'
}

export interface Bascule {
  /** La liste à enregistrer. */
  choisis: number[]
  /** La sélection mise de côté (vide : aucune). */
  memoire: number[]
}

/**
 * Passer d'un mode à l'autre. « Tous » vide la liste et garde la sélection
 * de côté. « Seulement ceux-ci » reprend la sélection gardée (réduite à ce
 * qui est encore proposé) ; sans elle, il démarre avec TOUT coché : on
 * retire ce qui ne va pas, rien ne change tant qu'on n'a rien décoché.
 */
export function basculerMode(
  mode: ModeListe,
  choisis: readonly number[],
  memoire: readonly number[],
  proposes: readonly number[],
): Bascule {
  if (mode === 'tous') {
    return {
      choisis: [],
      memoire: choisis.length ? [...choisis] : [...memoire],
    }
  }
  if (choisis.length) return { choisis: [...choisis], memoire: [...memoire] }
  const repris = memoire.filter((id) => proposes.includes(id))
  return {
    choisis: repris.length ? repris : [...proposes],
    memoire: [...memoire],
  }
}

/**
 * Une modification de la liste en mode « Seulement ceux-ci » : refusée
 * (null) si elle ne garde plus aucun élément proposé. Un élément coché qui
 * n'est plus proposé (un code mort) ne compte pas : il ne sert à rien.
 */
export function modificationPermise(
  suivante: readonly number[],
  proposes: readonly number[],
): number[] | null {
  return suivante.some((id) => proposes.includes(id)) ? [...suivante] : null
}
