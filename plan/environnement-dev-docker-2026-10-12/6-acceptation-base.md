# Étape 6 — Acceptation : la base locale équivaut à la prod

## Objectif

Prouver, contre les témoins de l'étape 0, que la base locale a les mêmes
règles que la prod, avant de lui raccorder l'app.

## Fichier(s) impacté(s)

- `supabase/tests/acceptation.sh` (nouveau) : joue les `verif_*` en local
- `releve-prod.md` (colonne « local » ajoutée)

## Travail à réaliser

1. `supabase db query --local -f` sur `verif_complet.sql`,
   `verif_advisor.sql`, `verif_audit_2026-09-06.sql`,
   `verif_classeur_acces.sql`. Comparer ligne à ligne avec l'étape 0.
2. Empreinte chiffrée : tables, policies, fonctions et triggers par schéma.
3. Tout écart est expliqué dans `releve-prod.md` (ex. : un objet qui
   n'existe qu'en local parce qu'il appartient à la stack) ou corrigé dans
   les migrations, puis `db reset` et on recommence.
4. D15 : `verif_classeur_acces.sql` est joué sous `set role authenticated`,
   jamais en superuser.

## Phase de test /martin

- Oracle : `releve-prod.md`, au SHA committé à l'étape 0.
- Mutation de contrôle : supprimer une policy en local → au moins un
  `verif_*` passe au rouge. Restaurer par `db reset`.

## Critère de validation

- Mêmes scores qu'en prod (n/n) sur les 4 contrôles.
- Empreinte identique, ou écarts tous expliqués.
- Commit sans push.
