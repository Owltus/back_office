/*
 * Visuels des coupures euro (billets / pièces), bundlés par Vite.
 *
 * Séparé de `DENOMINATIONS` (lib/caisse/constants.ts, métier pur) : un chemin
 * d'asset est une préoccupation de présentation, pas de la donnée métier importée
 * par les calculs et le mapping DB. Écran (<img>) et PDF (rasterisation) lisent
 * la même URL ici — source unique.
 */

import type { DenomKey } from '#/lib/caisse/types.ts'

import billet5 from './billet-5.svg'
import billet10 from './billet-10.svg'
import billet20 from './billet-20.svg'
import billet50 from './billet-50.svg'
import billet100 from './billet-100.svg'
import billet200 from './billet-200.svg'
import billet500 from './billet-500.svg'
import piece1c from './piece-1c.svg'
import piece2c from './piece-2c.svg'
import piece5c from './piece-5c.svg'
import piece10c from './piece-10c.svg'
import piece20c from './piece-20c.svg'
import piece50c from './piece-50c.svg'
import piece1e from './piece-1e.svg'
import piece2e from './piece-2e.svg'

/** URL (bundlée) du visuel de chaque coupure. */
export const DENOM_SVG: Record<DenomKey, string> = {
  cnt_500: billet500,
  cnt_200: billet200,
  cnt_100: billet100,
  cnt_50: billet50,
  cnt_20: billet20,
  cnt_10: billet10,
  cnt_5: billet5,
  cnt_2: piece2e,
  cnt_1: piece1e,
  cnt_050: piece50c,
  cnt_020: piece20c,
  cnt_010: piece10c,
  cnt_005: piece5c,
  cnt_002: piece2c,
  cnt_001: piece1c,
}
