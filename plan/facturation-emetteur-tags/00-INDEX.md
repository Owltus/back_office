# Plan — Facturation : apprentissage par émetteur + tags thématiques

## Contexte

Deux ajouts sur la feature `facturation` (prototype admin, sans DB, tout côté
navigateur), pour accélérer l'imputation au quotidien :

- **Volet A — Apprentissage par émetteur.** L'utilisateur renseigne le nom de
  l'émetteur d'une facture (ex. « Martin »). Ce nom apparaît dans le texte du PDF.
  En mémorisant l'association « Martin → imputation(s) choisie(s) », la prochaine
  facture contenant « Martin » pré-remplit automatiquement ces imputations. C'est
  la résurrection du champ « Fournisseur (mémorisation) » retiré récemment, mais en
  version **multi-imputations** (une facture porte déjà `codes: string[]`).

- **Volet B — Tags thématiques dans le modal.** Chaque ligne du plan analytique
  reçoit 1 à plusieurs **tags de domaine** (Technique, Hébergement, Restauration,
  Énergie, RH…), affichés dans le modal `CodePicker` et **filtrables**. Objectif :
  retrouver vite une ligne par domaine métier (« c'est de l'hébergement, pas du
  matériel technique »), au-delà de la section comptable brute déjà utilisée pour
  grouper.

Contrainte projet rappelée : backend Supabase **partagé, lecture seule**. Comme le
reste de la feature, tout vit côté navigateur — les règles apprises en
`localStorage` (`facturation:regles-apprises`), les tags en données statiques dans
`constants.ts`. Aucune écriture réseau applicative.

---

## Angles à clarifier

**D1 — Modèle des règles apprises multi-codes. Concerne l'étape 1.**
- **Option A retenue (recommandée)** : une règle apprise **par code**, toutes avec
  le même mot-clé (`keywords:['martin']`). `detect()` agrège déjà les codes via
  `Set` → **aucune modification de `detect()`**, ni du type `SupplierRule`, ni des
  14 `SEED_RULES`, ni du test. Seul `rememberRule` change (émettre N règles, id
  suffixé par code `learned:${key}:${code}`).
- **Option B** : étendre `SupplierRule` à `codes: string[]`. Plus « propre »
  sémantiquement, mais casse le type partagé, impose de migrer les 14 seed, le test
  et les données `localStorage` déjà stockées. Écartée sauf avis contraire.

**D2 — Où stocker le nom d'émetteur saisi. Concerne l'étape 1.**
- **Option A retenue (recommandée)** : nouveau champ `InvoiceRecord.supplierName`
  (dans le store de session) → le nom survit à un aller-retour de sélection de
  facture, et peut être pré-rempli depuis la détection.
- **Option B** : état local dans `InvoicePanel` (perdu au changement de facture car
  remontage `key={record.id}`). Plus simple mais UX moins bonne.

**D3 — Garde-fou sur les noms courts. Concerne l'étape 1.**
Le matching est par sous-chaîne (`text.includes(kw)`) sans borne de mot. Un nom
court appris (« SA », « Or ») provoquerait des faux positifs massifs. **Recommandé :
refuser de mémoriser un nom normalisé de moins de 4 caractères** (message
d'explication). À confirmer (seuil).

**D4 — Taxonomie des tags de domaine. Concerne l'étape 2. CHOIX PRODUIT.**
Rien dans le code ne définit cette liste : c'est une décision métier. **Proposition
(13 tags)** : Technique, Énergie & fluides, Hébergement, Restauration, IT &
logiciels, Administratif, RH, Commercial, Finance, Prestataires, Déplacements,
Location d'espaces, Revenus annexes. Un mapping section→tag ne suffit pas :
`FRAIS EXPLOITATION` (20 lignes) et `FRAIS ADMINISTRATIFS` (10) sont des fourre-tout
qui exigent un curage ligne par ligne (l'étape 2 propose un mapping complet des 55
lignes, **à faire valider par le métier OKKO** — les `hint` guident mais restent
ambigus, ex. les 5 lignes « Consommable d'exploitation »).

**D5 — Sémantique du filtre par tag. Concerne l'étape 4.**
- **Option A retenue (recommandée)** : un seul tag actif à la fois (exclusif),
  combiné en **ET** avec la recherche texte. Simple et lisible.
- **Option B** : plusieurs tags actifs (OU/ET). Plus puissant, plus complexe.

**D6 — Composant de tag. Concerne les étapes 3-4.**
Aucun `badge`/`chip` réutilisable n'existe. **Recommandé** : petit composant
`src/components/facturation/Tag.tsx` calqué sur le style `LockBadge`
(`rounded-full`, bord + fond teinté `/10`), avec une table statique
`TAG_COLORS` (classes Tailwind littérales, pas de génération dynamique). Alternative
écartée : primitive shadcn `badge` (dépendance en plus pour un besoin local).

---

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-apprentissage-emetteur.md](./1-apprentissage-emetteur.md) | Volet A — champ émetteur + mémorisation multi-codes | — | P0 | 1h30 | Émetteur mémorisable, pré-sélection auto au prochain PDF | |
| 2 | [2-taxonomie-tags-donnees.md](./2-taxonomie-tags-donnees.md) | Volet B — taxonomie + `tags[]` sur les 55 lignes | — | P0 | 1h30 | `BudgetLine.tags` peuplé, validé métier | |
| 3 | [3-composant-tag.md](./3-composant-tag.md) | Volet B — composant `Tag` réutilisable | 2 | P1 | 30 min | Pastille de domaine colorée | |
| 4 | [4-modal-affichage-filtre-tags.md](./4-modal-affichage-filtre-tags.md) | Volet B — affichage + filtre + recherche par tag | 2, 3 | P0 | 1h | Tags visibles et filtrables dans le modal | |
| 5 | [5-validation-globale.md](./5-validation-globale.md) | Validation | 1, 4 | P0 | 30 min | tsc + tests + build + vérif navigateur | ⚠ |

---

## Ordre d'exécution

Les volets A et B sont **indépendants** (aucun fichier commun critique). Deux
sprints parallélisables, réunis à la validation :

- **Sprint A** : étape 1.
- **Sprint B** : étape 2 → 3 → 4 (séquentiel : les tags de données alimentent le
  composant puis le modal).
- **Clôture** : étape 5 (dépend de 1 et 4).

---

## Architecture cible

```
src/lib/facturation/
  types.ts         BudgetLine.tags?: string[]  ·  InvoiceRecord.supplierName (retour)
  constants.ts     TAGS (taxonomie) + tags[] sur les 55 BUDGET_LINES
  detect.ts        rememberRule(supplier, codes[])  ·  ids learned:${key}:${code}
src/components/facturation/
  Tag.tsx          (NOUVEAU) pastille de domaine, TAG_COLORS statiques
  InvoicePanel.tsx champ « Émetteur » + bouton « Mémoriser » (multi-codes)
  CodePicker.tsx   tags par ligne + barre de filtre + recherche incluant les tags
  FacturationBoard.tsx  record.supplierName (création + pré-remplissage)
```

---

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|-------------------|-------------------|
| Métier (lib) | `types.ts`, `constants.ts`, `detect.ts`, `facturation.test.ts` | — |
| Composants (UI) | `InvoicePanel.tsx`, `CodePicker.tsx`, `FacturationBoard.tsx` | `Tag.tsx` |
| Réutilisés (sans modif) | `LockBadge.tsx` (patron de style), `ui/dialog.tsx`, `#/lib/utils.ts` | — |
| **Total** | **7 modifiés** | **1 nouveau** |
