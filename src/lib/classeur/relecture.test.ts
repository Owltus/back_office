import { describe, expect, it, vi } from 'vitest'

import { alertesRelecture } from '#/lib/classeur/relecture.ts'

vi.mock('#/lib/supabase.ts', () => ({ supabase: {} }))

const A = '5/0f2a9b1c-1234-4abc-8def-0123456789ab.webp'
const B = '5/1a2b3c4d-1234-4abc-8def-0123456789ab.webp'

const lignes = (md: string, connues: string[] | null = []) =>
  alertesRelecture(md, connues === null ? null : new Set(connues)).map(
    (a) => a.ligne,
  )

describe('alertesRelecture', () => {
  it('un document propre ne déclenche rien', () => {
    const md = `## Objectif\n\nTexte **gras**.\n\n### Étape\n\n![a](${A})\n\n[site](https://okko.fr)\n\n| A | B |\n| --- | --- |\n| 1 | 2 |`
    expect(alertesRelecture(md, new Set([A]))).toEqual([])
  })
  it('image supprimée de la médiathèque, pas d’alerte tant qu’elle n’est pas chargée', () => {
    const md = `![a](${A})\n![b](${B})\n![ext](https://x.fr/i.png)`
    expect(lignes(md, [A])).toEqual([2])
    expect(lignes(md, null)).toEqual([])
    // Casse indifférente.
    expect(lignes(`![a](${A.toUpperCase()})`, [A])).toEqual([])
  })
  it('lien sans adresse, mais pas une image', () => {
    expect(lignes('[voir]()\n[voir](https://)\n[ok](https://a.fr)')).toEqual([
      1, 2,
    ])
    expect(lignes('![img]()')).toEqual([])
  })
  it('titre qui saute un niveau ; le premier titre est libre', () => {
    expect(
      lignes('### Début\n\n# Grand\n\n### Sauté\n\n## Partie\n\n### Ok'),
    ).toEqual([5])
  })
  it('tableau : cases en trop, cases manquantes, séparateur absent', () => {
    const md =
      '| A | B |\n| --- | --- |\n| 1 | 2 | 3 |\n| 4 |\n\n| X | Y |\n| 1 | 2 |'
    const a = alertesRelecture(md, new Set())
    expect(a.map((x) => x.ligne)).toEqual([3, 4, 6])
    expect(a[0].message).toMatch(/en trop/)
    expect(a[2].message).toMatch(/séparation/)
  })
  it('séparateur au mauvais nombre de colonnes : le tableau ne s’affiche pas', () => {
    expect(lignes(['| A | B |', '| --- |', '| 1 | 2 |'].join('\n'))).toEqual([
      2,
    ])
  })
  it('une phrase avec une barre n’est pas un tableau', () => {
    expect(lignes('Horaires : 7h | 10h\nFin')).toEqual([])
  })
  it('le contenu des blocs de code est ignoré', () => {
    expect(lignes('```\n[vide]()\n# a\n### b\n```\n## Ok')).toEqual([])
  })
})
