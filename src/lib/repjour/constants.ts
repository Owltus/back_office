export const TOTAL_ROOMS = 80;
export const VAT_RATE = 10; // TVA hébergement France — fixé en dur

export function toTTC(ht: number): number {
  return ht * (1 + VAT_RATE / 100);
}

// Mois avec index vide pour accès direct par numéro (1-12)
export const MONTHS = [
  '', 'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

// Mois en majuscules sans index vide (pour les selects 0-11)
export const MONTHS_LABELS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

export const DAY_NAMES = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
