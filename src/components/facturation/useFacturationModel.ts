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
} {
  const { data: pool } = useQuery({
    queryKey: ['facturation', 'clouds'],
    queryFn: fetchClouds,
    retry: false,
  })
  const { data: issuers } = useQuery({
    queryKey: ['facturation', 'issuers'],
    queryFn: fetchIssuers,
    retry: false,
  })
  const { data: issuerCodes } = useQuery({
    queryKey: ['facturation', 'issuerCodes'],
    queryFn: fetchIssuerCodes,
    retry: false,
  })
  const { data: issuerDenylist } = useQuery({
    queryKey: ['facturation', 'issuerDenylist'],
    queryFn: fetchIssuerDenylist,
    retry: false,
  })
  const { data: issuerMemory } = useQuery({
    queryKey: ['facturation', 'issuerMemory'],
    queryFn: fetchIssuerMemory,
    retry: false,
  })
  const { data: journal } = useQuery({
    queryKey: ['facturation', 'journal'],
    queryFn: fetchJournal,
    retry: false,
  })
  const { data: budgetLinesData } = useQuery({
    queryKey: ['facturation', 'budgetLines'],
    queryFn: fetchBudgetLines,
    retry: false,
  })
  const { data: comptesData } = useQuery({
    queryKey: ['facturation', 'comptes'],
    queryFn: fetchComptes,
    retry: false,
  })
  // Peuple le registre synchrone (budgetLabel/budgetHint/budgetTag/compteLabel) AU RENDU —
  // avant les useMemo enfants (buildGalaxy…) → aucune course. Idempotent, sans état ; repli
  // code/numéro si vide.
  const budgetLines = budgetLinesData ?? []
  const comptes = comptesData ?? []
  setBudgetLines(budgetLines)
  setCompteLabels(comptes)
  return {
    serverPool: pool ?? { perCode: {} },
    issuers: issuers ?? [],
    issuerCodes: issuerCodes ?? { perIssuer: {} },
    issuerDenylist: issuerDenylist ?? { perIssuer: {} },
    issuerMemory: issuerMemory ?? { perIssuer: {} },
    journal: journal ?? { entries: [] },
    budgetLines,
    comptes,
  }
}
