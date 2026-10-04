import { describe, expect, it, vi } from 'vitest'

import {
  alertesRelecture,
  relireLigneImport,
} from '#/lib/classeur/relecture.ts'
import type { InfoImage, InfoPage } from '#/lib/classeur/relecture.ts'

vi.mock('#/lib/supabase.ts', () => ({ supabase: {} }))

/*
 * Bords de la relecture (étape 2 du plan `classeur-fonctions-2026-10-04`,
 * score de mutation de `relecture.ts`). Chaque attendu est écrit à la main
 * depuis la règle : messages exacts, frontières (strict / large), ancrages
 * des expressions régulières. Dimensions d'image : 96 px = 25,4 mm, colonne
 * de 190 mm, capture automatique bornée à 15 cm, « pleine » à 17 cm,
 * « petite » = 33 % de 190 mm, « moyenne » = 50 %.
 */

const A = '5/0f2a9b1c-1234-4abc-8def-0123456789ab.webp'

function med(info: Partial<InfoImage> = {}): Map<string, InfoImage> {
  return new Map([[A, { largeur: 600, hauteur: 400, nom: 'Capture', ...info }]])
}

const msgs = (
  md: string,
  images: Map<string, InfoImage> | null = new Map(),
  pages: readonly InfoPage[] | null = [],
) => alertesRelecture(md, images, pages).map((a) => a.message)

const img = (titre = '') => `![Écran](${A}${titre === '' ? '' : ` "${titre}"`})`

describe('relecture — titres', () => {
  it('message exact, noms des niveaux', () => {
    expect(msgs('# A\n### B')).toEqual([
      'Titre sauté : « B » est un sous-titre placé après un grand titre.',
    ])
    expect(msgs('## A\n#### B')).toEqual([
      'Titre sauté : « B » est un titre de niveau 4 placé après un titre de partie.',
    ])
  })
  it('titre long abrégé à 40 signes, espaces retirés', () => {
    const long = 'abcdefghij'.repeat(5)
    expect(msgs(`# A\n### ${long}   `)).toEqual([
      `Titre sauté : « ${long.slice(0, 39)}… » est un sous-titre placé après un grand titre.`,
    ])
    const juste = 'x'.repeat(40)
    expect(msgs(`# A\n### ${juste}`)[0]).toContain(`« ${juste} »`)
  })
  it('ancrages : « #A » et sept dièses ne sont pas des titres', () => {
    expect(msgs('# A\n###B')).toEqual([])
    expect(msgs('# A\n####### x')).toEqual([])
    expect(msgs('# A\nx ### y')).toEqual([])
    expect(msgs('# A\n###   B')).toHaveLength(1)
  })
})

describe('relecture — blocs de code et directives', () => {
  it('le contenu d’un bloc de code (``` ou ~~~, même indenté) est ignoré', () => {
    expect(msgs('```\n**Gras**\n```')).toEqual([])
    expect(msgs('  ~~~\n**Gras**\n  ~~~')).toEqual([])
    expect(msgs('x ```\n**Gras**')).toHaveLength(1)
  })
  it('directives : indentation, fermeture avec espaces, fermeture orpheline', () => {
    expect(msgs('  :::photos\n![Vue](a-inserer)\n  :::  ')).toEqual([
      "1 emplacement d'image à remplir : cliquez sur le cadre gris dans l'aperçu pour y mettre la photo.",
    ])
    expect(msgs(':::')).toEqual([])
    expect(msgs('x :::photos')).toEqual([])
    expect(msgs(':::  x')).toEqual([
      'Bloc mal écrit : « :::  x ». Écrivez « :::photos » ou « :::etape » sans espace après les deux-points.',
    ])
  })
  it('texte dans une planche : message exact ; ligne vide ou blanche ignorée', () => {
    expect(msgs(':::photos\n   \n\nUn texte\n:::')).toEqual([
      'Planche de photos : ce texte occupera une rangée entière. Placez-le plutôt au-dessus de la planche, ou en légende d’une photo.',
    ])
  })
  it('une fermeture sans ouverture ne referme pas le bloc suivant', () => {
    expect(msgs(':::\n:::photos\nTexte')).toEqual([
      'Bloc « :::photos » jamais fermé : ajoutez une ligne « ::: » à sa fin, sinon tout ce qui suit y sera rangé.',
      'Planche de photos : ce texte occupera une rangée entière. Placez-le plutôt au-dessus de la planche, ou en légende d’une photo.',
    ])
  })
})

describe('relecture — écriture', () => {
  it('ligne en gras seule : message exact, espaces tolérés', () => {
    expect(msgs('  **Accueil**  ')).toEqual([
      'Ligne en gras utilisée comme titre : « Accueil ». Utilisez le bouton Sous-titre : un vrai titre ne reste jamais seul en bas de page.',
    ])
    expect(msgs('__Accueil__')).toHaveLength(1)
    expect(msgs('**Accueil** suite')).toEqual([])
    expect(msgs('x **Accueil**')).toEqual([])
    expect(msgs('**Ensuite : **')).toEqual([])
  })
  it('étape longue : message exact, puces, numéros, cases', () => {
    const mots = (n: number) => Array.from({ length: n }, () => 'mot').join(' ')
    expect(msgs(`- ${mots(36)}`)).toEqual([
      'Étape longue (36 mots) : découpez-la en étapes plus courtes, une action par étape.',
    ])
    expect(msgs(`- ${mots(35)}`)).toEqual([])
    expect(msgs(`  12. ${mots(36)}`)).toHaveLength(1)
    expect(msgs(`- [ ] ${mots(36)}`)[0]).toContain('(36 mots)')
    expect(msgs(`- [x]  ${mots(36)}`)[0]).toContain('(36 mots)')
    // Sans espace après la puce, ce n'est pas une étape.
    expect(msgs(`-${mots(36)}`)).toEqual([])
    expect(msgs(`x - ${mots(36)}`)).toEqual([])
  })
  it('étape : un lien compte pour son texte', () => {
    const mots = (n: number) => Array.from({ length: n }, () => 'mot').join(' ')
    // 34 mots + « ok » = 35 : rien. Sans réduction, l'adresse ajouterait 2 mots.
    expect(msgs(`- ${mots(34)} [ok](https://x.fr/a b c)`)).toEqual([])
    // 35 mots + « ok » = 36 : signalé (le texte du lien compte).
    expect(msgs(`- ${mots(35)} [ok](u)`)[0]).toContain('(36 mots)')
  })
  it('émoji : message exact', () => {
    expect(msgs('Attention 🔥')).toEqual([
      "Émoji : il s'imprime mal en noir et blanc. Remplacez-le par un mot, ou par un encadré Attention, Important ou Astuce.",
    ])
  })
  it('lien sans adresse : texte de repli, http aussi', () => {
    expect(msgs('[]( )')).toEqual(['Lien sans adresse : « lien ».'])
    expect(msgs('[Voir](http://)')).toEqual(['Lien sans adresse : « Voir ».'])
  })
})

describe('relecture — images (dimensions)', () => {
  it('capture : 1100 px de large passe, au-delà non', () => {
    expect(msgs(img(), med({ largeur: 1100, hauteur: 400 }))).toEqual([])
    expect(msgs(img(), med({ largeur: 1101, hauteur: 400 }))).toEqual([
      "Capture très large : une fois imprimé, son texte sera trop petit pour être lu. Cliquez sur l'image dans l'aperçu et recadrez sur la partie utile.",
    ])
  })
  it('le cadre réduit la largeur prise en compte', () => {
    const large = med({ largeur: 2000, hauteur: 400 })
    expect(msgs(img('cadre=0,0,50,100'), large)).toEqual([])
    expect(msgs(img('cadre=0,0,60,100'), large)[0]).toMatch(
      /^Capture très large/,
    )
  })
  it('le cadre réduit la hauteur prise en compte', () => {
    const haute = med({ largeur: 600, hauteur: 1000 })
    expect(msgs(img(), haute)).toEqual([
      "Capture très haute (environ 15 cm, plus d'une demi-page) : cliquez dessus dans l'aperçu et recadrez sur la partie utile.",
    ])
    expect(msgs(img('cadre=0,0,100,40'), haute)).toEqual([])
    expect(msgs(img('cadre=0,0,100,50'), haute)[0]).toMatch(
      /^Capture très haute/,
    )
  })
  it('image haute à taille imposée : hauteur en cm, conseil Automatique', () => {
    expect(msgs(img('pleine'), med({ largeur: 900, hauteur: 1600 }))).toEqual([
      "Image très haute (environ 17 cm, plus d'une demi-page) : choisissez la taille Automatique ou recadrez-la.",
    ])
  })
  it('bandeau : rapport strictement supérieur à 6 ET moins de 15 mm', () => {
    const bandeau =
      "Bandeau très fin : cliquez sur l'image dans l'aperçu et recadrez sur l'élément utile (un bouton, une case)."
    // Petite (≈ 63 mm) : rapport 6 → 10,4 mm de haut, mais pas > 6.
    expect(msgs(img('petite'), med({ largeur: 600, hauteur: 100 }))).toEqual([])
    expect(msgs(img('petite'), med({ largeur: 700, hauteur: 100 }))).toEqual([
      bandeau,
    ])
    // Moyenne (95 mm) : rapport 6,1 → 15,6 mm, assez haut pour être lu.
    expect(msgs(img('moyenne'), med({ largeur: 610, hauteur: 100 }))).toEqual(
      [],
    )
  })
})

describe('relecture — agrégats et pages', () => {
  it('pluriels des emplacements et des légendes', () => {
    expect(msgs('![a](a-inserer)\n![b](a-inserer)')).toEqual([
      "2 emplacements d'image à remplir : cliquez sur le cadre gris dans l'aperçu pour y mettre la photo.",
    ])
    expect(msgs(`![](${A})`, med())).toEqual([
      "1 image sans légende : cliquez sur une image dans l'aperçu pour écrire ce qu'elle montre.",
    ])
  })
  it('alertes triées par ligne, agrégats compris', () => {
    const a = alertesRelecture(`![](${A})\n# A\n### B`, med())
    expect(a.map((x) => x.ligne)).toEqual([1, 3])
    const b = alertesRelecture('# A\n### B\n\n**G**\n\n:::photos', null)
    expect(b.map((x) => x.ligne)).toEqual([2, 4, 6])
  })
  it('saut de page : seulement une ligne « === » exacte, sous 50 %', () => {
    const page = (remplissage: number): InfoPage[] => [{ saut: 1, remplissage }]
    expect(msgs('A\n===\nB', null, page(0.3))).toEqual([
      "Saut de page : la page d'avant n'est remplie qu'à 30 %. Retirez-le si rien ne l'impose, la mise en page s'en charge.",
    ])
    expect(msgs('A\n===  \nB', null, page(0.3))).toHaveLength(1)
    expect(msgs('A\n===\nB', null, page(0.5))).toEqual([])
    expect(msgs('A\n  ===\nB', null, page(0.3))).toEqual([])
    expect(msgs('A\n=== x\nB', null, page(0.3))).toEqual([])
    expect(msgs('A\n===\nB', null, [{ saut: 2, remplissage: 0.3 }])).toEqual([])
    expect(msgs('A\n===\nB', null, [{ remplissage: 0.3 }])).toEqual([])
    expect(msgs('A\n===\nB', null, [{ saut: 1 }])).toEqual([])
  })
  it('page peu remplie sans saut : ni la dernière, ni à 60 %, ni sans suite', () => {
    const fin: InfoPage = { remplissage: 1 }
    expect(msgs('x', null, [{ remplissage: 0.4, suivante: 7 }, fin])).toEqual([
      'Page 1 remplie à 40 % : ce qui suit ne tenait pas dans la place restante. Une taille plus petite pour cette image, ou une étape plus courte, la ferait remonter.',
    ])
    expect(msgs('x', null, [{ remplissage: 0.6, suivante: 7 }, fin])).toEqual(
      [],
    )
    expect(msgs('x', null, [{ remplissage: 0.4 }, fin])).toEqual([])
    expect(msgs('x', null, [{ suivante: 7 }, fin])).toEqual([])
    expect(
      msgs('x', null, [{ remplissage: 0.4, suivante: 7, saut: 1 }, fin]),
    ).toEqual([])
    expect(msgs('x', null, [{ remplissage: 0.4, suivante: 7 }])).toEqual([])
  })
  it('schémas découpés : une alerte par ligne, sans doublon', () => {
    const a = alertesRelecture('x', null, [
      { schemas: [9, 3] },
      { schemas: [3] },
    ])
    expect(a.map((x) => x.ligne)).toEqual([3, 9])
  })
})

describe('relecture — tableaux', () => {
  it('lignes indentées, case « null » (même en en-tête), une seule case', () => {
    expect(msgs('  | A | B |\n  | --- | --- |\n  | 1 |')).toEqual([
      'Tableau : cette ligne a 1 case pour 2 colonnes.',
    ])
    expect(msgs('| A | null |\n| --- | --- |\n| 1 | 2 |')).toEqual([
      'Tableau : une case contient « null ». Laissez-la vide, ou écrivez ce qui manque.',
    ])
    expect(msgs('| A | B |\n| --- | --- |\n| NULL | 2 |')).toHaveLength(1)
    expect(msgs('| A | B |\n| --- | --- |\n| nullité | annulé null |')).toEqual(
      [],
    )
    expect(msgs('| A | B | C |\n| --- | --- | --- |\n| 1 | 2 |')).toEqual([
      'Tableau : cette ligne a 2 cases pour 3 colonnes.',
    ])
  })
  it('séparateur au mauvais nombre de colonnes : message exact', () => {
    expect(msgs('| A | B |\n| --- |')).toEqual([
      'Tableau : la ligne de séparation a 1 « --- » pour 2 colonnes, il sera imprimé comme du texte.',
    ])
  })
  it('tableau sans séparateur : seulement si TOUTES ses lignes commencent par |', () => {
    const sans =
      'Tableau sans ligne de séparation « | --- | » sous l’en-tête : il sera imprimé comme du texte.'
    expect(msgs('| A |\n| B |')).toEqual([sans])
    expect(msgs('| A |\nB | C')).toEqual([])
    expect(msgs('| A |')).toEqual([])
    expect(msgs('A | B\n| C |')).toEqual([])
  })
})

describe('relireLigneImport — natures', () => {
  it('un document de genre « chapitre » n’est pas relu', () => {
    expect(
      relireLigneImport(
        { kind: 'document', genre: 'chapitre', apres: { content: '**G**' } },
        null,
      ),
    ).toBeNull()
  })
})
