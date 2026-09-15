import { describe, expect, it } from 'vitest'

import { extractReportDate } from '#/lib/repjour/parse/date.ts'

/*
 * La date du rapport est lue dans le NOM du fichier déposé à l'import manuel.
 * Se tromper de date ici range le rapport au mauvais jour, en silence — d'où le
 * refus explicite que la fonction annonce dans son commentaire.
 *
 * Martin, 2026-09-15 : ce refus était INOPÉRANT. Le contrôle reposait sur
 * `isNaN(date.getTime())`, qui ne se déclenche jamais pour une date hors bornes
 * parce que `Date` déborde au lieu d'échouer. Un 30 février passait pour le
 * 1er mars, et un identifiant numérique placé avant la date détournait la
 * lecture vers l'an 1238. Les cas ci-dessous figent la réparation.
 */

describe('extractReportDate — lecture nominale', () => {
  it("prend la date du nom et recule d'un jour (les données sont de la veille)", () => {
    const r = extractReportDate('Comparison_By_Date_20260714.csv')
    expect([r.year, r.month, r.dayOfMonth]).toEqual([2026, 7, 13])
  })

  it('traverse correctement un début de mois', () => {
    const r = extractReportDate('Comparison_By_Date_20260301.csv')
    expect([r.year, r.month, r.dayOfMonth]).toEqual([2026, 2, 28])
  })

  it('traverse correctement un début d\'année', () => {
    const r = extractReportDate('Comparison_By_Date_20260101.csv')
    expect([r.year, r.month, r.dayOfMonth]).toEqual([2025, 12, 31])
  })

  it('donne le bon nombre de jours pour le mois retenu, février bissextile compris', () => {
    // 2028 est bissextile : le rapport du 29 février doit annoncer 29 jours.
    const r = extractReportDate('Comparison_By_Date_20280301.csv')
    expect([r.year, r.month, r.dayOfMonth]).toEqual([2028, 2, 29])
    expect(r.daysInMonth).toBe(29)
  })

  it('accepte un nom horodaté, où la date est suivie de chiffres', () => {
    // Le premier groupe de huit chiffres est déjà la bonne date : ce cas ne
    // doit surtout pas être refusé par le durcissement.
    const r = extractReportDate('Comparison_By_Date_202607141200.csv')
    expect([r.year, r.month, r.dayOfMonth]).toEqual([2026, 7, 13])
  })
})

describe('extractReportDate — noms de fichiers piégeux', () => {
  it("ignore un identifiant numérique placé avant la date", () => {
    // Avant correction : « 12345678 » était lu comme année 1234, mois 56,
    // jour 78, ce qui débordait jusqu'au 16 octobre 1238 SANS lever d'erreur.
    // Ces composantes ne forment aucune date : la recherche doit continuer.
    const r = extractReportDate('Comparison_12345678_20260714.csv')
    expect([r.year, r.month, r.dayOfMonth]).toEqual([2026, 7, 13])
  })

  it('refuse un 30 février au lieu de le décaler en silence', () => {
    // Avant correction : le 30 février 2026 devenait le 2 mars, puis le
    // 1er mars après le recul d'un jour. Le rapport était rangé à une date
    // que personne n'avait demandée.
    expect(() =>
      extractReportDate('Comparison_By_Date_20260230.csv'),
    ).toThrowError(/nom du fichier/)
  })

  it("refuse un mois 13 au lieu de déborder sur l'année suivante", () => {
    // Avant correction : le « mois 13 » devenait janvier 2027, puis le
    // 31 décembre 2026 après le recul d'un jour.
    expect(() =>
      extractReportDate('Comparison_By_Date_20261301.csv'),
    ).toThrowError(/nom du fichier/)
  })

  it('refuse un 29 février sur une année non bissextile', () => {
    // 2026 n'est pas bissextile. C'est le cas le plus insidieux : la date a
    // l'air parfaitement plausible.
    expect(() =>
      extractReportDate('Comparison_By_Date_20260229.csv'),
    ).toThrowError(/nom du fichier/)
  })

  it('refuse un nom sans aucune date lisible', () => {
    expect(() => extractReportDate('export.csv')).toThrowError(/nom du fichier/)
    expect(() => extractReportDate(undefined)).toThrowError(/nom du fichier/)
    expect(() => extractReportDate('')).toThrowError(/nom du fichier/)
  })

  it('reste stable appelée plusieurs fois de suite', () => {
    // Garde-fou : l'expression régulière de recherche est GLOBALE. Hissée au
    // niveau du module, elle conserverait un curseur entre deux appels et le
    // deuxième import de la séance lirait à partir du mauvais endroit.
    const noms = [
      'Comparison_By_Date_20260714.csv',
      'Comparison_12345678_20260714.csv',
      'Comparison_By_Date_20260714.csv',
    ]
    for (const nom of noms) {
      const r = extractReportDate(nom)
      expect([r.year, r.month, r.dayOfMonth]).toEqual([2026, 7, 13])
    }
  })
})
