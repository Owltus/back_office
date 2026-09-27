/*
 * Comparaison de deux versions d'un document, ligne à ligne — amélioration
 * n° 21 de `plan/classeur-editeur-ameliorations` (« comme GitHub quand on
 * compare deux codes »). Pure, sans dépendance.
 *
 * Plus longue sous-suite commune (LCS) sur les lignes, après avoir retiré
 * le début et la fin communs (le cas courant : une retouche au milieu d'une
 * procédure). Les documents font quelques centaines de lignes : la table
 * n × m reste petite ; au-delà de `MAX_CELLULES`, repli sur un bloc
 * « tout retiré / tout ajouté » plutôt que de figer l'onglet.
 */

export type TypeLigne = 'egal' | 'ajout' | 'retrait'

export interface LigneDiff {
  type: TypeLigne
  texte: string
  /** Numéro dans l'ancienne version (retrait, égal). */
  avant?: number
  /** Numéro dans la nouvelle version (ajout, égal). */
  apres?: number
}

const MAX_CELLULES = 4_000_000

export function comparerLignes(ancien: string, nouveau: string): LigneDiff[] {
  const a = ancien === '' ? [] : ancien.split('\n')
  const b = nouveau === '' ? [] : nouveau.split('\n')

  let debut = 0
  while (debut < a.length && debut < b.length && a[debut] === b[debut]) debut++
  let finA = a.length
  let finB = b.length
  while (finA > debut && finB > debut && a[finA - 1] === b[finB - 1]) {
    finA--
    finB--
  }

  const resultat: LigneDiff[] = []
  for (let i = 0; i < debut; i++)
    resultat.push({ type: 'egal', texte: a[i], avant: i + 1, apres: i + 1 })

  const ma = a.slice(debut, finA)
  const mb = b.slice(debut, finB)
  const n = ma.length
  const m = mb.length

  if (n * m > MAX_CELLULES) {
    ma.forEach((t, i) =>
      resultat.push({ type: 'retrait', texte: t, avant: debut + i + 1 }),
    )
    mb.forEach((t, j) =>
      resultat.push({ type: 'ajout', texte: t, apres: debut + j + 1 }),
    )
  } else {
    // lcs[i][j] = longueur de la LCS de ma[i..] et mb[j..].
    const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        lcs[i][j] =
          ma[i] === mb[j]
            ? lcs[i + 1][j + 1] + 1
            : Math.max(lcs[i + 1][j], lcs[i][j + 1])
      }
    }
    let i = 0
    let j = 0
    while (i < n || j < m) {
      if (i < n && j < m && ma[i] === mb[j]) {
        resultat.push({
          type: 'egal',
          texte: ma[i],
          avant: debut + i + 1,
          apres: debut + j + 1,
        })
        i++
        j++
      } else if (j < m && (i === n || lcs[i][j + 1] >= lcs[i + 1][j])) {
        resultat.push({ type: 'ajout', texte: mb[j], apres: debut + j + 1 })
        j++
      } else {
        resultat.push({ type: 'retrait', texte: ma[i], avant: debut + i + 1 })
        i++
      }
    }
  }

  for (let k = 0; k < a.length - finA; k++) {
    resultat.push({
      type: 'egal',
      texte: a[finA + k],
      avant: finA + k + 1,
      apres: finB + k + 1,
    })
  }
  // À l'affichage, les retraits d'un bloc modifié viennent avant ses ajouts.
  return regrouper(resultat)
}

/** Dans chaque bloc de changements contigus : retraits puis ajouts. */
function regrouper(lignes: LigneDiff[]): LigneDiff[] {
  const sortie: LigneDiff[] = []
  let retraits: LigneDiff[] = []
  let ajouts: LigneDiff[] = []
  const vider = () => {
    sortie.push(...retraits, ...ajouts)
    retraits = []
    ajouts = []
  }
  for (const l of lignes) {
    if (l.type === 'retrait') retraits.push(l)
    else if (l.type === 'ajout') ajouts.push(l)
    else {
      vider()
      sortie.push(l)
    }
  }
  vider()
  return sortie
}

export interface Bilan {
  ajouts: number
  retraits: number
}

export function bilan(lignes: readonly LigneDiff[]): Bilan {
  let ajouts = 0
  let retraits = 0
  for (const l of lignes) {
    if (l.type === 'ajout') ajouts++
    else if (l.type === 'retrait') retraits++
  }
  return { ajouts, retraits }
}

/** Un segment affiché : des lignes, ou un repli de lignes inchangées. */
export type Segment =
  | { type: 'lignes'; lignes: LigneDiff[] }
  | { type: 'replie'; nombre: number; lignes: LigneDiff[] }

/**
 * Replie les longues suites de lignes inchangées, en gardant `contexte`
 * lignes autour de chaque changement (3, comme GitHub).
 */
export function segmenter(
  lignes: readonly LigneDiff[],
  contexte = 3,
): Segment[] {
  const garder = new Array<boolean>(lignes.length).fill(false)
  lignes.forEach((l, i) => {
    if (l.type === 'egal') return
    for (
      let k = Math.max(0, i - contexte);
      k <= Math.min(lignes.length - 1, i + contexte);
      k++
    )
      garder[k] = true
  })
  const segments: Segment[] = []
  let i = 0
  while (i < lignes.length) {
    const debut = i
    const visible = garder[i]
    while (i < lignes.length && garder[i] === visible) i++
    const bloc = lignes.slice(debut, i)
    segments.push(
      visible
        ? { type: 'lignes', lignes: bloc }
        : { type: 'replie', nombre: bloc.length, lignes: bloc },
    )
  }
  return segments
}
