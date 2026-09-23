import { cn } from '#/lib/utils.ts'

/*
 * Classes des deux grilles des pages analytique (cartes de synthèse, graphiques).
 *
 * ⚠ POURQUOI UN MODULE À PART. Elles vivaient dans `AnalytiqueCards.tsx` et
 * `AnalytiqueCharts.tsx`, qui tirent `StatTile`, Recharts et le reste du socle
 * analytique. Le squelette de ROUTE en a besoin — il est monté à la racine,
 * donc dans le chunk d'entrée : les importer de là y aurait fait entrer tout le
 * socle. Isolées ici (deux fonctions, `cn` pour seule dépendance), elles
 * restent la SOURCE UNIQUE partagée par le contenu et son squelette, sans
 * peser sur le démarrage.
 *
 * Les deux fichiers d'origine les ré-exportent : aucun appelant n'a changé.
 */

/** Classe de la grille de cartes — source UNIQUE, partagée avec le squelette de
 * chargement (`AnalytiqueSkeleton`) pour qu'ils ne dérivent jamais l'un de l'autre. */
export function cardsGridClass(cols: number): string {
  return cn(
    'grid shrink-0 grid-cols-2 gap-3',
    cols === 7 && 'sm:grid-cols-4 lg:grid-cols-7',
    cols === 6 && 'sm:grid-cols-3 lg:grid-cols-6',
    cols === 5 && 'sm:grid-cols-5',
    cols !== 5 && cols !== 6 && cols !== 7 && 'sm:grid-cols-4',
  )
}

/** Classe de la grille de graphiques — source UNIQUE, partagée avec le squelette
 * de chargement (`AnalytiqueSkeleton`). */
export function chartsGridClass(cols: number): string {
  return cn('grid shrink-0 grid-cols-1 gap-4', cols > 1 && 'lg:grid-cols-2')
}
