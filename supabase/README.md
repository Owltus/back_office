# supabase/ — ce qui fait foi

Depuis le 2026-10-13 (plan `plan/environnement-dev-docker-2026-10-12/`).

| Chemin | Rôle |
| --- | --- |
| `migrations/` | **LA vérité du schéma.** Rejouée de zéro par `supabase db reset`, livrée en prod par `livrer.bat`. `20261013000000_baseline.sql` = dump exact du schéma de la prod ce jour-là (aucune donnée). Octets exacts (`.gitattributes`). |
| `seed.sql`, `seed/` | Données FICTIVES de la base locale (généré : `pnpm db:seed:generer`). Jamais en prod. |
| `anonymiser.sql` | Joué par `copier-prod` sur la base LOCALE après une copie de la prod. Jamais en prod. |
| `functions/` | Edge Functions. En local : clé de la stack, e-mails vers Mailpit (`_shared/environnement.ts`). |
| `tests/` | Tests de la base (pgTAP) et fixtures d'import (`tests/fixtures/*.eml`, fictives). |
| `config.toml` | Stack LOCALE seulement (sauf `[functions.*]`, lu au déploiement). Un réglage Auth changé ici se reporte À LA MAIN dans le dashboard. |
| `verif_*.sql`, `diagnostic_panne.sql` | Contrôles en lecture, jouables en local comme en prod. |
| Tous les autres `*.sql` | **HISTORIQUE.** Écrits et joués à la main jusqu'au 2026-10-12. Ne plus jamais les rejouer : ils sont déjà dans la baseline, et plusieurs rouvriraient des failles (voir leurs en-têtes « NE PLUS REJOUER »). Gardés parce que CLAUDE.md et la mémoire les citent. |

Changer le schéma : `supabase migration new <nom>` (ou essais dans Studio puis
`supabase db diff --local -f <nom>`), `pnpm db:reset`, vérifier l'app, commit,
`livrer.bat`.
