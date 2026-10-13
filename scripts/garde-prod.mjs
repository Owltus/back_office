// Garde anti-prod de l'assistant (plan environnement-dev-docker-2026-10-12,
// étape 1, D10-B). Branché en hook PreToolUse sur Bash et PowerShell dans
// `.claude/settings.local.json` : toute commande qui VISE la prod est refusée
// tant qu'elle ne porte pas le marqueur `PROD_CONFIRME=1`, posé par
// l'assistant uniquement sur demande explicite de l'utilisateur dans le chat.
//
// Lecture et écriture sont traitées pareil : le geste explicite est exigé
// dans les deux cas, ce qui laisse une trace. C'est un FILET contre l'oubli
// (un `--linked` par réflexe), pas une barrière contre un adversaire : une
// commande fabriquée exprès pour le contourner y parviendra.
//
// Code de sortie 2 = refus ; le message part sur stderr et revient à
// l'assistant. Toute autre situation (JSON illisible, outil inconnu) laisse
// passer : un garde qui planterait bloquerait tout le travail local.

export const MARQUEUR = 'PROD_CONFIRME=1'

export const REF_PROD = 'ozpavwghrmmkrnmkxodg'

/**
 * Motifs qui désignent la prod, cherchés dans la commande NORMALISÉE : les
 * espaces y sont déjà regroupés en une seule, d'où ` ` et `[^ ]` plutôt que
 * `\s+` et `\S`.
 *
 * Entre le nom de l'outil et la sous-commande, seules des OPTIONS (`-x`,
 * `--x`) sont admises : un message de commit qui contient « push » ou
 * « link » ne doit pas être pris pour la commande.
 */
const OPTIONS = '(?:-[^ ]+ )*'
const outil = (debut, fin) => new RegExp(`\\b${debut} ${OPTIONS}${fin}\\b`)

export const MOTIFS = [
  { re: new RegExp(REF_PROD), raison: 'référence du projet de production' },
  { re: /pooler\.supabase\.com/, raison: 'connexion au pooler Supabase (prod)' },
  { re: /backoffice\.naostack\.com/, raison: 'domaine de production' },
  { re: /--linked\b/, raison: '`--linked` vise le projet lié (prod)' },
  { re: /--project-ref\b/, raison: '`--project-ref` vise un projet distant' },
  { re: outil('supabase', 'link'), raison: '`supabase link` relie le poste à un projet distant' },
  { re: outil('supabase', `functions ${OPTIONS}deploy`), raison: 'déploiement d’Edge Functions' },
  { re: outil('supabase', `secrets ${OPTIONS}(?:set|unset)`), raison: 'modification des secrets distants' },
  // `db push` et `migration repair` existent aussi en `--local` : légitimes.
  { re: outil('supabase', `db ${OPTIONS}push`), raison: '`db push` écrit le schéma distant', saufLocal: true },
  { re: outil('supabase', `migration ${OPTIONS}repair`), raison: '`migration repair` écrit l’historique distant', saufLocal: true },
  { re: /--db-url[ =](?!postgres(?:ql)?:\/\/[^ @]*@(?:127\.0\.0\.1|localhost)[:/])/, raison: '`--db-url` vers une base qui n’est pas locale' },
  { re: outil('wrangler', '(?:deploy|publish|(?:triggers|versions) deploy)'), raison: 'déploiement du Worker Cloudflare' },
  { re: outil('wrangler', 'secret'), raison: 'secrets du Worker Cloudflare' },
  { re: outil('vercel', '(?:deploy|env|promote)'), raison: 'commande Vercel sur la production' },
  { re: /\bvercel\b[^;&|]*--prod\b/, raison: '`vercel --prod` déploie en production' },
  // Les scripts de livraison et de copie lancent EUX-MÊMES des commandes vers
  // la prod, que ce hook ne verrait pas : leur LANCEMENT est refusé (c'est
  // l'utilisateur qui les lance, avec le mot de passe de la base). Les citer
  // (`git add scripts/livrer.mjs`, un test) reste permis.
  {
    re: /(?:^|[;&|] ?|\b(?:pnpm(?: run)?|npm run|npx|node|bun|cmd \/c|call|start) )[^ ]*?(?:livrer|copier-prod)(?:\.bat|\.mjs)?(?: |$)/,
    raison: '`livrer` / `copier-prod` atteignent la prod : c’est l’utilisateur qui les lance',
  },
  // `git -c clé=valeur push` : `-c` est la seule option à valeur courante.
  { re: new RegExp(`\\bgit (?:-c [^ ]+ |-[^ ]+ )*push\\b`), raison: '`git push` déclenche le déploiement Vercel' },
]

/**
 * Ramène une commande à une forme comparable : minuscules, sans les
 * caractères d'échappement ni les guillemets de bash, cmd et PowerShell
 * (`--link""ed`, `--lin^ked`, `` --lin`ked ``), espaces regroupés.
 */
export function normaliser(commande) {
  return String(commande)
    .toLowerCase()
    .replace(/["'`^\\]/g, '')
    .replace(/\s+/g, ' ')
}

/**
 * Décision PURE : `{ autorise: true }` ou `{ autorise: false, raisons }`.
 */
export function verdict(commande) {
  const c = normaliser(commande)
  if (c.includes(MARQUEUR.toLowerCase())) return { autorise: true }
  const local = /--local\b/.test(c)
  const raisons = MOTIFS.filter((m) => m.re.test(c) && !(m.saufLocal && local)).map(
    (m) => m.raison,
  )
  return raisons.length === 0 ? { autorise: true } : { autorise: false, raisons }
}

/** Message renvoyé à l'assistant en cas de refus. */
export function messageRefus(raisons) {
  return [
    'Garde anti-prod : commande refusée.',
    ...raisons.map((r) => `- ${r}`),
    'La cible par défaut est la base LOCALE (`--local`, 127.0.0.1:54321/54322).',
    `Pour viser la prod, l'utilisateur doit le demander explicitement dans le chat ; ajouter alors ${MARQUEUR} à la commande et dire pourquoi.`,
  ].join('\n')
}

/** Extrait la commande du JSON PreToolUse, ou `null` si ce n'en est pas une. */
export function commandeDuHook(entree) {
  try {
    const donnees = JSON.parse(entree)
    const outil = donnees?.tool_name
    if (outil !== 'Bash' && outil !== 'PowerShell') return null
    const commande = donnees?.tool_input?.command
    return typeof commande === 'string' ? commande : null
  } catch {
    return null
  }
}

// Stryker disable all : l'adaptateur ne tourne que dans un PROCESSUS à part
// (le hook), que Stryker n'instrumente pas ; il est couvert par les tests
// « hook réel » de `garde-prod.test.ts`, qui le lancent avec node.
async function principal() {
  let entree = ''
  for await (const morceau of process.stdin) entree += morceau
  const commande = commandeDuHook(entree)
  if (commande === null) return
  const v = verdict(commande)
  if (!v.autorise) {
    process.stderr.write(messageRefus(v.raisons) + '\n')
    process.exit(2)
  }
}

const lanceDirectement =
  process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())
if (lanceDirectement) await principal()
// Stryker restore all
