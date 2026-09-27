/*
 * Tableau Markdown (GFM) ⇄ grille — amélioration n° 7 de
 * `plan/classeur-editeur-ameliorations`, décision utilisateur du
 * 2026-09-27 : la grille n'est qu'un OUTIL DE SAISIE, le document ne
 * contient jamais que du tableau Markdown officiel :
 *
 *   | Élément | Détail |
 *   | --- | --- |
 *   | Premier | Texte |
 *
 * - Lecture tolérante : bords `|` facultatifs, lignes de longueurs
 *   différentes complétées par des cases vides (jamais tronquées), `\|`
 *   rendu comme `|` dans la case.
 * - Écriture stricte : une barre tapée dans une case est protégée (`\|`),
 *   un retour à la ligne devient une espace (une case tient sur une ligne),
 *   l'alignement éventuel d'une colonne (`:---:`) est CONSERVÉ.
 */

export type Alignement = 'aucun' | 'gauche' | 'centre' | 'droite'

export interface Grille {
  entete: string[]
  lignes: string[][]
  alignements: Alignement[]
}

export interface TableauTrouve extends Grille {
  /** Début de la première ligne du tableau dans le texte. */
  debut: number
  /** Fin de la dernière ligne (avant son saut de ligne). */
  fin: number
}

const RE_SEPARATEUR = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/

/** Découpe une ligne de tableau en cases (bords facultatifs, `\|` gardé). */
export function decouperLigne(ligne: string): string[] {
  let s = ligne.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1)
  const cases: string[] = []
  let courant = ''
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '\\' && s[i + 1] === '|') {
      courant += '|'
      i++
    } else if (c === '|') {
      cases.push(courant.trim())
      courant = ''
    } else {
      courant += c
    }
  }
  cases.push(courant.trim())
  return cases
}

function alignementDe(marque: string): Alignement {
  const m = marque.trim()
  const g = m.startsWith(':')
  const d = m.endsWith(':')
  if (g && d) return 'centre'
  if (d) return 'droite'
  if (g) return 'gauche'
  return 'aucun'
}

function marqueDe(a: Alignement | undefined): string {
  switch (a) {
    case 'gauche':
      return ':---'
    case 'centre':
      return ':---:'
    case 'droite':
      return '---:'
    default:
      return '---'
  }
}

/** Même nombre de cases partout (le plus grand), complété par du vide. */
export function normaliser(g: Grille): Grille {
  const n = Math.max(1, g.entete.length, ...g.lignes.map((l) => l.length))
  const completer = (l: string[]) => [
    ...l,
    ...Array.from({ length: n - l.length }, () => ''),
  ]
  return {
    entete: completer(g.entete),
    lignes: g.lignes.map(completer),
    alignements: Array.from(
      { length: n },
      (_, i) => g.alignements[i] ?? 'aucun',
    ),
  }
}

/** Contenu d'une case prêt à écrire : une ligne, barres protégées. */
function echapper(texte: string): string {
  return texte
    .replace(/\r?\n+/g, ' ')
    .replace(/\\\|/g, '|')
    .replace(/\|/g, '\\|')
    .trim()
}

/** Écrit la grille en tableau Markdown standard (sans saut final). */
export function ecrireTableau(g: Grille): string {
  const t = normaliser(g)
  const ligne = (cases: string[]) =>
    `| ${cases.map((c) => echapper(c)).join(' | ')} |`
  return [
    ligne(t.entete),
    `| ${t.alignements.map((a) => marqueDe(a)).join(' | ')} |`,
    ...t.lignes.map(ligne),
  ].join('\n')
}

/** Grille vide de départ : 2 colonnes, en-tête + 2 lignes. */
export function grilleVide(): Grille {
  return {
    entete: ['Colonne 1', 'Colonne 2'],
    lignes: [
      ['', ''],
      ['', ''],
    ],
    alignements: ['aucun', 'aucun'],
  }
}

/**
 * Le tableau Markdown qui contient la position `curseur`, s'il y en a un :
 * bloc de lignes contiguës contenant `|`, dont la DEUXIÈME est une ligne
 * de séparation (`| --- |`). Sans séparateur, ce n'est pas un tableau.
 */
export function trouverTableau(
  valeur: string,
  curseur: number,
): TableauTrouve | null {
  const lignes = valeur.split('\n')
  // Index de la ligne du curseur et position de début de chaque ligne.
  const debuts: number[] = []
  let pos = 0
  for (const l of lignes) {
    debuts.push(pos)
    pos += l.length + 1
  }
  let iCurseur = 0
  while (
    iCurseur + 1 < lignes.length &&
    debuts[iCurseur + 1] <= Math.max(0, curseur)
  )
    iCurseur++
  const estLigneTableau = (i: number) =>
    i >= 0 && i < lignes.length && lignes[i].includes('|')
  if (!estLigneTableau(iCurseur)) return null
  let haut = iCurseur
  while (estLigneTableau(haut - 1)) haut--
  let bas = iCurseur
  while (estLigneTableau(bas + 1)) bas++
  // Le séparateur doit être en DEUXIÈME ligne du bloc.
  if (bas - haut < 1 || !RE_SEPARATEUR.test(lignes[haut + 1])) return null
  const entete = decouperLigne(lignes[haut])
  const alignements = decouperLigne(lignes[haut + 1]).map(alignementDe)
  const corps = lignes.slice(haut + 2, bas + 1).map(decouperLigne)
  return {
    ...normaliser({ entete, lignes: corps, alignements }),
    debut: debuts[haut],
    fin: debuts[bas] + lignes[bas].length,
  }
}
