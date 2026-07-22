import { useQuery } from '@tanstack/react-query'

import { EFFECTS } from '#/lib/artefact/effects/index.ts'
import { fetchEasterEggs } from '#/lib/easter-eggs/service.ts'

import { SecretEffect } from './SecretEffect.tsx'

/*
 * Easter eggs — monte, sur toute l'app authentifiée, un détecteur clavier par
 * easter egg ACTIF configuré en base (table `easter_eggs`). Remplace les anciens
 * `<SecretEffect>` codés en dur : la liste (mot-clé → effet) se gère depuis la
 * page admin /easter-eggs.
 *
 * Chaque `effectId` est résolu dans le registre `EFFECTS` ; un effet inconnu (id
 * obsolète) est ignoré. Tant que la migration SQL n'est pas jouée, la requête
 * échoue silencieusement (`data` reste indéfini) et aucun easter egg n'est monté.
 */
export function EasterEggs() {
  const { data } = useQuery({
    queryKey: ['easter-eggs', 'active'],
    queryFn: fetchEasterEggs,
  })

  const eggs = (data ?? []).filter((egg) => egg.enabled)

  return (
    <>
      {eggs.map((egg) => {
        const effect = EFFECTS.find((e) => e.id === egg.effectId)
        if (!effect) return null
        return (
          <SecretEffect key={egg.id} keyword={egg.keyword} effect={effect} />
        )
      })}
    </>
  )
}
