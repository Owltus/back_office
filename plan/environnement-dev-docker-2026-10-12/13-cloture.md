# Étape 13 — Clôture : parcours de bout en bout

## Objectif

Prouver le contrat de l'utilisateur : « faire le zinzin en dev sans avoir peur
de tout casser de l'autre côté ».

## Fichier(s) impacté(s)

- `00-INDEX.md` (bilan de clôture, colonne Livrable « FAIT <sha> »)

## Travail à réaliser

1. Poste redémarré, puis `start.bat` : stack + app, bandeau ambre.
2. Connexion avec chacun des 6 comptes de test.
3. **Zinzin** : vider une table entière en local, supprimer un classeur,
   casser une policy ; puis `pnpm db:reset` → tout revient en moins de
   2 minutes.
4. Les 4 essais en attente depuis le 2026-10-04, faits EN LOCAL : import
   LLM avec refus, restauration depuis la corbeille, déplacement et copie
   vers un autre classeur, « Enregistrer au format PDF ».
5. Rapport et import nocturne en local → Mailpit seulement.
6. **Garde-fous déclenchés exprès** : `--linked` → refus du hook ;
   `pnpm dev` avec une URL prod → erreur de démarrage ; clé `sb_secret_`
   dans les fonctions locales → refus.
7. **Prod intacte** : `verif_*` en prod (lecture) identiques à l'étape 0 ;
   `migration list` aligné.
8. `pnpm build`, `npx tsc --noEmit`, `pnpm test`, `pnpm test:db`,
   `deno test`, Stryker sur les nouveaux modules.

## Critère de validation

- Les 8 points cochés, avec preuves dans le bilan.
- Commit sans push ; le push est demandé à l'utilisateur.

## Contrôle /borg

- Revue adverse de l'ensemble : un chemin vers la prod a-t-il échappé au
  garde (outil oublié, alias, script) ? Une donnée réelle s'est-elle glissée
  dans le dépôt ? Le site Vercel a-t-il changé de comportement ?
