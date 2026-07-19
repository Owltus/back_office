# Étape 1 — Module `stopwords.ts` (couche 1 + fonction couche 2)

## Objectif

Créer le module métier pur `stopwords.ts` portant les deux couches : la liste statique
`INVOICE_STOPWORDS` (couche 1, fusionnée dans le `STOPWORDS` de `wordpool.ts` → active dès
`tokenize`) et la fonction pure `documentStoplist` (couche 2, non encore branchée au scoring).

## Contexte

Diagnostic des agents : `tokenize` (`wordpool.ts:187-194`) est le goulot unique — élargir
`STOPWORDS` améliore le pull PARTOUT (scoring, apprentissage `countTokens`, graine `seedPool`). La
liste doit être PRÉ-NORMALISÉE (minuscules, sans accents : `reglement`, `echeance`, `penalites`) car
`tokenize` normalise avant de comparer (`text.ts:9-14`). Trois mots-pièges à NE JAMAIS inclure
(signaux métier, utilisés par les fixtures) : `commission`, `reservation`, `consommation` (+
`intervention`, `reparation`). La couche 2 se dérive du journal (`JournalEntry.deltas` = sac de
tokens par document).

## Fichier(s) impacté(s)

- `src/lib/facturation/stopwords.ts` (nouveau, pur — feuille, importe seulement `type JournalEntry`)
- `src/lib/facturation/wordpool.ts` (modif : fusion `INVOICE_STOPWORDS` dans `STOPWORDS`)
- `src/lib/facturation/facturation.test.ts` (modif : tests couche 1 + `documentStoplist`)

## Travail à réaliser

### 1. `stopwords.ts` — couche 1 (liste statique, catégorisée)

```ts
import type { JournalEntry } from '#/lib/facturation/types.ts'

/*
 * Vocabulaire NON DISCRIMINANT du pull de tokens (denylist), en deux couches :
 *  - INVOICE_STOPWORDS : termes universels d'une facture (paiement, légal, admin, logistique,
 *    politesse). PRÉ-NORMALISÉS (minuscules, sans accents) car tokenize normalise avant de
 *    comparer. NE JAMAIS y mettre un mot de NATURE PRODUIT (gaz, alcool, electricite…) ni les
 *    signaux métier des fixtures (commission, reservation, consommation, intervention).
 *  - documentStoplist : filtre ADAPTATIF, apprend les parasites depuis le journal (df-document).
 */
export const INVOICE_STOPWORDS: string[] = [
  // Paiement / financier
  'reglement', 'paiement', 'payer', 'paye', 'echeance', 'echeancier', 'penalites',
  'penalite', 'retard', 'escompte', 'acompte', 'solde', 'avoir', 'prelevement',
  'virement', 'cheque', 'mandat', 'especes', 'comptant', 'interet', 'interets',
  'agios', 'franco', 'port', 'frais', 'majoration', 'recouvrement', 'indemnite',
  // Légal / mentions
  'mentions', 'legales', 'legal', 'cgv', 'conditions', 'generales', 'vente',
  'contrat', 'clause', 'litige', 'tribunal', 'competent', 'propriete', 'reserve',
  'assurance', 'garantie', 'responsabilite', 'immatricule', 'capital', 'social',
  'intracommunautaire', 'intracomm',
  // Admin / document
  'facturation', 'facturer', 'duplicata', 'original', 'copie', 'exemplaire',
  'bordereau', 'recapitulatif', 'detail', 'designation', 'libelle', 'rubrique',
  'periode', 'mois', 'annee', 'exercice', 'emis', 'emetteur', 'destinataire',
  'dossier', 'contact', 'correspondant', 'service', 'gestionnaire', 'references',
  'informations',
  // Logistique / livraison
  'livraison', 'livre', 'livrer', 'expedition', 'expedie', 'transport', 'colis',
  'palette', 'enlevement', 'retrait', 'delai', 'delais', 'lot', 'stock',
  // Adresse / coordonnées / politesse
  'adresse', 'postal', 'postale', 'ville', 'telephone', 'portable', 'standard',
  'cordialement', 'salutations', 'veuillez', 'madame', 'monsieur', 'merci',
  'remercions', 'disposition', 'batiment', 'etage', 'bureau', 'siege', 'zone',
]
```

Note : les doublons avec le `STOPWORDS` existant (`facture`, `tva`, `article`, `code`, `tel`…) sont
neutralisés par le `Set` — inoffensif. Auditer la liste finale contre les tokens littéraux des
tests (`consommation`, `commission`, `reservation`, `intervention`, `reparation`, `ascenseur`,
`booking`, `sejour`, `nuitee`, `electricite`…) : AUCUN ne doit y figurer.

### 2. `stopwords.ts` — couche 2 (fonction adaptative pure)

```ts
/** Seuils du filtre adaptatif (denylist par fréquence-document). Réglables. */
export const DOC_STOP_RATIO = 0.5 // token présent sur ≥ 50 % des documents → parasite
export const DOC_STOP_MIN_DOCS = 8 // garde cold-start (réf. MAXDF_MIN_CODES)

/** Denylist ADAPTATIVE : tokens présents sur une trop grande part des DOCUMENTS du journal
 *  (quel que soit le code) → boilerplate/noms/adresses propres au contexte. `Set` vide tant
 *  que le journal est trop petit (< minDocs) → inerte (dégradation gracieuse). */
export function documentStoplist(
  entries: JournalEntry[],
  ratio: number = DOC_STOP_RATIO,
  minDocs: number = DOC_STOP_MIN_DOCS,
): Set<string> {
  const n = entries.length
  if (n < minDocs) return new Set()
  const df: Record<string, number> = {}
  for (const e of entries)
    for (const t of Object.keys(e.deltas ?? {})) df[t] = (df[t] ?? 0) + 1
  const out = new Set<string>()
  for (const [t, c] of Object.entries(df)) if (c / n >= ratio) out.add(t)
  return out
}
```

### 3. Fusion dans `wordpool.ts`

Importer `INVOICE_STOPWORDS` et composer le `Set` privé sans changer `tokenize` :

```ts
import { INVOICE_STOPWORDS } from '#/lib/facturation/stopwords.ts'
// … BASE_STOPWORDS = new Set([...]) (l'actuel) …
const STOPWORDS = new Set<string>([...BASE_STOPWORDS, ...INVOICE_STOPWORDS])
```

`tokenize` continue d'interroger `STOPWORDS.has(t)` (l.192) — zéro changement de logique.

### 4. Tests

```ts
// Couche 1 : générique filtré, produit conservé, liste normalisée.
tokenize('Reglement par cheque, bon de livraison, echeance 30 jours') // → pas de reglement/cheque/livraison/echeance
tokenize('Livraison de gaz et alcool, consommation electricite')      // → garde gaz, alcool, consommation, electricite
for (const w of INVOICE_STOPWORDS) expect(normalize(w)).toBe(w)       // garde-fou convention
expect(countTokens('reglement livraison gaz')).toEqual({ gaz: 1 })   // l'appris est propre
// Couche 2 : documentStoplist
// < minDocs → Set vide ; ≥ minDocs → token présent sur ≥ ratio des entries retenu ; token rare non retenu.
```

## Ordre d'exécution

1. Créer `stopwords.ts` (liste + fonction + seuils).
2. Fusionner dans `wordpool.ts`.
3. Ajouter les tests (couche 1 + `documentStoplist`), en vérifiant qu'AUCUN test existant ne casse.
4. `npx tsc --noEmit` et `npx vitest run src/lib/facturation` verts.

## Critère de validation

- `INVOICE_STOPWORDS` normalisés, sans mot-piège ; `tokenize` filtre le générique et conserve les
  mots produit ; `countTokens` n'apprend plus le générique.
- `documentStoplist` : garde cold-start (< minDocs → vide), df-document correcte, pur.
- `npx tsc --noEmit`, `npx vitest run` verts (aucun test existant cassé).
