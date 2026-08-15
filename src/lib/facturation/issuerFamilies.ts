/*
 * Guidage directionnel par FAMILLE (section) — logique PURE (aucun React/DOM/Supabase),
 * testable en Node. SANS IA : c'est un simple repli de la mémoire émetteur→code
 * (`issuerPrior`) sur la famille de chaque code, puis un classement en trois niveaux.
 *
 * Idée : dès qu'un émetteur a été vu quelques fois, on SAIT vers quelles familles pencher
 * (« plausible ») et lesquelles sont improbables pour lui (« improbable ») — un prestataire
 * technique n'atterrit pas sur « Restauration ». C'est un DÉPARTAGE, jamais un filtre : une
 * famille « improbable » reste accessible (grisée à l'affichage, cf. AA1).
 *
 * Honnêteté du démarrage à froid : émetteur inconnu ou peu vu → aucune orientation (tout
 * « neutre »). « Je ne sais pas encore » vaut mieux qu'une mauvaise direction.
 *
 * Pureté : ce module NE connaît PAS le référentiel. Le mapping code→famille (`familyOf`,
 * = budgetCategory) est INJECTÉ par l'appelant, comme pour detect.ts.
 */

import { issuerMaturity, issuerPrior } from '#/lib/facturation/issuerCodes.ts'
import type { IssuerCodes } from '#/lib/facturation/issuerCodes.ts'

export type FamilyTier = 'plausible' | 'neutre' | 'improbable'

/** Nb de factures d'un émetteur à partir duquel on ose orienter au niveau FAMILLE (AA2).
 *  Plus bas que le seuil CODE (ISSUER_STRONG_MIN=5) : une famille mûrit plus vite qu'un
 *  code précis. Réglage prudent, à affiner à l'usage. */
export const FAMILY_GUIDANCE_MIN = 3

/** Seuils de classement d'une famille pour un émetteur mûr (part du prior famille). */
export const FAMILY_STRONG = 0.15 // part >= → « plausible »
export const FAMILY_FAINT = 0.02 // part <= → « improbable »

/** Poids par famille pour un émetteur = somme des P(code|émetteur) des codes de la famille.
 *  `familyOf` (= budgetCategory) est injecté pour garder ce module pur. `{}` si émetteur
 *  inconnu (démarrage à froid). La somme vaut ~1 quand des familles connues existent. */
export function issuerFamilyPrior(
  model: IssuerCodes,
  key: string,
  familyOf: (code: string) => string,
): Record<string, number> {
  const prior = issuerPrior(model, key)
  const out: Record<string, number> = {}
  for (const [code, p] of Object.entries(prior)) {
    const fam = familyOf(code)
    if (fam) out[fam] = (out[fam] ?? 0) + p
  }
  return out
}

/** L'émetteur a-t-il été vu assez de fois pour qu'on ose orienter au niveau famille ? */
export function familyGuidanceReady(
  model: IssuerCodes,
  key: string,
  min = FAMILY_GUIDANCE_MIN,
): boolean {
  return issuerMaturity(model, key).total >= min
}

/** Classe une famille pour un émetteur. `ready` faux (émetteur inconnu/peu vu) → toujours
 *  'neutre' (démarrage à froid : aucune orientation). Sinon : part forte → 'plausible',
 *  part quasi nulle → 'improbable', entre les deux → 'neutre'. 'improbable' est un signal
 *  d'AFFICHAGE (grisé), jamais une exclusion (AA1). */
export function familyTier(
  familyPrior: Record<string, number>,
  family: string,
  ready: boolean,
  opts?: { strong?: number; faint?: number },
): FamilyTier {
  if (!ready) return 'neutre'
  // Un code sans section (famille vide) ne peut pas être jugé : neutre, jamais « improbable ».
  if (!family) return 'neutre'
  const strong = opts?.strong ?? FAMILY_STRONG
  const faint = opts?.faint ?? FAMILY_FAINT
  const w = familyPrior[family] ?? 0
  if (w >= strong) return 'plausible'
  if (w <= faint) return 'improbable'
  return 'neutre'
}

/** Familles « plausibles » pour un émetteur, de la plus forte à la plus faible (pour un
 *  résumé directionnel « plutôt X, Y »). Vide si non prêt. */
export function plausibleFamilies(
  familyPrior: Record<string, number>,
  ready: boolean,
  opts?: { strong?: number },
): string[] {
  if (!ready) return []
  const strong = opts?.strong ?? FAMILY_STRONG
  return Object.entries(familyPrior)
    .filter(([, w]) => w >= strong)
    .sort((a, b) => b[1] - a[1])
    .map(([fam]) => fam)
}
