import { describe, expect, it } from 'vitest'

import {
  appliquerEdition,
  basculerEntourage,
  basculerPrefixe,
  continuerListe,
  indenterListe,
  entourerDeBloc,
  insererBloc,
  insererLien,
  insererLigne,
  insererTexteEnBloc,
  prefixeActif,
} from '#/lib/classeur/markdownEdition.ts'
import type { Edition } from '#/lib/classeur/markdownEdition.ts'

/** Applique et rend le texte + la sélection posée (texte sélectionné). */
function res(valeur: string, e: Edition | null) {
  if (!e) return null
  const apres = appliquerEdition(valeur, e)
  return {
    texte: apres,
    choisi: apres.slice(e.selection[0], e.selection[1]),
    e,
  }
}

describe('basculerEntourage', () => {
  it('met en gras la sélection, puis la retire au second clic', () => {
    const v = 'un mot ici'
    const a = res(v, basculerEntourage(v, 3, 6, 'gras'))!
    expect(a.texte).toBe('un **mot** ici')
    expect(a.choisi).toBe('mot')
    const b = res(
      a.texte,
      basculerEntourage(a.texte, a.e.selection[0], a.e.selection[1], 'gras'),
    )!
    expect(b.texte).toBe(v)
    expect(b.choisi).toBe('mot')
  })
  it('retire aussi quand les marques sont dans la sélection', () => {
    const v = 'un **mot** ici'
    expect(res(v, basculerEntourage(v, 3, 10, 'gras'))!.texte).toBe(
      'un mot ici',
    )
  })
  it('laisse les espaces de bord hors des marques', () => {
    const v = 'un mot ici'
    expect(res(v, basculerEntourage(v, 2, 7, 'gras'))!.texte).toBe(
      'un **mot** ici',
    )
  })
  it('sans sélection, insère un exemple sélectionné', () => {
    const a = res('', basculerEntourage('', 0, 0, 'italique'))!
    expect(a.texte).toBe('*texte en italique*')
    expect(a.choisi).toBe('texte en italique')
  })
  it('l’italique ne confond pas le gras : il s’y ajoute', () => {
    const v = '**mot**'
    expect(res(v, basculerEntourage(v, 0, 7, 'italique'))!.texte).toBe(
      '***mot***',
    )
    const w = '**mot**'
    // « mot » entouré de ** : l'italique ne le « retire » pas.
    expect(res(w, basculerEntourage(w, 2, 5, 'italique'))!.texte).toBe(
      '***mot***',
    )
  })
  it('barré', () => {
    expect(res('a', basculerEntourage('a', 0, 1, 'barre'))!.texte).toBe('~~a~~')
  })
})

describe('basculerPrefixe', () => {
  it('pose un titre sur la ligne du curseur, curseur en fin de ligne', () => {
    const v = 'Intro\nAccueil\nFin'
    const a = res(v, basculerPrefixe(v, 8, 8, 'titre2'))!
    expect(a.texte).toBe('Intro\n## Accueil\nFin')
    expect(a.e.selection[0]).toBe('Intro\n## Accueil'.length)
  })
  it('remplace un titre par un autre, puis le retire', () => {
    const v = '## Accueil'
    const a = res(v, basculerPrefixe(v, 5, 5, 'titre1'))!
    expect(a.texte).toBe('# Accueil')
    expect(res(a.texte, basculerPrefixe(a.texte, 3, 3, 'titre1'))!.texte).toBe(
      'Accueil',
    )
  })
  it('liste à puces sur plusieurs lignes, lignes vides respectées', () => {
    const v = 'a\n\nb\nc'
    expect(res(v, basculerPrefixe(v, 0, v.length, 'puces'))!.texte).toBe(
      '- a\n\n- b\n- c',
    )
  })
  it('numérote dans l’ordre et convertit une liste à puces', () => {
    const v = '- a\n- b\n- c'
    expect(res(v, basculerPrefixe(v, 0, v.length, 'numeros'))!.texte).toBe(
      '1. a\n2. b\n3. c',
    )
  })
  it('bascule : retire les puces si toutes les lignes en ont', () => {
    const v = '- a\n  - b'
    expect(res(v, basculerPrefixe(v, 0, v.length, 'puces'))!.texte).toBe(
      'a\n  b',
    )
  })
  it('cases à cocher et citation', () => {
    expect(res('tâche', basculerPrefixe('tâche', 0, 0, 'cases'))!.texte).toBe(
      '- [ ] tâche',
    )
    expect(res('note', basculerPrefixe('note', 0, 0, 'citation'))!.texte).toBe(
      '> note',
    )
  })
  it('une sélection qui finit au début d’une ligne ne la prend pas', () => {
    const v = 'a\nb'
    expect(res(v, basculerPrefixe(v, 0, 2, 'puces'))!.texte).toBe('- a\nb')
  })
})

describe('insererBloc', () => {
  it('isole le bloc par des lignes vides (un --- collé ferait un titre)', () => {
    const v = 'Texte'
    expect(res(v, insererBloc(v, 5, 5, 'separateur'))!.texte).toBe(
      'Texte\n\n---\n',
    )
    const w = 'a\nb'
    expect(res(w, insererBloc(w, 1, 1, 'saut'))!.texte).toBe('a\n\n===\n\nb')
  })
  it('n’ajoute pas de lignes vides en trop', () => {
    const v = 'a\n\n'
    expect(res(v, insererBloc(v, 3, 3, 'saut'))!.texte).toBe('a\n\n===\n')
    expect(res('', insererBloc('', 0, 0, 'saut'))!.texte).toBe('===\n')
  })
  it('tableau : la première cellule est sélectionnée', () => {
    const a = res('', insererBloc('', 0, 0, 'tableau'))!
    expect(a.choisi).toBe('Colonne 1')
    expect(a.texte.split('\n')[1]).toBe('| --- | --- |')
  })
})

describe('insererLien', () => {
  it('le texte sélectionné devient le libellé, l’adresse est sélectionnée', () => {
    const v = 'voir le site'
    const a = res(v, insererLien(v, 5, 12))!
    expect(a.texte).toBe('voir [le site](https://)')
    expect(a.choisi).toBe('https://')
  })
  it('une adresse sélectionnée devient l’adresse', () => {
    const v = 'https://okko.fr'
    const a = res(v, insererLien(v, 0, v.length))!
    expect(a.texte).toBe('[texte du lien](https://okko.fr)')
    expect(a.choisi).toBe('texte du lien')
  })
})

describe('continuerListe', () => {
  it('continue une liste à puces', () => {
    const v = '- a'
    const a = res(v, continuerListe(v, 3, 3))!
    expect(a.texte).toBe('- a\n- ')
    expect(a.e.selection[0]).toBe(a.texte.length)
  })
  it('incrémente une liste numérotée et garde le retrait', () => {
    const v = '  3. c'
    expect(res(v, continuerListe(v, 6, 6))!.texte).toBe('  3. c\n  4. ')
  })
  it('une case suivante est décochée', () => {
    const v = '- [x] fait'
    expect(res(v, continuerListe(v, v.length, v.length))!.texte).toBe(
      '- [x] fait\n- [ ] ',
    )
  })
  it('Entrée sur un élément vide termine la liste', () => {
    const v = '- a\n- '
    expect(res(v, continuerListe(v, v.length, v.length))!.texte).toBe('- a\n')
  })
  it('hors liste, ou curseur dans le préfixe : comportement normal', () => {
    expect(continuerListe('texte', 5, 5)).toBeNull()
    expect(continuerListe('- a', 1, 1)).toBeNull()
    expect(continuerListe('- a', 0, 3)).toBeNull()
  })
})

describe('indenterListe', () => {
  it('Tab décale une ligne de liste, Maj + Tab la ramène', () => {
    const v = '- a\n- b'
    const a = res(v, indenterListe(v, 6, 6, 1))!
    expect(a.texte).toBe('- a\n  - b')
    expect(a.e.selection[0]).toBe(8)
    expect(res(a.texte, indenterListe(a.texte, 8, 8, -1))!.texte).toBe(v)
  })
  it('hors liste, Tab garde son rôle', () => {
    expect(indenterListe('texte', 0, 0, 1)).toBeNull()
    expect(indenterListe('> note', 0, 0, 1)).toBeNull()
  })
})

describe('prefixeActif', () => {
  it('reconnaît la nature de la ligne du curseur', () => {
    const v = '## T\n- a\n1. b\ntexte'
    expect(prefixeActif(v, 2)).toBe('titre2')
    expect(prefixeActif(v, 7)).toBe('puces')
    expect(prefixeActif(v, 12)).toBe('numeros')
    expect(prefixeActif(v, v.length)).toBeNull()
  })
})

describe('insererLigne — image insérée au curseur relevé', () => {
  const img = '![plan](2/a.webp)'
  it('isole la ligne et place le curseur après', () => {
    const v = 'avant apres'
    const a = res(v, insererLigne(v, 5, 5, img))!
    expect(a.texte).toBe(`avant\n${img}\n apres`)
    expect(a.e.selection[0]).toBe(`avant\n${img}\n`.length)
  })
  it('n’ajoute pas de saut en trop, remplace la sélection', () => {
    const v = 'a\nXX\nb'
    expect(res(v, insererLigne(v, 2, 4, img))!.texte).toBe(`a\n${img}\nb`)
  })
  it('position inconnue ou hors du texte : au bout', () => {
    expect(res('abc', insererLigne('abc', null, null, img))!.texte).toBe(
      `abc\n${img}\n`,
    )
    expect(res('abc', insererLigne('abc', 50, 60, img))!.texte).toBe(
      `abc\n${img}\n`,
    )
    expect(res('', insererLigne('', 0, 0, img))!.texte).toBe(`${img}\n`)
  })
})

describe('insererTexteEnBloc — tableau de la grille', () => {
  const t = '| A |\n| --- |'
  it('isole le bloc et place le curseur après', () => {
    const a = res('Intro', insererTexteEnBloc('Intro', 5, 5, t))!
    expect(a.texte).toBe(`Intro\n\n${t}\n`)
    expect(a.e.selection[0]).toBe(`Intro\n\n${t}`.length)
  })
  it('remplace un tableau existant sans toucher au voisinage', () => {
    const v = `Avant\n\n| X |\n| --- |\n\nAprès`
    const d = v.indexOf('| X')
    const f = v.indexOf('\n\nAprès')
    expect(res(v, insererTexteEnBloc(v, d, f, t))!.texte).toBe(
      `Avant\n\n${t}\n\nAprès`,
    )
  })
})

describe('entourerDeBloc — étape illustrée, planche', () => {
  it('entoure la ligne du curseur, curseur sur la ligne de fermeture', () => {
    const v = 'Avant.\n\nOuvrir la porte.\n\nAprès.'
    const e = entourerDeBloc(v, 12, 12, 'etape')
    const t = appliquerEdition(v, e)
    expect(t).toBe('Avant.\n\n:::etape\nOuvrir la porte.\n\n:::\n\nAprès.')
    // Une image insérée au curseur arrive DANS le bloc, sur sa ligne.
    const img = appliquerEdition(
      t,
      insererLigne(t, e.selection[0], e.selection[1], '![X](1/a.webp)'),
    )
    expect(img).toContain('Ouvrir la porte.\n\n![X](1/a.webp)\n:::')
  })

  it('entoure toutes les lignes sélectionnées, garde le titre AU-DESSUS', () => {
    const v = '### 4. Ballon\nAppuyer :\n1. court\n2. long'
    const t = appliquerEdition(v, entourerDeBloc(v, 0, v.length, 'etape'))
    expect(t).toBe(
      '### 4. Ballon\n\n:::etape\nAppuyer :\n1. court\n2. long\n\n:::\n',
    )
  })

  it('ligne vide : bloc vide prêt à recevoir une photo', () => {
    const v = 'a\n\n\nb'
    const e = entourerDeBloc(v, 2, 2, 'etape')
    const t = appliquerEdition(v, e)
    expect(t).toContain(':::etape\n\n:::')
    expect(t.slice(e.selection[0], e.selection[0] + 3)).toBe(':::')
  })

  it('une sélection qui finit au début d’une ligne n’entraîne pas cette ligne', () => {
    const v = 'un\ndeux\ntrois'
    const t = appliquerEdition(v, entourerDeBloc(v, 0, 3, 'etape'))
    expect(t).toBe(':::etape\nun\n\n:::\n\ndeux\ntrois')
  })
})
