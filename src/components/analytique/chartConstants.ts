/*
 * Constantes de rendu communes aux primitives de graphique du socle analytique
 * (KpiLineChart, KpiStackedBarChart). Une seule source pour la hauteur, la marge et
 * les couleurs d'axes/grille — évite les magic numbers dupliqués et la dérive entre
 * les deux graphes et le squelette de chargement.
 */

/** Hauteur du conteneur responsive (px). */
export const CHART_HEIGHT = 220

/** Marge interne du graphe (le `left` négatif rapproche l'axe Y du bord). */
export const CHART_MARGIN = { top: 5, right: 0, left: -25, bottom: 0 } as const

/** Couleur des graduations / libellés d'axes. */
export const CHART_AXIS = 'var(--muted-foreground)'

/** Couleur de la grille et des lignes d'axes. */
export const CHART_GRID = 'var(--border)'
