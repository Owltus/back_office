import { useQuery } from '@tanstack/react-query'

import { LAZY_EFFECTS } from '#/lib/artefact/effects/lazy.ts'
import { fetchEasterEggs } from '#/lib/easter-eggs/service.ts'

import { SecretEffect } from './SecretEffect.tsx'

/*
 * Easter eggs — monte, sur toute l'app authentifiée, un détecteur clavier par
 * easter egg ACTIF configuré en base (table `easter_eggs`). Remplace les anciens
 * `<SecretEffect>` codés en dur : la liste (mot-clé → effet) se gère depuis la
 * page admin /easter-eggs.
 *
 * Chaque `effectId` est résolu dans le registre PARESSEUX `LAZY_EFFECTS` ; un
 * effet inconnu (id obsolète) est ignoré. Le registre complet (`index.ts`)
 * n'est PAS importé ici : il tirerait les quatorze animations — 44 150 octets
 * bruts — dans le chunk d'entrée de toute l'application, pour du code qui ne
 * sert qu'au moment où un mot-clé est tapé (audit du 2026-09-21). Tant que la migration SQL n'est pas jouée, la requête
 * échoue silencieusement (`data` reste indéfini) et aucun easter egg n'est monté.
 */
export function EasterEggs() {
  // Liste quasi statique : ne change que depuis la page admin, qui invalide le
  // préfixe ['easter-eggs'] après chaque modification → une lecture par heure
  // suffit (au lieu d'une relecture à chaque montage passé 60 s).
  const { data } = useQuery({
    queryKey: ['easter-eggs', 'active'],
    queryFn: fetchEasterEggs,
    staleTime: 60 * 60_000,
  })

  const eggs = (data ?? []).filter((egg) => egg.enabled)

  return (
    <>
      {eggs.map((egg) => {
        const effect = LAZY_EFFECTS.find((e) => e.id === egg.effectId)
        if (!effect) return null
        return (
          <SecretEffect key={egg.id} keyword={egg.keyword} load={effect.load} />
        )
      })}
    </>
  )
}
