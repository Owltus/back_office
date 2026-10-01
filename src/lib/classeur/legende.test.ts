import { describe, expect, it } from 'vitest'

import {
  estLegendeGenerique,
  legendeAffichable,
  nettoyerLegende,
} from '#/lib/classeur/legende.ts'

describe('légendes génériques (masquées, jamais réécrites)', () => {
  // Échantillon des 102 textes réels relevés en base le 2026-09-30.
  const reels = [
    'PXL_20260930_090804989',
    'PXL_20260930_091551682',
    'Caisse – capture 1',
    'Création de devis groupe (BackYou) – capture 36',
    "Gestion des objets trouvés – Peek'in – capture 4",
    'Règlement via Adyen – Pay By Link – capture 7',
  ]
  it('les 2 familles réelles sont reconnues', () => {
    for (const t of reels) expect(estLegendeGenerique(t)).toBe(true)
  })

  it('noms de fichiers usuels', () => {
    for (const t of [
      '',
      '   ',
      'image',
      'IMG_4521',
      'IMG_20250101_120000',
      'Screenshot 2026-09-30 101010',
      'Capture d’écran 2026-09-30 à 10.10.10',
      'WhatsApp Image 2026-09-30 at 10.10.10',
      'photo.jpg',
      'DSC0042',
      '20260930_101010',
    ])
      expect(estLegendeGenerique(t)).toBe(true)
  })

  it('les vraies légendes passent', () => {
    for (const t of [
      'Manchette 1 : près du ballon rouge, en hauteur',
      'Bouton NEW en haut à gauche',
      'Bac à sel ouvert',
      '2 vannes du by-pass',
      'Capture du tableau des tarifs',
    ]) {
      expect(estLegendeGenerique(t)).toBe(false)
      expect(legendeAffichable(`  ${t} `)).toBe(t)
    }
  })

  it('nettoyer : ni crochets ni retours', () => {
    expect(nettoyerLegende(' A [b]\nc ')).toBe('A b c')
  })
})
