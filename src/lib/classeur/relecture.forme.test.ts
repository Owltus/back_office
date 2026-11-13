import { describe, expect, it } from 'vitest'

import { alertesRelecture } from '#/lib/classeur/relecture.ts'

/*
 * Forme des documents (audit du 2026-11-13) : trois formes qui se lisent
 * mal, mêmes règles que les consignes du LLM.
 */

const msgs = (md: string) => alertesRelecture(md, null).map((a) => a.message)

describe('relecture — forme des documents', () => {
  it('plus de trois encadrés typés : une alerte, sur le quatrième', () => {
    const e = (t: string) => `> [!${t}]\n> Texte.\n`
    const trois = [e('NOTE'), e('TIP'), e('IMPORTANT')].join('\n')
    expect(msgs(trois).filter((m) => m.includes('encadrés'))).toEqual([])
    const quatre = `${trois}\n${e('WARNING')}`
    const a = alertesRelecture(quatre, null).filter((x) =>
      x.message.includes('encadrés'),
    )
    expect(a).toHaveLength(1)
    expect(a[0].ligne).toBe(10)
    expect(a[0].message).toContain('4 encadrés')
  })

  it('tableau d’étapes numérotées, mais pas un tableau de chiffres ordinaire', () => {
    expect(msgs('| 1 | 2 | 3 |\n| --- | --- | --- |\n| A | B | C |')).toContain(
      "Tableau d'étapes numérotées : il répète les titres de la procédure. Retirez-le, les étapes suffisent.",
    )
    expect(
      msgs('| Étage | Issue |\n| --- | --- |\n| 1 | 2 |').filter((m) =>
        m.includes('Tableau'),
      ),
    ).toEqual([])
  })

  it('section d’une ligne, mais pas une étape numérotée ni une section avec sous-parties', () => {
    expect(
      msgs('## Quand\n\nTous les soirs.\n\n## Suite\n\nTexte.\nEncore.'),
    ).toContain(
      "Section d'une seule ligne : « Quand ». Mettez cette ligne dans la phrase d'ouverture ou dans une autre section.",
    )
    expect(
      msgs('## 2. Fermer\n\nFermer la porte.\n\n## 3. Partir\n\nTexte.'),
    ).toEqual([])
    expect(
      msgs('## Objectif\n\nTexte.\n\n### Détail\n\nTexte.\n\n## Fin\n\nTexte.'),
    ).toEqual([])
  })
})
