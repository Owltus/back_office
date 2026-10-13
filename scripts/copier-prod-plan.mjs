// Copie des DONNÉES de la prod vers la base locale — logique PURE (plan
// environnement-dev-docker-2026-10-12, étape 14, D21-D23). `copier-prod.mjs`
// relève l'état et exécute ; ici, ce qui est copié et dans quel ordre.

export const REF_PROD = 'ozpavwghrmmkrnmkxodg'

/** Schémas lus en prod (données seules). */
export const SCHEMAS = ['public', 'private', 'auth', 'storage']

/**
 * Jamais copié. Sessions et jetons de la prod : jamais sur le poste (les
 * COMPTES, eux, sont copiés : connexion locale avec le mot de passe
 * habituel). Le reste est interne à Supabase ou recréé par les migrations
 * locales (le bucket : `hors_public`).
 */
export const EXCLUES = [
  'auth.sessions',
  'auth.refresh_tokens',
  'auth.mfa_factors',
  'auth.mfa_challenges',
  'auth.mfa_amr_claims',
  'auth.flow_state',
  'auth.one_time_tokens',
  'auth.audit_log_entries',
  'auth.saml_providers',
  'auth.saml_relay_states',
  'auth.sso_providers',
  'auth.sso_domains',
  'auth.schema_migrations',
  'auth.instances',
  'storage.buckets',
  // Les lignes des fichiers sont recréées par l'envoi des fichiers eux-mêmes
  // dans le stockage local ; copiées ici, elles entreraient en conflit.
  'storage.objects',
  'storage.migrations',
  'storage.s3_multipart_uploads',
  'storage.s3_multipart_uploads_parts',
]

/** Buckets dont les FICHIERS sont copiés (les lignes viennent du dump). */
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
