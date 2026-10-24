import { describe, expect, it, vi } from 'vitest'

import {
  alertesRelecture,
  appliquerCorrections,
} from '#/lib/classeur/relecture.ts'
import type { InfoImage, InfoPage } from '#/lib/classeur/relecture.ts'

vi.mock('#/lib/supabase.ts', () => ({ supabase: {} }))

/*
 * Corrections MÉCANIQUES de la relecture (2026-10-24). Oracle, pour chaque
 * point : une fois la correction appliquée, (1) le texte vaut exactement
 * l'attendu, écrit à la main, et (2) la relecture ne signale plus ce point.
 */

const CHEMIN = '5/0f2a9b1c-1234-4abc-8def-0123456789ab.webp'

function relire(
  md: string,
  images: Map<string, InfoImage> = new Map(),
  pages: InfoPage[] = [],
) {
  return alertesRelecture(md, images, pages)
}

/** Corrige le SEUL point dont le message contient `motif`. */
function corriger(
  md: string,
  motif: string,
  images?: Map<string, InfoImage>,
  pages?: InfoPage[],
): string {
  const visees = relire(md, images, pages).filter((a) =>
    a.message.includes(motif),
  )
  expect(visees, motif).toHaveLength(1)
  const c = visees[0].correction
  expect(c, motif).toBeDefined()
  const apres = appliquerCorrections(md, c ? [c] : [])
  expect(
    relire(apres, images, pages).some((a) => a.message.includes(motif)),
    `${motif} encore signalé`,
  ).toBe(false)
  return apres
}

describe('corrections mécaniques', () => {
  it('ligne en gras → titre, un niveau sous le titre précédent', () => {
    expect(corriger('## Accueil\n\n**Les papiers**\n\nTexte.', 'en gras')).toBe(
      '## Accueil\n\n### Les papiers\n\nTexte.',
    )
    // Sans titre avant : titre de partie.
    expect(corriger('**Les papiers**\nTexte.', 'en gras')).toBe(
      '## Les papiers\nTexte.',
    )
  })

  it('ligne en gras dans un bloc : aucune correction (titre au-dessus)', () => {
    const md = ':::etape\n**Couper**\n:::'
    const a = relire(md).find((x) => x.message.includes('en gras'))
    expect(a?.correction).toBeUndefined()
  })

  it('titre sauté → niveau suivant', () => {
    expect(corriger('# A\n\n### B', 'Titre sauté')).toBe('# A\n\n## B')
  })

  it('émoji retiré, avec son sélecteur de variante', () => {
    expect(corriger('- ⚠️ Couper le gaz', 'Émoji')).toBe('- Couper le gaz')
    expect(corriger('Fin ✅', 'Émoji')).toBe('Fin ')
  })

  it('lien sans adresse → texte seul', () => {
    expect(corriger('Voir [le plan]() ici.', 'Lien sans adresse')).toBe(
      'Voir le plan ici.',
    )
  })

  it('bloc mal écrit ou mal nommé', () => {
    expect(corriger('::: photos\n![a](x)\n:::', 'Bloc mal écrit')).toBe(
      ':::photos\n![a](x)\n:::',
    )
    expect(corriger(':::photo\n![a](x)\n:::', 'Bloc inconnu')).toBe(
      ':::photos\n![a](x)\n:::',
    )
    expect(
      corriger(':::étapes{photo=gauche}\nTexte\n:::', 'Bloc inconnu'),
    ).toBe(':::etape{photo=gauche}\nTexte\n:::')
    // Un nom sans voisin connu : pas de correction.
    const a = relire(':::galerie\n:::').find((x) =>
      x.message.includes('Bloc inconnu'),
    )
    expect(a?.correction).toBeUndefined()
  })

  it('texte dans une planche → remonté au-dessus', () => {
    expect(
      corriger(':::photos\n![a](x)\nLes vannes.\n![b](y)\n:::', 'Planche'),
    ).toBe('Les vannes.\n\n:::photos\n![a](x)\n![b](y)\n:::')
  })

  it('saut de page inutile retiré', () => {
    const md = 'A\n\n===\n\nB'
    expect(
      corriger(md, 'Saut de page', new Map(), [
        { remplissage: 0.2, saut: 1 },
        { remplissage: 0.9 },
      ]),
    ).toBe('A\n\n\nB')
  })

  it('image supprimée → emplacement à remplir, légende et taille gardées', () => {
    expect(
      corriger(
        `![Vanne rouge](${CHEMIN} "petite cadre=10,10,50,50")`,
        'Image introuvable',
      ),
    ).toBe('![Vanne rouge](a-inserer "petite")')
  })

  it('image très haute à taille imposée → automatique, cadre gardé', () => {
    const images = new Map([
      [CHEMIN, { largeur: 400, hauteur: 2000, nom: 'Capture' }],
    ])
    const apres = corriger(
      `![Écran](${CHEMIN} "pleine cadre=0,0,100,90")`,
      'Image très haute',
      images,
    )
    expect(apres).toBe(`![Écran](${CHEMIN} "cadre=0,0,100,90")`)
  })

  it('tableaux : séparateur, case null, ligne courte, séparateur absent', () => {
    expect(
      corriger('| A | B |\n| --- |\n| 1 | 2 |', 'ligne de séparation a'),
    ).toBe('| A | B |\n| --- | --- |\n| 1 | 2 |')
    expect(corriger('| A | B |\n| --- | --- |\n| null | 2 |', 'null')).toBe(
      '| A | B |\n| --- | --- |\n|  | 2 |',
    )
    expect(
      corriger('| A | B | C |\n| --- | --- | --- |\n| 1 |', '1 case pour'),
    ).toBe('| A | B | C |\n| --- | --- | --- |\n| 1 |  |  |')
    expect(corriger('| A | B |\n| 1 | 2 |', 'sans ligne de séparation')).toBe(
      '| A | B |\n| --- | --- |\n| 1 | 2 |',
    )
  })

  it('le sens reste à la personne : aucune correction', () => {
    const md = `- ${'mot '.repeat(40)}\n![capture 3](${CHEMIN})\n![x](a-inserer)`
    const images = new Map([
      [CHEMIN, { largeur: 1900, hauteur: 900, nom: 'Capture' }],
    ])
    const sans = relire(md, images).filter((a) => !a.correction)
    expect(sans.map((a) => a.message.split(' ')[0])).toEqual(
      expect.arrayContaining(['Étape', 'Capture', '1', '1']),
    )
    expect(relire(md, images).every((a) => !a.correction)).toBe(true)
  })
})

describe('appliquerCorrections', () => {
  it('tout corriger en une fois, de la dernière à la première', () => {
    const md = '# A\n\n### B\n\n**C**\n\nVoir [x]().\n\n- 🔥 Feu'
    const tout = relire(md).flatMap((a) => (a.correction ? [a.correction] : []))
    expect(tout).toHaveLength(4)
    expect(appliquerCorrections(md, tout)).toBe(
      '# A\n\n## B\n\n### C\n\nVoir x.\n\n- Feu',
    )
  })

  it('correction caduque (texte changé depuis) : sautée', () => {
    const [a] = relire('**Titre**')
    expect(a.correction).toBeDefined()
    if (!a.correction) return
    expect(appliquerCorrections('**Autre**', [a.correction])).toBe('**Autre**')
  })

  it('corrections qui se chevauchent : la seconde attend la relecture suivante', () => {
    const md = ':::photos\n![a](x)\nUn.\nDeux.\n:::'
    const cs = relire(md).flatMap((a) => (a.correction ? [a.correction] : []))
    expect(cs).toHaveLength(2)
    const une = appliquerCorrections(md, cs)
    expect(une).toBe('Un.\n\n:::photos\n![a](x)\nDeux.\n:::')
    const reste = relire(une).flatMap((a) =>
      a.correction ? [a.correction] : [],
    )
    expect(appliquerCorrections(une, reste)).toBe(
      'Un.\n\nDeux.\n\n:::photos\n![a](x)\n:::',
    )
  })

  it('les blocs de code ne sont jamais touchés', () => {
    const md = '```\n**Gras**\n🔥\n```'
    expect(relire(md)).toEqual([])
  })
})
