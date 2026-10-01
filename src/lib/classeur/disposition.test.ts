import { describe, expect, it } from 'vitest'

import {
  changerDisposition,
  dispositionImage,
  editionEntre,
} from '#/lib/classeur/disposition.ts'

const IMG = '![Vanne](5/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp)'

/** Change la disposition de la (première) image du texte. */
function changer(texte: string, cible: 'centre' | 'gauche' | 'droite') {
  const debut = texte.indexOf(IMG)
  return changerDisposition(texte, debut, debut + IMG.length, IMG, cible)
}

describe('disposition d’une image', () => {
  it('lit la disposition : centrée, à droite (défaut d’une étape), à gauche', () => {
    expect(dispositionImage(`a\n\n${IMG}`, 4)).toBe('centre')
    const droite = `:::etape\nTexte\n\n${IMG}\n:::`
    expect(dispositionImage(droite, droite.indexOf(IMG))).toBe('droite')
    const gauche = `:::etape{photo=gauche}\nTexte\n\n${IMG}\n:::`
    expect(dispositionImage(gauche, gauche.indexOf(IMG))).toBe('gauche')
  })

  it('centrée → à droite : l’image et la consigne qui la PRÉCÈDE en colonnes', () => {
    const v = `### 1. Accès\n\nOuvrir la porte.\nEntrer.\n\n${IMG}\n\nSuite.`
    expect(changer(v, 'droite')).toBe(
      `### 1. Accès\n\n:::etape\nOuvrir la porte.\nEntrer.\n\n${IMG}\n:::\n\nSuite.`,
    )
  })

  it('toute la consigne depuis le titre, plusieurs paragraphes et encadré compris', () => {
    const v = `### 2. Bac

Ouvrir.

Ajouter du sel.

> Attention.

${IMG}

### 3. Suite`
    expect(changer(v, 'gauche')).toBe(
      `### 2. Bac

:::etape{photo=gauche}
Ouvrir.

Ajouter du sel.

> Attention.

${IMG}
:::

### 3. Suite`,
    )
    // Et l'aller-retour par « centrée » retrouve exactement le même bloc.
    const gauche = changer(v, 'gauche')
    expect(changer(changer(gauche, 'centre'), 'gauche')).toBe(gauche)
  })

  it('ne traverse jamais une autre image', () => {
    const autre = '![B](5/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp)'
    const v = `Texte A.

${autre}

Texte B.

${IMG}`
    expect(changer(v, 'droite')).toBe(
      `Texte A.

${autre}

:::etape
Texte B.

${IMG}
:::
`,
    )
  })

  it('étape de liste suivie de sa capture (sans ligne vide)', () => {
    const v = `1. Cliquer sur NEW.\n${IMG}\n2. Valider.`
    // Le texte d'avant est l'étape 1 ; l'image ne s'en sépare pas.
    expect(changer(v, 'gauche')).toBe(
      `:::etape{photo=gauche}\n1. Cliquer sur NEW.\n\n${IMG}\n:::\n\n2. Valider.`,
    )
  })

  it('pas de texte avant : prend le texte qui suit', () => {
    const v = `${IMG}\n\nLe texte après.`
    expect(changer(v, 'droite')).toBe(
      `:::etape\nLe texte après.\n\n${IMG}\n:::\n`,
    )
  })

  it('un titre au-dessus reste au-dessus du bloc', () => {
    const v = `### Titre\n${IMG}`
    expect(changer(v, 'droite')).toBe(`### Titre\n\n:::etape\n${IMG}\n:::\n`)
  })

  it('à droite → à gauche : seule la ligne d’ouverture change', () => {
    const v = `:::etape\nTexte\n\n${IMG}\n:::`
    expect(changer(v, 'gauche')).toBe(
      `:::etape{photo=gauche}\nTexte\n\n${IMG}\n:::`,
    )
    expect(changer(changer(v, 'gauche'), 'droite')).toBe(v)
  })

  it('à côté → centrée : le bloc est défait, le texte reste, l’image le suit', () => {
    const v = `Avant.\n\n:::etape{photo=gauche}\nTexte.\n\n${IMG}\n:::\n\nAprès.`
    expect(changer(v, 'centre')).toBe(`Avant.\n\nTexte.\n\n${IMG}\n\nAprès.`)
  })

  it('aller-retour centrée → droite → centrée : rien de perdu', () => {
    const v = `Consigne.\n\n${IMG}\n\nSuite.`
    expect(changer(changer(v, 'droite'), 'centre')).toBe(v)
  })

  it('étape à plusieurs photos → centrée : seule cette photo sort, après le bloc', () => {
    const autre = '![B](5/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp)'
    const v = `:::etape\nTexte\n\n${IMG}\n${autre}\n:::\n\nSuite.`
    expect(changer(v, 'centre')).toBe(
      `:::etape\nTexte\n\n${autre}\n:::\n\n${IMG}\n\nSuite.`,
    )
  })

  it('editionEntre : la plus petite plage, qui reconstitue le nouveau texte', () => {
    const a = 'abc DEF ghi'
    const b = 'abc XY ghi'
    const e = editionEntre(a, b)
    expect(a.slice(0, e.debut) + e.texte + a.slice(e.fin)).toBe(b)
    expect(e.texte).toBe('XY')
  })
})
