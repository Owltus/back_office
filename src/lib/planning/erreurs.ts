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

/** Une écriture en plusieurs temps qui a échoué APRÈS un premier temps
 * réussi (relecture du 2026-11-06) : le message le dit. */
export function partielle(err: unknown): unknown {
  return typeof err === 'object' && err !== null
    ? Object.assign(err, { partielle: true })
    : Object.assign(new Error(String(err)), { partielle: true })
}

const PARTIELLE =
  ' Une partie a pu être enregistrée : votre saisie est gardée, vérifiez puis enregistrez à nouveau.'

export function messageErreur(
  err: unknown,
  action = 'Opération impossible',
): string {
  const m = messageSimple(err, action)
  return typeof err === 'object' &&
    err !== null &&
    (err as { partielle?: boolean }).partielle
    ? `${m}${PARTIELLE}`
    : m
}

function messageSimple(err: unknown, action: string): string {
  const code = codeErreur(err)
  if (code === '42501') {
    return `${action} : vos droits sur la page Planning ne le permettent pas.`
  }
  if (code && CODES_EN_CLAIR.has(code)) {
    const message = (err as ErreurPostgres).message
    if (message) return message
  }
  if (code === '23505') {
    // Le nom de la règle refusée dit laquelle (audit RH du 2026-11-01 : un
    // horaire en double ne parle pas d'une personne).
    const brut = `${(err as ErreurPostgres).message ?? ''} ${(err as { details?: string }).details ?? ''}`
    if (brut.includes('horaires_heures'))
      return `${action} : un horaire aux mêmes heures existe déjà.`
    if (brut.includes('nom_unique'))
      return `${action} : un autre élément porte déjà ce nom. Pour échanger deux noms, donnez d'abord un autre nom à l'un d'eux.`
    if (brut.includes('un_par_jour') || !brut.trim())
      return `${action} : cette personne a déjà un shift ce jour-là, un seul par jour.`
    return `${action} : cet élément existe déjà.`
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
