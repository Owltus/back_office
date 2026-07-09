import { describe, expect, it } from 'vitest'

import {
  buildReportHtml,
  escapeHtml,
  type EmailData,
} from '#/lib/repjour/reportHtml.ts'

const KPI = { nuitees: 60, to: 75, pm: 120, revpar: 90, roomRevenue: 7200 }

const DATA: EmailData = {
  realiseJour: KPI,
  realiseMTD: { ...KPI, nuitees: 500, roomRevenue: 60000 },
  projeteMois: { ...KPI, nuitees: 1800, roomRevenue: 216000 },
  budget: {
    id: 1,
    year: 2026,
    month: 7,
    nuitees: 1700,
    taux_occupation: 70,
    prix_moyen: 118,
    revpar: 83,
    room_revenue: 200000,
  } as EmailData['budget'],
  ecart: {
    nuitees: 100,
    to: 5,
    pm: 2,
    revpar: 7,
    roomRevenue: 16000,
  } as EmailData['ecart'],
  dayOfMonth: 8,
  month: 7,
  year: 2026,
}

describe('buildReportHtml', () => {
  const html = buildReportHtml(DATA)

  it('ne touche jamais au DOM : appelable hors navigateur', () => {
    // Le test tourne sous Node sans jsdom. Si la fonction utilisait `document`,
    // l'appel ci-dessus aurait déjà jeté — c'est tout l'objet de l'extraction.
    expect(typeof html).toBe('string')
    expect(html.length).toBeGreaterThan(0)
  })

  it('rend un tableau avec ses six colonnes', () => {
    expect(html).toContain('<table')
    for (const th of ['Jour', 'Cumul', 'Projeté', 'Budget', 'Écart']) {
      expect(html).toContain(`>${th}</th>`)
    }
  })

  it('rend les cinq indicateurs', () => {
    for (const label of [
      'Nuitées',
      'Taux occupation',
      'Prix moyen',
      'RevPAR',
      "Chiffre d'affaires",
    ]) {
      expect(html).toContain(escapeHtml(label))
    }
  })

  it("colore l'écart en vert au-dessus du budget, en rouge en dessous", () => {
    expect(html).toContain('#4CAF50') // écarts positifs de DATA
    const negatif = buildReportHtml({
      ...DATA,
      ecart: { ...DATA.ecart, nuitees: -50 },
    })
    expect(negatif).toContain('#E53935')
  })

  it("n'emploie aucune couleur oklch (html2canvas ne sait pas les lire)", () => {
    expect(html).not.toContain('oklch')
  })

  it('échappe les caractères qui casseraient le balisage', () => {
    expect(escapeHtml('a & b <script> "x" \'y\'')).toBe(
      'a &amp; b &lt;script&gt; &quot;x&quot; &#39;y&#39;',
    )
  })
})
