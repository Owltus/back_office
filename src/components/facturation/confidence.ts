import type { Detection } from '#/lib/facturation/types.ts'

/*
 * Confiance affichée d'une imputation — partagé par le panneau (InvoicePanel) et le
 * modal de choix (CodePicker) pour que les deux montrent EXACTEMENT le même % et la
 * même teinte. Contient des classes Tailwind → vit côté composants (pas dans lib/,
 * réservé au métier pur).
 */

/** Palette selon le niveau de confiance (texte + barre). Paliers volontairement
 *  humbles : la confiance des nuages est absolue (force × corroboration), donc basse
 *  tant qu'il y a peu de données — le gris « pas sûr » est un état normal. */
export function confidenceTone(confidence: number): {
  text: string
  bar: string
} {
  if (confidence >= 0.5)
    return { text: 'text-emerald-500', bar: 'bg-emerald-500' }
  if (confidence >= 0.25) return { text: 'text-amber-500', bar: 'bg-amber-500' }
  return { text: 'text-muted-foreground', bar: 'bg-muted-foreground' }
}

/** Probabilité que `code` soit la bonne imputation, d'après la détection : score de
 *  nuage si présent, sinon confiance de la règle pour le meilleur code, sinon rien
 *  (code sans preuve → pas de probabilité). */
export function probaFor(
  code: string,
  d: Detection | null | undefined,
): number | undefined {
  if (!d) return undefined
  const sc = d.scores?.find((s) => s.code === code)
  if (sc) return sc.proba
  if (code === d.code) return d.confidence
  return undefined
}

/** Vrai quand l'imputation provient du SEUL émetteur (mots muets) → à confirmer (badge). */
export function needsReview(d: Detection | null | undefined): boolean {
  return !!d?.fromIssuerOnly
}
