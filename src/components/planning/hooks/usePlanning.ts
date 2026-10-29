/*
 * Données et écritures de la page Planning (TanStack Query). Les clés
 * `planning` ne vont jamais sur disque (`lib/queryPersist.ts`).
 *
 * Droits (plan planning-portage D4) : lecture = voir ; écriture = faire le
 * planning ; gestion = paramétrer et verrouiller. Miroir des RLS : la base
 * reste l'autorité, l'écran ne fait que griser.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '#/components/auth/AuthContext.tsx'
import { codeErreur, messageErreur } from '#/lib/planning/erreurs.ts'
import { planningKeys } from '#/lib/planning/keys.ts'
import {
  aJoursFixes,
  analyser,
  aPoserFixes,
  preparerGeneration,
} from '#/lib/planning/semaine.ts'
import type {
  DonneesSemaine,
  OptionsGeneration,
  SemaineOut,
} from '#/lib/planning/semaine.ts'
import {
  appliquerGeneration,
  fetchEtatSemaine,
  fetchReferentiel,
  fetchSemaine,
} from '#/lib/planning/service.ts'
import type { DonneesShifts } from '#/lib/planning/service.ts'
import { resoudre } from '#/lib/planning/solveur.ts'
import { ajouterJours, aujourdhuiParis, lundiDe } from '#/lib/planning/temps.ts'
import type { Referentiel, Salarie } from '#/lib/planning/types.ts'
import { useRelireAuRetour } from '#/components/planning/hooks/auRetour.ts'

export interface DroitsPlanning {
  /** Droits lus (tant que non, tout est grisé). */
  pret: boolean
  lire: boolean
  /** Faire le planning : shifts, absences, valider, compléter, vider. */
  ecrire: boolean
  /** Paramétrer l'équipe et l'hôtel, verrouiller, importer. */
  gerer: boolean
}

export function useDroitsPlanning(): DroitsPlanning {
  const { can, permsResolved } = useAuth()
  const pret = permsResolved
  return {
    pret,
    lire: pret && can('planning', 'lecture'),
    ecrire: pret && can('planning', 'ecriture'),
    gerer: pret && can('planning', 'gestion'),
  }
}

/** La date du jour à Paris, suivie au passage de minuit et au retour d'onglet. */
export function useAujourdhui(): string {
  const [jour, setJour] = useState(() => aujourdhuiParis())
  useEffect(() => {
    const maj = () => setJour(aujourdhuiParis())
    const t = window.setInterval(maj, 60_000)
    document.addEventListener('visibilitychange', maj)
    return () => {
      window.clearInterval(t)
      document.removeEventListener('visibilitychange', maj)
    }
  }, [])
  return jour
}

export function useReferentiel() {
  // Relu au retour sur l'onglet (au plus toutes les 2 s, voir auRetour.ts).
  useRelireAuRetour()
  return useQuery({
    queryKey: planningKeys.referentiel(),
    queryFn: fetchReferentiel,
    // Même seuil que les autres lectures de l'app (lib/query.ts).
    staleTime: 60_000,
  })
}

export function useShiftsSemaine(lundi: string) {
  useRelireAuRetour()
  return useQuery({
    queryKey: planningKeys.semaine(lundi),
    queryFn: () => fetchSemaine(lundi),
    staleTime: 30_000,
  })
}

/** Assemble ce que lit l'analyse d'une semaine. */
export function donneesSemaine(
  lundi: string,
  referentiel: Referentiel,
  shifts: DonneesShifts,
): DonneesSemaine {
  const avant = ajouterJours(lundi, -7)
  const apres = ajouterJours(lundi, 7)
  return {
    lundi,
    referentiel,
    absences: shifts.absences,
    affectations: shifts.affectations.filter((a) => a.lundi === lundi),
    avant: shifts.affectations.filter((a) => a.lundi === avant),
    apres: shifts.affectations.filter((a) => a.lundi === apres),
  }
}

/** La semaine analysée (vérificateur en direct). */
export function useSemaine(lundi: string) {
  const ref = useReferentiel()
  const shifts = useShiftsSemaine(lundi)
  const donnees = useMemo(
    () =>
      ref.data && shifts.data
        ? donneesSemaine(lundi, ref.data, shifts.data)
        : null,
    [lundi, ref.data, shifts.data],
  )
  const semaine = useMemo<SemaineOut | null>(
    () => (donnees ? analyser(donnees) : null),
    [donnees],
  )
  return {
    referentiel: ref.data ?? null,
    donnees,
    semaine,
    isPending: ref.isPending || shifts.isPending,
    isError: ref.isError || shifts.isError,
    refetch: () => Promise.all([ref.refetch(), shifts.refetch()]),
  }
}

/** Compteur d'actions en cours : `occupe` grise, `estOccupe()` refuse un
 * second clic trop rapide (prototype `useOccupation`). */
export function useOccupation() {
  const compteur = useRef(0)
  const [occupe, setOccupe] = useState(false)
  const pendant = useCallback(
    async <T>(action: () => Promise<T>): Promise<T> => {
      compteur.current++
      setOccupe(true)
      try {
        return await action()
      } finally {
        compteur.current--
        if (compteur.current === 0) setOccupe(false)
      }
    },
    [],
  )
  return { occupe, estOccupe: () => compteur.current > 0, pendant }
}

export interface ResultatEcriture {
  ok: boolean
  message?: string
}

/** Une écriture : exécutée, puis tout le planning relu ; l'erreur devient un
 * message lisible (jamais le texte brut de la base). */
export function useEcriture() {
  const qc = useQueryClient()
  return useCallback(
    async (
      action: () => Promise<unknown>,
      echec = 'Action impossible',
    ): Promise<ResultatEcriture> => {
      try {
        await action()
        await qc.invalidateQueries({ queryKey: planningKeys.all })
        return { ok: true }
      } catch (err) {
        await qc.invalidateQueries({ queryKey: planningKeys.all })
        return { ok: false, message: messageErreur(err, echec) }
      }
    },
    [qc],
  )
}

export interface BilanGeneration {
  poses: number
  dureeMs: number
  semaine: SemaineOut
}

/**
 * Générer (« Compléter », « Full auto », horaires fixes) : relit l'état de la
 * base, prépare le problème autour de ce qui reste, le résout dans le worker,
 * puis l'applique en UNE transaction (refusée si le planning a changé entre
 * la lecture et l'écriture).
 */
export function useGenerer() {
  const qc = useQueryClient()
  return useCallback(
    async (
      lundi: string,
      options: Omit<OptionsGeneration, 'aujourdhui'> & { aujourdhui?: string },
    ): Promise<BilanGeneration> => {
      const debut = performance.now()
      const etat = await fetchEtatSemaine(lundi)
      const [referentiel, shifts] = await Promise.all([
        qc.fetchQuery({
          queryKey: planningKeys.referentiel(),
          queryFn: fetchReferentiel,
          staleTime: 0,
        }),
        fetchSemaine(lundi),
      ])
      const d = donneesSemaine(lundi, referentiel, shifts)
      const aujourdhui = options.aujourdhui ?? aujourdhuiParis()
      const g = preparerGeneration(d, {
        ...options,
        aujourdhui,
        graine: options.graine ?? Math.floor(Math.random() * 1e9),
      })
      const resultat = await resoudre(g.probleme)
      if (resultat.statut === 'inconnu') {
        throw new Error(
          "le calcul n'a pas abouti : réessayez, ou retirez un shift validé qui bloque",
        )
      }
      const nouvelles = g.traduire(resultat)
      const poses = await appliquerGeneration({
        lundi,
        etat,
        depuis: g.depuis,
        tout: !!options.tout,
        exclus: [...(options.exclus ?? [])],
        sansEffacer: !!options.sansEffacer,
        nouvelles,
      })
      await qc.invalidateQueries({ queryKey: planningKeys.all })
      const apres = await fetchSemaine(lundi)
      qc.setQueryData(planningKeys.semaine(lundi), apres)
      return {
        poses,
        dureeMs: Math.round(performance.now() - debut),
        semaine: analyser(donneesSemaine(lundi, referentiel, apres)),
      }
    },
    [qc],
  )
}

/**
 * Horaires fixes toujours posés (prototype `poser_fixes`) : à l'ouverture
 * d'une semaine à venir, avec le droit d'écriture, le personnel à jours fixes
 * qui n'y a encore rien est posé d'après sa fiche, sans rien retirer. Une
 * tentative par semaine ET par état des fiches concernées
 * (`signatureFixes`) : modifier une fiche relance la pose une fois, comme le
 * prototype qui la refaisait au rechargement du staff. `pendant` (de `useOccupation`)
 * marque la page occupée le temps du calcul : une saisie faite entre-temps
 * ferait refuser la pose (PL409, le planning a changé). Ce refus est réessayé
 * UNE fois, `generer` relisant l'état de la base avant de recalculer.
 */
export function usePoserFixes(
  lundi: string,
  donnees: DonneesSemaine | null,
  ecrire: boolean,
  aujourdhui: string,
  surMessage: (texte: string) => void,
  pendant?: <T>(action: () => Promise<T>) => Promise<T>,
) {
  const generer = useGenerer()
  const tentees = useRef(new Map<string, string>())
  useEffect(() => {
    if (!ecrire || !donnees) return
    const signature = signatureFixes(donnees.referentiel.salaries)
    if (tentees.current.get(lundi) === signature) return
    if (lundi < lundiDe(aujourdhui)) return
    const aPoser = aPoserFixes(donnees, aujourdhui)
    if (!aPoser.size) return
    tentees.current.set(lundi, signature)
    const poser = () =>
      generer(lundi, {
        seulement: aPoser,
        sansEffacer: true,
        titulairesSeulement: true,
        aujourdhui,
      })
    const travail = async () => {
      try {
        await poser().catch((err: unknown) => {
          if (codeErreur(err) !== 'PL409') throw err
          return poser()
        })
      } catch (err) {
        surMessage(messageErreur(err, 'Horaires fixes non posés'))
      }
    }
    void (pendant ? pendant(travail) : travail())
  }, [lundi, donnees, ecrire, aujourdhui, generer, surMessage, pendant])
}

/**
 * Empreinte des fiches qui comptent pour les horaires fixes (personnel à
 * jours fixes : semaine type, contrat, postes, horaires permis, présence).
 * Elle change quand une de ces fiches change, ou quand une personne entre ou
 * sort de ce personnel ; le reste du staff n'y entre pas.
 */
export function signatureFixes(salaries: Salarie[]): string {
  return JSON.stringify(
    salaries
      .filter(aJoursFixes)
      .map((x) => [
        x.id,
        x.actif,
        x.semaine_type,
        x.type_contrat,
        x.heures_hebdo,
        x.forfait_jours,
        x.mineur,
        x.competences,
        x.shifts_autorises,
        x.heures_ecole_jour,
        x.date_entree,
        x.date_sortie,
      ]),
  )
}
