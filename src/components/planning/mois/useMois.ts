/*
 * Données de la vue mois : UNE lecture (shifts de toutes les semaines
 * affichées, plus la semaine d'avant et celle d'après pour le repos de 11 h,
 * et les jours d'absence sur la même étendue), puis chaque semaine analysée
 * par le vérificateur en direct (`analyser`), mémoïsée.
 */

import { useEffect, useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'

import {
  donneesSemaine,
  useGenerer,
  useReferentiel,
} from '#/components/planning/hooks/usePlanning.ts'
import { messageErreur } from '#/lib/planning/erreurs.ts'
import { planningKeys } from '#/lib/planning/keys.ts'
import { analyser, aPoserFixes } from '#/lib/planning/semaine.ts'
import type { DonneesSemaine, SemaineOut } from '#/lib/planning/semaine.ts'
import { fetchShifts } from '#/lib/planning/service.ts'
import { ajouterJours, lundiDe } from '#/lib/planning/temps.ts'
import {
  etatSemaine,
  joursDuMois,
  lundisDe,
} from '#/components/planning/mois/mois.ts'

export function useMois(mois: string) {
  const jours = useMemo(() => joursDuMois(mois), [mois])
  const lundis = useMemo(() => lundisDe(jours), [jours])
  const premier = lundis[0]
  const dernier = lundis[lundis.length - 1]
  const ref = useReferentiel()
  const shifts = useQuery({
    queryKey: planningKeys.mois(premier, lundis.length),
    queryFn: () =>
      fetchShifts(
        [ajouterJours(premier, -7), ...lundis, ajouterJours(dernier, 7)],
        ajouterJours(premier, -7),
        ajouterJours(dernier, 13),
      ),
    // Même seuil que la semaine (usePlanning.useShiftsSemaine).
    staleTime: 30_000,
  })
  const donnees = useMemo(() => {
    const m = new Map<string, DonneesSemaine>()
    if (!ref.data || !shifts.data) return m
    for (const l of lundis) m.set(l, donneesSemaine(l, ref.data, shifts.data))
    return m
  }, [lundis, ref.data, shifts.data])
  const semaines = useMemo(() => {
    const m = new Map<string, SemaineOut>()
    for (const [l, d] of donnees) m.set(l, analyser(d))
    return m
  }, [donnees])
  return {
    jours,
    lundis,
    referentiel: ref.data ?? null,
    donnees,
    semaines,
    charge: !!ref.data && !!shifts.data,
    isPending: ref.isPending || shifts.isPending,
    isError: ref.isError || shifts.isError,
    refetch: () => Promise.all([ref.refetch(), shifts.refetch()]),
  }
}

/**
 * Horaires fixes toujours posés (prototype `semaineAvecFixes`, appelé pour
 * chaque semaine du mois) : à l'ouverture du mois, avec le droit d'écriture,
 * chaque semaine à venir ni verrouillée ni déjà réalisée reçoit, DANS
 * L'ORDRE, les horaires fixes du personnel qui n'y a encore rien. Une seule
 * tentative par semaine et par montage ; sans rien retirer.
 */
export function usePoserFixesMois(args: {
  donnees: Map<string, DonneesSemaine>
  verrous: string[]
  ecrire: boolean
  aujourdhui: string
  pendant: <T>(action: () => Promise<T>) => Promise<T>
  surMessage: (texte: string) => void
}) {
  const { donnees, verrous, ecrire, aujourdhui, pendant, surMessage } = args
  const generer = useGenerer()
  const tentees = useRef(new Set<string>())
  useEffect(() => {
    if (!ecrire) return
    const aFaire: Array<{ lundi: string; seulement: Set<number> }> = []
    for (const [lundi, d] of donnees) {
      if (tentees.current.has(lundi) || lundi < lundiDe(aujourdhui)) continue
      if (!etatSemaine(lundi, verrous, aujourdhui).ouverte) continue
      const seulement = aPoserFixes(d, aujourdhui)
      if (!seulement.size) continue
      tentees.current.add(lundi)
      aFaire.push({ lundi, seulement })
    }
    if (!aFaire.length) return
    void pendant(async () => {
      for (const { lundi, seulement } of aFaire) {
        try {
          await generer(lundi, {
            seulement,
            sansEffacer: true,
            titulairesSeulement: true,
            aujourdhui,
          })
        } catch (err) {
          surMessage(messageErreur(err, 'Horaires fixes non posés'))
          return
        }
      }
    })
  }, [donnees, verrous, ecrire, aujourdhui, generer, pendant, surMessage])
}
