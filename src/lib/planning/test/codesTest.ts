/*
 * Les horaires n'ont plus de code depuis le 2026-10-31 (décision
 * utilisateur) : un horaire se lit par ses heures. Les jeux d'essai, eux,
 * gardent le code du prototype (« M », « M3 »…) pour qu'un test désigne un
 * horaire d'un mot. Ce code ne vit QUE dans les tests : il est rangé à côté
 * de l'objet (WeakMap), jamais dans le type `Horaire`. Une copie (`{ ...h }`)
 * le perd : chercher dans le référentiel du jeu, pas dans une copie.
 */

const codes = new WeakMap<object, string>()

/** Range le code d'essai de l'horaire et le rend tel quel. */
export function avecCode<T extends object>(h: T, code: string): T {
  codes.set(h, code)
  return h
}

/** Code d'essai d'un horaire d'un jeu de test (undefined hors jeu). */
export function codeTest(h: object | null | undefined): string | undefined {
  return h ? codes.get(h) : undefined
}

/** L'horaire du jeu qui porte ce code d'essai. */
export function horaireTest<T extends object>(
  horaires: readonly T[],
  code: string,
): T {
  const h = horaires.find((x) => codes.get(x) === code)
  if (!h) throw new Error(`horaire d'essai inconnu : ${code}`)
  return h
}

/** Les anciennes catégories HCR des jeux d'essai (retirées du type `Poste`
 * le 2026-11-06) : ce qu'elles réglaient, recopié tel quel pour que les
 * jeux gardent exactement leur planning (durée max d'un service, nuit de
 * l'accueil). */
export type CategorieTest =
  'reception' | 'veille_nuit' | 'cuisine' | 'administratif_hors_site' | 'autre'

const DUREE_MAX_TEST: Record<CategorieTest, number> = {
  reception: 12 * 60,
  veille_nuit: 12 * 60,
  cuisine: 11 * 60,
  administratif_hors_site: 10 * 60,
  autre: 11 * 60 + 30,
}

export function reglagesCategorie(c: CategorieTest): {
  jour_max_minutes: number
  accueil_nuit: boolean
} {
  return {
    jour_max_minutes: DUREE_MAX_TEST[c],
    accueil_nuit: c === 'veille_nuit',
  }
}
