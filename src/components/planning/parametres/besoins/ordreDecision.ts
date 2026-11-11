/*
 * « Dans quel ordre le planning décide » (page Besoins), ÉCRIT d'après les
 * réglages (étape 7 du plan planning-moteur-configurable, 2026-11-05). Un
 * poste est indispensable au fonctionnement, ou ne l'est pas (décision
 * utilisateur du 2026-11-05 : « soit un poste est important, soit il ne
 * l'est pas ») : les postes indispensables sont remplis en premier. Même
 * ordre que le calcul (un niveau par palier, generateur.ts) : besoin souhaité,
 * poste non indispensable, poste indispensable. Pur ; aucun poids en
 * chiffres, aucun nom de poste en dur.
 */

import { listeEt } from '#/lib/planning/affichage.ts'
import { estIndispensable } from '#/lib/planning/modele.ts'
import { accueilActif, estPosteAccueil } from '#/lib/planning/presence.ts'
import type { Poste } from '#/lib/planning/types.ts'

/** Ce que le réglage change, en une phrase (Postes). */
export const AIDE_INDISPENSABLE =
  "Si ce poste manque, l'hôtel ne peut pas tourner. Le planning le remplit en premier."
export const AIDE_NON_INDISPENSABLE =
  "L'hôtel tourne sans lui quelques jours. Le planning le remplit s'il reste du monde."

/** Les postes ouverts, indispensables ou non (l'ancienne valeur
 * « important » se lit non). */
export function postesParImportance(postes: readonly Poste[]): {
  indispensables: Poste[]
  autres: Poste[]
} {
  const ouverts = postes.filter((p) => !p.ferme)
  return {
    indispensables: ouverts.filter((p) => estIndispensable(p)),
    autres: ouverts.filter((p) => !estIndispensable(p)),
  }
}

/** Les sections de la page Besoins, d'après le seul réglage de chaque poste
 * (un poste neuf y apparaît tout seul) : le tableau de l'accueil va dans
 * « Postes indispensables » si l'un de ses postes l'est ; chaque autre poste
 * ouvert a sa grille dans la section de son réglage. */
export function sectionsBesoins(postes: readonly Poste[]): {
  /** Le tableau de l'accueil existe (un poste du matin et du soir). */
  accueil: boolean
  /** Le tableau de l'accueil va dans la section des indispensables. */
  accueilIndispensable: boolean
  /** Postes à grille, indispensables. */
  indispensables: Poste[]
  /** Postes à grille, non indispensables. */
  autres: Poste[]
} {
  const actif = accueilActif(postes)
  const ouverts = postes.filter((p) => !p.ferme)
  const duTableau = ouverts.filter((p) => estPosteAccueil(p, actif))
  const aPart = ouverts.filter((p) => !estPosteAccueil(p, actif))
  return {
    accueil: actif,
    accueilIndispensable: actif && duTableau.some((p) => estIndispensable(p)),
    indispensables: aPart.filter((p) => estIndispensable(p)),
    autres: aPart.filter((p) => !estIndispensable(p)),
  }
}

/** Les phrases du repli, dans l'ordre. */
export function phrasesOrdreDecision(postes: readonly Poste[]): string[] {
  const { indispensables, autres } = postesParImportance(postes)
  const noms = (ps: Poste[]) => listeEt(ps.map((p) => p.nom))
  const vides =
    indispensables.length && autres.length
      ? `Quand il manque du monde, une place reste vide dans cet ordre : d'abord les besoins souhaités, puis les autres postes (${noms(autres)}), et les postes indispensables (${noms(indispensables)}) en dernier.`
      : "Aucun poste n'est plus indispensable qu'un autre : quand il manque du monde, les besoins souhaités restent vides avant les obligatoires."
  return [
    "La loi d'abord, puis les places nécessaires. Une place n'est laissée vide que si personne ne peut la tenir.",
    vides,
    'Puis les heures des contrats, puis un titulaire avant un dépannage, puis le confort : repos groupés, jours habituels, partage des week-ends, des soirs et des matins tôt sur 4 semaines.',
    'Les extras ne sont jamais placés par le calcul : on les appelle, puis on les pose à la main.',
  ]
}
