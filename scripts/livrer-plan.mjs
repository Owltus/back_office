// Livraison en prod — logique PURE (plan environnement-dev-docker-2026-10-12,
// étape 9, D20). Aucune commande ici : `livrer.mjs` relève l'état, cette page
// décide, `livrer.mjs` exécute. Tout ce qui peut empêcher une livraison est
// décidé ici et testé (`livrer-plan.test.ts`).

export const REF_PROD = 'ozpavwghrmmkrnmkxodg'

/** Fonctions qui ne vérifient pas le JWT (appelées par le Worker). */
export const SANS_VERIF_JWT = new Set(['import-report', 'montre-resume'])

/**
 * Fonctions à déployer d'après les fichiers changés depuis la dernière
 * livraison. `_shared/` changé = toutes (elles l'embarquent).
 */
export function fonctionsModifiees(fichiers, toutes) {
  const touchees = new Set()
  for (const f of fichiers) {
    const m = /^supabase\/functions\/([^/]+)\//.exec(f.replace(/\\/g, '/'))
    if (!m) continue
    if (m[1] === '_shared') return [...toutes].sort()
    if (toutes.includes(m[1])) touchees.add(m[1])
  }
  return [...touchees].sort()
}

/**
 * Instructions qui RETIRENT ou CHANGENT ce dont l'ancien code dépend (il
 * tourne encore 1 à 2 min sur la nouvelle base). Large exprès : un faux
 * positif coûte une saisie, un faux négatif casse l'app (revue adverse du
 * 2026-10-13 : `drop constraint`, `drop col` sans `column`, `revoke`,
 * `alter column … type`, `delete`/`update` de masse passaient).
 */
const DESTRUCTIF = [
  /\bdrop\s+(?!default\b|not\s+null\b|identity\b)\w+/i,
  /\brename\b/i,
  /\brevoke\b/i,
  /\btruncate\b/i,
  /\bdelete\s+from\b/i,
  /\bupdate\s+[\w."]+\s+set\b/i,
  /\balter\s+column\s+\S+\s+(?:set\s+data\s+)?type\b/i,
  /\balter\s+column\s+\S+\s+set\s+not\s+null\b/i,
]

/**
 * Les INSTRUCTIONS destructrices d'une migration (commentaires ôtés, texte
 * entier découpé sur `;` : une instruction sur deux lignes est vue entière).
 */
export function lignesDestructrices(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .split(';')
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s && DESTRUCTIF.some((re) => re.test(s)))
    .map((s) => (s.length > 160 ? `${s.slice(0, 157)}…` : s))
}

/**
 * Instructions qui écrivent du CONTENU dans une migration (demande
 * utilisateur du 2026-10-15 : la structure part, jamais le contenu). Une
 * liste de référence peut en avoir besoin : c'est permis, mais jamais sans
 * que l'utilisateur l'ait vu.
 */
const DONNEES = [
  /\binsert\s+into\b/i,
  /\bupdate\s+[\w."]+\s+set\b/i,
  /\bdelete\s+from\b/i,
  /\bcopy\s+[\w."]+/i,
  /\btruncate\b/i,
]

/** Les instructions d'une migration qui écrivent des données. */
export function lignesDonnees(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .split(';')
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s && DONNEES.some((re) => re.test(s)))
    .map((s) => (s.length > 160 ? `${s.slice(0, 157)}…` : s))
}

/**
 * Structure de la base locale changée SANS migration ? Sortie de
 * `supabase db diff --local` (base locale contre migrations rejouées dans une
 * base fantôme). Rend le SQL de l'écart, vide s'il n'y en a pas. Sortie
 * illisible = erreur : on ne conclut jamais « rien » sans l'avoir lu.
 */
export function ecartNonCapture(sortie) {
  const ligne = sortie
    .split(/\r?\n/)
    .reverse()
    .find((l) => l.trim().startsWith('{') && l.includes('"diff"'))
  if (ligne) {
    try {
      const j = JSON.parse(ligne)
      if (typeof j.diff === 'string') return j.diff.trim()
    } catch {
      // repli texte ci-dessous
    }
  }
  if (/No schema changes found/.test(sortie)) return ''
  throw new Error(
    'Comparaison de la structure locale illisible : vérification impossible.',
  )
}

/**
 * Schéma comparable : fins de ligne et espaces de fin ignorés, ainsi que les
 * lignes VOLATILES d'un dump (`\restrict <jeton aléatoire>` des pg_dump
 * récents, en-têtes datés) qui signaleraient une dérive à chaque fois.
 */
export function normaliserSchema(sql) {
  return sql
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => !/^\\(?:un)?restrict\b|^-- Dumped (?:from|by)\b/.test(l))
    .join('\n')
    .trim()
}

/** Les lignes qui diffèrent entre deux schémas (ensemble, pas ordre). */
export function ecartSchema(attendu, reel) {
  const a = normaliserSchema(attendu).split('\n')
  const r = normaliserSchema(reel).split('\n')
  const compter = (lignes) => {
    const m = new Map()
    for (const l of lignes) m.set(l, (m.get(l) ?? 0) + 1)
    return m
  }
  const ma = compter(a)
  const mr = compter(r)
  const absentes = []
  const ajoutees = []
  for (const [l, n] of ma)
    for (let i = mr.get(l) ?? 0; i < n; i++) absentes.push(l)
  for (const [l, n] of mr)
    for (let i = ma.get(l) ?? 0; i < n; i++) ajoutees.push(l)
  return { absentes, ajoutees }
}

/**
 * Contrôles AVANT tout contact avec la prod. Rend la première raison
 * d'arrêt, ou `null`.
 *
 * @param {{
 *   branche: string, arbrePropre: boolean, enRetard: boolean,
 *   etiquetteProd: boolean, controles: Array<{nom: string, ok: boolean}>,
 *   migrationsNonJoueesEnLocal: Array<string>, ecartNonCapture?: string,
 * }} e
 */
export function arretAvantProd(e) {
  if (e.branche !== 'main')
    return `Vous êtes sur la branche « ${e.branche} » : la prod se livre depuis main.`
  if (!e.arbrePropre)
    return 'Des modifications ne sont pas commitées : commitez-les (ou annulez-les) avant de livrer.'
  if (e.enRetard)
    return 'main est en retard sur origin/main : récupérez d’abord les commits distants (git pull).'
  if (!e.etiquetteProd)
    return 'Aucune livraison connue (étiquette git « prod » absente) : lancez d’abord l’amorçage (livrer.bat --amorcer).'
  for (const c of e.controles)
    if (!c.ok)
      return `Contrôle en échec : ${c.nom}. Corrigez-le avant de livrer.`
  if (e.ecartNonCapture)
    return `La structure de la base locale a changé SANS migration (modification faite dans Studio ?) : rien ne partirait. Capturez-la : « supabase db diff --local -f <nom> », relisez le fichier, puis « pnpm db:reset » pour l'essayer.\n${e.ecartNonCapture.split('\n').slice(0, 15).join('\n')}`
  if (e.migrationsNonJoueesEnLocal.length > 0)
    return `Migrations jamais jouées sur la base locale : ${e.migrationsNonJoueesEnLocal.join(', ')}. Lancez « pnpm db:reset » (ou « supabase migration up --local ») et vérifiez l’app avant de livrer.`
  return null
}

/**
 * Quels contrôles locaux jouer (demande utilisateur du 2026-10-15 : « c'est
 * long de ouf »). Deux allègements, et seulement deux :
 * - le commit a déjà passé TOUS les contrôles (l'essai juste avant, arbre
 *   propre) : même code, même verdict, on ne les rejoue pas ;
 * - la base locale porte une copie de la prod (aucun compte fictif) et aucune
 *   migration ne part : les tests de la base attendent les données fictives
 *   et ne vérifieraient rien de neuf. Dès qu'une migration part, ils sont
 *   exigés (il faudra `pnpm db:reset`).
 *
 * @param {{ dejaVerifie: boolean, copieDeLaProd: boolean,
 *   migrationsModifiees: Array<string> }} e
 */
export function choixControles(e) {
  if (e.dejaVerifie)
    return {
      jouer: false,
      testsBase: false,
      note: 'Contrôles déjà passés sur ce commit (essai) : non rejoués.',
    }
  if (e.copieDeLaProd && e.migrationsModifiees.length === 0)
    return {
      jouer: true,
      testsBase: false,
      note: 'Tests de la base non joués : la base locale porte la copie de la prod et aucune migration ne part.',
    }
  return { jouer: true, testsBase: true, note: null }
}

/**
 * Ce qui identifie une livraison : le commit, les migrations et les
 * fonctions qui partent. L'essai en affiche l'empreinte ; `--confirme=` ne
 * livre que si elle n'a pas changé (ce qui part = ce qui a été lu).
 *
 * @param {{ head: string, migrations: Array<string>, fonctions: Array<string> }} e
 */
export function descriptionLivraison(e) {
  return [
    e.head,
    [...e.migrations].sort().join(','),
    [...e.fonctions].sort().join(','),
  ].join('|')
}

/**
 * Cas où `--confirme=` (envoi SANS clavier, celui de l'assistant) refuse :
 * ils exigent un geste de l'utilisateur, au clavier, par `livrer.bat`.
 * Avant le 2026-10-15, `printf 'LIVRER\nSUPPRIMER\n'` aurait suffi à
 * franchir la seconde confirmation.
 *
 * @param {{ destructives: Array<string>, configToml: boolean, worker: boolean,
 *   avecDonnees?: Array<string>, donneesAcceptees?: boolean }} e
 */
export function arretsSansClavier(e) {
  const arrets = []
  if (e.avecDonnees?.length && !e.donneesAcceptees)
    arrets.push(
      `Migration qui écrit du CONTENU (${e.avecDonnees.join(', ')}) : à montrer à l’utilisateur ; avec son accord, relancer avec --avec-donnees.`,
    )
  if (e.destructives.length)
    arrets.push(
      `Migration qui RETIRE ou CHANGE quelque chose (${e.destructives.join(', ')}) : la confirmation SUPPRIMER se tape au clavier, livrer.bat.`,
    )
  if (e.configToml)
    arrets.push(
      'supabase/config.toml a changé : réglages à reporter à la main dans le dashboard, à voir avec l’utilisateur.',
    )
  if (e.worker)
    arrets.push(
      'Le Worker Cloudflare a changé : son déploiement est à part, à voir avec l’utilisateur.',
    )
  return arrets
}

/**
 * Le plan d'envoi, dans l'ordre qui ne casse pas l'app en service : le
 * schéma d'abord (l'ancien code doit le supporter), puis les fonctions,
 * puis le site. Vide si rien n'est confirmé.
 *
 * @param {{
 *   reponse: string, confirmationSuppression: string | null,
 *   migrations: Array<{nom: string, destructrices: Array<string>}>,
 *   fonctions: Array<string>, commits: number,
 * }} e
 */
export function planEnvoi(e) {
  if (e.reponse.trim() !== 'LIVRER')
    return { etapes: [], raison: 'Livraison annulée : rien n’est parti.' }
  const destructives = e.migrations.filter((m) => m.destructrices.length > 0)
  if (
    destructives.length > 0 &&
    e.confirmationSuppression?.trim() !== 'SUPPRIMER'
  )
    return {
      etapes: [],
      raison:
        'Une migration RETIRE quelque chose et la seconde confirmation n’a pas été donnée : rien n’est parti.',
    }
  const etapes = []
  if (e.migrations.length > 0)
    etapes.push({
      nom: 'Base de données',
      // `--yes` : LIVRER vaut confirmation (sinon une 3e question, en anglais).
      cmd: ['supabase', 'db', 'push', '--linked', '--yes'],
    })
  for (const f of e.fonctions) {
    const cmd = [
      'supabase',
      'functions',
      'deploy',
      f,
      '--project-ref',
      REF_PROD,
    ]
    if (SANS_VERIF_JWT.has(f)) cmd.push('--no-verify-jwt')
    etapes.push({ nom: `Fonction ${f}`, cmd })
  }
  if (e.commits > 0)
    etapes.push({
      nom: 'Site (Vercel)',
      cmd: ['git', 'push', 'origin', 'main'],
    })
  if (etapes.length === 0)
    return { etapes: [], raison: 'Rien à livrer : la prod est déjà à jour.' }
  etapes.push({
    nom: 'Étiquette prod',
    cmd: ['git', 'tag', '-f', 'prod', 'HEAD'],
  })
  return { etapes, raison: null }
}

/** Ce qui est parti et ce qui ne l'est pas, après un échec à l'étape `i`. */
export function bilanEchec(etapes, i) {
  return {
    parti: etapes.slice(0, i).map((e) => e.nom),
    echoue: etapes[i]?.nom ?? null,
    pasParti: etapes.slice(i + 1).map((e) => e.nom),
    // `db push` applique les migrations une à une : un échec au milieu en
    // laisse une partie en prod.
    peutEtreEnPartie: etapes[i]?.nom === 'Base de données',
  }
}

/**
 * Lignes d'une sortie `supabase db query -o json` : un tableau nu (lancé par
 * une personne) ou `{ rows }` (détecté « agent »). Revue adverse du
 * 2026-10-13 : seule la seconde forme était lue, or c'est la première que
 * l'utilisateur obtient.
 */
export function lignesJson(sortie) {
  const debut = sortie.search(/[[{]/)
  if (debut < 0) throw new Error('Réponse de la base illisible (pas de JSON).')
  const j = JSON.parse(sortie.slice(debut))
  if (Array.isArray(j)) return j
  if (j && Array.isArray(j.rows)) return j.rows
  throw new Error('Réponse de la base illisible (forme inattendue).')
}

/**
 * Noms des secrets d'une sortie `supabase secrets list` : JSON (`-o json`,
 * tableau d'objets `name`) ou tableau texte, séparé par `|` ou par les
 * filets Unicode des CLI récentes. Une liste VIDE est une erreur de lecture,
 * jamais « tout manque » : la prod porte toujours les secrets `SUPABASE_*`
 * (le 2026-10-15, une lecture ratée annonçait les 4 secrets absents).
 */
export function nomsSecrets(sortie) {
  // CLI 2.120 (relevé le 2026-10-15) : `{"secrets":[{name, value, …}], …}`.
  let noms = []
  const debut = sortie.search(/[[{]/)
  if (debut >= 0) {
    try {
      const fin = Math.max(sortie.lastIndexOf(']'), sortie.lastIndexOf('}'))
      const j = JSON.parse(sortie.slice(debut, fin + 1))
      const liste = Array.isArray(j) ? j : j?.secrets
      if (Array.isArray(liste))
        noms = liste.map((s) => String(s?.name ?? s?.Name ?? '').trim())
    } catch {
      noms = []
    }
  }
  if (noms.length === 0)
    noms = sortie.split(/\r?\n/).map(
      (l) =>
        l
          .split(/[|│┃]/)
          .map((c) => c.trim())
          .find(Boolean) ?? '',
    )
  noms = noms.filter((n) => /^[A-Z0-9_]+$/.test(n) && n !== 'NAME')
  if (noms.length === 0)
    throw new Error(
      'Liste des secrets de la prod illisible : vérification impossible, rien ne part.',
    )
  return noms
}

/** Secrets attendus en prod, absents de la liste relevée. */
export function secretsManquants(attendus, presents) {
  const p = new Set(presents)
  return attendus.filter((s) => !p.has(s))
}
