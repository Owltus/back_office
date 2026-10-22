import { describe, expect, it, vi } from 'vitest'

vi.mock('#/lib/supabase.ts', () => ({ supabase: {} }))

const { bilanEntree, bilanRestauration, libellerEntree } =
  await import('#/components/classeur/dialogs/HistoriqueDialog.tsx')

/*
 * Points de restauration pris avant un import (vus au navigateur le
 * 2026-10-22) : « Fusion depuis Import dans le chapitre X », « 2 ajouté(s),
 * 0 mis à jour », « 3 supprimé(s) ». Mêmes mots que l'aperçu d'import
 * (décision utilisateur du 2026-10-20 : ni « fusion » ni jargon), accords
 * faits.
 */

describe('points pris avant un import', () => {
  it('la description dit ce qui a été importé, sans « fusion »', () => {
    const l = libellerEntree({
      kind: 'fusion',
      label: '',
      source_name: 'Import dans le chapitre Sécurité incendie',
    })
    expect(l.titre).toBe('Avant un import')
    expect(l.description).toBe('Import dans le chapitre Sécurité incendie')
    expect(
      libellerEntree({ kind: 'fusion', label: '', source_name: '' })
        .description,
    ).toBe('Un fichier')
  })

  it('bilan accordé, jamais de « (s) »', () => {
    expect(
      bilanEntree({ inserted: 1, updated: 0, unchanged: 14, skipped: 0 }),
    ).toBe('1 ajouté, 0 modifié, 14 inchangés')
    expect(
      bilanEntree({ inserted: 2, updated: 3, unchanged: 1, skipped: 2 }),
    ).toBe('2 ajoutés, 3 modifiés, 1 inchangé, 2 ignorés')
  })

  it('restauration : « mis à la corbeille », pas « supprimé(s) »', () => {
    expect(bilanRestauration({ inserted: 0, updated: 0, deleted: 3 })).toBe(
      'Point restauré : 0 ajouté, 0 modifié, 3 mis à la corbeille.',
    )
    expect(bilanRestauration({ inserted: 2, updated: 1, deleted: 0 })).toBe(
      'Point restauré : 2 ajoutés, 1 modifié.',
    )
  })
})
