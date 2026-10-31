/*
 * Double-clic sur un shift ou un repos : bascule validé / proposition
 * (demande utilisateur du 2026-10-31). Le clic simple ouvre l'éditeur : il
 * attend donc un court instant qu'un second clic ne vienne pas, sinon le
 * double-clic ouvrirait d'abord l'éditeur. Le clavier (detail 0) n'attend
 * pas. Une seule minuterie pour toute la page : un seul pointeur.
 */

/** Délai entre deux clics pour un double-clic (ms). */
export const DELAI_DOUBLE_CLIC = 250

let attente: ReturnType<typeof setTimeout> | undefined

export function clicOuDoubleClic(
  e: { detail: number },
  simple: () => void,
  double: (() => void) | null,
): void {
  if (!double || e.detail === 0) {
    simple()
    return
  }
  clearTimeout(attente)
  attente = undefined
  if (e.detail === 1) {
    attente = setTimeout(() => {
      attente = undefined
      simple()
    }, DELAI_DOUBLE_CLIC)
  } else if (e.detail === 2) {
    double()
  }
}
