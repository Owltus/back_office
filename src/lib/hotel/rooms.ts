import { range } from '#/lib/utils.ts'

/*
 * Inventaire des chambres de l'hôtel (OKKO Nantes) — source unique partagée.
 *
 * 80 chambres sur 6 étages ; le numéro encode l'étage (centaine). Les étages 1
 * et 6 sont partiels (pas de 101, étage 6 en 621-631). Réutilisé par PDJ
 * (affichage live des couverts) et Rapprochement (grille cochable housekeeping).
 */
export const ALL_ROOMS = [
  ...range(102, 114), // étage 1 (13)
  ...range(201, 214), // étage 2 (14)
  ...range(301, 314), // étage 3 (14)
  ...range(401, 414), // étage 4 (14)
  ...range(501, 514), // étage 5 (14)
  ...range(621, 631), // étage 6 (11)
]

/** Étage d'une chambre (centaine du numéro). */
export const floorOf = (room: number) => Math.floor(room / 100)
