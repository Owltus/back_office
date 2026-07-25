/*
 * Extraction du SIRET / SIREN d'une facture — logique PURE (testable en Node, sans
 * React/DOM/Supabase). Le SIREN identifie l'ENTREPRISE (9 chiffres) ; le SIRET, un de ses
 * ÉTABLISSEMENTS (14 chiffres = SIREN + NIC). On reconnaît l'émetteur bien plus sûrement
 * par ce numéro que par son nom (EDF, RTE, SFR : trop courts ; un nom mal océrisé casse la
 * reconnaissance). Décision : on regroupe par SIREN (l'entreprise), d'où le renvoi des
 * 9 premiers chiffres même quand un SIRET complet est lu.
 */

/** Séparateurs tolérés entre groupes de chiffres : espace ordinaire, point, et les espaces
 *  insécable (U+00A0), insécable fine (U+202F, séparateur de milliers français) et fine
 *  (U+2009) — courantes en typographie française et dans les extractions PDF. Défini par
 *  échappements explicites (aucun caractère invisible dans la source). */
const SEP = '[ .\\u00a0\\u202f\\u2009]?'
/** SIRET (14 chiffres) et SIREN (9 chiffres), séparateurs tolérés. Les lookaround
 *  (?<!\d) / (?!\d) bornent le motif par des non-chiffres pour ne pas tailler 14 chiffres
 *  au milieu d'un nombre plus long. */
const SIRET_RE = new RegExp(`(?<!\\d)\\d(?:${SEP}\\d){13}(?!\\d)`, 'g')
const SIREN_RE = new RegExp(`(?<!\\d)\\d(?:${SEP}\\d){8}(?!\\d)`, 'g')

/** Clé de Luhn : somme pondérée (un chiffre sur deux doublé depuis la droite) ≡ 0 mod 10.
 *  Le SIREN et le SIRET la vérifient — c'est ce qui écarte les faux positifs (montants,
 *  numéros de facture, références) qui, eux, n'ont aucune raison d'y satisfaire. */
function luhn(digits: string): boolean {
  let sum = 0
  let double = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48 // '0' = 48
    if (d < 0 || d > 9) return false
    if (double) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
    double = !double
  }
  return sum % 10 === 0
}

/**
 * Renvoie le SIREN (9 chiffres) de l'émetteur lu dans `text`, ou null si rien de valide.
 * On cherche d'abord un SIRET (14 chiffres, plus spécifique) et on en retourne les 9 premiers
 * chiffres ; à défaut, un SIREN (9 chiffres). Chaque candidat est validé par la clé de Luhn.
 *
 * Note : le SIREN de La Poste (356000000) satisfait Luhn et est donc reconnu tel quel ; seul
 * son SIRET *compact* (14 chiffres collés, cas rare) échapperait à la validation — on reste
 * simple à dessein, la forme espacée retombant sur le repli SIREN.
 */
export function extractSiren(text: string): string | null {
  for (const m of text.matchAll(SIRET_RE)) {
    const digits = m[0].replace(/\D/g, '')
    if (luhn(digits)) return digits.slice(0, 9)
  }
  for (const m of text.matchAll(SIREN_RE)) {
    const digits = m[0].replace(/\D/g, '')
    if (luhn(digits)) return digits
  }
  return null
}
