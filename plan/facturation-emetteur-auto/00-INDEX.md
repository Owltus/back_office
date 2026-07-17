# Plan — Facturation : reconnaissance automatique de l'émetteur

## Contexte

Aujourd'hui le champ « Émetteur » est saisi à la main, puis versé comme token fort
dans les nuages au tamponnage. On veut que l'app **reconnaisse seule les émetteurs
déjà rencontrés** et **pré-remplisse** le champ : à force d'étiqueter, elle
constitue un dictionnaire des émetteurs (« martin », « edf »…) et, sur une nouvelle
facture, si le texte contient un émetteur connu, elle propose son nom.

Périmètre volontairement borné (rodin) :
- **Émetteur DÉJÀ vu** (saisi au moins une fois) → reconnu et pré-rempli. C'est un
  simple dictionnaire + recherche de sous-chaîne, sans IA. Les factures d'un même
  fournisseur ont un en-tête constant (gabarit) → le nom ressaisi une fois matche
  les suivantes.
- **Émetteur JAMAIS vu** → **pas de devinette**. Identifier un nom inconnu dans du
  texte brut est de l'extraction d'entités (IA, exclue) ou des heuristiques
  fragiles. On laisse le champ vide ; l'humain tape le nom → l'app l'apprend.

Contrainte projet : Supabase partagé, lecture seule côté outillage. Comme
`facturation_wordpool`, **nouvelle table dédiée, SQL exécuté par l'utilisateur**,
écriture uniquement via RPC `SECURITY DEFINER` à garde interne.

---

## Angles à clarifier

**D1 — Stockage : table dédiée vs extension des nuages. Concerne l'étape 1.**
- **Option A retenue (recommandée)** : nouvelle table `facturation_issuers
  (name, display, count)`. L'émetteur est **agnostique du code** (c'est un « qui »)
  et porte un **nom d'affichage** que les nuages `(code, token, count)` ne peuvent
  pas représenter. Séparation nette.
- **Option B** : marquer certains tokens des nuages comme « émetteur ». Mélange deux
  notions (classer vs identifier), pas de nom d'affichage propre. Écartée.

**D2 — Reconnaissance d'un émetteur INCONNU (rodin). Concerne l'étape 3.**
- **Option A retenue (recommandée)** : ne rien deviner. Champ vide, on apprend à la
  saisie. Honnête, zéro faux positif.
- **Option B** : heuristique (mot près de « SARL/SAS », token le plus saillant).
  Fragile, souvent faux. Écartée pour v1.

**D3 — Matching d'un émetteur connu. Concerne l'étape 2.**
- **Option A retenue (recommandée)** : recherche de **sous-chaîne** du nom normalisé
  (`text.includes(name)`), longueur ≥ 4 (réutilise `MIN_LEARN_LEN`), on retient le
  `count` le plus haut. Robuste pour un fournisseur au gabarit constant.
- Priorité de pré-remplissage : **émetteur appris** > mot-clé d'une SEED_RULE > vide.

---

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-schema-issuers.md](./1-schema-issuers.md) | SQL : table `facturation_issuers` + RLS + RPC (exécuté par l'utilisateur) | — | P0 | 30 min | `supabase/facturation_issuers.sql` | ⚠ |
| 2 | [2-module-service-issuers.md](./2-module-service-issuers.md) | Module pur `matchIssuer` + service (fetch/learn) + tests | — | P0 | 1h | `issuers.ts` + service + tests | |
| 3 | [3-integration-prefill.md](./3-integration-prefill.md) | Lecture cachée + pré-remplissage + apprentissage au tamponnage | 1, 2 | P0 | 1h | Émetteur reconnu et pré-rempli | |
| 4 | [4-validation-globale.md](./4-validation-globale.md) | Validation | 1, 3 | P0 | 30 min | tsc + tests + build + vérif | ⚠ |

---

## Ordre d'exécution

Étape 1 (SQL, à faire exécuter par l'utilisateur) en parallèle de l'étape 2 (pur,
indépendant de la DB). Puis 3, puis 4. Comme pour les nuages, tout est buildable et
dégrade gracieusement si la table n'existe pas encore (pas de pré-remplissage, sans
erreur bloquante).

---

## Architecture cible

```
supabase/
  facturation_issuers.sql   (NOUVEAU) table (name,display,count) + RLS + RPC learn — EXÉCUTÉ PAR L'UTILISATEUR
src/lib/facturation/
  issuers.ts        (NOUVEAU) PUR : matchIssuer(text, issuers) → émetteur connu ou null
  cloudService.ts   + fetchIssuers() / learnIssuer(name, display)
src/components/facturation/
  FacturationBoard.tsx  useQuery(['facturation','issuers']) → pré-remplit supplierName
  InvoicePanel.tsx      handleStamp → learnIssuer (en plus de learnClouds)
```

---

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|-------------------|-------------------|
| DB | — | `supabase/facturation_issuers.sql` |
| Métier (lib) | `cloudService.ts`, `facturation.test.ts` | `issuers.ts` |
| Composants (UI) | `FacturationBoard.tsx`, `InvoicePanel.tsx` | — |
| Réutilisés (sans modif) | `text.ts` (normalize), `detect.ts` (MIN_LEARN_LEN), `lib/query.ts` | — |
| **Total** | **4 modifiés** | **2 nouveaux** |
