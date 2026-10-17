// Lancer : `deno test --no-check --node-modules-dir=none supabase/functions/send-report/corps.test.ts`
//
// Audit du 2026-10-17 : corps non objet ou champ non chaîne → 500 ; tableau en
// `htmlBody` / `pdfBase64` → plafonds de taille contournés.

import { assert, assertEquals } from 'jsr:@std/assert@1'
import { MAX_HTML, MAX_PDF_BASE64, validerCorps } from './corps.ts'

const bon = { subject: 'Rapport', htmlBody: '<p>x</p>' }

Deno.test('corps non objet → 400', () => {
  for (const brut of [null, 42, 'x', true, [], [bon]]) {
    const r = validerCorps(brut)
    assertEquals(r, { ok: false, status: 400, error: 'Corps de requête invalide' }, JSON.stringify(brut))
  }
})

Deno.test('champ non chaîne → 400 (nombre, booléen, objet, TABLEAU)', () => {
  for (const champ of ['date', 'subject', 'htmlBody', 'pdfBase64', 'pdfName'])
    for (const valeur of [5, true, {}, ['a'], new Array(10).fill('x')]) {
      const r = validerCorps({ ...bon, [champ]: valeur })
      assertEquals(r.ok, false, `${champ}=${JSON.stringify(valeur)}`)
      if (!r.ok) assertEquals(r.status, 400)
    }
})

Deno.test('un tableau ne contourne plus le plafond de taille', () => {
  // Avant : `[gros].length` = 1, sous le plafond ; le tableau partait tel quel.
  const gros = 'x'.repeat(MAX_HTML + 1)
  assertEquals(validerCorps({ ...bon, htmlBody: [gros] }).ok, false)
  assertEquals(validerCorps({ ...bon, pdfBase64: ['A'.repeat(MAX_PDF_BASE64 + 1)] }).ok, false)
  // En chaîne, le plafond s'applique bien.
  assertEquals(validerCorps({ ...bon, htmlBody: gros }), {
    ok: false,
    status: 413,
    error: 'Contenu trop volumineux',
  })
  assertEquals(validerCorps({ ...bon, pdfBase64: 'A'.repeat(MAX_PDF_BASE64 + 1) }), {
    ok: false,
    status: 413,
    error: 'Pièce jointe trop volumineuse',
  })
})

Deno.test('champs absents ou null acceptés, valeurs par défaut', () => {
  const r = validerCorps({ ...bon, date: null, pdfBase64: null, pdfName: null })
  assert(r.ok)
  assertEquals(r.corps, {
    reportDate: '',
    subject: 'Rapport',
    htmlBody: '<p>x</p>',
    pdfBase64: '',
    pdfName: 'rapport.pdf',
  })
})

Deno.test('usage légitime : tout est rendu, sujet et date rognés', () => {
  const r = validerCorps({
    date: ' 2026-10-16 ',
    subject: '  Rep Jour  ',
    htmlBody: '<!doctype html>',
    pdfBase64: 'JVBERi0=',
    pdfName: 'Rep Jour 16-10-2026.pdf',
  })
  assert(r.ok)
  assertEquals(r.corps.reportDate, '2026-10-16')
  assertEquals(r.corps.subject, 'Rep Jour')
  assertEquals(r.corps.pdfName, 'Rep Jour 16-10-2026.pdf')
})

Deno.test('sujet ou corps manquant, nom de fichier invalide → 400', () => {
  assertEquals(validerCorps({ htmlBody: 'x' }), { ok: false, status: 400, error: 'Sujet ou corps manquant' })
  assertEquals(validerCorps({ subject: '   ', htmlBody: 'x' }).ok, false)
  for (const pdfName of ['../a.pdf', 'a/b.pdf', 'a.exe', ''])
    assertEquals(validerCorps({ ...bon, pdfName }), {
      ok: false,
      status: 400,
      error: 'Nom de pièce jointe invalide',
    })
})
