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
  {
    re: /pooler\.supabase\.com/,
    raison: 'connexion au pooler Supabase (prod)',
  },
  { re: /backoffice\.naostack\.com/, raison: 'domaine de production' },
  { re: /--linked\b/, raison: '`--linked` vise le projet lié (prod)' },
  { re: /--project-ref\b/, raison: '`--project-ref` vise un projet distant' },
  {
    re: outil('supabase', 'link'),
    raison: '`supabase link` relie le poste à un projet distant',
  },
  {
    re: outil('supabase', `functions ${OPTIONS}deploy`),
    raison: 'déploiement d’Edge Functions',
  },
  {
    re: outil('supabase', `secrets ${OPTIONS}(?:set|unset)`),
    raison: 'modification des secrets distants',
  },
  // `db push` et `migration repair` existent aussi en `--local` : légitimes.
  {
    re: outil('supabase', `db ${OPTIONS}push`),
    raison: '`db push` écrit le schéma distant',
    saufLocal: true,
  },
  {
    re: outil('supabase', `migration ${OPTIONS}repair`),
    raison: '`migration repair` écrit l’historique distant',
    saufLocal: true,
  },
  {
    re: /--db-url[ =](?!postgres(?:ql)?:\/\/[^ @]*@(?:127\.0\.0\.1|localhost)[:/])/,
    raison: '`--db-url` vers une base qui n’est pas locale',
  },
  // Wrangler et Vercel : LISTE BLANCHE des sous-commandes sans effet sur la
  // prod (revue adverse du 2026-10-13 : `wrangler -c x deploy`, `rollback`,
  // `delete`, `versions upload`, `vercel` seul, `vc` passaient).
  {
    re: /\bwrangler (?!(?:dev|whoami|tail|login|logout|types|docs|--help|-h|--version|-v)\b)/,
    raison:
      'Wrangler hors lecture (déploiement, retour arrière, secrets du Worker)',
  },
  {
    re: /\bv(?:ercel|c)(?: |$)(?!(?:whoami|ls|list|inspect|logs|login|logout|--help|-h|--version|-v)\b)/,
    raison: 'Vercel hors lecture (déploiement, alias, retour arrière)',
  },
  {
    re: /\bv(?:ercel|c)\b[^;&|]*--prod\b/,
    raison: '`--prod` : production Vercel',
  },
  {
    re: /\bgh (?:pr merge|repo sync|api\b.*\bmerges\b)/,
    raison: 'fusion sur GitHub (déclenche le déploiement Vercel)',
  },
  // `git -c clé=valeur push` : `-c` est la seule option à valeur courante.
  {
    re: new RegExp(`\\bgit (?:-c [^ ]+ |-[^ ]+ )*(?:subtree )?push\\b`),
    raison: '`git push` déclenche le déploiement Vercel',
  },
]

/**
 * Les scripts de livraison et de copie lancent EUX-MÊMES des commandes vers
 * la prod, que ce hook ne verrait pas : tout segment qui les nomme est
 * refusé, sauf s'il commence par un outil qui ne fait que les LIRE ou les
 * tester (`git add scripts/livrer.mjs`, `npx vitest run …`).
 */
// Sans `\b` en tête : la normalisation retire le `\` d'un chemin Windows
// (`scripts\livrer.mjs` → `scriptslivrer.mjs`).
// `start.bat` aussi (2026-10-14) : il lance la copie de la prod, et sa
// question O/N répond « oui » toute seule au bout de 10 s.
const NOMME_UN_SCRIPT_PROD =
  /(?:(?:livrer|copier-prod)(?:\.bat|\.mjs)?|start\.bat)(?= |$)/
const LECTEURS =
  /^(?:git|cat|type|grep|rg|head|tail|sed|ls|dir|echo|wc|diff|less|more|code|npx (?:vitest|prettier|eslint|tsc)|pnpm (?:test|vitest|lint|check|format)|node --check)\b/

/** Sous-commandes `supabase` sans cible distante (sûres même poste lié). */
const SUPABASE_SANS_CIBLE =
  /\bsupabase (?:-[^ ]+ )*(?:unlink|start|stop|status|init|login|logout|help|--help|-h|--version|-v)\b/

const PREFIXE_MARQUEUR = /^(?:\$env:)?prod_confirme=1(?: |$)/
const MARQUEUR_SEUL = /^\$env:prod_confirme=1$/

/** Les commandes d'une ligne composée (`;`, `&&`, `||`, `|`, `&`, retours). */
export function segments(c) {
  return c
    .split(/&&|\|\||[;&|\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Ramène une commande à une forme comparable : minuscules, sans les
 * caractères d'échappement ni les guillemets de bash, cmd et PowerShell
 * (`--link""ed`, `--lin^ked`, `` --lin`ked ``), espaces regroupés.
 */
export function normaliser(commande) {
  return (
    String(commande)
      .toLowerCase()
      .replace(/["'`^\\]/g, '')
      .replace(/\s+/g, ' ')
      // Version épinglée d'un outil (`npx supabase@latest`, `wrangler@4`) :
      // retirée, sinon `\bsupabase ` ne reconnaissait plus l'outil. Seulement
      // un mot SANS `:` ni `/` avant le `@` : une URL `postgres://u:p@hôte`
      // reste intacte.
      .replace(
        /(^| )(@?[a-z][\w.-]*)@(?:\d[^ ]*|latest|next|beta|canary)(?= |$)/g,
        '$1$2',
      )
  )
}

/**
 * Décision PURE, segment par segment : `{ autorise: true }` ou
 * `{ autorise: false, raisons }`.
 *
 * - Le marqueur ne vaut que pour SON segment, posé en préfixe
 *   (`PROD_CONFIRME=1 supabase …`), ou pour le segment qui suit un
 *   `$env:PROD_CONFIRME=1` PowerShell. Un marqueur cité ailleurs (`echo`,
 *   message de commit) n'autorise rien.
 * - `--local` ne blanchit que son segment (`db push --local && db push`
 *   passait).
 * - `lie` : le poste est resté relié à la prod (`supabase/.temp/project-ref`,
 *   fenêtre fermée en pleine livraison) ; alors toute commande `supabase`
 *   sans `--local` vise la prod par défaut.
 */
export function verdict(commande, { lie = false } = {}) {
  const raisons = []
  const ajouter = (r) => {
    if (!raisons.includes(r)) raisons.push(r)
  }
  let parMarqueurPrecedent = false
  for (const s of segments(normaliser(commande))) {
    const marque = parMarqueurPrecedent || PREFIXE_MARQUEUR.test(s)
    parMarqueurPrecedent = MARQUEUR_SEUL.test(s)
    if (marque) continue
    const local = /--local\b/.test(s)
    for (const m of MOTIFS)
      if (m.re.test(s) && !(m.saufLocal && local)) ajouter(m.raison)
    if (NOMME_UN_SCRIPT_PROD.test(s) && !LECTEURS.test(s))
      ajouter(
        '`livrer` / `copier-prod` atteignent la prod : c’est l’utilisateur qui les lance',
      )
    if (lie && /\bsupabase\b/.test(s) && !local && !SUPABASE_SANS_CIBLE.test(s))
      ajouter(
        'le poste est encore RELIÉ à la prod (supabase/.temp/project-ref) : lancez `supabase unlink`, ou ajoutez `--local`',
      )
  }
  return raisons.length === 0
    ? { autorise: true }
    : { autorise: false, raisons }
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
    if (outil !== 'Bash' && outil !== 'PowerShell' && outil !== 'Monitor')
      return null
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
  const { existsSync } = await import('node:fs')
  const { join } = await import('node:path')
  const racine = process.env.CLAUDE_PROJECT_DIR || process.cwd()
  const lie = existsSync(join(racine, 'supabase', '.temp', 'project-ref'))
  const v = verdict(commande, { lie })
  if (!v.autorise) {
    process.stderr.write(messageRefus(v.raisons) + '\n')
    process.exit(2)
  }
}

const lanceDirectement =
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())
if (lanceDirectement) await principal()
// Stryker restore all
