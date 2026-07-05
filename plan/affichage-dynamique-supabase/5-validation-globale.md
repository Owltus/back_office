# Étape 5 — Validation globale (typecheck, build, matrice de rôles, RLS)

## Objectif

Clôturer le chantier : vérifier que l'ensemble compile et build, que le CRUD fonctionne de bout en bout, que le gating par rôle est correct côté UI **et** côté base (RLS), et qu'aucune régression n'a été introduite sur l'affiche (rendu / impression A3).

## Contexte

Dernière étape, marquée critique pour l'audit global (double gating UI + RLS sur backend partagé). La vérification RLS se fait en **lecture seule**, comme pour le parking (aucune écriture de test en prod par l'assistant).

## Fichier(s) impacté(s)

- Aucun nouveau fichier — validation transverse sur l'ensemble du chantier.

## Travail à réaliser

### 1. Validation technique

- `npx tsc --noEmit` : aucun type cassé.
- `pnpm lint` : pas de nouvelle erreur (la dette lint préexistante de `DashboardBoard` est hors périmètre).
- `pnpm check` (Prettier) : formatage OK sur les fichiers touchés.
- `pnpm build` : build vert ; vérifier que le chunk affichage n'embarque pas de poids mort.

### 2. Matrice de test par rôle (manuel, via l'app)

| Action | utilisateur | super_utilisateur | admin |
|--------|:-----------:|:-----------------:|:-----:|
| Voir / appliquer un modèle, générer, imprimer | oui | oui | oui |
| Ajouter un modèle | non (bouton absent) | oui | oui |
| Modifier un modèle | non | oui | oui |
| Supprimer un modèle | non | oui | oui |

(Aligner sur D1 si Option B retenue.) Tests joués par l'utilisateur avec de vrais comptes (jamais d'écriture automatique en prod).

### 3. Vérification RLS (lecture seule)

- `select policyname, cmd, roles from pg_policies where tablename = 'affiche_templates'` : 4 policies attendues, écriture conditionnée par `get_user_role()` selon D1.
- Confirmer qu'un accès anonyme (sans session) ne lit rien, et qu'un `utilisateur` ne peut pas écrire (rejet RLS).

### 4. Non-régression affiche

- Le rendu A3, l'aperçu (scale), l'impression `window.print()` et le nommage `Affiche_JJ-MM-AAAA` fonctionnent comme avant.
- Aucune couleur / icône invalide venue de la DB ne fait planter le rendu (le `check` SQL sur `color` et le repli `alert` sur l'icône couvrent les cas).

## Ordre d'exécution

1. `npx tsc --noEmit`, `pnpm lint`, `pnpm check`, `pnpm build`.
2. Jouer la matrice de rôles dans l'app (utilisateur).
3. Vérifier les 4 policies RLS + accès anonyme (lecture seule).
4. Contrôler la non-régression du rendu / impression.

## Critère de validation

- Build vert, typecheck / lint / format OK.
- Matrice de rôles respectée côté UI et refus RLS effectif pour `utilisateur`.
- Rendu et impression de l'affiche inchangés.

## Contrôle /borg

Étape critique (validation globale, double gating sur backend partagé). Audit final :
- Cohérence UI ↔ RLS : tout ce que l'UI masque à `utilisateur` est **aussi** refusé par la RLS (l'UI seule ne protège pas ; la base est le vrai rempart).
- Aucune écriture n'a touché les tables partagées (`profiles`, `daily_reports`, `forecast_days`, `budget`, `email_recipients`, `hotel_config`, `audit_log`) ; seule `affiche_templates` est écrite, et uniquement par des comptes autorisés via l'app.
- Aucune fuite de la clé `service_role` (jamais préfixée `VITE_`, jamais en code client).
- Pas de régression sur les autres features (parking, repjour) : le `QueryClient` partagé et les conventions perf (auth non bloquante, `useQuery`) restent respectés.
