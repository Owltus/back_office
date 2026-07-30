export const TOTAL_ROOMS = 80;
export const VAT_RATE = 10; // TVA hébergement France — fixé en dur

export function toTTC(ht: number): number {
  return ht * (1 + VAT_RATE / 100);
}

// Constantes de date (mois, jours) DÉPLACÉES dans lib/shared/dates.ts — génériques,
// pas propres à repjour — et ré-exportées ici pour ne casser aucun import existant.
export {
  MONTHS,
  MONTHS_LABELS,
  MONTHS_SHORT,
  DAY_NAMES,
} from '#/lib/shared/dates.ts';
