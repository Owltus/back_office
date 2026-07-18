# Plan — Fonctionnement global de l'attribution : bonnes pratiques & base propre

## Contexte

Revue GLOBALE du fonctionnement de l'attribution/apprentissage des imputations (onglet
Facturation) et application des bonnes pratiques (classification de texte TF-IDF) pour une
base de données la plus propre possible. Trois axes, déjà arbitrés avec l'utilisateur :
réglage PRUDENT du filtre émetteur, NETTOYAGE des mots parasites, GESTION SEMI-AUTONOME des
erreurs. Le socle (détection deux couches, modèle émetteur→codes) est déjà en place et sain.

- **Émetteur = assistant, jamais autorité** : les mots priment, l'émetteur re-pondère ; il
  ne verrouille jamais contre un signal texte fort. Seuil de confiance relevé, proposition
  « à vérifier » quand il agit seul.
- **Bruit** : le socle gère déjà beaucoup (stopwords, `cf<2→0`, BM25, idf→0 pour l'ubiquité).
  Manquent un `max_df` adaptatif, une stoplist « boilerplate facture », et un top-K par idf.
- **Erreurs** : détecter les anomalies (co-occurrence émetteur→code aberrante, codes
  confusables) et les proposer à validation ; denylist « cet émetteur ne va jamais sur ce
  code » ; correction manuelle conservée.
- **Contrainte CLAUDE.md** : backend Supabase PARTAGÉ, LECTURE SEULE côté outillage ;
  écritures UNIQUEMENT via RPC `SECURITY DEFINER` (garde de rôle) ; SQL exécuté par
  l'UTILISATEUR, jamais par l'assistant.

---

## Angles à clarifier

**Décisions tranchées par l'utilisateur** (réglages émetteur/erreurs) : seuil filtre = 5 ;
les MOTS priment (retrait du filtre dur) ; mots muets + émetteur fort → proposer MAIS
« à vérifier » ; gestion des erreurs = file de revue semi-autonome + denylist + correction
manuelle (les trois).

**D1 — Retirer `addStrong` (nom d'émetteur injecté dans le pull) ? REVIREMENT vs D4.
Concerne l'étape 3.**
- **Option A retenue (recommandée)** : OUI le retirer — c'est le plus gros gain de propreté
  des nuages (le nom d'émetteur, marque à idf fort, écrase les autres codes). Le signal
  émetteur passe désormais par le modèle séparé `IssuerCodes`. ET recâbler `galaxy.ts` pour
  alimenter les nœuds émetteur depuis `IssuerCodes` (sinon la galaxie les perd).
- **Option B (écartée)** : garder `addStrong` (décision D4 du plan précédent). Double
  comptage émetteur (pool + modèle), nuages plus bruités, mais galaxie inchangée.
- Divergence des agents : le plan `facturation-attribution-emetteur-education` avait tranché
  D4 = GARDER ; ce chantier vise la propreté → on reconsidère. Coût : recâblage galaxie.

**D2 — Top-K par idf : où ? Concerne l'étape 2.**
- **Option A retenue (recommandée)** : s'appuyer sur `max_df` + stoplist pour la propreté du
  scoring (les mots à idf≈0 pèsent déjà 0), et garder le `prune` SQL par count pour la
  rétention disque. Ajouter un top-K client (dans `vectorize`) SEULEMENT si un profilage le
  justifie (le tie-break à idf égal doit rester déterministe).
- **Option B** : top-K par idf systématique dans `vectorize` — plus « pur » mais complexité
  et risque de non-déterminisme sans tie-break stable.

**D3 — Représentation du « à vérifier ». Concerne l'étape 1.**
- **Option A retenue (recommandée)** : un flag au niveau `Detection` (`fromIssuerOnly?:
  boolean`), posé UNIQUEMENT dans le cas mots-muets + émetteur concentré. Le `source`
  par-code ne suffit pas là (les codes viennent de `topPriorCodes`, pas de `scores`).
- **Option B** : nouvelle valeur d'union `source: 'issuer-only'` par-code + entrées `scores`
  synthétiques — unifie l'affichage mais alourdit `probaFor`/`sourceFor`.

**D4 — File de revue : à la volée ou en table ? Concerne l'étape 6.**
- **Option A retenue (recommandée)** : À LA VOLÉE, sans table — tout le modèle est déjà en
  cache client, les anomalies sont des fonctions pures. Résoudre = les RPC existantes
  (`unlearnIssuerCodes`, `denylist_add`, `pruneClouds`). Cohérent avec « l'apprentissage vit
  dans les compteurs, rien d'autre ».
- **Option B (différée)** : petite table `facturation_review_dismissed` UNIQUEMENT si le
  besoin « ignorer une anomalie acceptée » se confirme (sinon elle réapparaît à chaque calcul).

**D5 — Sémantique de la denylist. Concerne l'étape 5.**
- **Option A retenue (recommandée)** : poser une interdiction émetteur↔code purge AUSSI le
  compteur positif existant (`unlearnIssuerCodes`) — modèle cohérent, pas de signal
  contradictoire.
- **Option B** : laisser cohabiter (la denylist gagne au filtrage) — plus simple mais garde
  un compteur « fantôme ».

**D6 — Emplacement de la file de revue. Concerne l'étape 6.**
- **Option A retenue (recommandée)** : nouvelle route pleine `/facturation/revue` calquée sur
  `FacturationGalaxie` (tâche de curation globale, lecture seule + actions). L'atelier est
  déjà saturé.
- **Option B** : section dans la galaxie (mélange visualisation et curation).

**D7 (rodin) — Faut-il tout faire MAINTENANT ? Concerne l'ordre d'exécution.**
- La base vient d'être VIDÉE (≈ 2 factures). Les anomalies / denylist / page de revue
  n'apportent de la valeur qu'une fois la base PEUPLÉE. Le réglage émetteur (étape 1) et le
  nettoyage des parasites (étapes 2-3) sont utiles IMMÉDIATEMENT.
- **Recommandation** : exécuter **Sprint A (étapes 1-3)** maintenant, et **différer Sprint B
  (4-6)** jusqu'à ce que la base soit alimentée (les seuils d'anomalie/confusabilité ne
  seront calibrables qu'à ce moment). À trancher par l'utilisateur.

---

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-reglage-prudent-emetteur.md](./1-reglage-prudent-emetteur.md) | Filtre émetteur prudent + badge « à vérifier » | — | P0 | 1h30 | Seuil 5, mots priment, flag `fromIssuerOnly` + badge | |
| 2 | [2-nettoyage-mots-parasites.md](./2-nettoyage-mots-parasites.md) | max_df adaptatif + stoplist + top-K idf | — | P0 | 2h | Nuages propres, parasites transverses neutralisés | |
| 3 | [3-retrait-addstrong-galaxie.md](./3-retrait-addstrong-galaxie.md) | Retrait `addStrong` + galaxie sur `IssuerCodes` | 1 | P1 | 2h | Nom d'émetteur hors du pool, galaxie recâblée | |
| 4 | [4-detection-anomalies.md](./4-detection-anomalies.md) | Détection d'anomalies (métier pur) | — | P1 | 2h | `issuerOutliers` + `confusableCodes` + `anomalies.ts`, testé | |
| 5 | [5-denylist-emetteur-code.md](./5-denylist-emetteur-code.md) | Denylist émetteur↔code (DB + détection) | 1 | P1 | 2h30 | Table + RPC + garde dans la détection | ⚠ |
| 6 | [6-page-revue-ui.md](./6-page-revue-ui.md) | Page de revue + déclaration denylist (UI) | 4, 5 | P1 | 2h30 | `/facturation/revue` + actions de curation | |
| 7 | [7-validation-globale.md](./7-validation-globale.md) | Validation globale | 1, 2, 3, 4, 5, 6 | P0 | 1h | tsc + vitest + build verts, non-régression | ⚠ |

---

## Ordre d'exécution

- **Sprint A — valeur immédiate (base quasi vide)** : étapes **1** (émetteur prudent), **2**
  (nettoyage parasites), **3** (retrait addStrong + galaxie). Parallélisables 1‖2 ; 3 dépend de 1.
- **Sprint B — quand la base est peuplée** : étapes **4** (anomalies), **5** (denylist,
  SQL par l'utilisateur), **6** (page de revue). 4‖5 ; 6 dépend de 4 et 5.
- **Fin** : étape **7** (validation globale).

Cf. **D7** : l'utilisateur peut ne lancer que le Sprint A maintenant et différer le Sprint B.

---

## Architecture cible

```
src/lib/facturation/
  wordpool.ts          (MODIF) — max_df dans idf (garde N≥8), STOPWORDS étendu, codeCosine/confusableCodes
  detect.ts            (MODIF) — retrait filtre dur, flag fromIssuerOnly, garde denylist
  issuerCodes.ts       (MODIF) — ISSUER_STRONG_MIN 3→5, issuerOutliers + seuils
  types.ts             (MODIF) — Detection.fromIssuerOnly
  galaxy.ts            (MODIF) — nœuds émetteur depuis IssuerCodes (retrait addStrong)
  cloudService.ts      (MODIF) — fetch/add/remove denylist
  anomalies.ts         (NOUVEAU, pur) — agrège issuerOutliers + confusableCodes → file de revue
  issuerDenylist.ts    (NOUVEAU, pur) — modèle denylist + isDenied
  facturation.test.ts  (MODIF) — tests adaptés + nouveaux
src/components/facturation/
  InvoicePanel.tsx     (MODIF) — badge « à vérifier », retrait addStrong, action denylist
  confidence.ts        (MODIF) — helper needsReview
  useFacturationModel.ts (MODIF) — 4e query : issuerDenylist
  FacturationRevue.tsx (NOUVEAU) — page de revue (calquée sur FacturationGalaxie)
  GalaxyCard.tsx / nav (MODIF) — lien vers la revue
src/routes/facturation/
  revue.tsx            (NOUVEAU) — route /facturation/revue
supabase/
  facturation_issuer_denylist.sql (NOUVEAU, EXÉCUTÉ PAR L'UTILISATEUR) — table + RPC add/remove
  facturation_corrections.sql     (MODIF, EXÉCUTÉ PAR L'UTILISATEUR) — propager denylist (rename/merge/delete)
```

Un seul DDL nouveau (denylist), réversible, isolé des tables partagées. La file de revue ne
crée AUCUNE table (calcul à la volée, D4). SQL exécuté par l'utilisateur.

---

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|-------------------|-------------------|
| DB | `supabase/facturation_corrections.sql` | `supabase/facturation_issuer_denylist.sql` |
| Métier (lib) | `wordpool.ts`, `detect.ts`, `issuerCodes.ts`, `types.ts`, `galaxy.ts`, `cloudService.ts`, `facturation.test.ts` | `anomalies.ts`, `issuerDenylist.ts` |
| Composants (UI) | `InvoicePanel.tsx`, `confidence.ts`, `useFacturationModel.ts`, `GalaxyCard.tsx` | `FacturationRevue.tsx`, `routes/facturation/revue.tsx` |
| Réutilisés (sans modif) | `issuers.ts`, `text.ts`, `similarity.ts`, `constants.ts` | — |
| **Total** | **12 modifiés** | **4 nouveaux** |
