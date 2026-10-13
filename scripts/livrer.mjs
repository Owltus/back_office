// Livrer en prod : UNE commande (plan environnement-dev-docker-2026-10-12,
// étape 9). Lancée par l'UTILISATEUR (`livrer.bat` ou `pnpm livrer`) ;
// l'assistant ne la lance jamais (le hook garde-prod refuse son lancement).
//
//   livrer.bat             contrôles → résumé → LIVRER → base, fonctions, site
//   livrer.bat --essai     contrôles → résumé, puis s'arrête (rien ne part)
//   livrer.bat --amorcer   une seule fois : inscrit en prod les migrations déjà
//                          présentes (baseline), sans rien rejouer
//
// La décision est dans `livrer-plan.mjs` (pur, testé) ; ici, seulement les
// commandes. Le poste est relié à la prod le temps de la livraison, puis
// délié dans un `finally` — succès, échec ou Ctrl + C.

import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'

import {
  REF_PROD,
  arretAvantProd,
  bilanEchec,
  ecartSchema,
  fonctionsModifiees,
  lignesDestructrices,
  planEnvoi,
  secretsManquants,
} from './livrer-plan.mjs'

const RACINE = join(import.meta.dirname, '..')
const DOSSIER_ETAT = join(homedir(), '.back-office')
const INSTANTANE = join(DOSSIER_ETAT, 'schema-prod.sql')
const SECRETS_ATTENDUS = [
  'IMPORT_SECRET',
  'REPORT_FROM',
  'RESEND_API_KEY',
  'SB_SECRET_KEY',
]
const MODE = process.argv.includes('--amorcer')
  ? 'amorcer'
  : process.argv.includes('--essai')
    ? 'essai'
    : 'livrer'

// ── commandes ──────────────────────────────────────────────────────────────

function lancer(cmd, { voir = false, accepterEchec = false } = {}) {
  const r = spawnSync(cmd[0], cmd.slice(1), {
    cwd: RACINE,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: voir ? 'inherit' : ['inherit', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
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

/** Lignes d'un `supabase db query -o json`. */
function requete(cible, sql) {
  const { sortie } = lancer([
    'supabase',
    'db',
    'query',
    cible,
    '-o',
    'json',
    `"${sql}"`,
  ])
  const json = JSON.parse(sortie.slice(sortie.indexOf('{')))
  return json.rows ?? []
}

function versionsMigrationsLocales() {
  return readdirSync(join(RACINE, 'supabase', 'migrations'))
    .filter((f) => /^\d{14}_.+\.sql$/.test(f))
    .sort()
}

function dumpProd() {
  const f = join(tmpdir(), `schema-prod-${Date.now()}.sql`)
  lancer([
    'supabase',
    'db',
    'dump',
    '--linked',
    '--schema',
    'public,private',
    '-f',
    f,
  ])
  const sql = readFileSync(f, 'utf8')
  rmSync(f, { force: true })
  return sql
}

function enregistrerInstantane(sql) {
  mkdirSync(DOSSIER_ETAT, { recursive: true })
  writeFileSync(INSTANTANE, sql)
}

async function demander(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    return await rl.question(question)
  } finally {
    rl.close()
  }
}

// ── étapes ─────────────────────────────────────────────────────────────────

function controlesLocaux() {
  titre('Contrôles locaux (rien ne touche la prod)')
  lancer(['git', 'fetch', 'origin', '--tags', '--quiet'])
  const branche = lancer(['git', 'rev-parse', '--abbrev-ref', 'HEAD']).sortie
  const arbrePropre = lancer(['git', 'status', '--porcelain']).sortie === ''
  const enRetard =
    Number(lancer(['git', 'rev-list', '--count', 'HEAD..origin/main']).sortie) >
    0
  const etiquetteProd = lancer(
    ['git', 'rev-parse', '-q', '--verify', 'refs/tags/prod'],
    { accepterEchec: true },
  ).ok
  const pkg = JSON.parse(readFileSync(join(RACINE, 'package.json'), 'utf8'))
  const aVerifier = [
    ['types (tsc)', ['npx', 'tsc', '--noEmit']],
    ['tests (vitest)', ['pnpm', 'test']],
    ['build', ['pnpm', 'build']],
    ...(pkg.scripts?.['test:db']
      ? [['tests de la base (test:db)', ['pnpm', 'test:db']]]
      : []),
  ]
  const controles = []
  for (const [nom, cmd] of aVerifier) {
    process.stdout.write(`- ${nom}… `)
    const ok = lancer(cmd, { accepterEchec: true }).ok
    console.log(ok ? 'OK' : 'ÉCHEC')
    controles.push({ nom, ok })
    if (!ok) break
  }
  let jouees = []
  try {
    jouees = requete(
      '--local',
      'select version from supabase_migrations.schema_migrations',
    ).map((r) => r.version)
  } catch {
    throw new Error('Base locale injoignable : lancez « pnpm db:start ».')
  }
  const migrationsNonJoueesEnLocal = versionsMigrationsLocales().filter(
    (f) => !jouees.includes(f.slice(0, 14)),
  )
  return arretAvantProd({
    branche,
    arbrePropre,
    enRetard,
    etiquetteProd: MODE === 'amorcer' ? true : etiquetteProd,
    controles,
    migrationsNonJoueesEnLocal,
  })
}

async function amorcer() {
  titre('Amorçage (une seule fois)')
  if (
    lancer(['git', 'rev-parse', '-q', '--verify', 'refs/tags/prod'], {
      accepterEchec: true,
    }).ok
  )
    throw new Error(
      'Déjà amorcé (étiquette « prod » présente). Utilisez livrer.bat.',
    )
  const deja = requete(
    '--linked',
    "select to_regclass('supabase_migrations.schema_migrations') is not null as existe",
  )[0]
  if (deja?.existe)
    throw new Error(
      'La prod a déjà un historique de migrations : amorçage inutile.',
    )
  const versions = versionsMigrationsLocales().map((f) => f.slice(0, 14))
  const prod = dumpProd()
  const local = (() => {
    const f = join(tmpdir(), `schema-local-${Date.now()}.sql`)
    lancer([
      'supabase',
      'db',
      'dump',
      '--local',
      '--schema',
      'public,private',
      '-f',
      f,
    ])
    const s = readFileSync(f, 'utf8')
    rmSync(f, { force: true })
    return s
  })()
  const { absentes, ajoutees } = ecartSchema(local, prod)
  console.log(
    `Schéma prod comparé à la base locale : ${absentes.length + ajoutees.length} ligne(s) d'écart.`,
  )
  for (const l of [
    ...absentes.map((x) => `  local seulement : ${x}`),
    ...ajoutees.map((x) => `  prod seulement  : ${x}`),
  ].slice(0, 20))
    console.log(l)
  console.log(
    `\nMigrations à INSCRIRE en prod comme déjà appliquées (rien n'est rejoué) : ${versions.join(', ')}`,
  )
  console.log(
    'C’est la seule écriture : la table supabase_migrations.schema_migrations est créée et remplie.',
  )
  if (
    (await demander('\nTapez AMORCER pour continuer : ')).trim() !== 'AMORCER'
  ) {
    console.log('Amorçage annulé : rien n’a été écrit.')
    return
  }
  lancer(
    [
      'supabase',
      'migration',
      'repair',
      '--status',
      'applied',
      ...versions,
      '--linked',
    ],
    { voir: true },
  )
  const apres = dumpProd()
  const e = ecartSchema(prod, apres)
  console.log(
    `Schéma avant / après l'amorçage : ${e.absentes.length + e.ajoutees.length} ligne(s) d'écart (attendu : 0).`,
  )
  enregistrerInstantane(apres)
  lancer(['git', 'tag', '-f', 'prod', 'origin/main'])
  console.log(
    'Amorcé. Étiquette « prod » posée sur origin/main. Les prochaines livraisons : livrer.bat.',
  )
}

async function livrer() {
  if (!existsSync(INSTANTANE))
    throw new Error(
      `Instantané du schéma prod absent (${INSTANTANE}) : amorçage à faire (livrer.bat --amorcer).`,
    )

  titre('Dérive : la prod a-t-elle été modifiée hors livraison ?')
  const prod = dumpProd()
  const { absentes, ajoutees } = ecartSchema(
    readFileSync(INSTANTANE, 'utf8'),
    prod,
  )
  if (absentes.length + ajoutees.length > 0) {
    for (const l of [
      ...absentes.map((x) => `  disparu : ${x}`),
      ...ajoutees.map((x) => `  apparu  : ${x}`),
    ].slice(0, 30))
      console.log(l)
    throw new Error(
      'Le schéma de la prod a changé depuis la dernière livraison, hors migration. On ne livre pas par-dessus : capturez ce changement en migration, ou annulez-le en prod.',
    )
  }
  console.log('Aucune dérive.')

  titre('Ce qui part')
  const enProd = requete(
    '--linked',
    'select version from supabase_migrations.schema_migrations',
  ).map((r) => r.version)
  const migrations = versionsMigrationsLocales()
    .filter((f) => !enProd.includes(f.slice(0, 14)))
    .map((nom) => ({
      nom,
      destructrices: lignesDestructrices(
        readFileSync(join(RACINE, 'supabase', 'migrations', nom), 'utf8'),
      ),
    }))
  const commits = lancer(['git', 'log', '--oneline', 'prod..HEAD'])
    .sortie.split('\n')
    .filter(Boolean)
  const changes = lancer(['git', 'diff', '--name-only', 'prod..HEAD'])
    .sortie.split('\n')
    .filter(Boolean)
  const toutes = readdirSync(join(RACINE, 'supabase', 'functions'), {
    withFileTypes: true,
  })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
    .map((d) => d.name)
  const fonctions = fonctionsModifiees(changes, toutes)
  const secrets = lancer([
    'supabase',
    'secrets',
    'list',
    '--project-ref',
    REF_PROD,
  ])
    .sortie.split('\n')
    .map((l) => l.split('|')[0].trim())
    .filter((n) => /^[A-Z0-9_]+$/.test(n))
  const manquants = secretsManquants(SECRETS_ATTENDUS, secrets)

  console.log(`Commits (${commits.length}) :`)
  for (const c of commits.slice(0, 30)) console.log(`  ${c}`)
  console.log(
    `Migrations (${migrations.length}) : ${migrations.map((m) => m.nom).join(', ') || 'aucune'}`,
  )
  console.log(
    `Fonctions à déployer (${fonctions.length}) : ${fonctions.join(', ') || 'aucune'}`,
  )
  const avert = []
  if (manquants.length)
    avert.push(`Secrets absents en prod : ${manquants.join(', ')}`)
  if (changes.includes('supabase/config.toml'))
    avert.push(
      'supabase/config.toml a changé : les réglages Auth ne partent PAS, reportez-les à la main dans le dashboard.',
    )
  if (changes.some((f) => f.startsWith('worker/')))
    avert.push(
      'worker/ a changé : il ne part pas avec livrer. Ensuite : wrangler deploy, wrangler triggers deploy, puis wrangler tail.',
    )
  for (const m of migrations.filter((x) => x.destructrices.length))
    avert.push(
      `${m.nom} RETIRE quelque chose (l'ancien code tourne encore 1 à 2 min dessus) :\n      ${m.destructrices.join('\n      ')}`,
    )
  for (const a of avert) console.log(`⚠ ${a}`)
  if (manquants.length)
    throw new Error('Secret manquant en prod : rien ne part.')

  if (MODE === 'essai') {
    console.log('\nMode essai : arrêt ici, rien n’est parti.')
    return
  }
  const reponse = await demander('\nTapez LIVRER pour envoyer en prod : ')
  const confirmationSuppression = migrations.some((m) => m.destructrices.length)
    ? await demander(
        'Une migration RETIRE quelque chose. Tapez SUPPRIMER pour confirmer : ',
      )
    : null
  const plan = planEnvoi({
    reponse,
    confirmationSuppression,
    migrations,
    fonctions,
    commits: commits.length,
  })
  if (plan.etapes.length === 0) {
    console.log(plan.raison)
    return
  }

  titre('Envoi')
  for (let i = 0; i < plan.etapes.length; i++) {
    const e = plan.etapes[i]
    console.log(`→ ${e.nom}`)
    try {
      lancer(e.cmd, { voir: true })
    } catch (err) {
      const b = bilanEchec(plan.etapes, i)
      console.log(`\nÉCHEC à l'étape « ${b.echoue} ».`)
      console.log(`Parti : ${b.parti.join(', ') || 'rien'}`)
      console.log(`Pas parti : ${b.pasParti.join(', ') || 'rien'}`)
      throw err
    }
  }
  lancer(['git', 'push', '-f', 'origin', 'prod'], { accepterEchec: true })

  titre('Contrôle après livraison (lecture)')
  for (const f of ['verif_advisor.sql', 'verif_classeur_acces.sql']) {
    const r = lancer(
      ['supabase', 'db', 'query', '--linked', '-f', `supabase/${f}`],
      { accepterEchec: true },
    )
    const verdict = /TOUT EST EN PLACE|RESULTAT OK/.exec(r.sortie + ' ')
      ? 'OK'
      : 'à relire'
    console.log(`- ${f} : ${verdict}`)
  }
  enregistrerInstantane(dumpProd())
  console.log('\nLivré. Instantané du schéma prod mis à jour.')
}

// ── programme ──────────────────────────────────────────────────────────────

let lie = false
// Ctrl + C : `finally` ne s'exécute pas sur un signal, on délie ici.
process.on('SIGINT', () => {
  lancer(['supabase', 'unlink'], { accepterEchec: true })
  console.log('\nInterrompu. Poste délié de la prod.')
  process.exit(130)
})
try {
  const arret = controlesLocaux()
  if (arret) throw new Error(arret)
  titre('Liaison temporaire à la prod')
  lancer(['supabase', 'link', '--project-ref', REF_PROD], { voir: true })
  lie = true
  if (MODE === 'amorcer') await amorcer()
  else await livrer()
} catch (err) {
  console.error(`\n✗ ${err instanceof Error ? err.message : String(err)}`)
  process.exitCode = 1
} finally {
  if (lie || existsSync(join(RACINE, 'supabase', '.temp', 'project-ref'))) {
    lancer(['supabase', 'unlink'], { accepterEchec: true })
    console.log('\nPoste délié de la prod.')
  }
}
