# Étape 12 — Validation globale

## Objectif

Clore le chantier : tout est vert, tout est livré, tout est noté.

## Travail à réaliser

1. Lancer la batterie complète en local : `pnpm test`, `pnpm test:db`, `npx tsc --noEmit`, `pnpm build`, les tests du Worker et les tests Deno.
2. Livrer chaque lot selon le protocole (`--essai`, puis `--confirme`), avec les flags nécessaires et l'accord de l'utilisateur.
3. Après chaque livraison, en prod, en lecture seule :
   - `verif_advisor.sql` et `verif_classeur_acces.sql` ;
   - le site en ligne contient le nouveau code.
4. Revérifier les failles corrigées avec les 4 reproductions de l'audit en local : chacune doit maintenant être refusée.
5. Mettre à jour CLAUDE.md (section « Audit security-audit-skill ») et la mémoire.
6. Optionnel : relancer `/security-audit` en mode rapide sur les fichiers modifiés.

## Critère de validation

- Les 4 failles confirmées sont refusées en local et en prod (lecture seule).
- Aucune nuit d'import manquée pendant tout le chantier.

## Contrôle /borg

- Aucune régression : imports de nuit, envoi du rapport, planning, comptes, impression du Classeur.
