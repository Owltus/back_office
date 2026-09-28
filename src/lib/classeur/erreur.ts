/*
 * Message d'erreur affichable d'une écriture Classeur.
 *
 * La base fait foi (RLS) : un compte sans le niveau requis obtient un refus
 * Postgres `42501` (insufficient_privilege) même si la garde UI a été
 * contournée. Ce refus doit s'afficher proprement, près de l'action, jamais
 * casser la page. Ton hôtelier : phrases courtes, pas de jargon SQL.
 */

const CODE_DROITS = '42501'

interface ErreurPostgres {
  code?: string
  message?: string
}

/** Vrai si l'erreur est un refus de droits de la base. */
export function estRefusDroits(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as ErreurPostgres).code === CODE_DROITS
  )
}

/**
 * Phrase courte pour l'utilisateur. `action` décrit ce qui a échoué
 * (« Création impossible », « Suppression impossible »…).
 */
export function messageErreur(
  err: unknown,
  action = 'Opération impossible',
): string {
  if (estRefusDroits(err)) {
    return 'Modification refusée : vos droits sur la page Classeur ne le permettent pas.'
  }
  const code =
    typeof err === 'object' && err !== null
      ? (err as ErreurPostgres).code
      : undefined
  // Erreur de la BASE (code SQLSTATE ou PostgREST) : jamais le message brut,
  // qui nomme tables, contraintes et colonnes (audit de sécurité du
  // 2026-09-28). Une phrase par famille suffit à l'utilisateur.
  if (typeof code === 'string' && code !== '') {
    if (code === '23505') return `${action} : cet élément existe déjà.`
    if (code.startsWith('23') || code.startsWith('22')) {
      return `${action} : la base a refusé ces données.`
    }
    return `${action}. Réessayez dans un instant.`
  }
  // Erreur du navigateur (réseau, conversion d'image…) : son message est
  // le nôtre ou celui du navigateur, sans détail de la base.
  const detail = err instanceof Error ? err.message : null
  return detail ? `${action} : ${detail}` : `${action}.`
}
