# Étape 3 — Retrait du matching par les mots du contenu

## Objectif

Supprimer entièrement le moteur d'imputation « par les mots de la facture » (le piège « gaz »). L'imputation ne viendra plus que de l'apprentissage par émetteur. À l'issue, `detect` ne fait plus que « émetteur reconnu → ses couples historiques ».

## Contexte

`wordpool.ts` (TF-IDF / cosinus), la couche 2 de `detect.ts`, la table/RPC `facturation_wordpool`, le niveau « mots » de `galaxy.ts` et `confusableCodes` implémentent ce matching. Le métier le rejette explicitement. Suppression transverse (module, DB, tests). Le niveau émetteur→code de la galaxie est CONSERVÉ.

## Fichier(s) impacté(s)

- `src/lib/facturation/wordpool.ts` (supprimé)
- `src/lib/facturation/detect.ts` (modification : retrait de la couche « mots », garde `extractHints` date/n°)
- `src/lib/facturation/anomalies.ts` (modification : retrait `confusableCodes`)
- `src/lib/facturation/galaxy.ts` (modification : retrait du niveau « mots »)
- `src/lib/facturation/cloudService.ts` (modification : retrait des accès `*_wordpool_*`)
- `supabase/facturation_wordpool_drop.sql` (nouveau : `drop table` / `drop function` ciblés)
- `src/lib/facturation/facturation.test.ts` (modification : retrait des tests wordpool)

## Travail à réaliser

### 1. Métier

Supprimer `wordpool.ts`. Réduire `detect()` à « émetteur → candidats » (garder `extractHints` pour la date/le numéro, utile au tampon). Retirer `confusableCodes` (`anomalies.ts`) et le niveau « mots » de `galaxy.ts`.

### 2. DB

`facturation_wordpool_drop.sql` : `drop table if exists public.facturation_wordpool cascade;` + `drop function` des RPC wordpool. Fichier ciblé, exécuté par l'utilisateur (opération destructive → confirmation).

### 3. Tests

Retirer les `describe` liés au wordpool ; conserver émetteur / denylist / hash / stamp.

## Ordre d'exécution

1. Métier (module + detect + anomalies + galaxy + cloudService).
2. Tests.
3. L'utilisateur exécute `facturation_wordpool_drop.sql` dans Supabase.

## Critère de validation

- `npx tsc --noEmit` + `pnpm build` OK ; `pnpm test` vert (tests restants).
- Grep `wordpool` / `scoreInvoice` / `confusableCodes` vide côté `src/`.
- La galaxie s'affiche encore (émetteurs→codes), sans niveau « mots ».

## Contrôle /borg

Étape critique (suppression transverse + `drop table` en PRODUCTION). Audit post-exécution :
- Aucune référence morte à `wordpool` / `scoreInvoice` / `confusableCodes`.
- `detect()` n'impute plus rien à partir du contenu (seulement l'émetteur).
- Le `drop table` ne touche QUE `facturation_wordpool` (jamais les autres tables facturation).
