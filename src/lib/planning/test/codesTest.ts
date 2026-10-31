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
