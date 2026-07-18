# Plan — Facturation : robustesse aux erreurs de saisie (émetteur & imputation)

## Contexte

L'apprentissage facturation est cumulatif et irréversible : au tamponnage, on écrit
des compteurs dans les tables partagées Supabase (nuages de mots par imputation,
dictionnaire d'émetteurs). Une erreur humaine y entre donc directement. La gravité
dépend du type d'erreur (confirmé par les agents, avec une divergence utile de
vocabulaire entre « peu grave côté données » et « grave et durable ») :

- **Faute de frappe sur l'émetteur → nuages** : FAIBLE. Un token vu une seule fois a
  `cf < 2 → idf = 0`, invisible au scoring ; `prune` finit par l'effacer.
- **Faute de frappe sur l'émetteur → dictionnaire** : GÊNANTE et PERMANENTE.
  `facturation_issuer_learn` n'a ni filtre `cf<2` ni prune → une entrée fantôme
  (`veola`, count 1) reste indéfiniment, pollue les suggestions et la galaxie.
- **Mauvaise imputation** : GRAVE et DURABLE. Des dizaines de tokens corrélés sont
  appris sur le mauvais code, votent ensemble et dépassent `cf≥2` en réapparaissant →
  le mauvais code se met à scorer. Rien ne l'annule automatiquement.

Réversibilité : les écritures sont des deltas additifs **décrémentables** (donc
réversibles en principe), MAIS aucune RPC de correction n'existe et aucun journal des
deltas n'est stocké — la réversibilité fine suppose de reconstituer le delta (possible
tant que la facture est ouverte : re-tokeniser `record.text`).

Stratégie retenue : **prévention d'abord** (frontend/lib, aucun schéma partagé touché),
**correction ensuite** (RPC SQL, exécutées par l'utilisateur). Contrainte projet
(CLAUDE.md) : backend Supabase partagé, lecture seule côté outillage ; écriture par RPC
`SECURITY DEFINER` à garde de rôle ; SQL exécuté par l'utilisateur, jamais l'assistant.

---

## Angles à clarifier

**D1 (rodin) — Périmètre : prévention seule vs prévention + correction. Transverse.**
- **Option A retenue (recommandée)** : v1 = prévention (étapes 1-3, 100 % frontend/lib, testable, aucun DDL). Les RPC de correction (étape 4) sont écrites et livrées, mais leur SQL est **exécuté par l'utilisateur** quand une pollution doit être nettoyée.
- **Option B** : tout livrer d'un bloc, correction incluse activée. Écartée : le schéma partagé impose une exécution manuelle et non testable par l'assistant.
- Justification : la faute de frappe côté nuages est auto-résorbée (`cf<2`, prune) ; la seule dette durable (mauvaise imputation, entrée émetteur fantôme) est mieux évitée en amont (confirmation + autocomplétion) que réparée en aval.

**D2 (rodin) — Confirmation d'apprentissage : friction vs sécurité. Concerne l'étape 2.**
- **Option A retenue (recommandée)** : case « mémoriser cette imputation » (cochée par défaut) + affichage clair de ce qui sera appris (émetteur + codes) au moment du tamponnage → l'humain corrige avant d'écrire, sans étape bloquante.
- **Option B** : encart de confirmation explicite (Confirmer / Ne pas apprendre) via `Dialog`. Plus sûr, plus lourd.
- **Option C** : rien de bloquant, tout repose sur l'undo a posteriori (dépend de l'étape 4). Écartée comme seule ligne de défense.

**D3 (rodin) — Fuzzy émetteur : quel seuil, où. Concerne l'étape 1.**
- Comparer le nom saisi (`normalizeIssuer`) aux émetteurs connus par distance d'édition / trigrammes. Seuil à trancher (distance ≤ 1-2, ou ratio ≥ 0,85). **Option retenue (recommandée)** : suggestion NON bloquante sous l'input (« Vouliez-vous dire *Booking* ? ») qui remplace par le `display` canonique au clic, calculée avant l'apprentissage.

**D4 — `normalizeIssuer` séparé de `normalize`. Concerne l'étape 1.**
- `normalize` est partagé avec le scoring des nuages (ne pas l'alourdir, cf. cycle d'imports `text.ts`). Créer un `normalizeIssuer` dédié : collapse des espaces multiples, retrait de la ponctuation, retrait des suffixes juridiques (`sarl`, `sas`, `sa`). Reco : helper séparé.

**D5 (rodin) — Désapprentissage exact sans journal. Concerne l'étape 4.**
- Aucun journal des deltas n'existe. **Option retenue (recommandée)** : reconstituer le delta depuis `record.text` (re-tokenisation + `SUPPLIER_WEIGHT` connu) tant que la facture est ouverte, et l'envoyer en négatif à une RPC `unlearn` — pas de nouvelle table de journal en v1.
- **Option B (différée)** : table `facturation_learn_log` horodatée pour un unlearn a posteriori hors session. Hors v1.

**D6 — Hygiène galaxie : masquage vs suppression. Concerne l'étape 3.**
- Un mot rare peut être légitime. **Option retenue (recommandée)** : seuil `minCount` d'**AFFICHAGE** dans `buildGalaxy` (masque le bruit à très faible count, non destructif). La suppression réelle reste `pruneClouds` (maintenance admin, globale, destructive).

**D7 — Garde `count >= 0` en base. Concerne l'étape 4.**
- Ajouter une contrainte `check (count >= 0)` et un `greatest(0, count - delta)` dans `unlearn` pour éviter les compteurs négatifs qui fausseraient `satTf`/`l2`.

---

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-prevention-emetteur.md](./1-prevention-emetteur.md) | Prévention émetteur | — | P0 | 2h30 | Autocomplétion + « vouliez-vous dire » + normalizeIssuer | |
| 2 | [2-confirmation-apprentissage.md](./2-confirmation-apprentissage.md) | Confirmation d'apprentissage | — | P0 | 1h | On voit / on choisit ce qui sera mémorisé | |
| 3 | [3-hygiene-galaxie-mincount.md](./3-hygiene-galaxie-mincount.md) | Hygiène galaxie | — | P1 | 1h | Le bruit à faible count n'apparaît plus | |
| 4 | [4-correction-desapprentissage.md](./4-correction-desapprentissage.md) | Correction & désapprentissage | 1 | P1 | 3h | RPC unlearn/rename/merge (SQL utilisateur) + undo | ⚠ |
| 5 | [5-validation-globale.md](./5-validation-globale.md) | Validation globale | 1, 2, 3, 4 | P0 | 30 min | tsc + vitest + build + navigateur | ⚠ |

---

## Ordre d'exécution

- **Sprint A (parallélisable)** : étapes 1, 2, 3 — 100 % frontend/lib, indépendantes, aucun DDL.
- **Sprint B** : étape 4 — écriture des RPC de correction (SQL livré, **exécuté par l'utilisateur**), wrappers client, et undo en séance (dépend de l'autocomplétion émetteur de l'étape 1 pour la ré-saisie canonique).
- **Fin** : étape 5, validation globale.

---

## Architecture cible

```
supabase/
  facturation_corrections.sql   (NOUVEAU, EXÉCUTÉ PAR L'UTILISATEUR)
                                unlearn/rename/merge/delete + check(count>=0)
src/lib/facturation/
  similarity.ts                 (NOUVEAU, PUR) distance d'édition / trigrammes
  text.ts                       (MODIF) normalizeIssuer (espaces, suffixes juridiques)
  cloudService.ts               (MODIF) unlearnClouds, renameIssuer, mergeIssuer
  galaxy.ts                     (MODIF) buildGalaxy(pool, issuers, topWords, minCount)
components/facturation/
  FacturationBoard.tsx          (MODIF) transmet `issuers` à InvoicePanel
  InvoicePanel.tsx              (MODIF) autocomplétion + fuzzy + confirmation + undo
  FacturationGalaxie.tsx        (MODIF) seuil minCount d'affichage
```

Aucun DDL exécuté par l'assistant. Le fichier `facturation_corrections.sql` est livré prêt
à exécuter par l'utilisateur (même contrat que `facturation_wordpool.sql`).

---

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|-------------------|-------------------|
| DB | — | `supabase/facturation_corrections.sql` (exécuté par l'utilisateur) |
| Métier (lib) | `text.ts`, `cloudService.ts`, `galaxy.ts` | `similarity.ts` |
| Composants (UI) | `FacturationBoard.tsx`, `InvoicePanel.tsx`, `FacturationGalaxie.tsx` | — |
| Réutilisés (sans modif) | `issuers.ts`, `useFacturationModel.ts`, `Tag.tsx`, `CodePicker.tsx` | — |
| **Total** | **6 modifiés** | **2 nouveaux** |
