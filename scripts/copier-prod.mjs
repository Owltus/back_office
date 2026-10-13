// Copier les DONNÉES de la prod dans la base locale (plan environnement-dev-
// docker-2026-10-12, étape 14). Lancé par l'UTILISATEUR (`copier-prod.bat`) ;
// l'assistant ne le lance jamais (le hook garde-prod le refuse).
//
// Sens UNIQUE : la prod est LUE (un dump des données), jamais écrite. Les noms
// de clients sont remplacés (`supabase/anonymiser.sql`), les sessions et
// jetons ne sont pas copiés, les comptes le sont (connexion locale avec votre
// mot de passe habituel). Le fichier de dump est effacé à la fin, dans tous
// les cas, et le poste délié.

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
import { createInterface } from 'node:readline/promises'

import {
  BUCKETS,
  REF_PROD,
  argumentsDump,
  arretAvantCopie,
  derniereMigration,
  migrationsNonLivrees,
} from './copier-prod-plan.mjs'

const RACINE = join(import.meta.dirname, '..')
const CONTENEUR_DB = 'supabase_db_back-office'

function lancer(cmd, { voir = false, accepterEchec = false, entree } = {}) {
  const r = spawnSync(cmd[0], cmd.slice(1), {
    cwd: RACINE,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    input: entree,
    stdio: voir
      ? 'inherit'
      : [entree === undefined ? 'inherit' : 'pipe', 'pipe', 'pipe'],
    maxBuffer: 256 * 1024 * 1024,
  })
  if (r.status !== 0 && !accepterEchec) {
    const detail = voir
      ? ''
      : `\n${(r.stderr || r.stdout || '').trim().slice(-1500)}`
    throw new Error(`« ${cmd.join(' ')} » a échoué.${detail}`)
  }
  return { ok: r.status === 0, sortie: (r.stdout ?? '').trim() }
}

const titre = (t) => console.log(`\n=== ${t} ===`)

/** psql DANS le conteneur de la base locale : jamais une autre base. */
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
      '-q',
      '-At',
    ],
    {
      entree: sql,
    },
  ).sortie
}

let travail = null
let lie = false

function nettoyer() {
  if (travail) rmSync(travail, { recursive: true, force: true })
  travail = null
  if (lie || existsSync(join(RACINE, 'supabase', '.temp', 'project-ref'))) {
    lancer(['supabase', 'unlink'], { accepterEchec: true })
    lie = false
    console.log('Poste délié de la prod. Fichiers temporaires effacés.')
  }
}

process.on('SIGINT', () => {
  nettoyer()
  console.log('\nInterrompu.')
  process.exit(130)
})

async function demander(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    return await rl.question(question)
  } finally {
    rl.close()
  }
}

try {
  titre('Contrôles locaux')
  const baseLocaleJoignable = lancer(
    ['docker', 'exec', CONTENEUR_DB, 'pg_isready', '-U', 'postgres'],
    { accepterEchec: true },
  ).ok
  const mailpitBranche = existsSync(
    join(RACINE, 'supabase', 'functions', '_shared', 'environnement.ts'),
  )
  const arbrePropre = lancer(['git', 'status', '--porcelain']).sortie === ''
  const arret = arretAvantCopie({
    baseLocaleJoignable,
    mailpitBranche,
    arbrePropre,
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
  lie = true

  const sortie = lancer(
    [
      'supabase',
      'db',
      'query',
      '--linked',
      '-o',
      'json',
      '"select version from supabase_migrations.schema_migrations"',
    ],
    {
      accepterEchec: true,
    },
  ).sortie
  const versions = sortie.includes('{')
    ? (JSON.parse(sortie.slice(sortie.indexOf('{'))).rows ?? []).map(
        (r) => r.version,
      )
    : []
  const versionProd = derniereMigration(versions)
  if (versionProd === null)
    throw new Error(
      'La prod n’a pas encore d’historique de migrations : lancez d’abord « livrer.bat --amorcer ».',
    )

  travail = mkdtempSync(join(tmpdir(), 'copie-prod-'))
  const dump = join(travail, 'donnees.sql')
  titre('Lecture des données de la prod')
  lancer(argumentsDump(dump), { voir: true })

  const images = join(travail, 'images')
  for (const b of BUCKETS) {
    const r = lancer(
      [
        'supabase',
        'storage',
        'cp',
        '-r',
        `ss:///${b}`,
        join(images, b),
        '--experimental',
        '--linked',
      ],
      { accepterEchec: true },
    )
    console.log(
      r.ok
        ? `Fichiers du bucket ${b} lus.`
        : `⚠ Fichiers du bucket ${b} non lus (le reste de la copie est valable).`,
    )
  }
  lancer(['supabase', 'unlink'])
  lie = false
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

  titre('Chargement et anonymisation')
  const sql = readFileSync(dump, 'utf8')
  psqlLocal(
    `set session_replication_role = replica;\n${sql}\nset session_replication_role = origin;\n`,
  )
  psqlLocal(readFileSync(join(RACINE, 'supabase', 'anonymiser.sql'), 'utf8'))
  rmSync(dump, { force: true })
  console.log(
    'Données chargées, noms de clients remplacés, fichier de copie effacé.',
  )

  for (const b of BUCKETS) {
    if (!existsSync(join(images, b))) continue
    const r = lancer(
      [
        'supabase',
        'storage',
        'cp',
        '-r',
        join(images, b),
        `ss:///${b}`,
        '--experimental',
        '--local',
      ],
      { accepterEchec: true },
    )
    console.log(
      r.ok
        ? `Fichiers du bucket ${b} copiés en local.`
        : `⚠ Fichiers du bucket ${b} non copiés.`,
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
} catch (err) {
  console.error(`\n✗ ${err instanceof Error ? err.message : String(err)}`)
  process.exitCode = 1
} finally {
  nettoyer()
}
