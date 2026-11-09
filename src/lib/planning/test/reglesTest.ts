/*
 * Règles de test : les défauts de l'hôtel, réglage par réglage.
 */

import { REGLES_PAR_DEFAUT } from '#/lib/planning/reglesEtablissement.ts'
import type { RegleEtablissement } from '#/lib/planning/reglesEtablissement.ts'
import type { ModeleContrat, Referentiel } from '#/lib/planning/types.ts'

/** Les défauts sans le rythme 5 et 2 strict (2026-11-09) : les tests d'une
 * règle plus ancienne, qui la regardent seule. */
export const SANS_RYTHME_STRICT: RegleEtablissement = {
  ...REGLES_PAR_DEFAUT,
  repos: { ...REGLES_PAR_DEFAUT.repos, rythmeStrict: false },
}

/** Le référentiel avec la case « Jamais sans un salarié confirmé »
 * (2026-11-09) décochée pour tous les contrats : les tests portés du
 * prototype, dont l'hôtel fictif confie une place à un apprenti titulaire
 * seul. La règle elle-même est regardée dans `accompagne.test.ts`, hôtel
 * fictif compris. */
export function sansAccompagne<R extends Pick<Referentiel, 'modelesContrat'>>(
  r: R,
): R {
  return {
    ...r,
    modelesContrat: Object.values(REGLES_PAR_DEFAUT.modeles).map(
      (m): ModeleContrat => ({
        type_contrat: m.code,
        nom: m.nom,
        ordre: m.ordre,
        jour_max_minutes: m.jourMaxMinutes,
        mineur_possible: m.mineurPossible,
        forfait_possible: m.forfaitPossible,
        fin_obligatoire: m.finObligatoire,
        journees_imposees: m.journeesImposees,
        journee_etoile: m.journeeEtoile,
        placement_manuel: m.placementManuel,
        contrat_indicatif: m.contratIndicatif,
        ferie_rattrape: m.ferieRattrape,
        feries_jour_meme: m.feriesJourMeme,
        alternance: m.alternance,
        soutien_par_defaut: m.soutienParDefaut,
        accompagne: false,
      }),
    ),
  }
}
