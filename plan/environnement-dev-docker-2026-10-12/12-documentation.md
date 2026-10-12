# Étape 12 — Documentation et habitudes

## Objectif

Qu'il n'existe plus qu'UNE façon de travailler, écrite là où l'utilisateur
et l'assistant la liront.

## Fichier(s) impacté(s)

- `CLAUDE.md`, `README.md`, `start.bat`
- Mémoire : `supabase-acces-direct-bob.md`, `ne-pas-ecrire-backend-partage.md`,
  nouvelle entrée `environnement-dev-local.md`, `MEMORY.md`

## Travail à réaliser

1. **`CLAUDE.md`**, nouvelle section en tête « Environnements » :
   - dev = stack locale, commandes, comptes de test, Mailpit ;
   - prod = geste explicite (`PROD_CONFIRME=1`, `--project-ref`) ;
   - réécrire « Exécution du SQL » : la source de vérité devient
     `supabase/migrations/`, livrée par `pnpm db:livrer` ;
   - « l'assistant ne teste pas les écritures contre la prod » devient
     « l'assistant teste les écritures en LOCAL, toujours » ;
   - noter que les 150 fichiers à plat sont de l'historique.
2. **`README.md`** : démarrer (Docker Desktop, `start.bat`), arrêter, tout
   remettre à zéro, livrer.
3. **Mémoire** : mise à jour des deux fiches et nouvelle fiche ; renvoi depuis
   la D21 du plan Classeur (« base locale disponible depuis le … »).

## Critère de validation

- Un nouveau poste suit le README de bout en bout sans autre aide
  (vérifié à l'étape 13).
- Commit sans push.
