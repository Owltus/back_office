# Étape 0 — Préparation des tests (/martin)

## Objectif

Rendre les phases /martin des étapes suivantes **mesurables** :
- un score de mutation de départ sur `lib/classeur` ;
- un simulateur PostgREST partagé, au lieu de trois copies.

## Contexte

Stryker 10 est configuré (`pnpm test:mutation`, seuils 80 / 60), mais son
`mutate` n'inclut **aucun** fichier de `src/lib/classeur`. Les simulateurs en
mémoire existent déjà, chacun dans son fichier :
- `merge/audit.property.test.ts` : classe `Simulateur` ;
- `sauvegardeDocument.test.ts` : `vi.mock('#/lib/supabase.ts')` avec de vrais
  filtres `eq` et le drapeau `rlsRefuse`.

Docker est éteint : il n'y a ni base locale ni pgTAP (voir D21).

## Fichier(s) impacté(s)

- `stryker.config.json`
- `src/lib/classeur/test/simulateurSupabase.ts` (nouveau, si la factorisation tient en moins de 200 lignes)
- `src/lib/classeur/test/simulateurSupabase.test.ts` (nouveau)

## Travail à réaliser

### 1. Périmètre Stryker

Ajouter au `mutate` les fichiers PURS concernés par le chantier, sans le DOM
de `print/` :
- existants : `merge/portee.ts`, `merge/apply.ts`, `merge/consignes.ts`,
  `relecture.ts`, `diff.ts` ;
- à venir : `llmDemandes.ts`, `selectionImpression.ts`, `corbeille.ts`,
  `transfert.ts`, `zoom.ts`.

Lancer une fois sur les fichiers existants et noter le score de DÉPART dans
l'index. On ne mute pas tout `lib/classeur` d'un coup (durée).

### 2. Simulateur partagé

Il doit gérer :
- les tables `classeur_*` utiles ;
- `deleted_at` ;
- `updated_at` posé comme le fait `classeur_stamp` ;
- `classeur_versions_suivent` ;
- un stockage d'objets (`copy`, `remove`) ;
- un refus RLS par table et par opération, qui rend 0 ligne SANS `error` ;
- une panne injectable au N-ième appel (utile à l'étape 7b).

## Phase de test /martin

Trois tests témoins valident le simulateur lui-même :
1. un `update` refusé rend `{ data: [], error: null }` ;
2. un `select` sans filtre `deleted_at` rend aussi les lignes supprimées ;
3. une mutation posée à la main (filtre `eq` ignoré) fait échouer un test
   existant de `sauvegardeDocument.test.ts` porté sur le simulateur.

## Critère de validation

- Score de départ noté dans `00-INDEX.md`.
- `pnpm test` vert, `npx tsc --noEmit` vert.
