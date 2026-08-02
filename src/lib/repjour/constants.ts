export const TOTAL_ROOMS = 80;
export const VAT_RATE = 10; // TVA hébergement France — fixé en dur

// Facteur TTC (= 1,10) : source unique pour toute conversion HT <-> TTC. Éviter
// tout « 10 » magique dupliqué ailleurs (parsing, détection).
export const VAT_FACTOR = 1 + VAT_RATE / 100;

export function toTTC(ht: number): number {
  return ht * VAT_FACTOR;
}

export function fromTTC(ttc: number): number {
  return ttc / VAT_FACTOR;
}

// Constantes de date (mois, jours) DÉPLACÉES dans lib/shared/dates.ts — génériques,
// pas propres à repjour — et ré-exportées ici pour ne casser aucun import existant.
export {
  MONTHS,
  MONTHS_LABELS,
  MONTHS_SHORT,
  DAY_NAMES,
} from '#/lib/shared/dates.ts';
