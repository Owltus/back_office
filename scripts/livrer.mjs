// Livrer en prod : UNE commande (plan environnement-dev-docker-2026-10-12,
// étape 9). Lancée par l'utilisateur (`livrer.bat`), ou par l'assistant
// quand l'utilisateur demande « push » (`PROD_CONFIRME=1`, CLAUDE.md).
//
//   livrer.bat                       contrôles → résumé → LIVRER → envoi
//   livrer.bat --essai               contrôles → résumé + empreinte, arrêt
//   … --confirme=<empreinte>         envoi SANS clavier (assistant) si rien
//                                    n'a changé depuis l'essai ; refuse ce
//                                    qui demande un geste (SUPPRIMER…)
//   livrer.bat --amorcer             UNE fois : inscrit la baseline en prod
//   livrer.bat --reprendre-instantane  réaccepte le schéma prod actuel comme
//                                      référence (autre poste, livraison
//                                      interrompue), après l'avoir montré
//
// La décision est dans `livrer-plan.mjs` (pur, testé) ; ici, seulement les
// commandes. Le poste est relié à la prod le temps de la livraison, puis
// délié dans TOUS les cas : fin, erreur, Ctrl + C (y compris à une question),
// fenêtre fermée. Revue adverse du 2026-10-13 intégrée.

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
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
import { createInterface } from 'node:readline'

import {
  REF_PROD,
  arretAvantProd,
  bilanEchec,
  arretsReglagesFonctions,
  arretsSansClavier,
  changementsConfig,
  choixControles,
  descriptionLivraison,
  ecartNonCapture,
  ecartSchema,
  fonctionsModifiees,
  lignesDestructrices,
  lignesDonnees,
  lignesJson,
  planEnvoi,
  nomsSecrets,
  secretsManquants,
} from './livrer-plan.mjs'

const RACINE = join(import.meta.dirname, '..')
const LIAISON = join(RACINE, 'supabase', '.temp', 'project-ref')
const DOSSIER_ETAT = join(homedir(), '.back-office')
const INSTANTANE = join(DOSSIER_ETAT, 'schema-prod.sql')
/** Dernier commit dont TOUS les contrôles locaux sont passés. */
const CONTROLES_OK = join(DOSSIER_ETAT, 'controles-ok')
const SECRETS_ATTENDUS = [
  'IMPORT_SECRET',
  'MONTRE_CLE',
  'REPORT_FROM',
  'RESEND_API_KEY',
  'SB_SECRET_KEY',
]
/** Les SEULES migrations que l'amorçage inscrit sans les jouer : celles qui
 *  décrivent la prod du 2026-10-13. Toute migration plus récente part par
 *  `db push`, jamais par `repair`. */
const BASELINE = ['20261013000000', '20261013000001']
/** Écart connu entre le schéma local reconstruit et la prod : le CHECK de
 *  `classeur_documents` réimprimé avec d'autres parenthèses (2 lignes). */
const ECART_AMORCAGE_ATTENDU = 2
const MODE = process.argv.includes('--amorcer')
  ? 'amorcer'
  : process.argv.includes('--reprendre-instantane')
    ? 'reprendre'
    : process.argv.includes('--essai')
      ? 'essai'
      : 'livrer'
/** `--confirme=<empreinte>` : envoi sans clavier, après un essai lu. */
const CONFIRME =
  process.argv
    .find((a) => a.startsWith('--confirme='))
    ?.slice('--confirme='.length) ?? null

// ── commandes ──────────────────────────────────────────────────────────────

function lancer(cmd, { voir = false, accepterEchec = false } = {}) {
  const r = spawnSync(cmd[0], cmd.slice(1), {
    cwd: RACINE,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: voir ? 'inherit' : ['inherit', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
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

/** Lignes d'une requête (`--agent no` : sortie de personne, pas d'agent). */
function requete(cible, sql) {
  const { sortie } = lancer([
    'supabase',
    'db',
    'query',
    cible,
    '--agent',
    'no',
    '-o',
    'json',
    `"${sql}"`,
  ])
  return lignesJson(sortie)
}

/** Vrai si la base locale a des comptes et aucun compte fictif : c'est la
 *  copie de la prod (`copier-prod.mjs`). Base injoignable = faux (l'erreur
 *  sortira plus loin, avec son message). */
function baseLocaleCopieDeLaProd() {
  try {
    const [r] = requete(
      '--local',
      "select count(*) as total, count(*) filter (where right(email, 13) = '@exemple.test') as fictifs from auth.users",
    )
    return Number(r?.total) > 0 && Number(r?.fictifs) === 0
  } catch {
    return false
  }
}

function versionsMigrationsLocales() {
  return readdirSync(join(RACINE, 'supabase', 'migrations'))
    .filter((f) => /^\d{14}_.+\.sql$/.test(f))
    .sort()
}

function dump(cible) {
  const f = join(tmpdir(), `schema-${cible.slice(2)}-${Date.now()}.sql`)
  lancer([
    'supabase',
    'db',
    'dump',
    cible,
    '--schema',
    'public,private',
    '-f',
    `"${f}"`,
  ])
  const sql = readFileSync(f, 'utf8')
  rmSync(f, { force: true })
  return sql
}

function enregistrerInstantane(sql) {
  mkdirSync(DOSSIER_ETAT, { recursive: true })
  writeFileSync(INSTANTANE, sql)
}

function afficherEcart({ absentes, ajoutees }, a, b, max = 30) {
  for (const l of [
    ...absentes.map((x) => `  ${a} : ${x}`),
    ...ajoutees.map((x) => `  ${b} : ${x}`),
  ].slice(0, max))
    console.log(l)
}

/** Question à l'écran ; Ctrl + C la REJETTE (sinon Node sortait sans délier). */
function demander(question) {
  // Filet (audit du 2026-10-17) : une réponse ne se lit JAMAIS sur une entrée
  // qui n'est pas un clavier (tube, fichier, `printf … | node`).
  if (!process.stdin.isTTY)
    return Promise.reject(
      new Error(
        'Pas de clavier : cette confirmation se tape au clavier (une réponse passée par un tube est refusée).',
      ),
    )
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

// ── déliaison garantie ─────────────────────────────────────────────────────

function delier() {
  if (existsSync(LIAISON)) {
    spawnSync('supabase', ['unlink'], {
      cwd: RACINE,
      shell: process.platform === 'win32',
      stdio: 'ignore',
    })
    console.log('\nPoste délié de la prod.')
  }
}
// `exit` est synchrone : il couvre aussi une sortie imprévue de Node.
process.on('exit', delier)
for (const signal of ['SIGINT', 'SIGHUP', 'SIGBREAK', 'SIGTERM'])
  process.on(signal, () => {
    console.log('\nInterrompu.')
    process.exit(130)
  })

// ── étapes ─────────────────────────────────────────────────────────────────

function controlesLocaux() {
  titre('Contrôles locaux (rien ne touche la prod)')
  // `--force` : l'étiquette `prod` bouge à chaque livraison ; sans lui, git
  // refuse dès que la locale diffère de la distante.
  lancer(['git', 'fetch', 'origin', '--tags', '--force', '--quiet'])
  const branche = lancer(['git', 'rev-parse', '--abbrev-ref', 'HEAD']).sortie
  const arbrePropre = lancer(['git', 'status', '--porcelain']).sortie === ''
  const enRetard =
    Number(lancer(['git', 'rev-list', '--count', 'HEAD..origin/main']).sortie) >
    0
  const etiquetteProd = lancer(
    ['git', 'rev-parse', '-q', '--verify', 'refs/tags/prod'],
    { accepterEchec: true },
  ).ok
  const head = lancer(['git', 'rev-parse', 'HEAD']).sortie
  const migrationsModifiees = etiquetteProd
    ? lancer([
        'git',
        'diff',
        '--name-only',
        'prod..HEAD',
        '--',
        'supabase/migrations',
      ])
        .sortie.split('\n')
        .filter(Boolean)
    : []
  const choix = choixControles({
    dejaVerifie:
      arbrePropre &&
      existsSync(CONTROLES_OK) &&
      readFileSync(CONTROLES_OK, 'utf8').trim() === head,
    copieDeLaProd: baseLocaleCopieDeLaProd(),
    migrationsModifiees,
  })
  if (choix.note) console.log(choix.note)
  const pkg = JSON.parse(readFileSync(join(RACINE, 'package.json'), 'utf8'))
  const aVerifier = choix.jouer
    ? [
        ['types (tsc)', ['npx', 'tsc', '--noEmit']],
        ['tests (vitest)', ['pnpm', 'test']],
        ['build', ['pnpm', 'build']],
        ...(pkg.scripts?.['test:db'] && choix.testsBase
          ? [['tests de la base (test:db)', ['pnpm', 'test:db']]]
          : []),
      ]
    : []
  const controles = []
  for (const [nom, cmd] of aVerifier) {
    process.stdout.write(`- ${nom}… `)
    const r = lancer(cmd, { accepterEchec: true })
    console.log(r.ok ? 'OK' : 'ÉCHEC')
    controles.push({ nom, ok: r.ok })
    if (!r.ok) {
      console.log((r.erreur || r.sortie).split('\n').slice(-25).join('\n'))
      if (nom.startsWith('tests de la base'))
        console.log(
          '(Si la base locale contient une copie de la prod, ces tests attendent les données fictives : « pnpm db:reset », puis relancez.)',
        )
      break
    }
  }
  // Retenu pour la livraison qui suit l'essai : seulement si TOUT est passé
  // sur un arbre propre (sinon le commit ne décrit pas le code vérifié).
  if (choix.jouer && arbrePropre && controles.every((c) => c.ok)) {
    mkdirSync(DOSSIER_ETAT, { recursive: true })
    writeFileSync(CONTROLES_OK, `${head}\n`)
  }
  let jouees
  try {
    jouees = requete(
      '--local',
      'select version from supabase_migrations.schema_migrations',
    ).map((r) => r.version)
  } catch (err) {
    throw new Error(
      `Base locale : ${err instanceof Error ? err.message : err} (lancée ? « pnpm db:start »)`,
    )
  }
  const migrationsNonJoueesEnLocal = versionsMigrationsLocales().filter(
    (f) => !jouees.includes(f.slice(0, 14)),
  )
  // Seules les migrations partent : une table changée dans Studio sans
  // migration ne partirait pas, en silence. Structure seulement, jamais le
  // contenu (base fantôme rejouée depuis les migrations).
  process.stdout.write('- structure locale = migrations… ')
  const diff = lancer(
    ['supabase', 'db', 'diff', '--local', '--schema', 'public,private,storage'],
    { accepterEchec: true },
  )
  if (!diff.ok)
    throw new Error(
      `Comparaison de la structure locale impossible (base lancée ?).\n${(diff.erreur || diff.sortie).split('\n').slice(-10).join('\n')}`,
    )
  const ecart = ecartNonCapture(`${diff.sortie}\n${diff.erreur}`)
  console.log(ecart ? 'ÉCART' : 'OK')
  return arretAvantProd({
    ecartNonCapture: ecart,
    branche,
    arbrePropre,
    enRetard,
    etiquetteProd: MODE === 'livrer' || MODE === 'essai' ? etiquetteProd : true,
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
      'Déjà amorcé (étiquette « prod » présente). Autre poste ? livrer.bat --reprendre-instantane.',
    )
  const deja = requete(
    '--linked',
    "select to_regclass('supabase_migrations.schema_migrations') is not null as existe",
  )[0]
  if (deja?.existe)
    throw new Error(
      'La prod a déjà un historique de migrations : amorçage inutile.',
    )
  const locales = versionsMigrationsLocales().map((f) => f.slice(0, 14))
  if (BASELINE.some((v) => !locales.includes(v)))
    throw new Error(
      'Migrations de départ introuvables dans supabase/migrations.',
    )
  const prod = dump('--linked')
  const ecart = ecartSchema(dump('--local'), prod)
  const n = ecart.absentes.length + ecart.ajoutees.length
  console.log(
    `Schéma prod comparé à la base locale : ${n} ligne(s) d'écart (attendu : ${ECART_AMORCAGE_ATTENDU}, le CHECK de classeur_documents réimprimé).`,
  )
  afficherEcart(ecart, 'local seulement', 'prod seulement ', 20)
  if (locales.length > BASELINE.length)
    console.log(
      `Migrations plus récentes (${locales.length - BASELINE.length}) : non inscrites, elles partiront par la livraison.`,
    )
  console.log(
    `\nMigrations INSCRITES en prod comme déjà appliquées (rien n'est rejoué) : ${BASELINE.join(', ')}`,
  )
  console.log(
    'C’est la seule écriture : la table supabase_migrations.schema_migrations est créée et remplie.',
  )
  const mot = n > ECART_AMORCAGE_ATTENDU ? 'AMORCER MALGRE ECART' : 'AMORCER'
  if (n > ECART_AMORCAGE_ATTENDU)
    console.log(
      `⚠ Écart PLUS GRAND que prévu : la base locale ne reproduit pas la prod. À examiner avant d'amorcer.`,
    )
  if ((await demander(`\nTapez ${mot} pour continuer : `)).trim() !== mot) {
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
      ...BASELINE,
      '--linked',
      '--yes',
    ],
    { voir: true },
  )
  const apres = dump('--linked')
  const e = ecartSchema(prod, apres)
  console.log(
    `Schéma avant / après l'amorçage : ${e.absentes.length + e.ajoutees.length} ligne(s) d'écart (attendu : 0).`,
  )
  enregistrerInstantane(apres)
  lancer(['git', 'tag', '-f', 'prod', 'origin/main'])
  pousserEtiquette()
  console.log(
    'Amorcé. Étiquette « prod » posée sur origin/main. Les prochaines livraisons : livrer.bat.',
  )
}

async function reprendreInstantane() {
  titre('Reprendre le schéma actuel de la prod comme référence')
  const prod = dump('--linked')
  if (existsSync(INSTANTANE)) {
    const e = ecartSchema(readFileSync(INSTANTANE, 'utf8'), prod)
    console.log(
      `Écart avec la référence actuelle : ${e.absentes.length + e.ajoutees.length} ligne(s).`,
    )
    afficherEcart(e, 'référence', 'prod     ')
  } else console.log('Aucune référence sur ce poste.')
  console.log(
    '\nÀ faire SEULEMENT si cet écart est connu (livraison interrompue, autre poste).',
  )
  if (
    (await demander('Tapez REPRENDRE pour l’accepter : ')).trim() !==
    'REPRENDRE'
  ) {
    console.log('Annulé : référence inchangée.')
    return
  }
  enregistrerInstantane(prod)
  console.log('Référence du schéma prod mise à jour.')
}

function pousserEtiquette() {
  const r = lancer(
    ['git', 'push', 'origin', '+refs/tags/prod:refs/tags/prod'],
    { accepterEchec: true },
  )
  if (!r.ok)
    console.log(
      `⚠ L'étiquette « prod » n'a pas pu être poussée (${(r.erreur || '').split('\n').pop()}). À refaire : git push origin +refs/tags/prod:refs/tags/prod`,
    )
}

async function livrer() {
  if (!existsSync(INSTANTANE))
    throw new Error(
      `Référence du schéma prod absente sur ce poste (${INSTANTANE}). Premier usage : livrer.bat --amorcer. Autre poste : livrer.bat --reprendre-instantane.`,
    )

  titre('Dérive : la prod a-t-elle été modifiée hors livraison ?')
  const ecart = ecartSchema(readFileSync(INSTANTANE, 'utf8'), dump('--linked'))
  if (ecart.absentes.length + ecart.ajoutees.length > 0) {
    afficherEcart(ecart, 'disparu', 'apparu ')
    throw new Error(
      'Le schéma de la prod diffère de la référence de la dernière livraison. Si c’est une livraison interrompue ou un autre poste : livrer.bat --reprendre-instantane. Sinon, quelqu’un a modifié la prod à la main : capturez ce changement en migration avant de livrer.',
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
      donnees: lignesDonnees(
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
  // config.toml : réglages de fonctions (partent avec le déploiement) ou
  // autres réglages (Auth…, à reporter à la main : arrêt sans clavier).
  const config = changes.includes('supabase/config.toml')
    ? (() => {
        const apres = lancer([
          'git',
          'show',
          'HEAD:supabase/config.toml',
        ]).sortie
        const avant = lancer(['git', 'show', 'prod:supabase/config.toml'], {
          accepterEchec: true,
        })
        const c = avant.ok
          ? changementsConfig(avant.sortie, apres)
          : { horsFonctions: true, fonctions: [] }
        return {
          ...c,
          arrets: arretsReglagesFonctions({
            apres,
            changees: c.fonctions,
            deployees: fonctions,
          }),
        }
      })()
    : { horsFonctions: false, fonctions: [], arrets: [] }
  const lecture = lancer([
    'supabase',
    'secrets',
    'list',
    '--project-ref',
    REF_PROD,
    '-o',
    'json',
  ])
  const secrets = nomsSecrets(`${lecture.sortie}\n${lecture.erreur}`)
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
  if (config.horsFonctions)
    avert.push(
      'supabase/config.toml a changé : les réglages Auth ne partent PAS, reportez-les à la main dans le dashboard.',
    )
  else if (config.fonctions.length)
    console.log(
      `config.toml : seuls les réglages de fonctions ont changé (${config.fonctions.join(', ')}), appliqués au déploiement.`,
    )
  for (const a of config.arrets) avert.push(a)
  if (
    changes.some((f) => f.startsWith('cloudflare/') || f.startsWith('worker/'))
  )
    avert.push(
      'Le Worker Cloudflare a changé : il ne part pas avec livrer (déploiement Wrangler à faire à la main, puis surveiller ses journaux).',
    )
  for (const m of migrations.filter((x) => x.destructrices.length))
    avert.push(
      `${m.nom} RETIRE ou CHANGE quelque chose (l'ancien code tourne encore 1 à 2 min dessus) :\n      ${m.destructrices.join('\n      ')}`,
    )
  for (const m of migrations.filter((x) => x.donnees.length))
    avert.push(
      `${m.nom} écrit du CONTENU en prod (le reste n'est que de la structure) :\n      ${m.donnees.join('\n      ')}`,
    )
  for (const a of avert) console.log(`⚠ ${a}`)
  if (manquants.length)
    throw new Error('Secret manquant en prod : rien ne part.')

  const empreinte = createHash('sha256')
    .update(
      descriptionLivraison({
        head: lancer(['git', 'rev-parse', 'HEAD']).sortie,
        migrations: migrations.map((m) => m.nom),
        fonctions,
      }),
    )
    .digest('hex')
    .slice(0, 8)

  if (MODE === 'essai') {
    console.log(`\nEmpreinte : ${empreinte}`)
    console.log('Mode essai : arrêt ici, rien n’est parti.')
    return
  }
  if (CONFIRME !== null) {
    if (CONFIRME !== empreinte)
      throw new Error(
        `Empreinte ${CONFIRME} périmée (attendue ${empreinte}) : ce qui part a changé depuis l'essai. Relancez --essai.`,
      )
    const arrets = arretsSansClavier({
      destructives: migrations
        .filter((m) => m.destructrices.length)
        .map((m) => m.nom),
      configToml: config.horsFonctions,
      reglagesFonctions: config.arrets,
      worker: changes.some(
        (f) => f.startsWith('cloudflare/') || f.startsWith('worker/'),
      ),
      avecDonnees: migrations.filter((m) => m.donnees.length).map((m) => m.nom),
      donneesAcceptees: process.argv.includes('--avec-donnees'),
    })
    if (arrets.length)
      throw new Error(`Envoi sans clavier refusé :\n- ${arrets.join('\n- ')}`)
  } else if (!process.stdin.isTTY)
    throw new Error(
      'Pas de clavier : lancez --essai, puis --confirme=<empreinte> (plus de réponse passée par un tube).',
    )
  const reponse =
    CONFIRME !== null
      ? 'LIVRER'
      : await demander('\nTapez LIVRER pour envoyer en prod : ')
  const confirmationSuppression =
    reponse.trim() === 'LIVRER' &&
    migrations.some((m) => m.destructrices.length)
      ? await demander(
          'Une migration RETIRE ou CHANGE quelque chose. Tapez SUPPRIMER pour confirmer : ',
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
  // Laisse passer le hook git `pre-push` (`.githooks/`), qui refuse tout
  // envoi de main hors livraison : un envoi seul mettrait le site en ligne
  // sans la base ni les fonctions.
  process.env.LIVRAISON_EN_COURS = '1'
  for (let i = 0; i < plan.etapes.length; i++) {
    const e = plan.etapes[i]
    console.log(`→ ${e.nom}`)
    try {
      lancer(e.cmd, { voir: true })
    } catch (err) {
      const b = bilanEchec(plan.etapes, i)
      console.log(`\nÉCHEC à l'étape « ${b.echoue} ».`)
      console.log(`Parti : ${b.parti.join(', ') || 'rien'}`)
      if (b.peutEtreEnPartie)
        console.log(
          'Base de données : peut-être EN PARTIE (les migrations passent une à une). Relancez livrer.bat --essai pour voir ce qui reste, après livrer.bat --reprendre-instantane.',
        )
      console.log(`Pas parti : ${b.pasParti.join(', ') || 'rien'}`)
      throw err
    }
    // La référence suit la base DÈS qu'elle a changé : une suite en échec ne
    // doit pas faire passer la livraison réussie pour une dérive.
    if (e.nom === 'Base de données') enregistrerInstantane(dump('--linked'))
  }
  pousserEtiquette()

  titre('Contrôle après livraison (lecture)')
  for (const f of ['verif_advisor.sql', 'verif_classeur_acces.sql']) {
    const r = lancer(
      [
        'supabase',
        'db',
        'query',
        '--linked',
        '--agent',
        'no',
        '-f',
        `supabase/${f}`,
      ],
      { accepterEchec: true },
    )
    // verif_classeur_acces finit volontairement par une exception (annulation) :
    // son verdict est sur la sortie d'erreur.
    const ok = /TOUT EST EN PLACE|RESULTAT OK/.test(`${r.sortie}\n${r.erreur}`)
    console.log(`- ${f} : ${ok ? 'OK' : 'à relire'}`)
  }
  if (!plan.etapes.some((e) => e.nom === 'Base de données'))
    enregistrerInstantane(dump('--linked'))
  console.log('\nLivré.')
}

// ── programme ──────────────────────────────────────────────────────────────

try {
  // `--amorcer` et `--reprendre-instantane` n'ont pas de voie sans clavier :
  // refus AVANT toute liaison, comme le mode principal (audit du 2026-10-17 :
  // leur réponse se lisait sur l'entrée standard, même passée par un tube).
  if ((MODE === 'amorcer' || MODE === 'reprendre') && !process.stdin.isTTY)
    throw new Error(
      'Pas de clavier : ce mode se lance au clavier par l’utilisateur (livrer.bat), jamais avec une réponse passée par un tube.',
    )
  if (existsSync(LIAISON)) {
    console.log(
      '⚠ Le poste était resté relié à la prod (fenêtre fermée pendant un usage précédent ?) : déliaison.',
    )
    delier()
  }
  const arret = controlesLocaux()
  if (arret) throw new Error(arret)
  titre('Liaison temporaire à la prod')
  lancer(['supabase', 'link', '--project-ref', REF_PROD], { voir: true })
  if (MODE === 'amorcer') await amorcer()
  else if (MODE === 'reprendre') await reprendreInstantane()
  else await livrer()
} catch (err) {
  console.error(`\n✗ ${err instanceof Error ? err.message : String(err)}`)
  process.exitCode = 1
} finally {
  delier()
}
