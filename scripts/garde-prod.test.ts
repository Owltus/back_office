import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { fc, test } from '@fast-check/vitest'
import {
  MARQUEUR,
  REF_PROD,
  commandeDuHook,
  messageRefus,
  normaliser,
  verdict,
} from './garde-prod.mjs'

// Oracle : la liste des commandes qui visent la prod est écrite ICI, à la
// main, depuis le plan (étape 1, point 2) — jamais recopiée de la sortie du
// garde.

const REFUSEES: Array<string> = [
  // ref, URL, pooler, domaine
  `supabase db query --db-url postgresql://postgres:x@db.${REF_PROD}.supabase.co:5432/postgres "select 1"`,
  `curl https://${REF_PROD}.supabase.co/rest/v1/profiles`,
  `psql postgresql://postgres.${REF_PROD}:x@aws-0-eu-west-1.pooler.supabase.com:6543/postgres`,
  'psql postgresql://u:x@aws-0-eu-west-1.pooler.supabase.com:5432/postgres',
  'curl -X POST https://backoffice.naostack.com/api',
  // projet lié
  'supabase db query --linked "select 1"',
  'supabase db query --LINKED "select 1"',
  'supabase db query --link""ed "select 1"',
  'supabase db query --lin^ked "select 1"',
  'supabase db query --lin`ked "select 1"',
  'npx supabase db dump --linked -f schema.sql',
  'cd supabase && supabase migration list --linked',
  'supabase db query --linked -f supabase/verif_advisor.sql 2>&1 | head',
  'supabase   db   query   --linked "select 1"',
  'supabase secrets list --project-ref abc',
  // liaison
  'supabase link --project-ref abc',
  'npx supabase link',
  'bunx supabase --debug link',
  'pnpm dlx supabase link',
  // déploiements et écritures distantes
  'supabase functions deploy send-report',
  'supabase functions deploy import-report --no-verify-jwt',
  'supabase secrets set RESEND_API_KEY=x',
  'supabase secrets unset REPORT_TEST_TO',
  'supabase db push',
  'supabase db push --dry-run',
  'supabase migration repair --status applied 20261013000000',
  'supabase db query --db-url postgresql://postgres:x@db.exemple.com:5432/postgres "select 1"',
  'supabase db dump --db-url=postgres://u:p@10.0.0.4:5432/db',
  // Cloudflare
  'cd worker && npx wrangler deploy',
  'wrangler triggers deploy',
  'wrangler versions deploy',
  'wrangler secret put IMPORT_SECRET',
  // Vercel et git
  'vercel --prod',
  'vercel deploy',
  'vercel env pull',
  'git push',
  'git push origin main',
  'git -C C:/Users/x/back_office push',
  'git -c http.extraHeader=x push origin main',
  // options longues entre l'outil, la sous-commande et l'action
  'supabase --workdir=. --debug link',
  'supabase --debug functions --workdir=. deploy send-report',
  'supabase --debug secrets --workdir=. set X=1',
  'supabase --debug db --workdir=. push',
  'supabase --debug migration --workdir=. repair --status applied 1',
  'npx wrangler --config=wrangler.toml deploy',
  'wrangler --env=x triggers deploy',
  'wrangler --config=w.toml secret put X',
  'vercel --scope=okko deploy',
  'vercel --scope=okko env ls',
  'vercel ls --prod',
  'git --no-pager push',
  'git -c core.x=1 --no-pager push',
  'supabase db query --db-url=postgres://u:p@10.0.0.4:5432/db "select 1"',
  // scripts qui atteignent la prod
  'pnpm livrer',
  'pnpm run livrer',
  'npm run copier-prod',
  'node scripts/livrer.mjs',
  'node scripts\\copier-prod.mjs --oui',
  'livrer.bat',
  './livrer.bat',
  'cmd /c copier-prod.bat',
  'git status && pnpm livrer',
  'git status;livrer.bat',
  'pnpm livrer:essai',
  'npm run copier-prod:oui',
  'start.bat',
  './start.bat',
  'cmd /c start.bat',
  'cmd //c C:\\Users\\x\\back_office\\start.bat',
  // PowerShell
  '$env:X = 1; supabase db query --linked "select 1"',
  'supabase db query --linked "select 1"; if ($?) { echo ok }',
]

const AUTORISEES: Array<string> = [
  'supabase start -x vector',
  'supabase stop',
  'supabase status',
  'supabase unlink',
  'supabase db reset',
  'supabase db reset --local --no-seed',
  'supabase db query --local "select 1"',
  'supabase db query "select 1"',
  'supabase db diff --local -f ajout',
  'supabase db push --local',
  'supabase migration repair --local --status applied 1',
  'supabase migration up --local',
  'supabase db query --db-url postgresql://postgres:postgres@127.0.0.1:54322/postgres "select 1"',
  'supabase db query --db-url postgres://postgres:postgres@localhost:54322/postgres "select 1"',
  'supabase functions serve',
  'supabase --version',
  'pnpm dev',
  'pnpm test',
  'npx tsc --noEmit',
  'git status',
  'git log --oneline -5',
  'git commit -m "docs: commit sans push"',
  'git commit -m "db push et link en prose"',
  'git diff prod..HEAD',
  'echo link',
  'curl http://127.0.0.1:54321/rest/v1/',
  'wrangler tail --format json',
  'wrangler dev',
  'vercel whoami',
  'git log --grep=push',
  'git commit -m "supabase db push --local en prose"',
  'supabase db query --db-url=postgresql://postgres:postgres@127.0.0.1:54322/postgres "select 1"',
  'supabase   db   push   --local',
  'git add scripts/livrer.mjs livrer.bat copier-prod.bat',
  'npx vitest run scripts/livrer.test.ts',
  'pnpm test scripts/copier-prod',
  'cat livrer.bat',
  'cat start.bat',
  'git add start.bat',
  'pnpm livrer-quelque-chose',
  'pnpm commit C:/tmp/message.txt',
  // `start` sans `.bat` n'est pas le script de démarrage
  'pnpm db:start',
  'start "" http://localhost:3000',
  // la sous-commande seule, sans l'outil, n'est pas l'outil
  'echo x link',
  'echo x functions deploy',
  'echo x secrets set',
  'echo x db push',
  'echo x migration repair',
  'cat scripts/garde-prod.mjs',
]

describe('verdict : table des commandes', () => {
  it.each(REFUSEES)('refuse %s', (commande) => {
    const v = verdict(commande)
    expect(v.autorise).toBe(false)
    expect(v.raisons?.length).toBeGreaterThan(0)
  })

  it.each(AUTORISEES)('autorise %s', (commande) => {
    expect(verdict(commande)).toEqual({ autorise: true })
  })

  // Le marqueur ne vaut que pour le segment qu'il préfixe (revue adverse du
  // 2026-10-13) : ici, les commandes SIMPLES de la liste.
  it.each(REFUSEES.filter((c) => !/[;&|]/.test(c)))(
    'le marqueur en préfixe autorise %s',
    (commande) => {
      expect(verdict(`PROD_CONFIRME=1 ${commande}`)).toEqual({ autorise: true })
      expect(verdict(`$env:PROD_CONFIRME='1'; ${commande}`)).toEqual({
        autorise: true,
      })
    },
  )

  it('le marqueur ne déborde pas sur les segments suivants ni ne vaut cité', () => {
    expect(
      verdict('PROD_CONFIRME=1 supabase db dump --linked && git push').raisons,
    ).toEqual(['`git push` déclenche le déploiement Vercel'])
    expect(
      verdict('echo PROD_CONFIRME=1 ; supabase db push --linked').autorise,
    ).toBe(false)
    expect(
      verdict('git commit -m "PROD_CONFIRME=1" && git push').autorise,
    ).toBe(false)
    expect(
      verdict(
        'PROD_CONFIRME=1 supabase link --project-ref x && PROD_CONFIRME=1 supabase db dump --linked',
      ),
    ).toEqual({ autorise: true })
  })

  // Contournements trouvés par la revue adverse du 2026-10-13.
  it.each([
    'wrangler -c cloudflare/wrangler.toml deploy',
    'wrangler --config cloudflare/wrangler.toml deploy',
    'npx wrangler@latest deploy',
    'npx wrangler@4 triggers deploy',
    'wrangler rollback',
    'wrangler delete',
    'npx wrangler versions upload',
    'npx supabase@latest db push',
    'npx supabase@latest functions deploy import-report --no-verify-jwt',
    'pnpm dlx supabase@2 secrets set X=1',
    'supabase db push --local && supabase db push',
    'pnpm --silent livrer',
    'pnpm -s copier-prod',
    'npm run -s livrer',
    'yarn livrer',
    'node --env-file=.env scripts/livrer.mjs',
    'powershell -c ./livrer.bat',
    'vercel',
    'vercel .',
    'vc --prod',
    'vc deploy',
    'npx vercel@latest deploy',
    'vercel rollback',
    'vercel alias set a b',
    'gh pr merge 12 --merge',
    'gh repo sync',
    'gh api -X POST repos/o/r/merges',
    'git subtree push --prefix x origin main',
  ])('contournement refusé : %s', (commande) => {
    expect(verdict(commande).autorise).toBe(false)
  })

  it('poste resté lié : toute commande supabase sans --local est refusée', () => {
    for (const c of [
      'supabase migration list',
      'supabase db dump -f x.sql',
      'supabase config push',
      'supabase storage rm -r ss:///classeur-images',
      'supabase functions delete import-report',
      'supabase db query "select 1"',
    ]) {
      expect(verdict(c, { lie: true }).autorise, c).toBe(false)
      expect(
        verdict(c, { lie: false }).autorise === false ||
          c.includes('config push'),
      ).toBe(verdict(c).autorise === false || c.includes('config push'))
    }
    for (const c of [
      'supabase unlink',
      'supabase status',
      'supabase db query --local "select 1"',
      'git status',
    ])
      expect(verdict(c, { lie: true }), c).toEqual({ autorise: true })
  })

  it('une version épinglée ne casse pas une URL locale', () => {
    expect(
      verdict(
        'supabase db query --db-url postgresql://postgres:postgres@127.0.0.1:54322/postgres "select 1"',
      ),
    ).toEqual({ autorise: true })
    expect(normaliser('npx supabase@latest status')).toBe('npx supabase status')
  })

  it('outils en lecture : autorisés', () => {
    for (const c of [
      'wrangler tail',
      'wrangler whoami',
      'wrangler dev',
      'vercel whoami',
      'vercel ls',
      'vc logs x',
      'cat vercel.json',
      'git add vercel.json',
    ])
      expect(verdict(c), c).toEqual({ autorise: true })
  })

  it('--local ne blanchit pas une commande qui vise aussi la prod', () => {
    expect(verdict('supabase db push --local --linked').autorise).toBe(false)
    expect(
      verdict(
        `supabase db query --local "select 1" && curl ${REF_PROD}.supabase.co`,
      ).autorise,
    ).toBe(false)
    expect(verdict('supabase link --local').autorise).toBe(false)
  })

  it('un marqueur incomplet ne suffit pas', () => {
    expect(verdict('PROD_CONFIRME=0 supabase db push').autorise).toBe(false)
    expect(verdict('PROD_CONFIRME supabase db push').autorise).toBe(false)
  })

  it('donne une raison par motif reconnu, dans l’ordre des motifs', () => {
    const v = verdict(`supabase db push --linked --project-ref ${REF_PROD}`)
    expect(v.raisons).toEqual([
      'référence du projet de production',
      '`--linked` vise le projet lié (prod)',
      '`--project-ref` vise un projet distant',
      '`db push` écrit le schéma distant',
    ])
  })

  // Chaque motif a sa propre raison, lisible et distincte : c'est ce que
  // l'assistant lit pour comprendre le refus.
  it.each([
    [
      'curl https://x.pooler.supabase.com',
      'connexion au pooler Supabase (prod)',
    ],
    ['curl https://backoffice.naostack.com', 'domaine de production'],
    ['supabase link', '`supabase link` relie le poste à un projet distant'],
    ['supabase functions deploy x', 'déploiement d’Edge Functions'],
    ['supabase secrets set X=1', 'modification des secrets distants'],
    [
      'supabase migration repair',
      '`migration repair` écrit l’historique distant',
    ],
    [
      'supabase db query --db-url postgres://u@h:1/d',
      '`--db-url` vers une base qui n’est pas locale',
    ],
    [
      'wrangler deploy',
      'Wrangler hors lecture (déploiement, retour arrière, secrets du Worker)',
    ],
    [
      'vercel deploy',
      'Vercel hors lecture (déploiement, alias, retour arrière)',
    ],
    ['gh pr merge 3', 'fusion sur GitHub (déclenche le déploiement Vercel)'],
    ['git push', '`git push` déclenche le déploiement Vercel'],
    [
      'pnpm livrer',
      '`livrer` / `copier-prod` atteignent la prod : seulement sur demande de l’utilisateur',
    ],
  ])('%s → %s', (commande, raison) => {
    expect(verdict(commande).raisons).toEqual([raison])
  })
})

describe('normaliser', () => {
  it('minuscules, sans guillemets ni échappements, espaces regroupés', () => {
    expect(normaliser('A  "B"\t\'c\'  `d`^e\\f\n g')).toBe('a b c def g')
  })
})

describe('normaliser : versions épinglées', () => {
  it('retire un vrai numéro de version', () => {
    expect(normaliser('npx supabase@2.120.0 db push')).toBe(
      'npx supabase db push',
    )
    expect(normaliser('npx wrangler@4.0.0-rc.1 deploy')).toBe(
      'npx wrangler deploy',
    )
    expect(normaliser('npx supabase@latest link')).toBe('npx supabase link')
  })

  it('ne fait jamais disparaître la référence de la prod (contre-exemple « A@0 »)', () => {
    expect(verdict(`A@0${REF_PROD}`).autorise).toBe(false)
    expect(verdict(`x@1.2${REF_PROD} y`).autorise).toBe(false)
  })
})

describe('verdict : propriétés', () => {
  test.prop([fc.string(), fc.string()])(
    'toute commande contenant la ref, sans marqueur, est refusée',
    (a, b) => {
      fc.pre(!normaliser(a + b).includes(MARQUEUR.toLowerCase()))
      expect(verdict(`${a}${REF_PROD}${b}`).autorise).toBe(false)
    },
  )

  test.prop([fc.string(), fc.string()])(
    'toute commande contenant --linked, sans marqueur, est refusée',
    (a, b) => {
      fc.pre(!normaliser(a + b).includes(MARQUEUR.toLowerCase()))
      expect(verdict(`${a} --linked ${b}`).autorise).toBe(false)
    },
  )

  test.prop([fc.stringMatching(/^[a-z0-9 ._:/=-]{0,40}$/)])(
    'le marqueur en préfixe autorise toute commande SIMPLE',
    (cmd) => {
      expect(verdict(`${MARQUEUR} ${cmd}`).autorise).toBe(true)
    },
  )

  const motLocal = fc.constantFrom(
    'start',
    'stop',
    'status',
    'db reset',
    'db diff',
    'migration list',
    'db query',
  )
  test.prop([motLocal, fc.stringMatching(/^[a-z0-9 _.-]{0,30}$/)])(
    'une commande supabase --local sans motif prod est autorisée',
    (mot, args) => {
      // Les mots d'un autre outil de prod (`vc`, `gh`…) sont refusés partout,
      // même en argument : prudent, donc hors de cette propriété.
      fc.pre(
        !/link|push|repair|deploy|secret|project-ref|db-url|\bv(?:ercel|c)\b|\bwrangler\b|\bgh\b/.test(
          args,
        ),
      )
      expect(verdict(`supabase ${mot} --local ${args}`).autorise).toBe(true)
    },
  )
})

describe('commandeDuHook', () => {
  it('lit la commande de Bash et de PowerShell', () => {
    expect(
      commandeDuHook(
        JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'ls' } }),
      ),
    ).toBe('ls')
    expect(
      commandeDuHook(
        JSON.stringify({
          tool_name: 'PowerShell',
          tool_input: { command: 'dir' },
        }),
      ),
    ).toBe('dir')
  })

  it('ignore les autres outils et les entrées invalides', () => {
    expect(
      commandeDuHook(
        JSON.stringify({
          tool_name: 'Read',
          tool_input: { file_path: REF_PROD },
        }),
      ),
    ).toBeNull()
    expect(
      commandeDuHook(
        JSON.stringify({
          tool_name: 'Write',
          tool_input: { command: 'git push' },
        }),
      ),
    ).toBeNull()
    expect(commandeDuHook('pas du json')).toBeNull()
    expect(
      commandeDuHook(JSON.stringify({ tool_name: 'Bash', tool_input: {} })),
    ).toBeNull()
    expect(commandeDuHook('null')).toBeNull()
  })
})

describe('messageRefus', () => {
  it('cite chaque raison, la cible locale et le marqueur', () => {
    const lignes = messageRefus(['a', 'b']).split('\n')
    expect(lignes[0]).toBe('Garde anti-prod : commande refusée.')
    expect(lignes.slice(1, 3)).toEqual(['- a', '- b'])
    expect(lignes[3]).toContain('--local')
    expect(lignes[4]).toContain(MARQUEUR)
    expect(lignes).toHaveLength(5)
  })
})

describe('hook réel (processus node)', () => {
  const script = fileURLToPath(new URL('./garde-prod.mjs', import.meta.url))
  const lancer = (entree: string) =>
    spawnSync(process.execPath, [script], { input: entree, encoding: 'utf8' })

  it('code 2 et message sur stderr pour une commande prod', () => {
    const r = lancer(
      JSON.stringify({
        tool_name: 'Bash',
        tool_input: { command: 'supabase db query --linked "select 1"' },
      }),
    )
    expect(r.status).toBe(2)
    expect(r.stderr).toContain('Garde anti-prod')
  })

  it('code 0 pour une commande locale', () => {
    const r = lancer(
      JSON.stringify({
        tool_name: 'Bash',
        tool_input: { command: 'supabase db query --local "select 1"' },
      }),
    )
    expect(r.status).toBe(0)
  })

  it('code 0 pour une entrée illisible (le garde ne bloque jamais le travail local)', () => {
    expect(lancer('{').status).toBe(0)
  })
})
