# Étape 7 — Outillage

## Objectif

Deux petits durcissements des scripts du poste.

## Fichier(s) impacté(s)

- `scripts/prepare-tesseract.mjs`
- `supabase/anonymiser.sql` (et son test dans `copier-prod-plan.test.ts`)

## Travail à réaliser

### 1. tesseract

Ligne 60 : copier toujours les fichiers (il n'y en a que trois). Aujourd'hui, la copie est sautée quand la taille est identique, ce qui laisserait passer un fichier modifié de même taille.

### 2. Hachés des mots de passe dans la copie de la prod

Dans `anonymiser.sql` : `update auth.users set encrypted_password = crypt('<mot de passe des comptes de test>', gen_salt('bf'))`. Ainsi, une fuite de la base locale ne donne plus les hachés réels de la prod.

Conséquence à noter dans CLAUDE.md : après une copie, on se connecte en local avec le mot de passe de test, et non plus avec son vrai mot de passe.

## Critère de validation

- `pnpm test` est vert (le test du plan de copie est vert).
- La prochaine copie de la prod est lancée par l'utilisateur avec `start.bat`, que l'assistant ne lance pas.
