// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { chapitre, document, etat } from '#/lib/classeur/merge/fixtures.ts'
import type { PorteeExport } from '#/lib/classeur/exportMarkdown.ts'

/*
 * Export Markdown : les QUATRE combinaisons (un seul fichier ou un par
 * document, avec ou sans les images) toujours possibles, même quand les
 * documents n'ont aucune image (demande utilisateur du 2026-11-16 : « Avec
 * les images » était grisé dans ce cas).
 */

vi.mock('#/lib/supabase.ts', () => ({ supabase: {} }))

const { ExportMarkdownDialog } =
  await import('#/components/classeur/dialogs/ExportMarkdownDialog.tsx')

const A = chapitre({ id: 10, label: 'Accueil', sort_order: 1 })

function portee(contenu: string): PorteeExport {
  const e = etat([A], {
    documents: [
      document({ id: 1, chapter_id: 10, title: 'Check-in', content: contenu }),
    ],
  })
  return { classeurName: 'Essai', chapters: [A], content: e.content }
}

function ouvrir(p: PorteeExport) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ExportMarkdownDialog
        open
        onOpenChange={() => {}}
        portee={p}
        lirePeriodicites={() => Promise.resolve([])}
      />
    </QueryClientProvider>,
  )
}

const radio = (nom: RegExp) => screen.getByRole('radio', { name: nom })
const coche = (nom: RegExp) => radio(nom).getAttribute('aria-checked')
const phrase = () => screen.getByRole('status').textContent

afterEach(cleanup)

const AVEC_IMAGE =
  'Texte\n\n![Photo](1/0f8fad5b-d9cb-469f-a165-70867728950e.webp)\n'

describe('ExportMarkdownDialog — quatre combinaisons', () => {
  it('par défaut : un seul fichier, sans les images', () => {
    ouvrir(portee(AVEC_IMAGE))
    expect(coche(/^Un seul fichier/)).toBe('true')
    expect(coche(/^Sans les images/)).toBe('true')
    expect(phrase()).toBe('Vous recevez Essai.md, un seul fichier Markdown.')
  })

  for (const [titre, contenu] of [
    [
      'avec des images',
      'Texte\n\n![Photo](1/0f8fad5b-d9cb-469f-a165-70867728950e.webp)\n',
    ],
    ['sans aucune image', 'Texte seul\n'],
  ] as const) {
    it(`documents ${titre} : chaque forme se combine avec chaque choix d’images`, () => {
      ouvrir(portee(contenu))
      for (const forme of [/^Un seul fichier/, /^Un fichier par document/])
        for (const images of [/^Avec les images/, /^Sans les images/]) {
          fireEvent.click(radio(forme))
          fireEvent.click(radio(images))
          expect(radio(images).hasAttribute('disabled')).toBe(false)
          expect(coche(forme)).toBe('true')
          expect(coche(images)).toBe('true')
        }
    })
  }

  it('avec les images mais aucune : la phrase dit qu’il n’y a rien à joindre', () => {
    ouvrir(portee('Texte seul\n'))
    fireEvent.click(radio(/^Un fichier par document/))
    fireEvent.click(radio(/^Avec les images/))
    expect(phrase()).toContain('rien à joindre')
    fireEvent.click(radio(/^Sans les images/))
    expect(phrase()).not.toContain('rien à joindre')
  })

  it('avec une image : un fichier par document la joint', () => {
    ouvrir(
      portee(
        'Texte\n\n![Photo](1/0f8fad5b-d9cb-469f-a165-70867728950e.webp)\n',
      ),
    )
    fireEvent.click(radio(/^Un fichier par document/))
    fireEvent.click(radio(/^Avec les images/))
    expect(phrase()).toContain('son image dans un dossier images')
  })
})
