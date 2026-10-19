// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { ApercuImport } from '#/components/classeur/dialogs/ApercuImport.tsx'
import type { EtatImages } from '#/components/classeur/dialogs/ApercuImport.tsx'
import type { LigneImport } from '#/lib/classeur/merge/portee.ts'
import type { InfoImage } from '#/lib/classeur/relecture.ts'

vi.mock('#/lib/supabase.ts', () => ({ supabase: {} }))

/*
 * Relecture dans l'aperçu d'un import LLM (étape 2 du plan
 * `classeur-fonctions-2026-10-04`) : pastille sur la ligne repliée, en-tête
 * « N documents », liste au dépliage, et AUCUNE alerte d'image tant que la
 * médiathèque est en cours de lecture.
 */

const INVENTEE = '![x](24/inexistant.webp)'
const TABLEAU = ['| A | B | C |', '| --- | --- | --- |', '| 1 | 2 | 3 | 4 |']

function ligne(
  id: number,
  titre: string,
  content: string,
  over: Partial<LigneImport> = {},
): LigneImport {
  return {
    cle: `document:${String(id)}`,
    genre: 'modification',
    kind: 'document',
    titre,
    avant: { title: titre, description: '', content: 'Ancien texte' },
    apres: { title: titre, description: '', content },
    changement: 'texte',
    ordreChange: false,
    numero: null,
    ...over,
  }
}

const lignes: LigneImport[] = [
  ligne(1, 'Check-in', [INVENTEE, '', ...TABLEAU].join('\n')),
  ligne(2, 'Check-out', '# Titre\n### Sous-titre sauté'),
  ligne(3, 'Propre', 'Un texte sans souci.'),
  ligne(4, 'Supprimé', INVENTEE, { genre: 'suppression' }),
]

function rendre(
  etatImages: EtatImages,
  images: Map<string, InfoImage> | null = new Map(),
  refuses: ReadonlySet<string> = new Set(),
  ouvertes: ReadonlySet<string> = new Set(),
) {
  return render(
    <ApercuImport
      lignes={lignes}
      refuses={refuses}
      onBasculerRefus={() => {}}
      ouvertes={ouvertes}
      onOuvertes={() => {}}
      disabled={false}
      images={images}
      etatImages={etatImages}
    />,
  )
}

afterEach(cleanup)

describe('ApercuImport — relecture', () => {
  it('pastille par ligne repliée et en-tête « N documents »', () => {
    rendre('pret')
    expect(
      screen.getByText(
        "2 documents ont des points à vérifier. L'import reste possible.",
      ),
    ).toBeTruthy()
    // Check-in : image inventée + case en trop ; Check-out : titre sauté.
    expect(screen.getByText('2 points à vérifier')).toBeTruthy()
    expect(screen.getByText('1 point à vérifier')).toBeTruthy()
    // La ligne propre et la suppression ne portent aucune pastille.
    expect(screen.getAllByText(/points? à vérifier$/)).toHaveLength(2)
    expect(screen.queryByText(/Vérification des images en cours/)).toBeNull()
  })

  it('un document refusé ne compte plus dans l’en-tête', () => {
    rendre('pret', new Map(), new Set(['document:2']))
    expect(screen.getByText(/^1 document a des points à vérifier/)).toBeTruthy()
  })

  it('médiathèque en cours : aucune alerte d’image, mention discrète', () => {
    rendre('en-cours', new Map())
    expect(screen.getByText('Vérification des images en cours…')).toBeTruthy()
    // Check-in n'a plus que la case en trop.
    expect(screen.getAllByText('1 point à vérifier')).toHaveLength(2)
    expect(screen.queryByText('2 points à vérifier')).toBeNull()
  })

  it('au dépliage : la liste sous le diff et la note de mise en page', () => {
    rendre('pret', new Map(), new Set(), new Set(['document:1']))
    const liste = screen.getByRole('list', { name: '2 points à vérifier' })
    expect(liste.textContent).toContain(
      "Image introuvable dans la médiathèque : 24/inexistant.webp (inventée par l'IA ?).",
    )
    expect(liste.textContent).toContain('cases en trop')
    expect(
      screen.getByText(
        /La mise en page \(pages, schémas\) sera vérifiée dans l'éditeur/,
      ),
    ).toBeTruthy()
  })

  it('jamais bloquant : la case d’import reste active', () => {
    rendre('pret')
    const caseA = screen.getByLabelText<HTMLInputElement>('Importer Check-in')
    expect(caseA.disabled).toBe(false)
    expect(caseA.checked).toBe(true)
    fireEvent.click(caseA)
  })
})

describe('ApercuImport — réglages des feuilles en clair (étape 6, D4)', () => {
  const feuille = (over: Partial<LigneImport>): LigneImport => ({
    cle: 'tracking_sheet:3',
    genre: 'modification',
    kind: 'tracking_sheet',
    titre: 'Relevé',
    avant: { title: 'Relevé', description: '', content: '' },
    apres: { title: 'Relevé', description: '', content: '' },
    changement: 'autre',
    ordreChange: false,
    numero: null,
    ...over,
  })

  it('« Mensuel → Annuel », « 14 → 20 lignes » au lieu de « réglage modifié »', () => {
    render(
      <ApercuImport
        lignes={[
          feuille({ reglage: 'Mensuel → Annuel' }),
          feuille({
            cle: 'signature_sheet:4',
            kind: 'signature_sheet',
            titre: 'Émargement',
            reglage: '14 → 20 lignes',
          }),
          feuille({
            cle: 'nouveau:signature_sheet:5:Formation',
            genre: 'creation',
            kind: 'signature_sheet',
            titre: 'Formation',
            changement: 'texte',
            reglage: '20 lignes',
          }),
        ]}
        refuses={new Set()}
        onBasculerRefus={() => {}}
        ouvertes={new Set(['tracking_sheet:3'])}
        onOuvertes={() => {}}
        disabled={false}
      />,
    )
    expect(screen.getByText('Mensuel → Annuel')).toBeTruthy()
    expect(screen.getByText('14 → 20 lignes')).toBeTruthy()
    expect(screen.queryByText('réglage modifié')).toBeNull()
    expect(screen.getByText(/Feuille de signature · 20 lignes/)).toBeTruthy()
    expect(
      screen.getByText(
        'Le texte ne change pas. Périodicité : Mensuel → Annuel.',
      ),
    ).toBeTruthy()
  })
})

describe('ApercuImport — quatrième mur (étape 7)', () => {
  it('titre d’une feuille : signalé, « éléments » dans l’en-tête, « Titre » dans la liste', () => {
    const feuille: LigneImport = {
      cle: 'nouveau:signature_sheet:2:Émargement (brouillon généré)',
      genre: 'creation',
      kind: 'signature_sheet',
      titre: 'Émargement (brouillon généré)',
      avant: { title: '', description: '', content: '' },
      apres: {
        title: 'Émargement (brouillon généré)',
        description: '',
        content: '',
      },
      changement: 'texte',
      ordreChange: false,
      numero: null,
    }
    render(
      <ApercuImport
        lignes={[feuille, ligne(1, 'Check-in', 'Texte généré par une IA.')]}
        refuses={new Set()}
        onBasculerRefus={() => {}}
        ouvertes={new Set([feuille.cle as string])}
        onOuvertes={() => {}}
        disabled={false}
        images={new Map()}
        etatImages="pret"
      />,
    )
    expect(
      screen.getByText(
        "2 éléments ont des points à vérifier. L'import reste possible.",
      ),
    ).toBeTruthy()
    const liste = screen.getByRole('list', { name: '1 point à vérifier' })
    expect(liste.textContent).toBe(
      "Titre · Phrase sur l'IA dans le texte. Elle serait imprimée.",
    )
    // Pas de note de mise en page pour une feuille.
    expect(screen.queryByText(/sera vérifiée dans/)).toBeNull()
  })
})
