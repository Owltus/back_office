import { describe, expect, it } from 'vitest'

import { droitAuRattrapage } from '#/lib/planning/regles.ts'
import { avecAnciennete } from '#/lib/planning/semaine.ts'
import type { Salarie } from '#/lib/planning/types.ts'

/*
 * Ancienneté CUMULÉE sur tous les contrats d'une personne (décision
 * utilisateur du 2026-11-12 : « n'analyse pas que leur dernier contrat »).
 */

const contrat = (
  id: number,
  date_entree: string | null,
  date_sortie: string | null,
  suite_de: number | null = null,
): Salarie =>
  ({
    id,
    prenom: 'Test',
    nom: '',
    type_contrat: 'cdi',
    date_entree,
    date_sortie,
    suite_de,
    actif: true,
  }) as unknown as Salarie

const de = (liste: Salarie[], id: number) =>
  avecAnciennete(liste).find((x) => x.id === id) as Salarie

describe('ancienneté cumulée', () => {
  it('accepté : un nouveau contrat garde l ancienneté du précédent', () => {
    const liste = [
      contrat(2, '2024-01-16', '2026-12-06'),
      contrat(224, '2026-12-07', null, 2),
    ]
    const nouveau = de(liste, 224)
    expect(nouveau.anciennete).toBe('2024-01-16')
    expect(droitAuRattrapage(nouveau, '2026-12-25')).toBe(true)
  })

  it('refusé : sans le contrat d avant, le nouveau contrat n a pas un an', () => {
    const seul = contrat(224, '2026-12-07', null)
    expect(de([seul], 224).anciennete).toBeUndefined()
    expect(droitAuRattrapage(seul, '2026-12-25')).toBe(false)
  })

  it('les jours sans contrat entre deux contrats ne comptent pas', () => {
    // Juillet et août sans contrat (62 jours) : un an cumulé le 4 mars 2026.
    const liste = [
      contrat(1, '2025-01-01', '2025-06-30'),
      contrat(2, '2025-09-01', null, 1),
    ]
    const x = de(liste, 2)
    expect(x.anciennete).toBe('2025-03-04')
    expect(droitAuRattrapage(x, '2026-03-03')).toBe(false)
    expect(droitAuRattrapage(x, '2026-03-04')).toBe(true)
  })
})
