/* --------------------------------------------------------------------------
 * Modèle métier du planning parking (pur : sans React ni présentation).
 *
 * Modèle "hôtel" : arrivée à 14h (après-midi), départ à 12h (matin).
 * Chaque jour est coupé en 2 demi-journées (SLOTS_PER_DAY).
 * ------------------------------------------------------------------------ */

export const SPOTS = 14
export const FIRST_STAFF_SPOT = 13 // places 13 & 14 = "personnel" (tampon)
// Place réservée PMR (personne à mobilité réduite) : affichée avec le pictogramme
// fauteuil au lieu de son numéro. N'a aucun effet métier (occupation, captage…),
// c'est un repère visuel. Source unique du numéro de la place PMR.
export const PMR_SPOT = 8

// Pictogramme PMR (SVG potrace) — SOURCE UNIQUE partagée par l'affichage écran
// (ParkingBoard) et le PDF de suivi (pdf.ts, rasterisé en PNG). viewBox portrait,
// `transform` potrace (repère inversé + échelle). Rendu en `currentColor` à l'écran.
export const PMR_GLYPH = {
  viewBox: '0 0 1122 1280',
  transform: 'translate(0,1280) scale(0.1,-0.1)',
  paths: [
    'M3474 12786 c-133 -22 -288 -78 -399 -144 -469 -280 -676 -833 -505 -1344 16 -48 41 -110 55 -138 25 -50 27 -65 95 -1028 145 -2033 271 -3812 300 -4232 17 -239 33 -453 35 -475 l5 -40 363 0 c199 0 1141 -1 2093 -3 l1732 -2 125 -293 c69 -160 283 -663 477 -1117 342 -802 525 -1231 921 -2157 105 -247 192 -449 193 -450 2 -2 122 44 267 101 561 220 1774 696 1917 751 40 16 71 32 70 35 -70 179 -346 820 -353 820 -9 0 -372 -130 -1075 -385 -96 -35 -178 -60 -182 -57 -4 4 -205 466 -448 1027 -836 1930 -1192 2750 -1203 2775 l-12 25 -520 -3 c-286 -1 -1161 -7 -1943 -13 -783 -6 -1425 -9 -1427 -7 -3 3 -55 668 -55 703 0 13 160 15 1410 15 l1410 0 -2 538 -3 537 -1462 3 c-1160 2 -1463 5 -1463 15 0 6 -29 520 -64 1142 -43 759 -61 1132 -54 1136 6 4 34 9 63 13 29 3 92 17 140 31 354 103 653 400 764 759 99 322 50 677 -135 956 -169 256 -425 431 -728 496 -98 21 -302 26 -402 10z',
    'M2285 7932 c-901 -468 -1603 -1242 -1983 -2187 -303 -754 -378 -1551 -221 -2350 141 -718 471 -1389 960 -1950 98 -113 328 -341 434 -431 407 -347 869 -611 1365 -783 1435 -496 3009 -177 4170 845 221 194 464 463 637 704 129 179 328 515 321 543 -5 23 -732 1506 -736 1502 -2 -2 -14 -63 -27 -137 -131 -762 -555 -1453 -1182 -1925 -306 -230 -690 -418 -1046 -513 -467 -123 -984 -133 -1452 -26 -664 151 -1274 532 -1699 1060 -348 433 -561 921 -648 1481 -25 168 -35 533 -19 701 40 394 130 720 295 1060 241 497 574 889 1008 1186 76 52 88 64 88 88 0 16 -20 290 -45 610 -25 320 -45 586 -45 591 0 18 -28 7 -175 -69z',
  ],
} as const
// Places CLIENT (1..12) : dénominateur du taux d'occupation. Remplir les places
// tampon 13 & 14 pousse alors le taux AU-DESSUS de 100 % (surbooking assumé).
export const CLIENT_SPOTS = FIRST_STAFF_SPOT - 1 // 12
export const SPOTS_LIST = Array.from({ length: SPOTS }, (_, i) => i + 1)
export const SLOTS_PER_DAY = 2 // chaque jour = 2 demi-journées (matin / après-midi)

export type Status = 'reserve' | 'paye' | 'checkout'

export interface Reservation {
  id: string
  client: string
  spot: number // 1..14
  startDay: number // décalage absolu (jours) depuis le lundi de référence
  nights: number // >= 1
  status: Status
  comment: string
}

export type Mode = 'move' | 'resize-left' | 'resize-right'

// Modèle demi-journées : arrivée = après-midi (slot impair), départ = matin (slot pair).
export const arrivalSlot = (startDay: number) => startDay * SLOTS_PER_DAY + 1
export const departureSlot = (startDay: number, nights: number) =>
  (startDay + nights) * SLOTS_PER_DAY

// Chevauchement : arrivée = après-midi, départ = matin (mêmes demi-journées).
export function hasOverlap(
  reservations: Reservation[],
  spot: number,
  startDay: number,
  nights: number,
  ignoreId?: string,
): boolean {
  const start = arrivalSlot(startDay)
  const end = departureSlot(startDay, nights)
  return reservations.some(
    (r) =>
      r.id !== ignoreId &&
      r.spot === spot &&
      arrivalSlot(r.startDay) <= end &&
      start <= departureSlot(r.startDay, r.nights),
  )
}
