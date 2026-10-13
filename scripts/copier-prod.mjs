// Copier les DONNÉES de la prod dans la base locale (plan environnement-dev-
// docker-2026-10-12, étape 14). Lancé par l'UTILISATEUR (`copier-prod.bat`) ;
// l'assistant ne le lance jamais (le hook garde-prod le refuse).
//
// Sens UNIQUE : la prod est LUE (données de public et private, et les deux
// tables de comptes), jamais écrite. Chargement ET anonymisation dans UNE
// transaction : un échec n'y laisse jamais de vrais noms. Sessions et jetons
// ne sont pas copiés ; les comptes le sont (connexion locale avec votre mot de
// passe habituel). Le dossier de travail est effacé à la fin, et ceux qu'une
// fenêtre fermée aurait laissés sont effacés au lancement suivant. Le poste
// est délié dans tous les cas. Revue adverse du 2026-10-13 intégrée.

import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'

import {
  BUCKETS,
  COMPTES,
  REF_PROD,
  argumentsDump,
  arretAvantCopie,
  derniereMigration,
  insertionComptes,
  lectureComptes,
  migrationsNonLivrees,
} from './copier-prod-plan.mjs'
import { lignesJson } from './livrer-plan.mjs'

const RACINE = join(import.meta.dirname, '..')
const LIAISON = join(RACINE, 'supabase', '.temp', 'project-ref')
const CONTENEUR_DB = 'supabase_db_back-office'
const PREFIXE_TRAVAIL = 'copie-prod-'

function lancer(
  cmd,
  { voir = false, accepterEchec = false, entree, cwd = RACINE } = {},
) {
  const r = spawnSync(cmd[0], cmd.slice(1), {
    cwd,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    input: entree,
    stdio: voir
      ? 'inherit'
      : [entree === undefined ? 'inherit' : 'pipe', 'pipe', 'pipe'],
    maxBuffer: 256 * 1024 * 1024,
  })
  const res = {
    ok: r.status === 0,
    sortie: (r.stdout ?? '').trim(),
    erreur: (r.stderr ?? '').trim(),
  }
  if (!res.ok && !accepterEchec) {
    const detail = voir ? '' : `\n${(res.erreur || res.sortie).slice(-1500)}`
    throw new Error(`« ${cmd.join(' ')} » a échoué.${detail}`)
  }
  return res
}

const titre = (t) => console.log(`\n=== ${t} ===`)

/** psql DANS le conteneur de la base locale (jamais une autre base), en UNE transaction. */
function psqlLocal(sql) {
  return lancer(
    [
      'docker',
      'exec',
      '-i',
      CONTENEUR_DB,
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
      '-1',
      '-q',
      '-At',
    ],
    {
      entree: sql,
    },
  ).sortie
}

/** Requête en lecture sur la prod ; une erreur est AFFICHÉE, jamais avalée. */
function requeteProd(sql) {
  const r = lancer(
    [
      'supabase',
      'db',
      'query',
      '--linked',
      '--agent',
      'no',
      '-o',
      'json',
      `"${sql}"`,
    ],
    { accepterEchec: true },
  )
  if (!r.ok)
    throw new Error(
      `Lecture en prod impossible :\n${(r.erreur || r.sortie).slice(-1200)}`,
    )
  return lignesJson(r.sortie)
}

// ── nettoyage garanti ──────────────────────────────────────────────────────

let travail = null

function purgerTravaux() {
  for (const d of readdirSync(tmpdir()))
    if (d.startsWith(PREFIXE_TRAVAIL))
      rmSync(join(tmpdir(), d), { recursive: true, force: true })
}

function nettoyer() {
  if (travail) rmSync(travail, { recursive: true, force: true })
  travail = null
  if (existsSync(LIAISON)) {
    spawnSync('supabase', ['unlink'], {
      cwd: RACINE,
      shell: process.platform === 'win32',
      stdio: 'ignore',
    })
    console.log('Poste délié de la prod.')
  }
}
process.on('exit', nettoyer)
for (const signal of ['SIGINT', 'SIGHUP', 'SIGBREAK', 'SIGTERM'])
  process.on(signal, () => {
    console.log('\nInterrompu.')
    process.exit(130)
  })

function demander(question) {
  return new Promise((resolve, reject) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    rl.on('SIGINT', () => {
      rl.close()
      reject(new Error('Interrompu.'))
    })
    rl.question(question, (r) => {
      rl.close()
      resolve(r)
    })
  })
}

/** Les fonctions locales envoient-elles vraiment vers Mailpit, et nulle part ailleurs ? */
function mailpitBranche() {
  const env = join(
    RACINE,
    'supabase',
    'functions',
    '_shared',
    'environnement.ts',
  )
  const local = join(RACINE, 'supabase', 'functions', '.env')
  if (
    !existsSync(env) ||
    !readFileSync(env, 'utf8').includes("genre: 'mailpit'")
  )
    return false
  return !(
    existsSync(local) &&
    /^\s*RESEND_API_KEY\s*=\s*\S/m.test(readFileSync(local, 'utf8'))
  )
}

// ── programme ──────────────────────────────────────────────────────────────

try {
  purgerTravaux()
  if (existsSync(LIAISON)) {
    console.log(
      '⚠ Le poste était resté relié à la prod (fenêtre fermée pendant un usage précédent ?) : déliaison.',
    )
    nettoyer()
  }

  titre('Contrôles locaux')
  const arret = arretAvantCopie({
    baseLocaleJoignable: lancer(
      ['docker', 'exec', CONTENEUR_DB, 'pg_isready', '-U', 'postgres'],
      { accepterEchec: true },
    ).ok,
    mailpitBranche: mailpitBranche(),
    arbrePropre: lancer(['git', 'status', '--porcelain']).sortie === '',
  })
  if (arret) throw new Error(arret)

  console.log(
    'La base locale va être ENTIÈREMENT remplacée par les données de la prod',
  )
  console.log(
    '(noms de clients remplacés). Vos essais locaux actuels seront perdus.',
  )
  if ((await demander('Tapez COPIER pour continuer : ')).trim() !== 'COPIER') {
    console.log('Copie annulée : rien n’a changé.')
    process.exit(0)
  }

  titre('Liaison temporaire à la prod (lecture seule)')
  lancer(['supabase', 'link', '--project-ref', REF_PROD], { voir: true })

  const versionProd = derniereMigration(
    requeteProd(
      'select version from supabase_migrations.schema_migrations',
    ).map((r) => String(r.version)),
  )
  if (versionProd === null)
    throw new Error(
      'La prod n’a pas encore d’historique de migrations : lancez d’abord « livrer.bat --amorcer ».',
    )

  travail = mkdtempSync(join(tmpdir(), PREFIXE_TRAVAIL))
  titre('Lecture des données de la prod')
  // Chemins RELATIFS au dossier de travail : la CLI refuse un chemin Windows
  // absolu pour `storage cp` (vérifié le 2026-10-13).
  lancer(argumentsDump(`"${join(travail, 'donnees.sql')}"`), { voir: true })
  // `--workdir` : la CLI doit trouver le projet (liaison) depuis le dossier de travail.
  const cli = ['supabase', '--workdir', `"${RACINE}"`]
  const comptes = COMPTES.map((table) => {
    const lignes = requeteProd(lectureComptes(table))[0]?.lignes ?? []
    return { table, json: JSON.stringify(lignes), n: lignes.length }
  })
  console.log(comptes.map((c) => `${c.table} : ${c.n}`).join(' · '))
  for (const b of BUCKETS) {
    // Lecture : les fichiers du bucket arrivent DANS le dossier `<bucket>`.
    const r = lancer(
      [
        ...cli,
        'storage',
        'cp',
        '-r',
        `ss:///${b}`,
        b,
        '--experimental',
        '--linked',
      ],
      { accepterEchec: true, cwd: travail },
    )
    console.log(
      r.ok
        ? `Fichiers du bucket ${b} lus.`
        : `⚠ Fichiers du bucket ${b} non lus : ${(r.erreur || r.sortie).split('\n').pop()}`,
    )
  }
  lancer(['supabase', 'unlink'])
  console.log('Poste délié : la suite ne touche que la base locale.')

  titre(`Base locale ramenée à la version de la prod (${versionProd})`)
  lancer(
    [
      'supabase',
      'db',
      'reset',
      '--local',
      '--no-seed',
      '--version',
      versionProd,
    ],
    { voir: true },
  )

  titre('Chargement et anonymisation (une seule transaction)')
  const anonymiser = readFileSync(
    join(RACINE, 'supabase', 'anonymiser.sql'),
    'utf8',
  )
    .split(/\r?\n/)
    .filter((l) => !/^\s*(begin|commit)\s*;\s*$/i.test(l))
    .join('\n')
  psqlLocal(
    [
      'set session_replication_role = replica;',
      ...comptes.map((c) => insertionComptes(c.table, c.json)),
      readFileSync(join(travail, 'donnees.sql'), 'utf8'),
      anonymiser,
      'set session_replication_role = origin;',
    ].join('\n'),
  )
  rmSync(join(travail, 'donnees.sql'), { force: true })
  console.log(
    'Données chargées, noms de clients remplacés, fichier de copie effacé.',
  )

  for (const b of BUCKETS) {
    if (!existsSync(join(travail, b))) continue
    // Envoi : le DOSSIER `<bucket>` vers la racine `ss:///` (vers
    // `ss:///<bucket>`, la CLI créait `<bucket>/<bucket>/…`, vérifié).
    const r = lancer(
      [...cli, 'storage', 'cp', '-r', b, 'ss:///', '--experimental', '--local'],
      { accepterEchec: true, cwd: travail },
    )
    console.log(
      r.ok
        ? `Fichiers du bucket ${b} copiés en local.`
        : `⚠ Fichiers du bucket ${b} non copiés : ${(r.erreur || r.sortie).split('\n').pop()}`,
    )
  }

  const aRejouer = migrationsNonLivrees(
    readdirSync(join(RACINE, 'supabase', 'migrations')),
    versionProd,
  )
  if (aRejouer.length) {
    titre(
      `Migrations pas encore livrées, rejouées sur les vraies données (${aRejouer.length})`,
    )
    const r = lancer(['supabase', 'migration', 'up', '--local'], {
      voir: true,
      accepterEchec: true,
    })
    if (!r.ok)
      console.log(
        '⚠ Une migration échoue sur les vraies données : à corriger AVANT de livrer. La base est laissée en l’état pour enquête.',
      )
  }

  titre('Résumé')
  console.log(
    psqlLocal(
      "select 'comptes : ' || (select count(*) from auth.users) || ' · petits-déjeuners : ' || (select count(*) from public.pdj_breakfasts) || ' · parking : ' || (select count(*) from public.parking_reservations) || ' · documents : ' || (select count(*) from public.classeur_documents) || ' · fichiers : ' || (select count(*) from storage.objects)",
    ),
  )
  console.log(
    'Connexion locale : votre e-mail et votre mot de passe habituels (ceux de la prod au moment de la copie).',
  )
  console.log('Pour revenir aux données fictives : pnpm db:reset.')
} catch (err) {
  console.error(`\n✗ ${err instanceof Error ? err.message : String(err)}`)
  process.exitCode = 1
} finally {
  nettoyer()
}
