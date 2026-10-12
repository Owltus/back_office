# Étape 1 — Garde-fous contre la prod

## Objectif

Faire de la prod une cible EXPLICITE. Aucun outil (CLI, assistant, Martin,
`pnpm dev`) ne doit pouvoir l'atteindre par défaut ni par oubli d'un drapeau.

## Fichier(s) impacté(s)

- `supabase/.temp/` (délier : `supabase unlink`, D9)
- `scripts/garde-prod.mjs` (nouveau, versionné) + `scripts/garde-prod.test.ts`
- `.claude/settings.local.json` (hook PreToolUse vers le script ; la règle
  `allow Bash(supabase db query:*)` est réduite à `--local`)
- `.claude/skills/bob-assistant-supabase/SKILL.md` (réécrit)
- `~/.claude/settings.json` : `autoMode.environment` (« dev = stack locale
  127.0.0.1:54321/54322 ; prod = ozpavwghrmmkrnmkxodg, jamais liée »)
- `~/.claude/skills/martin/SKILL.md` : liste des cibles sûres réelles

## Travail à réaliser

1. **Délier** le poste (D9-A). Toute action prod passe ensuite par
   `--project-ref ozpavwghrmmkrnmkxodg` ou `--db-url`, écrit en toutes
   lettres.
2. **`scripts/garde-prod.mjs`**, fonction PURE `verdict(commande)` →
   `autorisé | refusé(raison)`, plus l'adaptateur hook (lit le JSON de
   l'outil sur l'entrée standard, code de sortie 2 = refus). Elle refuse,
   sauf si la commande contient `PROD_CONFIRME=1` :
   - `ozpavwghrmmkrnmkxodg` (ref, URL, `db.*.supabase.co`, pooler) ;
   - `--linked`, `supabase link` ;
   - `supabase functions deploy`, `secrets set|unset`, `db push`,
     `migration repair`, `wrangler deploy`, `wrangler triggers deploy`.
   Lecture et écriture sont traitées pareil : le geste explicite est exigé
   dans les deux cas, ce qui donne une trace.
3. **Hook** dans `.claude/settings.local.json` sur `Bash` et `PowerShell`.
   `PROD_CONFIRME=1` n'est posé que par l'assistant, sur demande explicite de
   l'utilisateur dans le chat (même règle que les opérations destructrices).
4. **Bob** : `--local` par défaut, section « Atteindre la prod » (lecture
   d'enquête ou livraison, toujours `--project-ref` + `PROD_CONFIRME=1`,
   motif dit dans le message). Le skill garde la discipline existante
   (SQL commité avant, destructif = confirmation).
5. **Martin** : cibles sûres = `127.0.0.1:54321/54322` ; le reste est
   inchangé.

## Implications propres

- Le dump de l'étape 3 devient la PREMIÈRE exception confirmée (D5-B) : il
  sert d'essai réel du garde.
- `.claude/` reste gitignoré. Seul le script est versionné ; le branchement
  du hook est une ligne, documentée dans `CLAUDE.md` (étape 12).

## Phase de test /martin

- Famille E : table de 40 commandes (variantes de casse, guillemets, `&&`,
  `;`, PowerShell, chemins Windows, ref coupé par des variables) ; exhaustif
  sur les refus.
- Famille A : fast-check, toute chaîne contenant le ref sans le marqueur est
  refusée ; toute commande `--local` sans motif prod est autorisée.
- Stryker sur `garde-prod.mjs` ≥ 80 %.
- Essai réel : `supabase db query --linked "select 1"` lancé par l'assistant
  est REFUSÉ par le hook (preuve citée).

## Critère de validation

- `supabase/.temp/project-ref` absent.
- Le hook refuse une commande prod sans marqueur et laisse passer `--local`.
- `pnpm test scripts/garde-prod` passe.
- Commit sans push.

## Contrôle /borg

- Aucun contournement trivial : variable d'environnement, alias, `cmd /c`,
  `npx supabase`, `bunx`.
- Le hook n'empêche pas `git`, `pnpm` ni les lectures locales (pas de faux
  positif bloquant).
