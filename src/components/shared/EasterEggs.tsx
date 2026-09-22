import { useEffect, useState } from 'react'
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
/**
 * Délai avant d'aller chercher la liste des easter eggs.
 *
 * ⚠ Mesure du 2026-09-22, dans le navigateur, sur `/pdj` : cette lecture partait
 * à 175 ms, AVANT les sept lectures métier de la page (qui démarrent à 1 020 ms),
 * et prenait 508 ms. Une liste purement décorative passait donc devant les
 * chiffres que l'hôtelier attend.
 *
 * Trois secondes : le temps que la page ait affiché ses données. C'est très
 * au-delà de ce qu'il faut à quiconque pour taper un mot-clé de huit lettres,
 * donc l'effet reste intégralement disponible — il est simplement armé une fois
 * que l'écran a fini son travail.
 */
const DELAI_ARMEMENT_MS = 3_000

export function EasterEggs() {
  /*
   * Armement DIFFÉRÉ. Le composant est monté par `AppAuthGate` sur toute
   * l'application authentifiée : sans ce délai, sa lecture entre en concurrence
   * avec celles de la page au moment précis où elles comptent le plus.
   *
   * `enabled` à false au premier rendu = TanStack Query ne lance rien du tout,
   * pas même une requête qu'on ignorerait ensuite.
   */
  const [arme, setArme] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setArme(true), DELAI_ARMEMENT_MS)
    return () => window.clearTimeout(t)
  }, [])

  // Liste quasi statique : ne change que depuis la page admin, qui invalide le
  // préfixe ['easter-eggs'] après chaque modification → une lecture par heure
  // suffit (au lieu d'une relecture à chaque montage passé 60 s).
  const { data } = useQuery({
    queryKey: ['easter-eggs', 'active'],
    queryFn: fetchEasterEggs,
    enabled: arme,
    staleTime: 60 * 60_000,
    gcTime: 2 * 60 * 60_000,
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
