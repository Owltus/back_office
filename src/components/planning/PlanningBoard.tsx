/*
 * Écran principal de l'onglet Planning : vue mois (par défaut, comme le
 * prototype) ou vue semaine (un clic sur une semaine du mois). Le choix et
 * la période vivent dans l'URL (`lib/planning/recherche.ts`).
 */

import { VueMois } from '#/components/planning/mois/VueMois.tsx'
import { VueSemaine } from '#/components/planning/semaine/VueSemaine.tsx'
import { useAujourdhui } from '#/components/planning/hooks/usePlanning.ts'
import type { PlanningSearch } from '#/lib/planning/recherche.ts'
import { ajouterJours, lundiDe } from '#/lib/planning/temps.ts'

/** Le mois qu'ouvre le planning sans période dans l'URL : celui du jour. */
export const moisParDefaut = (aujourdhui: string) => aujourdhui.slice(0, 7)

export function PlanningBoard({
  search,
  onSearch,
}: {
  search: PlanningSearch
  onSearch: (s: PlanningSearch) => void
}) {
  const aujourdhui = useAujourdhui()
  // Semaine par défaut : la semaine prochaine (prototype `lundi_prochain`).
  const lundiParDefaut = ajouterJours(lundiDe(aujourdhui), 7)
  const vue = search.vue ?? 'mois'
  if (vue === 'semaine') {
    const lundi = search.lundi ?? lundiParDefaut
    return (
      <VueSemaine
        lundi={lundi}
        onLundi={(l) => onSearch({ vue: 'semaine', lundi: l })}
        onMois={(m) => onSearch({ vue: 'mois', mois: m })}
      />
    )
  }
  // Mois par défaut : le mois en cours (prototype `PlanningPage`).
  const mois = search.mois ?? moisParDefaut(aujourdhui)
  return (
    <VueMois
      mois={mois}
      onMois={(m) => onSearch({ vue: 'mois', mois: m })}
      onSemaine={(l) => onSearch({ vue: 'semaine', lundi: l })}
    />
  )
}
