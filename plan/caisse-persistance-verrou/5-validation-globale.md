# Étape 5 — Validation globale (typecheck, build, matrice rôles, verrou temporel)

## Objectif

Valider le chantier de bout en bout : cohérence des types, build vert (découpage des chunks), comportement fonctionnel de la saisie et des écarts, et surtout **le verrou temporel** en conditions réelles — édition possible dans la fenêtre de grâce, refusée après, admin jamais bloqué. La sécurité réelle étant la RLS, on vérifie le verrou **en base**, pas seulement dans l'UI.

## Contexte

Dernière étape, marquée critique (validation globale post-chantier + vérification d'une logique de sécurité). Les tests d'écriture contre Supabase sont réalisés **par l'utilisateur** avec de vrais comptes (contrainte projet : jamais d'écriture automatique par l'assistant contre la prod partagée). L'assistant se limite aux vérifications lecture seule et aux commandes locales (`tsc`, `build`).

## Fichier(s) impacté(s)

- Aucun fichier de production modifié (étape de vérification). Éventuel `src/lib/caisse/calc.test.ts` si non créé en Étape 2.

## Travail à réaliser

### 1. Vérifications locales (assistant)

- `npx tsc --noEmit` : zéro erreur.
- `pnpm build` : succès ; vérifier qu'une route/chunk `caisse` apparaît et que le poids reste raisonnable.
- `pnpm lint` / `pnpm check` (format) si utilisés dans le flux habituel.
- Tests purs `calc.ts` : écarts (attendu − réel), `fundTotal` en centimes, `isBalanced`, `canEditSheet` sur les 4 cas de rôle/fenêtre.

### 2. Matrice de rôles (utilisateur, via l'app)

| Rôle | Lecture feuille | Créer / éditer brouillon | Valider | Éditer < fenêtre | Éditer > fenêtre | Rouvrir |
|------|----------------|--------------------------|---------|------------------|------------------|---------|
| `utilisateur` | oui | non | non | non | non | non |
| `super_utilisateur` | oui | oui | oui | oui | **non** | non |
| `admin` | oui | oui | oui | oui | oui | oui |

### 3. Vérification du verrou temporel (utilisateur + contrôle lecture)

1. Créer et valider une feuille avec un compte `super_utilisateur`.
2. Immédiatement : corriger un montant → doit réussir (dans la fenêtre).
3. Simuler l'expiration : soit attendre, soit (admin) régler `validated_at` à `now() - interval '4 hours'` en base, puis retenter une édition avec le `super_utilisateur` → **doit être refusée** par la RLS (erreur remontée dans l'UI, pas un faux succès).
4. Avec l'`admin` : éditer la même feuille verrouillée puis la rouvrir → doit réussir.
5. Contrôle lecture seule (assistant possible) : `select report_date, shift, status, validated_at from public.caisse_sheets order by report_date desc limit 5` et `select policyname, cmd, qual from pg_policies where tablename = 'caisse_sheets'`.

## Ordre d'exécution

1. `tsc` + `build` + lint (assistant).
2. Tests purs `calc`.
3. Matrice de rôles jouée par l'utilisateur dans l'app.
4. Scénario du verrou temporel (grâce / expiration / admin).
5. Contrôle RLS/données en lecture seule.

## Critère de validation

- `npx tsc --noEmit` et `pnpm build` verts ; chunk `caisse` présent.
- La matrice de rôles est respectée ligne à ligne.
- Le verrou temporel se comporte comme spécifié : édition dans la fenêtre OK, hors fenêtre refusée pour le `super_utilisateur`, jamais bloquée pour l'`admin`.
- Aucune écriture n'a été effectuée par l'assistant contre la base partagée ; toutes les écritures de test proviennent de comptes réels via l'app.

## Contrôle /borg

Étape critique (validation globale + vérification de sécurité du verrou). Audit final :
- La policy RLS UPDATE en base correspond exactement au plan (rôle + `validated_at` + `interval '3 hours'`) et `GRACE_HOURS` côté TS est identique.
- Aucun chemin d'écriture ne contourne la RLS (pas de client `service_role` embarqué côté navigateur ; les seules écritures passent par le client anon soumis à la RLS).
- La table `caisse_sheets` n'a créé aucune régression sur les tables partagées ; aucune migration ni DDL n'a touché `profiles`/`daily_reports`/etc.
- Un écart non nul n'empêche pas la persistance mais est bien signalé (rouge + incitation au commentaire) — la donnée reste fidèle à la réalité comptable, jamais « corrigée » silencieusement.
