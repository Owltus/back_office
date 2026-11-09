/*
 * Règles de test : les défauts de l'hôtel, réglage par réglage.
 */

import { REGLES_PAR_DEFAUT } from '#/lib/planning/reglesEtablissement.ts'
import type { RegleEtablissement } from '#/lib/planning/reglesEtablissement.ts'

/** Les défauts sans le rythme 5 et 2 strict (2026-11-09) : les tests d'une
 * règle plus ancienne, qui la regardent seule. */
export const SANS_RYTHME_STRICT: RegleEtablissement = {
  ...REGLES_PAR_DEFAUT,
  repos: { ...REGLES_PAR_DEFAUT.repos, rythmeStrict: false },
}
