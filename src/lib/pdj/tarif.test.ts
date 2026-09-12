import { describe, expect, it } from 'vitest'

import { detectTarifs, detectUnitPrice } from '#/lib/pdj/tarif.ts'

/*
 * Détection du tarif : valeurs RÉELLES tirées de doc/Addon Production _….csv.
 * PDJ → multiples de 19 ; PDJBB → base 10 avec remises (184,99…) ; PDJGROUP10 →
 * base 10 avec gratuités/avoirs (0, négatifs). La détection doit rester robuste.
 */

// Revenus PDJ réels (extrait) : tous multiples de 19.
const PDJ = [380, 418, 456, 570, 190, 171, 209, 38, 152, 114, 95, 342, 323, 475, 494, 266, 532, 247, 76, 57, 133, 19]
// Revenus PDJBB réels (extrait) : base 10, avec des remises non rondes.
const PDJBB = [300, 140, 250, 170, 60, 220, 160, 260, 120, 184.99, 227.53, 280, 190, 240, 500, 370, 30, 270.54]
// Revenus PDJGROUP10 réels (extrait) : base 10, avec 0 et négatifs (avoirs).
const GROUP = [200, 80, 10, 20, 240, 260, 180, 330, 770, 90, 100, 0, -540, -20.02, 610, 550, 130]

describe('detectUnitPrice', () => {
  it('PDJ : détecte 19 € (revenus tous multiples de 19)', () => {
    expect(detectUnitPrice(PDJ)).toBe(19)
  })

  it('PDJBB : détecte 10 € malgré les remises (184,99…)', () => {
    expect(detectUnitPrice(PDJBB)).toBe(10)
  })

  it('PDJGROUP10 : détecte 10 € en ignorant 0 et avoirs négatifs', () => {
    expect(detectUnitPrice(GROUP)).toBe(10)
  })

  it("s'adapte si le prix change (25 €) — rien en dur", () => {
    expect(detectUnitPrice([500, 250, 25, 75, 125, 1000])).toBe(25)
  })

  it('trop peu de données → null', () => {
    expect(detectUnitPrice([38, 19])).toBeNull()
  })
})

describe('detectTarifs', () => {
  it('renvoie un tarif par code, code indétectable absent', () => {
    const t = detectTarifs([
      ...PDJ.map((r) => ({ code: 'PDJ', revenue_ttc: r })),
      ...PDJBB.map((r) => ({ code: 'PDJBB', revenue_ttc: r })),
    ])
    expect(t.get('PDJ')).toBe(19)
    expect(t.get('PDJBB')).toBe(10)
  })
})

/*
 * INCIDENT DU 2026-09-12 — non-régression.
 *
 * Une seule journée Addon non multiple de 19 € (296,00 €) sur 254 jours a fait
 * basculer le tarif PDJ de 19,00 € à 1,00 €, divisant par 19 le CA affiché
 * partout (board, PDF, analytique, bande RepJour). Cause : le départage exigeait
 * le score MAXIMAL au sens strict, et 1,00 € divisait les 254 revenus quand
 * 19,00 € n'en divisait plus que 253.
 *
 * Le candidat 1,00 € n'existe que parce qu'un vieux jour à 19,00 € engendre
 * 1900 / 19 = 100 centimes : les deux conditions doivent être réunies, ce qui
 * explique que le défaut soit resté invisible huit mois.
 */
describe('detectUnitPrice — robustesse à une journée atypique', () => {
  // 253 jours propres (multiples de 19) + la journée qui a tout cassé.
  const HISTORIQUE_REEL = [
    19, // le petit revenu qui fabrique le candidat 1,00 €
    ...Array.from({ length: 252 }, (_, i) => 19 * (3 + (i % 40))),
    296, // 2026-09-12 : exception commerciale, non multiple de 19
  ]

  it('garde 19 € malgré une journée non multiple (incident du 2026-09-12)', () => {
    expect(detectUnitPrice(HISTORIQUE_REEL)).toBe(19)
  })

  it('sans la journée atypique, le résultat est identique', () => {
    expect(detectUnitPrice(HISTORIQUE_REEL.slice(0, -1))).toBe(19)
  })

  it('résiste à plusieurs journées atypiques isolées', () => {
    expect(detectUnitPrice([...HISTORIQUE_REEL, 296, 143.5])).toBe(19)
  })

  it('ne se laisse pas tirer vers un diviseur plus petit', () => {
    // 9,50 € divise TOUS les revenus en multiples de 19 : il ne doit jamais
    // l'emporter, la préférence allant au plus grand candidat en lice.
    expect(detectUnitPrice(HISTORIQUE_REEL)).not.toBe(9.5)
    expect(detectUnitPrice(HISTORIQUE_REEL)).not.toBe(1)
  })

  it('renonce encore quand les revenus sont vraiment dispersés', () => {
    // Le garde-fou SUPPORT_MIN reste actif : pas de tarif inventé sur du bruit.
    expect(detectUnitPrice([101.37, 203.11, 307.53, 409.99, 511.23])).toBeNull()
  })
})
