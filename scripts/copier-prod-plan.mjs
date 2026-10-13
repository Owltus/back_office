// Copie des DONNÉES de la prod vers la base locale — logique PURE (plan
// environnement-dev-docker-2026-10-12, étape 14, D21-D23). `copier-prod.mjs`
// relève l'état et exécute ; ici, ce qui est copié et dans quel ordre.

export const REF_PROD = 'ozpavwghrmmkrnmkxodg'

/**
 * Schémas lus en prod par `db dump --data-only` : les NÔTRES seulement.
 * `auth` et `storage` appartiennent à Supabase, leurs tables internes
 * varient d'une version à l'autre (répétition du 2026-10-13 : le chargement
 * échouait sur `storage.buckets_vectors`, que la stack locale protège).
 */
export const SCHEMAS = ['public', 'private']

/**
 * Comptes : SEULES ces deux tables de `auth` sont copiées (lues en JSON,
 * réinsérées par `json_populate_recordset`, tolérant une colonne de plus ou
 * de moins entre versions de GoTrue). Connexion locale avec le mot de passe
 * habituel. Sessions, jetons de renouvellement, MFA, journaux : JAMAIS — ils
 * ne sont même pas lus.
 */
export const COMPTES = ['auth.users', 'auth.identities']

/** Requête de lecture d'une table de comptes, en un seul JSON. */
export function lectureComptes(table) {
  if (!COMPTES.includes(table))
    throw new Error(`Table non autorisée : ${table}`)
  return `select coalesce(json_agg(t), '[]'::json) as lignes from ${table} t`
}

/**
 * Réinsertion locale d'une table de comptes. Le JSON est écrit entre
 * délimiteurs `$…$` dont l'étiquette est choisie absente du texte (pas
 * d'échappement possible à rater) ; passé par l'entrée standard de psql,
 * jamais en argument de commande (trop long, et visible des autres
 * processus).
 */
export function insertionComptes(table, json, etiquette = 'c') {
  if (!COMPTES.includes(table))
    throw new Error(`Table non autorisée : ${table}`)
  let tag = etiquette
  while (json.includes(`$${tag}$`)) tag += 'x'
  const [schema, nom] = table.split('.')
  // Seules les colonnes ORDINAIRES de la table locale : GoTrue en calcule
  // certaines (`confirmed_at`, `identities.email`), qu'on ne peut insérer
  // (répétition du 2026-10-13).
  return [
    `create temp table _comptes on commit drop as select * from json_populate_recordset(null::${table}, $${tag}$${json}$${tag}$::json);`,
    `do $do$ declare cols text; begin`,
    `  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols`,
    `  from information_schema.columns where table_schema = '${schema}' and table_name = '${nom}'`,
    `    and is_generated = 'NEVER' and coalesce(identity_generation, '') <> 'ALWAYS';`,
    `  execute format('insert into ${table} (%s) select %s from _comptes', cols, cols);`,
    `end $do$;`,
    `drop table _comptes;`,
  ].join('\n')
}

/** Tables de nos schémas jamais copiées (aucune à ce jour). */
export const EXCLUES = []

/** Buckets dont les FICHIERS sont copiés (leurs lignes `storage.objects`
 *  naissent de l'envoi des fichiers dans le stockage local). */
export const BUCKETS = ['classeur-images']

/** Dernière migration appliquée en prod : la base locale y est ramenée. */
export function derniereMigration(versionsProd) {
  const v = [...versionsProd].filter((x) => /^\d{14}$/.test(x)).sort()
  return v.length ? v[v.length - 1] : null
}

/**
 * Raison de NE PAS commencer, ou `null`. Aucun contact avec la prod avant
 * que tout ceci soit vrai.
 */
export function arretAvantCopie(e) {
  if (!e.baseLocaleJoignable)
    return 'La base locale ne répond pas : lancez « pnpm db:start » (Docker Desktop démarré).'
  if (!e.mailpitBranche)
    return 'Les fonctions locales n’envoient pas encore vers Mailpit (étape 8) : les vrais destinataires recevraient des e-mails. Copie refusée.'
  if (!e.arbrePropre)
    return 'Des modifications ne sont pas commitées : la copie rejoue les migrations du dépôt, commitez d’abord.'
  return null
}

/** Arguments du dump des données de la prod. */
export function argumentsDump(fichier) {
  const args = [
    'supabase',
    'db',
    'dump',
    '--linked',
    '--data-only',
    '--use-copy',
    '--schema',
    SCHEMAS.join(','),
  ]
  for (const t of EXCLUES) args.push('-x', t)
  args.push('-f', fichier)
  return args
}

/** Migrations du dépôt plus récentes que la prod : rejouées APRÈS les données. */
export function migrationsNonLivrees(fichiersLocaux, versionProd) {
  return fichiersLocaux
    .filter((f) => /^\d{14}_/.test(f))
    .filter((f) => versionProd === null || f.slice(0, 14) > versionProd)
    .sort()
}
