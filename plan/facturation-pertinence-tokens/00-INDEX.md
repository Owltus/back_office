# Plan — Pertinence du pull de tokens (facturation)

## Contexte

Le pull de tokens (nuages de mots par code) est pollué par du bruit administratif : mots de
paiement, mentions légales, logistique, adresses et NOMS PROPRES (fournisseur, client, contacts)
qui reviennent sur toutes les factures sans discriminer l'imputation. Les mots utiles (nature du
produit) sont noyés. Objectif : ne garder / pondérer que les mots porteurs de sens, de façon
FLEXIBLE (s'adapter à n'importe quel contexte, pas une liste figée exhaustive).

Deux couches complémentaires :

1. **Stopwords « facture » élargis** (déterministe) : un dictionnaire FR maintenable de termes
   universels (paiement, légal, admin, logistique, politesse) ajouté à `STOPWORDS`. Propre dès la
   1re facture. Ne bloque QUE du générique, JAMAIS un mot de nature produit.
2. **Filtre adaptatif par fréquence-document** (le cœur flexible) : à partir du JOURNAL
   (`facturation_learned_docs`, qui stocke les tokens PAR document), un token présent sur ≥ seuil %
   des DOCUMENTS (garde d'un minimum de documents = anti cold-start) est traité comme parasite,
   ignoré au scoring et masqué de l'affichage. Apprend le bruit propre à CHAQUE contexte (nom du
   fournisseur, du client, adresse, boilerplate) sans rien coder en dur.

- **Contrainte CLAUDE.md (à jour)** : backend Supabase DÉDIÉ à l'app (plus partagé) mais PROD LIVE.
  Ce chantier NE crée AUCUNE table (le journal existe déjà) — 100 % applicatif. Métier pur
  (`lib/facturation/*` sans React/Supabase), named exports, alias `#/` avec extension.
- **Invariants** : ne JAMAIS appliquer le filtre adaptatif à `countTokens` (deltas d'apprentissage
  = source de la df ET symétrie learn/unlearn). Le paramètre `stop?` est OPTIONNEL et en DERNIÈRE
  position (les tests appellent `detect`/`scoreInvoice` en positionnel). Dégradation gracieuse si le
  journal est vide.

---

## Angles à clarifier

- **D1 — Sur quel signal masquer l'AFFICHAGE ? (DIVERGENCE d'agents). Concerne l'étape 4.**
  L'agent « affichage » propose de rejouer le verdict `idf==0` du scoring (STOPWORDS + `max_df`).
  Mais `max_df` est INERTE avec peu de codes, et ce verdict ne capte pas les parasites STOCKÉS
  (adresses, noms, `legallais`, `accor`) qui, eux, ont une df-DOCUMENT élevée.
  - **Option A retenue (recommandée)** : l'affichage masque via la MÊME stoplist adaptative
    (couche 2) que le scoring — une seule source de vérité, cohérence UI/scoring totale. Les
    stopwords statiques (couche 1) n'atteignent jamais le pool (filtrés dès `tokenize`), donc rien
    à masquer pour eux.
  - **Option B (écartée)** : masquer sur `idf==0` recalculé — plus coûteux (`computeStats`) et
    aveugle au bruit mono-code (nom de fournisseur chez un seul code : df-code = 1, jamais masqué).

- **D2 — Emplacement des fonctions pures. Concerne les étapes 1, 2, 4.**
  - **Retenu** : nouveau module feuille `src/lib/facturation/stopwords.ts` (aucun import du module
    → pas de cycle) pour `INVOICE_STOPWORDS` (couche 1) ET `documentStoplist` (couche 2).
    `wordpool.ts` l'importe. Le petit helper d'affichage `visibleWords` vit dans `wordpool.ts`
    (près des opérations sur le pool).

- **D3 — Injection au scoring (consensus, pas une divergence). Concerne l'étape 3.**
  Option A des agents : la stoplist met `idf → 0` (première ligne de `idf`), JUMEAU EXACT du
  `max_df` existant → le token disparaît des vecteurs requête ET code, du dot, des normes, et des
  `words`. Cohérence maximale, rétro-compatible (`computeStats(pool)` sans stoplist inchangé).

- **D4 — (rodin) Biais cold-start mono-émetteur. Concerne l'étape 2.**
  Si le journal est petit et dominé par UN émetteur, tous ses tokens (y compris de vrais
  discriminants) atteignent une df élevée → le filtre global pourrait en supprimer à tort. La garde
  `minDocs` limite le risque. Un raffinement (df PAR émetteur) est hors périmètre — **assumé** :
  on reste sur une df GLOBALE, réglable, avec garde de volume.

- **D5 — Seuils. Concerne les étapes 2 et 4.**
  `DOC_STOP_RATIO` (~0,5) et `DOC_STOP_MIN_DOCS` (~8-10, réf. `MAXDF_MIN_CODES=8`,
  `ISSUER_STRONG_MIN=5`) en constantes DOCUMENTÉES, à affiner à l'usage.

---

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-stopwords-module.md](./1-stopwords-module.md) | Module `stopwords.ts` (couche 1 + fonction couche 2) | — | P0 | 2h | `INVOICE_STOPWORDS` fusionnés + `documentStoplist` pure + tests |  |
| 2 | [2-scoring-stoplist.md](./2-scoring-stoplist.md) | Intégration au scoring (idf→0) | 1 | P0 | 1h30 | `scoreInvoice`/`computeStats`/`idf` + `detect`/`redetect` gagnent `stop?` |  |
| 3 | [3-cablage-board.md](./3-cablage-board.md) | Câblage board + stoplist depuis le journal | 2 | P1 | 1h30 | stoplist calculée du journal, threadée à `processInvoice`/`redetect` |  |
| 4 | [4-affichage-pull.md](./4-affichage-pull.md) | Filtrage à l'affichage (galaxie + revue) | 3 | P1 | 2h | `visibleWords` + galaxie (panneau + nébuleuse) + comptes revue |  |
| 5 | [5-validation-globale.md](./5-validation-globale.md) | Validation globale | 1-4 | P0 | 1h | tsc/vitest/build verts, scénario, audit /borg | ⚠ |

## Ordre d'exécution

Séquentiel : 1 → 2 → 3 → 4 → 5. (La couche 1 est déjà active dès l'étape 1 via `tokenize` ; la
couche 2 devient effective au scoring à l'étape 2-3, puis à l'affichage à l'étape 4.)

## Architecture cible

```
src/lib/facturation/
  stopwords.ts               (NOUVEAU, pur) INVOICE_STOPWORDS + documentStoplist
  wordpool.ts                (MODIF) fusion STOPWORDS ; scoreInvoice/computeStats/idf + stop? ; visibleWords
  detect.ts                  (MODIF) detect/redetect + param stop?
  facturation.test.ts        (MODIF) tests couche 1 + documentStoplist + scoring filtré + visibleWords
  galaxy.ts                  (MODIF) buildGalaxy filtre les mots via la stoplist
src/components/facturation/
  useFacturationModel.ts     (MODIF) expose la stoplist dérivée du journal (source unique)
  FacturationBoard.tsx       (MODIF) stoplist -> processInvoice/redetect (+ deps)
  FacturationGalaxie.tsx     (MODIF) panneau des mots filtré via visibleWords
  FacturationRevue.tsx       (MODIF) comptes « vocabulaire » alignés sur visibleWords
```

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|-------------------|-------------------|
| Métier (lib) | `wordpool.ts`, `detect.ts`, `galaxy.ts`, `facturation.test.ts` | `stopwords.ts` |
| Composants (UI) | `useFacturationModel.ts`, `FacturationBoard.tsx`, `FacturationGalaxie.tsx`, `FacturationRevue.tsx` | — |
| **Total** | **8 modifiés** | **1 nouveau** |
