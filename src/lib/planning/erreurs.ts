/*
 * Message affichable d'une écriture du Planning. Comme le Classeur : jamais
 * le message brut d'une erreur de la base (tables, contraintes), SAUF pour
 * nos codes propres PL400 / PL409 / PL423, dont le message est écrit en
 * clair par la migration 20261027110000 pour être montré tel quel.
 */

interface ErreurPostgres {
  code?: string
  message?: string
}

const CODES_EN_CLAIR = new Set(['PL400', 'PL409', 'PL423'])

export function codeErreur(err: unknown): string | undefined {
  return typeof err === 'object' && err !== null
    ? (err as ErreurPostgres).code
    : undefined
}

export function messageErreur(
  err: unknown,
  action = 'Opération impossible',
): string {
  const code = codeErreur(err)
  if (code === '42501') {
    return `${action} : vos droits sur la page Planning ne le permettent pas.`
  }
  if (code && CODES_EN_CLAIR.has(code)) {
    const message = (err as ErreurPostgres).message
    if (message) return message
  }
  if (code === '23505') {
    return `${action} : cette personne a déjà un shift ce jour-là, un seul par jour.`
  }
  if (typeof code === 'string' && code !== '') {
    if (code.startsWith('23') || code.startsWith('22')) {
      return `${action} : la base a refusé ces données.`
    }
    return `${action}. Réessayez dans un instant.`
  }
  const detail = err instanceof Error ? err.message : null
  return detail ? `${action} : ${detail}` : `${action}.`
}

/** Refus de la base levé pour une écriture qui n'a touché aucune ligne
 * (RLS : un update ou un delete refusé rend 0 ligne SANS erreur). */
export function refusDroits(): Error & { code: string } {
  return Object.assign(new Error('refus'), { code: '42501' })
}
