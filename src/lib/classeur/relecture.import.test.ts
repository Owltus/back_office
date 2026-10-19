import fc from 'fast-check'
import { describe, expect, it, vi } from 'vitest'

import {
  alertesRelecture,
  relireLigneImport,
} from '#/lib/classeur/relecture.ts'
import type { InfoImage } from '#/lib/classeur/relecture.ts'

vi.mock('#/lib/supabase.ts', () => ({ supabase: {} }))

/*
 * Relecture de la réponse d'un LLM avant import (étape 2 du plan
 * `classeur-fonctions-2026-10-04`). Les exemples ci-dessous ont été écrits
 * À LA MAIN avant toute exécution ; les propriétés sont les lois du cahier
 * des charges (médiathèque inconnue ⇒ aucune alerte d'image ; ajouter un
 * paragraphe sans Markdown ne retire aucune alerte).
 */

const A = '24/0f2a9b1c-1234-4abc-8def-0123456789ab.webp'

function mediatheque(chemins: string[]): Map<string, InfoImage> {
  return new Map(
    chemins.map((c) => [
      c.toLowerCase(),
      { largeur: 600, hauteur: 400, nom: 'Capture' },
    ]),
  )
}

const relireImport = (md: string, images: Map<string, InfoImage> | null) =>
  alertesRelecture(md, images, null, 'import')

describe('relecture — contexte import (exemples écrits à la main)', () => {
  it('image inventée + tableau à 4 cases sous 3 colonnes = exactement 2 alertes', () => {
    const md = [
      '![x](24/inexistant.webp)',
      '',
      '| A | B | C |',
      '| --- | --- | --- |',
      '| 1 | 2 | 3 | 4 |',
    ].join('\n')
    const a = relireImport(md, mediatheque([A]))
    expect(a).toEqual([
      {
        ligne: 1,
        image: true,
        message:
          'Image introuvable dans la médiathèque : 24/inexistant.webp (inventée par le LLM ?).',
      },
      {
        ligne: 5,
        message:
          "Tableau : cette ligne a 4 cases pour 3 colonnes, les cases en trop n'apparaîtront pas.",
      },
    ])
  })

  it('a-inserer n’est jamais une image inventée', () => {
    const a = relireImport('![x](a-inserer)', new Map())
    expect(a.filter((x) => x.image === true)).toEqual([])
    expect(a.some((x) => x.message.includes('introuvable'))).toBe(false)
    // Seul le rappel de l'emplacement à remplir.
    expect(a).toHaveLength(1)
    expect(a[0].message).toMatch(/^1 emplacement d'image à remplir/)
  })

  it('une image connue de la médiathèque (casse ignorée) ne dit rien', () => {
    expect(
      relireImport(`![Vue du hall](${A.toUpperCase()})`, mediatheque([A])),
    ).toEqual([])
  })

  it('une adresse externe est aussi une image inventée', () => {
    const a = relireImport('![Plan](https://exemple.fr/plan.png)', new Map())
    expect(a).toHaveLength(1)
    expect(a[0].image).toBe(true)
    expect(a[0].message).toContain('inventée par le LLM')
  })

  it('médiathèque pas encore chargée : aucune alerte d’image', () => {
    expect(relireImport('![x](24/inexistant.webp)', null)).toEqual([])
  })

  it('l’éditeur garde SON message, et ignore un chemin mal formé', () => {
    const manquante = '24/1a2b3c4d-1234-4abc-8def-0123456789ab.webp'
    expect(alertesRelecture(`![x](${manquante})`, new Map())).toEqual([
      {
        ligne: 1,
        image: true,
        message: 'Image introuvable : elle a été supprimée de la médiathèque.',
      },
    ])
    expect(alertesRelecture('![x](24/inexistant.webp)', new Map())).toEqual([])
    expect(
      alertesRelecture('![x](24/inexistant.webp)', new Map(), [], 'editeur'),
    ).toEqual([])
  })

  it('pages = null : aucune alerte de page, le reste inchangé', () => {
    const md = 'Texte\n===\nSuite'
    expect(alertesRelecture(md, new Map(), null)).toEqual([])
    expect(
      alertesRelecture(md, new Map(), [{ saut: 1, remplissage: 0.2 }]),
    ).toHaveLength(1)
  })
})

describe('relireLigneImport', () => {
  const md = '![x](24/inexistant.webp)'
  const ligne = (kind: string, genre: string) => ({
    kind,
    genre,
    apres: { content: md },
  })

  it('relit les documents créés, modifiés ou restaurés', () => {
    for (const genre of ['creation', 'modification', 'restauration']) {
      const a = relireLigneImport(ligne('document', genre), new Map())
      expect(a).toHaveLength(1)
      expect(a?.[0].message).toContain('inventée par le LLM')
    }
  })

  it('ne relit pas une suppression ; chapitre et autre nature : titre et description seuls', () => {
    expect(
      relireLigneImport(ligne('document', 'suppression'), new Map()),
    ).toBeNull()
    // Étape 7 : relus (quatrième mur), mais leur `content` n'est pas un
    // texte imprimé : l'image inventée n'y est pas signalée.
    expect(relireLigneImport(ligne('chapter', 'chapitre'), new Map())).toEqual(
      [],
    )
    expect(
      relireLigneImport(ligne('tracking_sheet', 'modification'), new Map()),
    ).toEqual([])
  })

  it('médiathèque inconnue : liste vide, pas d’alerte d’image', () => {
    expect(relireLigneImport(ligne('document', 'creation'), null)).toEqual([])
  })
})

/** Markdown arbitraire, riche en constructions que la relecture regarde. */
const morceau = fc.oneof(
  fc.constantFrom(
    '![x](24/inexistant.webp)',
    `![Hall](${A})`,
    '![x](a-inserer)',
    '![](https://exemple.fr/a.png)',
    '![photo](5/0f2a9b1c-1234-4abc-8def-0123456789ab.webp "petite")',
    '| A | B |',
    '| --- | --- |',
    '| 1 | 2 | 3 |',
    '# Titre',
    '### Sous-titre',
    ':::photos',
    ':::',
    '::: etape',
    '```',
    '**Gras seul**',
    '- [ ] case',
    '[lien]()',
    '===',
    '',
  ),
  fc.string({ maxLength: 30 }),
)
const markdown = fc.array(morceau, { maxLength: 25 }).map((l) => l.join('\n'))
const mediathequeArb = fc.option(fc.constant(mediatheque([A])), {
  nil: null,
})
const contexteArb = fc.constantFrom('editeur' as const, 'import' as const)

describe('relecture — propriétés', () => {
  it('médiathèque null ⇒ aucune alerte d’image, quel que soit le Markdown', () => {
    fc.assert(
      fc.property(markdown, contexteArb, (md, contexte) => {
        const a = alertesRelecture(md, null, null, contexte)
        expect(a.filter((x) => x.image === true)).toEqual([])
        expect(a.some((x) => /introuvable/.test(x.message))).toBe(false)
      }),
      { numRuns: 300, seed: 20261004 },
    )
  })

  it('ajouter un paragraphe sans Markdown ne retire aucune alerte', () => {
    const paragraphe = fc
      .array(
        fc.constantFrom(
          'le',
          'client',
          'arrive',
          'à',
          'la',
          'réception',
          'puis',
          'repart',
        ),
        {
          minLength: 1,
          maxLength: 12,
        },
      )
      .map((m) => m.join(' '))
    fc.assert(
      fc.property(
        markdown,
        paragraphe,
        mediathequeArb,
        contexteArb,
        (md, p, images, contexte) => {
          const avant = alertesRelecture(md, images, null, contexte)
          const apres = alertesRelecture(
            `${md}\n\n${p}`,
            images,
            null,
            contexte,
          )
          const cles = new Set(
            apres.map((x) => `${String(x.ligne)}|${x.message}`),
          )
          for (const x of avant) {
            expect(cles.has(`${String(x.ligne)}|${x.message}`)).toBe(true)
          }
        },
      ),
      { numRuns: 300, seed: 20261005 },
    )
  })

  it('import : toute image hors médiathèque et hors a-inserer est signalée', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[a-z0-9/._-]{1,30}$/), (src) => {
        fc.pre(src !== 'a-inserer')
        const a = relireImport(`![Légende](${src})`, mediatheque([A]))
        expect(a.filter((x) => x.image === true)).toHaveLength(1)
      }),
      { numRuns: 300, seed: 20261006 },
    )
  })
})

describe('relecture — gestes proposés selon le contexte (audit C3)', () => {
  const md = ['![](24/x.webp)', '', '![Plan](a-inserer)'].join('\n')

  it('à l’import : aucun « cliquez dans l’aperçu », le geste vient après l’import', () => {
    const a = relireImport(md, null)
    expect(a.map((x) => x.message)).toEqual([
      "1 image sans légende : après l'import, ouvrez le document et cliquez sur chaque image pour écrire ce qu'elle montre.",
      "1 emplacement d'image à remplir : après l'import, ouvrez le document et cliquez sur chaque cadre gris pour y mettre la photo.",
    ])
  })

  it('dans l’éditeur : les messages d’avant, inchangés', () => {
    const a = alertesRelecture(md, null)
    expect(a.map((x) => x.message)).toEqual([
      "1 image sans légende : cliquez sur une image dans l'aperçu pour écrire ce qu'elle montre.",
      "1 emplacement d'image à remplir : cliquez sur le cadre gris dans l'aperçu pour y mettre la photo.",
    ])
  })

  it('à l’import : capture trop large ou trop haute, recadrage après l’import', () => {
    const images = new Map([
      ['24/large.webp', { largeur: 1600, hauteur: 300, nom: 'Capture' }],
      ['24/haute.webp', { largeur: 600, hauteur: 2400, nom: 'Capture' }],
    ])
    const a = relireImport(
      '![Écran](24/large.webp)\n\n![Liste](24/haute.webp)',
      images,
    )
    expect(a.length).toBeGreaterThanOrEqual(2)
    for (const x of a) {
      expect(x.message).not.toMatch(/dans l'aperçu|cliquez/i)
      expect(x.message).toMatch(/après l'import/i)
    }
  })
})
