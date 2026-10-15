// Commit en UNE commande — logique PURE (demande utilisateur du 2026-10-15 :
// « une vraie méthode qui respecte les bonnes pratiques »). `commit.mjs`
// relève l'état et exécute ; ici, seulement les décisions, testées dans
// `commit-plan.test.ts`.
//
// Pratique retenue (lint-staged, `vitest related`) : au commit, des
// contrôles LÉGERS sur les seuls fichiers touchés ; la batterie complète
// (build, pgTAP) tourne une fois, à la livraison.

/** Types de commit admis (Conventional Commits, déjà l'usage du dépôt). */
export const TYPES = [
  'feat',
  'fix',
  'perf',
  'refactor',
  'docs',
  'test',
  'chore',
  'style',
  'build',
  'ci',
  'revert',
]

const SUJET = new RegExp(`^(?:${TYPES.join('|')})(?:\\([^()]+\\))?!?: \\S`)

/**
 * `tsc` est-il utile ? Oui dès qu'un fichier typé change, et pour un script
 * `.mjs` : ses types vivent dans un `.d.mts` à part, qu'un oubli désaccorde
 * (le 2026-10-15, `choixControles` n'y avait pas été déclarée).
 */
export function besoinTsc(fichiers: Array<string>): boolean {
  return fichiers.some(
    (f) => /\.(?:tsx?|mts|cts)$/.test(f) || /^scripts\/.+\.mjs$/.test(f),
  )
}

/** Fichiers dont `vitest related` doit chercher les tests. */
export function sourcesATester(fichiers: Array<string>): Array<string> {
  return fichiers.filter(
    (f) => /\.(?:tsx?|mts|mjs|jsx?)$/.test(f) && !/\.d\.mts$/.test(f),
  )
}

/**
 * Fichiers indexés EN PARTIE (une partie seulement est dans l'index) : les
 * reformater puis les réindexer enverrait aussi la partie non indexée. On
 * les vérifie sans les réécrire.
 */
export function indexesEnPartie(
  indexes: Array<string>,
  modifiesHorsIndex: Array<string>,
): Array<string> {
  const hors = new Set(modifiesHorsIndex)
  return indexes.filter((f) => hors.has(f))
}

/**
 * Raisons de refuser un message. `assistant` : commit fait par Claude Code
 * (variable `CLAUDECODE`), qui doit porter ses deux lignes d'attribution.
 */
export function erreursMessage(
  texte: string,
  { assistant }: { assistant: boolean },
): Array<string> {
  const erreurs: Array<string> = []
  const lignes = texte.replace(/\r\n/g, '\n').split('\n')
  const sujet = (lignes[0] ?? '').trim()
  if (!sujet) erreurs.push('Message vide : la première ligne est le sujet.')
  else {
    if (!SUJET.test(sujet))
      erreurs.push(
        `Sujet hors convention : « type(portée): résumé », type parmi ${TYPES.join(', ')}.`,
      )
    if (sujet.length > 100)
      erreurs.push(`Sujet trop long (${sujet.length} caractères, 100 au plus).`)
  }
  if (lignes.length > 1 && lignes[1].trim() !== '')
    erreurs.push('La deuxième ligne doit être vide (sujet, ligne vide, corps).')
  if (assistant) {
    if (!/^Co-Authored-By: .+$/m.test(texte))
      erreurs.push('Ligne « Co-Authored-By: » absente.')
    if (!/^Claude-Session: .+$/m.test(texte))
      erreurs.push('Ligne « Claude-Session: » absente.')
  }
  return erreurs
}
