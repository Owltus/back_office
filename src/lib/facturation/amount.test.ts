import { describe, expect, it } from 'vitest'

import { detect } from '#/lib/facturation/detect.ts'

/*
 * Lecture du MONTANT sur une facture scannée. C'est un indice d'aide à la
 * saisie, jamais une écriture comptable — mais un indice faux vaut moins que
 * pas d'indice du tout, parce qu'il inspire confiance.
 *
 * Martin, 2026-09-15 : deux défauts trouvés ici, reproduits chacun trois fois.
 *   1. Les milliers séparés par une espace INSÉCABLE — ce que produisent la
 *      plupart des logiciels de facturation français — n'étaient pas reconnus :
 *      « 1 488,60 € » ressortait « 488,60 ». Mille euros disparus sans un mot.
 *   2. Un montant à point décimal (« 12.50 EUR ») était valorisé cent fois trop
 *      cher, parce que le point était effacé comme un séparateur de milliers.
 *      Conséquence : un acompte dérisoire l'emportait sur le vrai total.
 *
 * `extractAmount` n'est pas exportée ; on l'atteint par `detect`, c'est-à-dire
 * par le chemin que prend réellement l'application.
 */

/** Indice de montant lu sur un texte de facture, sans aucune règle d'imputation. */
function montantLu(texte: string): string | null {
  return detect(texte, []).hints.amount
}

/** Les quatre séparateurs de milliers qu'un PDF français peut produire. */
const SEPARATEURS: [string, string][] = [
  ['espace ordinaire', ' '],
  ['espace insécable', '\u00a0'],
  ['espace insécable fine', '\u202f'],
  ['espace fine', '\u2009'],
]

describe('montant — séparateurs de milliers', () => {
  for (const [nom, sep] of SEPARATEURS) {
    it(`lit le montant entier avec une ${nom}`, () => {
      // Oracle : le montant lu doit valoir 1488,60 — la valeur imprimée sur la
      // facture. Toute lecture qui perd le chiffre des milliers est fausse d'un
      // facteur mille, ce qui est exactement le défaut corrigé.
      const lu = montantLu(`Total TTC 1${sep}488,60 €`)
      expect(lu).not.toBeNull()
      expect(lu!.replace(/[^\d,]/g, '')).toBe('1488,60')
    })
  }

  it('lit un montant séparé par des points', () => {
    const lu = montantLu('Total TTC 1.488,60 €')
    expect(lu).toBe('1.488,60')
  })

  it('lit un montant sans millier', () => {
    expect(montantLu('Total TTC 90,00 €')).toBe('90,00')
  })
})

describe('montant — choix du plus gros, les deux conventions décimales', () => {
  it("retient le vrai total, pas l'acompte écrit avec un point décimal", () => {
    // Oracle métier : 900,00 € est plus grand que 12,50 €, quelle que soit la
    // façon dont chacun est écrit. C'est le défaut n°2 : le point décimal était
    // effacé, « 12.50 » valait 1250, et l'acompte gagnait.
    expect(montantLu('Acompte 12.50 EUR puis Total TTC 900,00 €')).toBe('900,00')
  })

  it("retient le vrai total quand l'ordre est inversé", () => {
    // Relation métamorphique : l'ordre d'apparition dans le texte ne doit rien
    // changer au plus grand montant.
    expect(montantLu('Total TTC 900,00 € après acompte 12.50 EUR')).toBe('900,00')
  })

  it('compare correctement un montant à milliers insécables et un montant simple', () => {
    const texte = `Sous-total 990,00 € — Total TTC 1\u202f488,60 €`
    const lu = montantLu(texte)
    expect(lu).not.toBeNull()
    expect(lu!.replace(/[^\d,]/g, '')).toBe('1488,60')
  })

  it('accepte les trois libellés de fin : €, EUR, TTC', () => {
    expect(montantLu('Net 42,00 €')).toBe('42,00')
    expect(montantLu('Net 42,00 EUR')).toBe('42,00')
    expect(montantLu('Net 42,00 TTC')).toBe('42,00')
  })

  it("ne rend rien quand aucun montant n'est repérable", () => {
    expect(montantLu('Facture sans aucun chiffre lisible')).toBeNull()
    expect(montantLu('')).toBeNull()
  })
})
