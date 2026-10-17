import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { verdict } from './garde-prod.mjs'

/*
 * Audit de sécurité du 2026-10-17 — hook garde-prod.
 * Oracle : `verdict(commande).autorise`. Le hook se déclare « filet contre
 * l'oubli, pas une barrière » : on sépare donc les formes NATURELLES (qu'un
 * assistant ou un humain écrit sans chercher à contourner) des formes
 * fabriquées exprès.
 *
 * Les blocs « FINDING » documentaient des formes qui PASSAIENT ; inversés
 * après le correctif du hook (2026-10-17) : elles sont refusées.
 */

const passe = (c: string) => verdict(c).autorise

describe('FINDING corrigé — formes naturelles reconnues', () => {
  it.each([
    // Exécutable nommé avec son extension Windows (PowerShell, cmd).
    'git.exe push origin main',
    '& "C:\\Program Files\\Git\\cmd\\git.exe" push origin main',
    'supabase.exe functions deploy import-report',
    'wrangler.cmd deploy',
    'vercel.cmd deploy',
    // Option globale de git à valeur séparée par une espace.
    'git --work-tree . push origin main',
    // Script de livraison suivi d'un caractère autre qu'une espace.
    '(cd scripts && node livrer.mjs)',
    'node scripts/livrer.mjs>livraison.log',
    // PowerShell : `.\start` lance start.bat (PATHEXT).
    '.\\start',
    // API GitHub : fusion d'une PR (singulier `merge`), mise à jour de main.
    'gh api -X PUT repos/o/r/pulls/1/merge',
    'gh api -X PATCH repos/o/r/git/refs/heads/main -f sha=abc',
  ])('refusé : %s', (c) => {
    expect(passe(c)).toBe(false)
  })

  it('`--local` en COMMENTAIRE ne blanchit plus `db push`', () => {
    expect(verdict('supabase db push # --local', { lie: true }).autorise).toBe(
      false,
    )
    expect(verdict('supabase db push # --local').autorise).toBe(false)
    expect(verdict('supabase db push', { lie: true }).autorise).toBe(false)
    expect(verdict('supabase db push --local # note', { lie: true })).toEqual({
      autorise: true,
    })
  })

  it.each([
    'gh api repos/o/r/pulls/1',
    'gh api -X GET repos/o/r/pulls',
    'gh api --method GET repos/o/r/git/refs/heads/main',
    'git.exe status',
    'git --work-tree . status',
    'start "" http://localhost:3000',
    'pnpm db:start',
    'git.exe log --grep=push',
  ])('le correctif ne bloque pas la lecture : %s', (c) => {
    expect(passe(c)).toBe(true)
  })
})

describe('Non retenu comme finding (contournement délibéré, hors contrat du hook)', () => {
  it.each([
    'supabase db query --lin${x}ked "select 1"',
    'node scripts/livrer.m*',
    'iex ("git pu"+"sh")',
    'sed -n "1e node scripts/livrer.mjs" x',
  ])('passe : %s', (c) => {
    expect(passe(c)).toBe(true)
  })
})

describe('ce qui tient', () => {
  it.each([
    'git -C . push',
    'git -c a=b push',
    'cmd /c git push',
    'npx supabase@2.120.0 link',
    'npx wrangler@4 deploy',
    'pnpm dlx vercel deploy --prod',
    'cmd /c start.bat',
    'pnpm livrer:essai',
    'npm run livrer',
    'cmd /c "node scripts\\livrer.mjs"',
    'node scripts\\copier-prod.mjs --confirme',
    'Start-Process supabase -ArgumentList db,push,--linked',
    'supabase db push --db-url postgresql://u:p@db.example.com:5432/postgres',
    'echo PROD_CONFIRME=1; git push',
    'PROD_CONFIRME=1 echo ok && git push',
    '$env:PROD_CONFIRME=1; git status; git push',
    'supabase db push --local && supabase db push --linked',
    'su\'\'pabase li""nk',
    'git pu`sh',
    'git p^ush',
  ])('refusé : %s', (c) => {
    expect(passe(c)).toBe(false)
  })

  // Générateur : quotes/échappements/espaces insérés dans les mots-clés.
  const bruit = fc.constantFrom('', '"', "'", '`', '^', '\\', '""', "''")
  const espace = fc.constantFrom(' ', '  ', '\t', ' \t ')
  const casse = (s: string) =>
    fc
      .array(fc.boolean(), { minLength: s.length, maxLength: s.length })
      .map((b) =>
        [...s].map((ch, i) => (b[i] ? ch.toUpperCase() : ch)).join(''),
      )
  const salir = (mot: string) =>
    fc
      .tuple(
        casse(mot),
        fc.array(bruit, { minLength: mot.length, maxLength: mot.length }),
      )
      .map(([m, b]) => [...m].map((ch, i) => b[i] + ch).join(''))

  it.each([
    ['git', 'push'],
    ['supabase', 'link'],
    ['wrangler', 'deploy'],
    ['vercel', 'deploy'],
  ])('propriété : %s %s bruité reste refusé', (outil, sous) => {
    fc.assert(
      fc.property(
        salir(outil),
        espace,
        salir(sous),
        (a, e, b) => !passe(`${a}${e}${b}`),
      ),
      { numRuns: 400 },
    )
  })

  it('propriété : --linked bruité reste refusé', () => {
    fc.assert(
      fc.property(
        salir('--linked'),
        (f) => !passe(`supabase db query ${f} "select 1"`),
      ),
      { numRuns: 400 },
    )
  })
})
