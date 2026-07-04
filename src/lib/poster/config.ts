/**
 * config.ts — Constantes de configuration du générateur d'affiches A3
 * Porté à l'identique du fork (assets/js/config.js).
 * Le bloc CONFIG.icons du fork (map redondante « pour compatibilité ») n'est
 * pas porté : c'est du code mort, la source des icônes est ailleurs.
 */

/** Palettes de couleurs (5 thèmes) */
export const COLORS = {
  bw: { bg: '#ffffff', text: '#000000', border: '#333333', icon: '#000000', name: 'Noir & Blanc' },
  okko: { bg: '#FFFBF5', text: '#3E3435', border: '#C38F77', icon: '#C38F77', name: 'OKKO' },
  red: { bg: '#FFF5F5', text: '#742A2A', border: '#C53030', icon: '#C53030', name: 'Rouge' },
  blue: { bg: '#F0F4F8', text: '#2C5282', border: '#4299E1', icon: '#4299E1', name: 'Bleu' },
  yellow: { bg: '#FFFEF0', text: '#835B10', border: '#EAB308', icon: '#EAB308', name: 'Jaune' },
} as const

/** Clé d'un thème de couleur */
export type ColorKey = keyof typeof COLORS

/** Dimensions du poster A3 portrait (96 DPI) */
export const POSTER = {
  width: 1123, // A3 portrait, 96 DPI (297 mm)
  height: 1587, // A3 portrait, 96 DPI (420 mm)
  padding: { vertical: 60, horizontal: 80 },
} as const

/** Valeurs par défaut */
export const DEFAULTS = { color: 'okko', icon: 'none', autoSizeMode: true } as const
