/*
 * Clés TanStack Query de la page Planning — SOURCE UNIQUE. Toutes commencent
 * par 'planning' : préfixe invalidé après une écriture, et JAMAIS écrit sur
 * disque (`PREFIXES_SENSIBLES` de `lib/queryPersist.ts` : noms du staff,
 * contrats, absences dont la maladie, sur un poste partagé).
 */
export const planningKeys = {
  all: ['planning'] as const,
  /** Équipe, postes, horaires, motifs, catégories, besoins, verrous. */
  referentiel: () => ['planning', 'referentiel'] as const,
  /** Shifts de la semaine et de ses deux voisines, jours d'absence autour. */
  semaine: (lundi: string) => ['planning', 'semaine', lundi] as const,
  /** Shifts et absences d'un mois (vue mois). */
  mois: (premierLundi: string, nbSemaines: number) =>
    ['planning', 'mois', premierLundi, nbSemaines] as const,
  /** Jours d'absence d'une personne (fiche). */
  absences: (salarieId: number) => ['planning', 'absences', salarieId] as const,
  /** Shifts relus par le contrôle des données à ranger, depuis le lundi
   * `depuis` (six mois en arrière, puis tout l'avenir posé). */
  aRanger: (depuis: string) => ['planning', 'a-ranger', depuis] as const,
  /** Shifts à venir d'une personne (fiche). */
  shiftsSalarie: (salarieId: number) =>
    ['planning', 'shifts-salarie', salarieId] as const,
}
