# Plan — Facturation : multi-imputation, confiance honnête, mise à jour en séance

## Contexte

La page facturation auto-impute une facture PDF à partir de deux couches (règles
déterministes + nuages de mots TF-IDF appris). Le modèle en place fonctionne mais
présente quatre limites que ce chantier vise à corriger :

- **Une seule imputation affichée** alors que la donnée en calcule déjà plusieurs.
  Un fournisseur peut livrer des articles très différents (alcool ET nourriture →
  imputations différentes), et un même article peut relever de plusieurs imputations
  à la fois. Sans IA, on ne peut pas trancher : le système doit donc présenter **la
  ou les imputations les plus probables**, pas une seule.
- **Sur-confiance sur base pauvre** : quand la base est vide ou quasi vide, le
  système manque de références fiables et ne devrait pas se prononcer avec assurance.
- **Le « collapse » de l'émetteur** : une fois un fournisseur appris sur un code, son
  nom (injecté comme token fort) rappelle systématiquement ce code et écrase les
  autres — l'émetteur « élague toutes les imputations possibles ».
- **Bug de mise à jour en séance** : après avoir tamponné le 1er PDF d'une liste, le
  2e ne bénéficie pas du nouvel apprentissage sans rafraîchir la page.

Contrainte projet (CLAUDE.md) : backend Supabase **partagé, lecture seule** côté
outillage ; toute écriture par RPC `SECURITY DEFINER` ; SQL exécuté par l'utilisateur,
jamais par l'assistant. Le chemin retenu ici **n'exige aucun nouveau DDL** (les RPC et
la donnée nécessaires existent déjà) ; les options qui toucheraient le schéma sont
explicitement différées ci-dessous.

---

## Angles à clarifier

**D1 — Nombre de candidats affichés. Concerne l'étape 2.**
- **Option A retenue (recommandée)** : afficher les codes **présélectionnés** (`detection.codes`, ≤ `CLOUD_MAX=3`), cohérents avec ce qui sera tamponné, avec une confiance par candidat.
- **Option B** : afficher jusqu'aux 5 candidats scorés (`detection.scores`) pour la transparence, en distinguant visuellement ceux qui sont présélectionnés.

**D2 (rodin) — Mesure de confiance sur base immature. Concerne l'étape 3.**
- **Option A retenue (recommandée)** : métrique de **maturité côté client** dérivée de `serverPool` (somme des `count` / nombre de codes non vides) — aucun changement de schéma, dégradation gracieuse préservée.
- **Option B (différée)** : nouvelle table `facturation_code_stats(code, invoices, updated_at)` incrémentée dans `facturation_wordpool_learn` pour un vrai compteur de factures par code. Impact schéma partagé → **hors v1**, SQL à exécuter par l'utilisateur.
- Divergence des agents : l'agent DB juge le compteur nécessaire pour une confiance fiable ; l'agent métier note que `idf`/anti-hapax atténuent déjà mécaniquement les scores sur base pauvre. La v1 tranche pour la métrique client, quitte à ajouter le compteur plus tard.

**D3 (rodin) — Origine réelle du « collapse » émetteur. Concerne l'étape 4.**
- L'agent métier n'a pas pu trancher entre deux mécanismes : (a) le token d'émetteur, appris avec `SUPPLIER_WEIGHT=5`, obtient un `idf` élevé et **domine le cosinus** → `CLOUD_KEEP_RATIO=0.75` écrase les autres codes ; (b) une règle de la couche 1 (`SEED_RULES`), prioritaire, retourne « ses codes seuls » et masque les nuages.
- **Levier retenu (recommandé)** : plafonner l'influence d'un token d'émetteur (réduire `SUPPLIER_WEIGHT` ou borner sa contribution au cosinus) et **vérifier sur données réelles** laquelle des deux voies domine avant d'ajuster les règles.

**D4 (rodin) — Mapping émetteur→codes explicite. Concerne l'étape 4 (différé).**
- Faut-il introduire un mapping **émetteur → codes** explicite (nouveau champ sur `Issuer`, migration Supabase) pour gérer proprement un fournisseur multi-articles, plutôt que la liaison indirecte par nuages ? Fort impact transverse (schéma + RPC + détection). **Recommandé : hors v1**, à réévaluer après les étapes 1-4.

**D5 — Apprentissage multi-code dilué. Concerne l'étape 4.**
- `addStrong` applique **le même delta à TOUS les codes** sélectionnés (`InvoicePanel`), ce qui gonfle identiquement plusieurs codes pour un article multi-imputé et dilue la discrimination future. Corriger (répartir/pondérer par code) impliquerait de toucher la RPC `facturation_wordpool_learn`. **Recommandé : documenter et différer**, sauf demande explicite.

**D6 — Flag « saisie manuelle » pour la re-détection. Concerne l'étape 1.**
- La re-détection en séance ne doit pas écraser une imputation/émetteur/date **saisis à la main**. Or aucun flag `userEdited` n'existe. **Recommandé : ajouter le flag**, positionné dès qu'un champ est patché manuellement.

**D7 — Échec silencieux de l'apprentissage. Concerne les étapes 1 et 3.**
- Si le rôle est insuffisant ou la table absente, `learnClouds` lève et le `catch {}` avale l'erreur : rien n'est appris (ni en séance, ni après refresh) et l'utilisateur n'en sait rien. **Recommandé : remonter un feedback discret** (toast/état) plutôt qu'un silence.

---

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-redetection-seance.md](./1-redetection-seance.md) | Re-détection en séance | — | P0 | 2h | Le 2e PDF profite de l'apprentissage sans refresh | |
| 2 | [2-multi-imputation-affichage.md](./2-multi-imputation-affichage.md) | Affichage multi-imputation | — | P0 | 1h30 | La carte montre plusieurs candidats + confiance | |
| 3 | [3-confiance-base-immature.md](./3-confiance-base-immature.md) | Confiance sur base immature | 2 | P1 | 2h | Avertissement + confiance atténuée quand base pauvre | |
| 4 | [4-conservation-texte-anti-collapse.md](./4-conservation-texte-anti-collapse.md) | Conservation & anti-collapse | — | P1 | 2h | Rétention bornée + collapse émetteur atténué | |
| 5 | [5-validation-globale.md](./5-validation-globale.md) | Validation globale | 1, 2, 3, 4 | P0 | 30 min | tsc + vitest + build + navigateur | ⚠ |

---

## Ordre d'exécution

- **Sprint A (parallélisable)** : étapes 1, 2 et 4 sont indépendantes (bug de séance,
  affichage multi, hygiène de conservation).
- **Sprint B** : étape 3 après l'étape 2 (elle enrichit la même carte de détection).
- **Fin** : étape 5 (validation globale) une fois 1-4 terminées.

---

## Architecture cible

```
src/lib/facturation/
  wordpool.ts            (MODIF) maturity(pool), SUPPLIER_WEIGHT/top-K révisés
  detect.ts              (MODIF) redetect(record, pool) pur, réutilise detect()
  cloudService.ts        (MODIF) pruneClouds() -> RPC facturation_wordpool_prune
  types.ts               (MODIF) InvoiceRecord.userEdited?: boolean
components/facturation/
  FacturationBoard.tsx   (MODIF) effet de re-détection sur changement de pool + bandeau maturité
  InvoicePanel.tsx       (MODIF) userEdited au patch manuel, feedback d'apprentissage, pondération émetteur
  DetectionCard.tsx      (MODIF) rendu multi-candidats + confiance par code + maturité
```

Aucun nouveau fichier. Aucun DDL en v1 (options schéma D2/D4 différées).

---

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|-------------------|-------------------|
| DB | — (options D2/D4 différées ; RPC `facturation_wordpool_prune` déjà déployée) | — |
| Métier (lib) | `wordpool.ts`, `detect.ts`, `cloudService.ts`, `types.ts` | — |
| Composants (UI) | `FacturationBoard.tsx`, `InvoicePanel.tsx`, `DetectionCard.tsx` | — |
| Réutilisés (sans modif) | `Tag.tsx`, `constants.ts` (`budgetLabel`), `useFacturationModel.ts`, `facturationStore.ts` | — |
| **Total** | **7 modifiés** | **0 nouveaux** |
