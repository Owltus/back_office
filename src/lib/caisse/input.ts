/*
 * Helpers de saisie pour les champs de la caisse.
 *
 * On utilise des <input type="text"> (jamais type="number") : les flèches
 * natives (spinners) de type="number" sont impossibles à masquer de façon
 * fiable (Lightning CSS retire le `-webkit-appearance: none` requis par WebKit),
 * et l'ajustement se fait de toute façon par des boutons +/-. Ces fonctions
 * pures nettoient / convertissent la saisie ; elles sont testées isolément.
 */

/**
 * Nettoie une saisie monétaire : conserve chiffres et UN seul séparateur
 * décimal, normalisé en virgule (affichage FR). Ne parse pas — préserve les
 * états intermédiaires de frappe comme "12," ou "12,5".
 */
export function sanitizeAmount(raw: string): string {
  let s = raw.replace(/[^0-9.,]/g, '').replace(/\./g, ',')
  const i = s.indexOf(',')
  if (i !== -1) {
    // un seul séparateur : on retire les virgules suivantes
    s = s.slice(0, i + 1) + s.slice(i + 1).replace(/,/g, '')
  }
  return s
}

/** Nombre à partir d'une saisie monétaire nettoyée (',' décimal). */
export function amountValue(text: string): number {
  if (text === '' || text === ',') return 0
  const n = parseFloat(text.replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

/** Texte d'affichage d'un montant en saisie FR (0 → champ vide). */
export function amountText(value: number): string {
  return value === 0 ? '' : String(value).replace('.', ',')
}

/** Nettoie une saisie de comptage (entier ≥ 0) : chiffres uniquement. */
export function sanitizeCount(raw: string): string {
  return raw.replace(/[^0-9]/g, '')
}

/** Entier ≥ 0 à partir d'une saisie de comptage. */
export function countValue(text: string): number {
  const s = sanitizeCount(text)
  if (s === '') return 0
  const n = parseInt(s, 10)
  return Number.isFinite(n) ? Math.max(0, n) : 0
}
