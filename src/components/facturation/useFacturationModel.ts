import { useQuery } from '@tanstack/react-query'

import {
  fetchBudgetLines,
  fetchClouds,
  fetchComptes,
  fetchIssuerCodes,
  fetchIssuerDenylist,
  fetchIssuerMemory,
  fetchIssuers,
  fetchJournal,
} from '#/lib/facturation/cloudService.ts'
import {
  setBudgetLines,
  setCompteLabels,
} from '#/lib/facturation/budgetRegistry.ts'
import type { WordPool } from '#/lib/facturation/wordpool.ts'
import type { IssuerCodes } from '#/lib/facturation/issuerCodes.ts'
import type { IssuerDenylist } from '#/lib/facturation/issuerDenylist.ts'
import type { IssuerMemory } from '#/lib/facturation/issuerMemory.ts'
import type { Issuer } from '#/lib/facturation/issuers.ts'
import type {
  BudgetLine,
  CompteLine,
  JournalEntry,
} from '#/lib/facturation/types.ts'

/**
 * Lectures Supabase de la facturation, en cache (nuages de mots appris, dictionnaire
 * d'émetteurs, mémoire émetteur→compte, référentiel). Partagé par l'atelier et la page
 * galaxie. Dégradation gracieuse : `retry:false` et valeurs par défaut vides si la table
 * n'existe pas / réseau KO. La POLITIQUE d'usage reste à l'appelant (le board fusionne
 * avec la graine, la galaxie garde l'appris brut).
 */
export function useFacturationModel(): {
  serverPool: WordPool
  issuers: Issuer[]
  issuerCodes: IssuerCodes
  issuerDenylist: IssuerDenylist
  issuerMemory: IssuerMemory
  journal: { entries: JournalEntry[] }
  /** Référentiel des imputations (Supabase). Aussi injecté dans budgetRegistry pour les
   *  accès synchrones (budgetLabel/budgetHint). Vide tant que la query n'a pas résolu. */
  budgetLines: BudgetLine[]
  /** Dictionnaire des comptes (compte → nom humain). Aussi injecté dans budgetRegistry
   *  (compteLabel). Vide tant que la query n'a pas résolu. */
  comptes: CompteLine[]
  /** État de chargement PAR lecture — cf. le commentaire du `return`. */
  chargement: {
    pool: boolean
    issuers: boolean
    issuerCodes: boolean
    issuerDenylist: boolean
    issuerMemory: boolean
    journal: boolean
    budgetLines: boolean
    comptes: boolean
  }
} {
  const poolQ = useQuery({
    queryKey: ['facturation', 'clouds'],
    queryFn: fetchClouds,
    retry: false,
  })
  const issuersQ = useQuery({
    queryKey: ['facturation', 'issuers'],
    queryFn: fetchIssuers,
    retry: false,
  })
  const issuerCodesQ = useQuery({
    queryKey: ['facturation', 'issuerCodes'],
    queryFn: fetchIssuerCodes,
    retry: false,
  })
  const issuerDenylistQ = useQuery({
    queryKey: ['facturation', 'issuerDenylist'],
    queryFn: fetchIssuerDenylist,
    retry: false,
  })
  const issuerMemoryQ = useQuery({
    queryKey: ['facturation', 'issuerMemory'],
    queryFn: fetchIssuerMemory,
    retry: false,
  })
  const journalQ = useQuery({
    queryKey: ['facturation', 'journal'],
    queryFn: fetchJournal,
    retry: false,
  })
  const budgetLinesQ = useQuery({
    queryKey: ['facturation', 'budgetLines'],
    queryFn: fetchBudgetLines,
    retry: false,
  })
  const comptesQ = useQuery({
    queryKey: ['facturation', 'comptes'],
    queryFn: fetchComptes,
    retry: false,
  })
  // Peuple le registre synchrone (budgetLabel/budgetHint/budgetTag/compteLabel) AU RENDU —
  // avant les useMemo enfants (buildGalaxy…) → aucune course. Idempotent, sans état ; repli
  // code/numéro si vide.
  const budgetLines = budgetLinesQ.data ?? []
  const comptes = comptesQ.data ?? []
  setBudgetLines(budgetLines)
  setCompteLabels(comptes)
  return {
    serverPool: poolQ.data ?? { perCode: {} },
    issuers: issuersQ.data ?? [],
    issuerCodes: issuerCodesQ.data ?? { perIssuer: {} },
    issuerDenylist: issuerDenylistQ.data ?? { perIssuer: {} },
    issuerMemory: issuerMemoryQ.data ?? { perIssuer: {} },
    journal: journalQ.data ?? { entries: [] },
    budgetLines,
    comptes,
    /*
     * ⚠ AJOUTÉ le 2026-09-24. Ce hook exposait HUIT lectures et AUCUN état de
     * chargement : chaque consommateur recevait un tableau vide sans pouvoir
     * distinguer « pas encore chargé » de « rien à afficher ». Toute la page
     * affirmait donc du FAUX pendant son chargement — « Aucune facture apprise
     * pour l'instant », « 0 émetteurs · 0 postes · 0 mots », « Aucun compte ne
     * correspond ». Ce n'est pas un saut de mise en page, c'est une affirmation
     * inexacte : l'utilisateur pouvait croire ses données perdues.
     *
     * Chaque drapeau est exposé séparément, car les consommateurs ne lisent pas
     * tous les mêmes tables : la galaxie n'attend pas le référentiel des
     * comptes, l'historique n'attend que le journal et les émetteurs.
     *
     * `isPending` et non `isFetching` : un rafraîchissement d'arrière-plan sur
     * des données déjà affichées ne doit RIEN masquer.
     */
    chargement: {
      pool: poolQ.isPending,
      issuers: issuersQ.isPending,
      issuerCodes: issuerCodesQ.isPending,
      issuerDenylist: issuerDenylistQ.isPending,
      issuerMemory: issuerMemoryQ.isPending,
      journal: journalQ.isPending,
      budgetLines: budgetLinesQ.isPending,
      comptes: comptesQ.isPending,
    },
  }
}
