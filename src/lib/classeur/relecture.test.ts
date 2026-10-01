import { describe, expect, it, vi } from 'vitest'

import { alertesRelecture } from '#/lib/classeur/relecture.ts'
import type { InfoImage } from '#/lib/classeur/relecture.ts'

vi.mock('#/lib/supabase.ts', () => ({ supabase: {} }))

const A = '5/0f2a9b1c-1234-4abc-8def-0123456789ab.webp'
const B = '5/1a2b3c4d-1234-4abc-8def-0123456789ab.webp'

/** Médiathèque : par défaut une capture moyenne, sans souci. */
function mediatheque(
  chemins: string[],
  info: Partial<InfoImage> = {},
): Map<string, InfoImage> {
  return new Map(
    chemins.map((c) => [
      c.toLowerCase(),
      { largeur: 600, hauteur: 400, nom: 'Capture', ...info },
    ]),
  )
}

const lignes = (md: string, connues: string[] | null = []) =>
  alertesRelecture(md, connues === null ? null : mediatheque(connues)).map(
    (a) => a.ligne,
  )

const messages = (
  md: string,
  images: Map<string, InfoImage> | null = mediatheque([A]),
) => alertesRelecture(md, images).map((a) => a.message)

describe('alertesRelecture', () => {
  it('un document propre ne déclenche rien', () => {
    const md = `## Objectif\n\nTexte **gras**.\n\n### Étape\n\n![Écran d'accueil](${A})\n\n[site](https://okko.fr)\n\n| A | B |\n| --- | --- |\n| 1 | 2 |`
    expect(alertesRelecture(md, mediatheque([A]))).toEqual([])
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
    const a = alertesRelecture(md, new Map())
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

describe('alertesRelecture — images (2026-10-01)', () => {
  it('capture trop large pour être lue, mais pas une photo de téléphone', () => {
    const md = `![Écran](${A})`
    expect(
      messages(md, mediatheque([A], { largeur: 1600, hauteur: 900 })),
    ).toEqual([expect.stringMatching(/Capture très large/)])
    expect(
      messages(
        md,
        mediatheque([A], {
          largeur: 1600,
          hauteur: 900,
          nom: 'PXL_20260930_090804989',
        }),
      ),
    ).toEqual([])
  })
  it('bandeau très fin', () => {
    expect(
      messages(
        `![Barre](${A})`,
        mediatheque([A], { largeur: 1000, hauteur: 40 }),
      ),
    ).toEqual([expect.stringMatching(/Bandeau/)])
  })
  it('image très haute en pleine largeur, pas en automatique', () => {
    const portrait = mediatheque([A], { largeur: 900, hauteur: 1600 })
    expect(messages(`![Panneau](${A} "pleine")`, portrait)).toEqual([
      expect.stringMatching(/très haute/),
    ])
    expect(messages(`![Panneau](${A})`, portrait)).toEqual([])
  })
  it('dans une planche ou une étape, la taille est imposée : rien à régler', () => {
    const large = mediatheque([A], { largeur: 1600, hauteur: 900 })
    expect(messages(`:::photos\n![Écran](${A})\n:::`, large)).toEqual([])
    expect(messages(`:::etape\nFaire.\n\n![Écran](${A})\n:::`, large)).toEqual(
      [],
    )
  })
  it('images sans légende : UNE alerte, sur la première', () => {
    const md = `Texte\n\n![PXL_20260930_090804989](${A})\n\n![Caisse – capture 2](${A})\n\n![](${A})`
    const a = alertesRelecture(md, mediatheque([A]))
    expect(a).toHaveLength(1)
    expect(a[0].ligne).toBe(3)
    expect(a[0].message).toMatch(/^3 images sans légende/)
  })
})

describe('alertesRelecture — blocs et pages (2026-10-01)', () => {
  it('bloc avec une espace, bloc inconnu, bloc jamais fermé', () => {
    const md = '::: photos\n\n:::attention\n\n:::etape\nTexte'
    const a = alertesRelecture(md, new Map())
    expect(a.map((x) => x.ligne)).toEqual([1, 3, 5])
    expect(a[0].message).toMatch(/sans espace/)
    expect(a[1].message).toMatch(/Bloc inconnu/)
    expect(a[2].message).toMatch(/jamais fermé/)
  })
  it('un bloc bien fermé ne déclenche rien', () => {
    expect(lignes(`:::photos\n![Vanne](${A})\n:::`, [A])).toEqual([])
  })
  it('du texte dans une planche', () => {
    expect(lignes(`:::photos\nRepérage\n![Vanne](${A})\n:::`, [A])).toEqual([2])
  })
  it('page presque vide à cause d’un saut de page : alerte sur le bon `===`', () => {
    const md = 'a\n\n===\n\nb\n\n===\n\nc'
    const a = alertesRelecture(md, new Map(), [
      { remplissage: 0.8, saut: 1 },
      { remplissage: 0.3, saut: 2 },
      { remplissage: 0.1 },
    ])
    expect(a).toHaveLength(1)
    expect(a[0].ligne).toBe(7)
    expect(a[0].message).toMatch(/30 %/)
  })
})
