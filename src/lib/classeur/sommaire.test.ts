import { describe, expect, it } from 'vitest'

import {
  construireSommaire,
  contenuDuChapitre,
  titreOuDefaut,
  trierChapitres,
} from '#/lib/classeur/sommaire.ts'
import type { ChapterContent, DbChapter } from '#/lib/classeur/types.ts'

const HORODATAGE = {
  uuid: 'u',
  deleted_at: null,
  created_at: '2026-09-25T10:00:00Z',
  updated_at: '2026-09-25T10:00:00Z',
}

function chapitre(id: number, label: string, sort_order: number): DbChapter {
  return { ...HORODATAGE, id, classeur_id: 1, label, icon: 'Shield', description: '', sort_order }
}

const chapters = [chapitre(2, 'Incendie', 2), chapitre(1, 'Accueil', 1), chapitre(3, 'Vide', 3)]

const content: ChapterContent = {
  documents: [
    { ...HORODATAGE, id: 1, chapter_id: 1, title: 'Consignes', description: '', content: '', sort_order: 2 },
    { ...HORODATAGE, id: 2, chapter_id: 2, title: '   ', description: '', content: '', sort_order: 1 },
  ],
  tracking_sheets: [
    { ...HORODATAGE, id: 1, chapter_id: 1, title: 'Extincteurs', periodicite_id: 1, sort_order: 1 },
  ],
  signature_sheets: [],
  intercalaires: [],
}

describe('trierChapitres', () => {
  it('trie par sort_order sans muter l entrée', () => {
    const out = trierChapitres(chapters)
    expect(out.map((c) => c.label)).toEqual(['Accueil', 'Incendie', 'Vide'])
    expect(chapters[0].label).toBe('Incendie')
  })
})

describe('contenuDuChapitre', () => {
  it('ne garde que les éléments du chapitre demandé', () => {
    const c = contenuDuChapitre(content, 1)
    expect(c.documents.map((d) => d.id)).toEqual([1])
    expect(c.tracking_sheets).toHaveLength(1)
    expect(contenuDuChapitre(content, 3).documents).toHaveLength(0)
  })
})

describe('construireSommaire', () => {
  it('numérote par position, garde les chapitres vides et remplace un titre blanc', () => {
    expect(titreOuDefaut('  ')).toBe('Sans titre')
    const s = construireSommaire(chapters, content)
    expect(s).toEqual([
      { number: 1, label: 'Accueil', icon: 'Shield', items: ['Extincteurs', 'Consignes'] },
      { number: 2, label: 'Incendie', icon: 'Shield', items: ['Sans titre'] },
      { number: 3, label: 'Vide', icon: 'Shield', items: [] },
    ])
  })
})
