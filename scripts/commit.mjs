// Commit en UNE commande (2026-10-15). Logique dans `commit-plan.ts`.
//
//   pnpm commit <fichier-message> [fichiers à indexer…]
//
// 1. indexe les fichiers donnés (sinon, prend l'index tel quel) ;
// 2. formate les fichiers indexés (prettier), vérifie ceux indexés en partie ;
// 3. `tsc --noEmit` si un fichier typé ou un script change ;
// 4. `vitest related` : seulement les tests qui importent les fichiers touchés ;
// 5. vérifie le message (Conventional Commits, attribution de l'assistant),
//    puis `git commit -F` et supprime le fichier de message.
//
// Le message vit dans un FICHIER (écrit par l'outil Write) : dans la ligne
// de commande, ses mots déclenchaient le garde anti-prod.

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import {
  besoinTsc,
  erreursMessage,
  indexesEnPartie,
  sourcesATester,
} from './commit-plan.ts'

const RACINE = join(import.meta.dirname, '..')

function lancer(cmd, { voir = false } = {}) {
  const r = spawnSync(cmd[0], cmd.slice(1), {
    cwd: RACINE,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: voir ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  })
  return {
    ok: r.status === 0,
    sortie: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim(),
  }
}

const liste = (cmd) =>
  lancer(cmd)
    .sortie.split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

function echec(texte, detail = '') {
  console.error(`✗ ${texte}`)
  if (detail) console.error(detail.split('\n').slice(-30).join('\n'))
  process.exit(1)
}

function etape(nom, cmd) {
  const debut = Date.now()
  const r = lancer(cmd)
  if (!r.ok) echec(`${nom} : échec. Rien n'est commité.`, r.sortie)
  console.log(`✓ ${nom} (${Math.round((Date.now() - debut) / 1000)} s)`)
}

const [fichierMessage, ...aIndexer] = process.argv.slice(2)
if (!fichierMessage || !existsSync(fichierMessage))
  echec('Usage : pnpm commit <fichier-message> [fichiers à indexer…]')

if (aIndexer.length) {
  const r = lancer(['git', 'add', '--', ...aIndexer])
  if (!r.ok) echec('git add a échoué.', r.sortie)
}
if (lancer(['git', 'diff', '--cached', '--quiet']).ok)
  echec('Rien n’est indexé : rien à committer.')

const indexes = liste([
  'git',
  'diff',
  '--cached',
  '--name-only',
  '--diff-filter=ACMR',
])
const enPartie = indexesEnPartie(indexes, liste(['git', 'diff', '--name-only']))
const entiers = indexes.filter((f) => !enPartie.includes(f))

const message = readFileSync(fichierMessage, 'utf8')
const erreurs = erreursMessage(message, {
  assistant: Boolean(process.env.CLAUDECODE),
})
if (erreurs.length) echec(`Message refusé :\n- ${erreurs.join('\n- ')}`)

if (entiers.length) {
  etape('format', [
    'npx',
    'prettier',
    '--write',
    '--ignore-unknown',
    ...entiers,
  ])
  lancer(['git', 'add', '--', ...entiers])
}
if (enPartie.length)
  etape('format (fichiers indexés en partie)', [
    'npx',
    'prettier',
    '--check',
    '--ignore-unknown',
    ...enPartie,
  ])
if (besoinTsc(indexes)) etape('types', ['npx', 'tsc', '--noEmit'])
const sources = sourcesATester(indexes)
if (sources.length)
  etape('tests liés', [
    'npx',
    'vitest',
    'related',
    '--run',
    '--passWithNoTests',
    ...sources,
  ])

const r = lancer(['git', 'commit', '-q', '-F', fichierMessage])
if (!r.ok) echec('git commit a échoué.', r.sortie)
rmSync(fichierMessage, { force: true })
console.log(lancer(['git', 'log', '--oneline', '-1']).sortie)
