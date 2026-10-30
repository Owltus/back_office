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
// `update [only] t [[as] alias] set` (audit du 2026-10-17 : l'alias et `only`
// passaient). Un nom entre guillemets est déjà réduit à `""` par le masque.
const UPDATE =
  /\bupdate\s+(?:only\s+)?[\w."$]+(?:\s*\*)?(?:\s+(?:as\s+)?(?!set\b)[\w"$]+)?\s+set\b/i
// Nom de colonne : `ALTER [ COLUMN ] c` — `COLUMN` est FACULTATIF.
const COLONNE = String.raw`\balter\s+(?:column\s+)?(?:""|[\w$]+)\s+`

const DESTRUCTIF = [
  /\bdrop\s+(?!default\b|not\s+null\b|identity\b)\w+/i,
  /\brename\b/i,
  /\brevoke\b/i,
  /\btruncate\b/i,
  /\bdelete\s+from\b/i,
  UPDATE,
  /\bmerge\s+into\b/i,
  new RegExp(`${COLONNE}(?:set\\s+data\\s+)?type\\b`, 'i'),
  new RegExp(`${COLONNE}set\\s+not\\s+null\\b`, 'i'),
  // Déplacer un objet = le renommer pour l'ancien code.
  /\balter\b.*\bset\s+schema\b/i,
]

/**
 * Découpe une migration en instructions, à la manière de PostgreSQL : un `;`,
 * un `--` ou un `/*` DANS une chaîne `'…'` (`''` doublé, `E'\''`), un nom
 * `"…"` ou un corps `$tag$…$tag$` n'est ni une fin d'instruction ni un
 * commentaire (audit du 2026-10-17 : `'a -- b'` effaçait la suite de la
 * ligne, donc un `drop` posé derrière). Commentaires remplacés par une espace
 * (commentaires en bloc imbriqués compris).
 *
 * Rend, par instruction, `texte` (le texte d'origine, à montrer) et `masque`
 * (chaînes et noms entre guillemets VIDÉS, pour la recherche : un commentaire
 * `'drop table'` ou une policy `"drop"` ne sont pas des instructions). Les
 * corps `$…$` sont GARDÉS dans le masque : un bloc `do $$ … $$` exécute ce
 * qu'il contient.
 */
export function instructionsSql(sql) {
  const res = []
  let texte = ''
  let masque = ''
  // Même masque, corps `$…$` VIDÉS : ce que voit la recherche dans un
  // `create function` (son corps ne tourne pas pendant la migration).
  let sansCorps = ''
  const pousser = () => {
    const t = texte.replace(/\s+/g, ' ').trim()
    if (t)
      res.push({
        texte: t,
        masque: masque.replace(/\s+/g, ' ').trim(),
        sansCorps: sansCorps.replace(/\s+/g, ' ').trim(),
      })
    texte = ''
    masque = ''
    sansCorps = ''
  }
  const n = sql.length
  let i = 0
  while (i < n) {
    const c = sql[i]
    const suiv = sql[i + 1]
    if (c === '-' && suiv === '-') {
      const fin = sql.indexOf('\n', i)
      i = fin < 0 ? n : fin
      texte += ' '
      masque += ' '
      sansCorps += ' '
      continue
    }
    if (c === '/' && suiv === '*') {
      let prof = 1
      i += 2
      while (i < n && prof > 0) {
        if (sql[i] === '/' && sql[i + 1] === '*') {
          prof++
          i += 2
        } else if (sql[i] === '*' && sql[i + 1] === '/') {
          prof--
          i += 2
        } else i++
      }
      texte += ' '
      masque += ' '
      sansCorps += ' '
      continue
    }
    if (c === "'" || c === '"') {
      // `E'…'` : la barre oblique inverse échappe.
      const echappe =
        c === "'" &&
        /[eE]/.test(sql[i - 1] ?? '') &&
        !/[\w$]/.test(sql[i - 2] ?? '')
      let j = i + 1
      while (j < n) {
        if (echappe && sql[j] === '\\') j += 2
        else if (sql[j] === c && sql[j + 1] === c) j += 2
        else if (sql[j] === c) break
        else j++
      }
      texte += sql.slice(i, j + 1)
      masque += c + c
      sansCorps += c + c
      i = j + 1
      continue
    }
    if (c === '$' && !/[\w$]/.test(sql[i - 1] ?? '')) {
      const m = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i))
      if (m) {
        const fin = sql.indexOf(m[0], i + m[0].length)
        const j = fin < 0 ? n : fin + m[0].length
        texte += sql.slice(i, j)
        masque += sql.slice(i, j)
        sansCorps += `${m[0]}${m[0]}`
        i = j
        continue
      }
    }
    if (c === ';') {
      pousser()
      i++
      continue
    }
    texte += c
    masque += c
    sansCorps += c
    i++
  }
  pousser()
  return res
}

const tronquer = (s) => (s.length > 160 ? `${s.slice(0, 157)}…` : s)

// Fausses alertes levées le 2026-10-17 (demande utilisateur : « ce ne sont
// pas des mises à jour destructrices ») : le corps d'un `create function`
// ne tourne pas pendant la migration (un `do $$ … $$`, lui, tourne) ; une
// policy ou un trigger retiré puis RECRÉÉ sous le même nom dans la même
// migration est un remplacement ; un `revoke` sur une fonction que la
// migration crée elle-même n'enlève rien dont l'ancien code dépende.
// Même règle, décision utilisateur du 2026-10-27 (page Planning) : une
// contrainte CHECK retirée puis RECRÉÉE sous le même nom, sur la même
// table, dans la même migration (une liste de valeurs élargie).
const CREE_ROUTINE = /^create\s+(?:or\s+replace\s+)?(?:function|procedure)\b/i

/** Le masque à chercher : sans le corps d'une fonction créée. */
const masqueUtile = ({ masque, sansCorps }) =>
  CREE_ROUTINE.test(masque) ? sansCorps : masque

/** Nom d'objet comparable : guillemets gardés, le reste en minuscules. */
const nomSql = (n) =>
  n.replace(/"[^"]*"|[^"]+/g, (p) => (p.startsWith('"') ? p : p.toLowerCase()))

const NOM = String.raw`((?:"[^"]*"|[\w$]+)(?:\.(?:"[^"]*"|[\w$]+))?)`
const CREE_OBJET = new RegExp(
  String.raw`^create\s+(?:or\s+replace\s+)?(?:constraint\s+)?(policy|trigger)\s+${NOM}\s.*?\bon\s+${NOM}`,
  'i',
)
const RETIRE_OBJET = new RegExp(
  String.raw`^drop\s+(policy|trigger)\s+(?:if\s+exists\s+)?${NOM}\s+on\s+${NOM}\s*(?:restrict)?$`,
  'i',
)
const CREE_CHECK = new RegExp(
  String.raw`^alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?${NOM}\s+add\s+constraint\s+${NOM}\s+check\s*\(`,
  'i',
)
const RETIRE_CONTRAINTE = new RegExp(
  String.raw`^alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?${NOM}\s+drop\s+constraint\s+(?:if\s+exists\s+)?${NOM}\s*(?:restrict)?$`,
  'i',
)
const CREE_FONCTION = new RegExp(
  String.raw`^create\s+(?:or\s+replace\s+)?(?:function|procedure)\s+${NOM}\s*\(`,
  'i',
)
const REVOKE_FONCTION = new RegExp(
  String.raw`^revoke\s+(?:all|execute)(?:\s+privileges)?\s+on\s+(?:function|procedure|routine)\s+${NOM}\s*\([^)]*\)\s+from\s+[\w\s,]+$`,
  'i',
)

/** Les instructions dont le masque répond à l'un des motifs. */
const instructionsQui = (sql, motifs, ignorer = () => false) =>
  instructionsSql(sql)
    .filter((i) => !ignorer(i))
    .filter((i) => motifs.some((re) => re.test(masqueUtile(i))))
    .map(({ texte }) => tronquer(texte))

/**
 * Les INSTRUCTIONS destructrices d'une migration (commentaires ôtés, texte
 * découpé en instructions : une instruction sur deux lignes est vue entière).
 */
export function lignesDestructrices(sql) {
  const instructions = instructionsSql(sql)
  const recrees = new Set()
  const fonctions = new Set()
  for (const { texte } of instructions) {
    const o = CREE_OBJET.exec(texte)
    if (o) recrees.add(`${o[1].toLowerCase()} ${nomSql(o[2])} ${nomSql(o[3])}`)
    const f = CREE_FONCTION.exec(texte)
    if (f) fonctions.add(nomSql(f[1]))
    const c = CREE_CHECK.exec(texte)
    if (c) recrees.add(`check ${nomSql(c[1])} ${nomSql(c[2])}`)
  }
  const remplacement = ({ texte }) => {
    const r = RETIRE_OBJET.exec(texte)
    if (r)
      return recrees.has(
        `${r[1].toLowerCase()} ${nomSql(r[2])} ${nomSql(r[3])}`,
      )
    const c = RETIRE_CONTRAINTE.exec(texte)
    if (c) return recrees.has(`check ${nomSql(c[1])} ${nomSql(c[2])}`)
    const v = REVOKE_FONCTION.exec(texte)
    return Boolean(v && fonctions.has(nomSql(v[1])))
  }
  return instructionsQui(sql, DESTRUCTIF, remplacement)
}

/**
 * Instructions qui écrivent du CONTENU dans une migration (demande
 * utilisateur du 2026-10-15 : la structure part, jamais le contenu). Une
 * liste de référence peut en avoir besoin : c'est permis, mais jamais sans
 * que l'utilisateur l'ait vu.
 */
const DONNEES = [
  /\binsert\s+into\b/i,
  UPDATE,
  /\bdelete\s+from\b/i,
  /\bmerge\s+into\b/i,
  /\bcopy\s+[\w."]+/i,
  /\btruncate\b/i,
]

/**
 * Le code du Worker Cloudflare a-t-il changé ? Un fichier de test
 * (`*.test.*`) ne se déploie pas : il ne compte pas (2026-10-17, l'ajout de
 * `worker.audit.test.ts` arrêtait la livraison pour rien).
 */
export function workerModifie(fichiers) {
  return fichiers
    .map((f) => f.replace(/\\/g, '/'))
    .some(
      (f) =>
        (f.startsWith('cloudflare/') || f.startsWith('worker/')) &&
        !/\.test\.[cm]?[jt]sx?$/.test(f),
    )
}

/** Les instructions d'une migration qui écrivent des données. */
export function lignesDonnees(sql) {
  return instructionsQui(sql, DONNEES)
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
      if (typeof j.diff === 'string') return sansObjetsPlateforme(j.diff)
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
 * Objets posés par Supabase lui-même (migrations internes de storage-api),
 * présents dans la base locale mais pas dans la base fantôme d'une autre
 * version d'image (constaté le 2026-10-30). Ils ne viennent d'aucune
 * migration du dépôt et ne doivent jamais y être capturés. Liste FERMÉE,
 * instruction entière : tout autre écart reste un refus.
 */
const OBJETS_PLATEFORME = [
  /^CREATE TRIGGER enforce_versioning_status_transition BEFORE UPDATE OF versioning_status ON storage\.buckets FOR EACH ROW EXECUTE FUNCTION storage\.enforce_versioning_status_transition\(\);$/,
]

function sansObjetsPlateforme(diff) {
  return diff
    .split(/\r?\n/)
    .filter((l) => !OBJETS_PLATEFORME.some((r) => r.test(l.trim())))
    .join('\n')
    .trim()
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
 * `configToml` = un réglage HORS sections [functions.*] a changé ;
 * `reglagesFonctions` = arrêts de `arretsReglagesFonctions`.
 *
 * @param {{ destructives: Array<string>, configToml: boolean, worker: boolean,
 *   avecDonnees?: Array<string>, donneesAcceptees?: boolean,
 *   reglagesFonctions?: Array<string> }} e
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
  for (const r of e.reglagesFonctions ?? []) arrets.push(r)
  return arrets
}

// ── config.toml : réglages de fonctions ou réglages Auth ? ────────────────
// Décision utilisateur du 2026-10-16 : un config.toml qui ne change QUE des
// sections [functions.*] ne bloque plus l'envoi sans clavier. Ces réglages
// partent avec le déploiement de la fonction (verify_jwt via SANS_VERIF_JWT),
// alors que les réglages Auth, eux, ne partent jamais et restent un arrêt.

const estSectionFonction = (entete) => /^\[functions\.[^\]]+\]$/.test(entete)

/**
 * Sections d'un config.toml : en-tête → lignes utiles (commentaires pleine
 * ligne et lignes vides ignorés). Le préambule a l'en-tête ''. Un en-tête
 * répété (`[[x]]`) reçoit un rang pour rester distinct.
 *
 * @param {string} texte
 * @returns {Map<string, Array<string>>}
 */
export function sectionsToml(texte) {
  const sections = new Map([['', []]])
  let courante = ''
  for (const brute of texte.split(/\r?\n/)) {
    const l = brute.trim()
    if (!l || l.startsWith('#')) continue
    if (/^\[.*\]$/.test(l)) {
      let cle = l
      for (let n = 2; sections.has(cle); n++) cle = `${l}#${n}`
      sections.set(cle, [])
      courante = cle
      continue
    }
    sections.get(courante)?.push(l)
  }
  return sections
}

/** Nom de la fonction d'un en-tête `[functions.<nom>]`. */
const nomFonction = (entete) => entete.slice('[functions.'.length, -1)

/**
 * Ce qui a changé entre deux config.toml : `horsFonctions` = un réglage
 * AUTRE qu'une section [functions.*] (Auth, API…, à reporter à la main) ;
 * `fonctions` = les fonctions dont la section a changé, apparu ou disparu.
 *
 * @param {string} avant
 * @param {string} apres
 */
export function changementsConfig(avant, apres) {
  const a = sectionsToml(avant)
  const b = sectionsToml(apres)
  let horsFonctions = false
  const fonctions = new Set()
  for (const cle of new Set([...a.keys(), ...b.keys()])) {
    const egal = (a.get(cle) ?? []).join('\n') === (b.get(cle) ?? []).join('\n')
    const present = a.has(cle) && b.has(cle)
    if (egal && present) continue
    if (estSectionFonction(cle)) fonctions.add(nomFonction(cle))
    else horsFonctions = true
  }
  return { horsFonctions, fonctions: [...fonctions].sort() }
}

/**
 * Arrêts propres aux réglages de fonctions : une section changée pour une
 * fonction qui ne part pas (le réglage ne serait pas appliqué), ou un
 * verify_jwt du config.toml qui contredit SANS_VERIF_JWT (la prod et le
 * local ne protégeraient pas la fonction de la même façon).
 *
 * @param {{ apres: string, changees: Array<string>, deployees: Array<string>,
 *   sansVerif?: ReadonlySet<string> }} e
 */
export function arretsReglagesFonctions(e) {
  const sansVerif = e.sansVerif ?? SANS_VERIF_JWT
  const arrets = []
  for (const f of e.changees)
    if (!e.deployees.includes(f))
      arrets.push(
        `config.toml : la section de ${f} a changé mais la fonction ne part pas, son réglage ne serait pas appliqué.`,
      )
  const sansJwtToml = new Set()
  for (const [cle, lignes] of sectionsToml(e.apres)) {
    if (!estSectionFonction(cle)) continue
    if (lignes.some((l) => /^verify_jwt\s*=\s*false$/.test(l)))
      sansJwtToml.add(nomFonction(cle))
  }
  for (const f of sansJwtToml)
    if (!sansVerif.has(f))
      arrets.push(
        `config.toml : ${f} est sans vérification JWT en local mais pas dans SANS_VERIF_JWT : la prod la protégerait autrement.`,
      )
  for (const f of sansVerif)
    if (!sansJwtToml.has(f))
      arrets.push(
        `config.toml : ${f} est dans SANS_VERIF_JWT sans verify_jwt = false dans config.toml : la prod et le local diffèrent.`,
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
