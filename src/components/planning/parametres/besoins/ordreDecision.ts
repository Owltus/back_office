/*
 * « Dans quel ordre le planning automatique décide » (page Besoins), ÉCRIT
 * d'après les réglages (étape 7 du plan planning-moteur-configurable,
 * 2026-11-05) : l'importance des postes (D11) dit quelles places restent
 * vides en premier quand il manque du monde. Même ordre que le calcul
 * (`paliersPlaces`, generateur.ts) : souhaité, Si possible, Important,
 * Indispensable. Pur ; aucun poids en chiffres.
 */

import { listeEt } from '#/lib/planning/affichage.ts'
import type { Importance, Poste } from '#/lib/planning/types.ts'

export const LIBELLES_IMPORTANCE: Record<Importance, string> = {
  indispensable: 'Indispensable',
  important: 'Important',
  si_possible: 'Si possible',
}

/** Ce que l'importance change, en une phrase (Postes). */
export const AIDE_IMPORTANCE: Record<Importance, string> = {
  indispensable:
    'Quand il manque du monde, ses places restent vides en dernier.',
  important:
    'Quand il manque du monde, ses places passent après celles des postes indispensables.',
  si_possible: 'Quand il manque du monde, ses places restent vides en premier.',
}

const ORDRE: readonly Importance[] = [
  'si_possible',
  'important',
  'indispensable',
]

/** Les postes ouverts rangés par importance (absente : Important). */
export function postesParImportance(
  postes: readonly Poste[],
): Record<Importance, string[]> {
  const r: Record<Importance, string[]> = {
    indispensable: [],
    important: [],
    si_possible: [],
  }
  for (const p of postes) {
    if (p.ferme) continue
    r[p.importance ?? 'important'].push(p.nom)
  }
  return r
}

/** Les phrases du repli, dans l'ordre. */
export function phrasesOrdreDecision(postes: readonly Poste[]): string[] {
  const par = postesParImportance(postes)
  const presents = ORDRE.filter((i) => par[i].length)
  const groupe = (i: Importance) =>
    `les postes ${LIBELLES_IMPORTANCE[i]} (${listeEt(par[i])})`
  let vides: string
  if (presents.length < 2) {
    vides =
      'Tous les postes ont la même importance : quand il manque du monde, les besoins souhaités restent vides avant les obligatoires.'
  } else {
    const [premier, ...suite] = presents
    const dernier = suite.pop() as Importance
    vides =
      `Quand il manque du monde, une place reste vide dans cet ordre : d'abord les besoins souhaités, puis ${groupe(premier)}` +
      suite.map((i) => `, puis ${groupe(i)}`).join('') +
      `, et ${groupe(dernier)} en dernier.`
  }
  return [
    "La loi d'abord, puis les places nécessaires : le nombre demandé à l'accueil et les personnes nécessaires des autres postes. Une place n'est laissée vide que si personne ne peut la tenir.",
    vides,
    'Puis les heures des contrats, puis un titulaire avant un dépannage, puis le confort (repos groupés, jours habituels, partage des week-ends, des soirs et des matins tôt sur les 4 dernières semaines). Les extras ne sont jamais placés par le calcul : on les appelle, puis on les pose à la main.',
  ]
}
