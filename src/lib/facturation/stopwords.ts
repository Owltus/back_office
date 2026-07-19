import type { JournalEntry } from '#/lib/facturation/types.ts'

/*
 * Vocabulaire NON DISCRIMINANT du pull de tokens — logique PURE (aucun React/DOM/Supabase),
 * en deux couches :
 *   - INVOICE_STOPWORDS : termes UNIVERSELS d'une facture (paiement, légal, admin, logistique,
 *     politesse), fusionnés dans le STOPWORDS de wordpool → filtrés dès `tokenize`. PRÉ-NORMALISÉS
 *     (minuscules, sans accents) car `tokenize` normalise avant de comparer (cf. text.ts).
 *     RÈGLE ABSOLUE : ne JAMAIS y mettre un mot pouvant désigner une NATURE de dépense (gaz,
 *     alcool, electricite, assurance, garantie, transport, service…) ni un signal métier des
 *     fixtures de test (commission, reservation, consommation, intervention, reparation). En cas
 *     de doute, on laisse la couche adaptative trancher.
 *   - documentStoplist : filtre ADAPTATIF qui apprend les parasites propres AU CONTEXTE (nom du
 *     fournisseur, du client, adresse, boilerplate) depuis le journal, par fréquence-document.
 */

/** Couche 1 — termes génériques d'une facture, sans aucun pouvoir discriminant. */
export const INVOICE_STOPWORDS: string[] = [
  // Paiement / financier (transactionnel, jamais une nature de dépense)
  'reglement',
  'paiement',
  'payer',
  'paye',
  'echeance',
  'echeancier',
  'penalites',
  'penalite',
  'retard',
  'escompte',
  'acompte',
  'solde',
  'prelevement',
  'virement',
  'cheque',
  'mandat',
  'especes',
  'comptant',
  'interet',
  'interets',
  'agios',
  'franco',
  'port',
  'majoration',
  'recouvrement',
  'indemnite',
  // Légal / mentions obligatoires
  'mentions',
  'legales',
  'legal',
  'cgv',
  'conditions',
  'generales',
  'clause',
  'litige',
  'tribunal',
  'competent',
  'immatricule',
  'intracommunautaire',
  'intracomm',
  'responsabilite',
  // Admin / document
  'facturation',
  'facturer',
  'duplicata',
  'original',
  'copie',
  'exemplaire',
  'bordereau',
  'recapitulatif',
  'detail',
  'designation',
  'libelle',
  'rubrique',
  'periode',
  'mois',
  'annee',
  'exercice',
  'emis',
  'emetteur',
  'destinataire',
  'dossier',
  'contact',
  'correspondant',
  'gestionnaire',
  'references',
  'informations',
  // Logistique / livraison
  'livraison',
  'livre',
  'livrer',
  'expedition',
  'expedie',
  'colis',
  'palette',
  'enlevement',
  'retrait',
  'delai',
  'delais',
  'lot',
  'stock',
  // Adresse / coordonnées / politesse
  'adresse',
  'postal',
  'postale',
  'ville',
  'telephone',
  'portable',
  'standard',
  'cordialement',
  'salutations',
  'veuillez',
  'madame',
  'monsieur',
  'merci',
  'remercions',
  'disposition',
  'batiment',
  'etage',
  'bureau',
  'siege',
  'zone',
]

/** Seuils du filtre adaptatif (couche 2). Réglables à l'usage. */
export const DOC_STOP_RATIO = 0.5 // token présent sur ≥ 50 % des documents → candidat parasite
export const DOC_STOP_MIN_DOCS = 8 // garde cold-start (réf. MAXDF_MIN_CODES)
export const DOC_STOP_MIN_CODES = 3 // TRANSVERSALITÉ : parasite = présent dans ≥ 3 imputations

/**
 * Couche 2 — denylist ADAPTATIVE. Un token est parasite s'il est À LA FOIS :
 *  - présent sur ≥ `ratio` des DOCUMENTS du journal (fréquent), ET
 *  - TRANSVERSE : présent dans ≥ `minCodes` imputations DISTINCTES.
 * La transversalité PROTÈGE les mots propres à UNE imputation, même si elle domine le journal
 * (ex. 30 factures sur un seul code) : ce sont ses mots-signaux, pas du bruit. Seuls les mots
 * vraiment transverses (adresse, nom du client, termes de paiement…) sont écartés. `Set` vide
 * tant que le journal est trop petit (< minDocs) → inerte (dégradation gracieuse).
 */
export function documentStoplist(
  entries: JournalEntry[],
  ratio: number = DOC_STOP_RATIO,
  minDocs: number = DOC_STOP_MIN_DOCS,
  minCodes: number = DOC_STOP_MIN_CODES,
): Set<string> {
  const n = entries.length
  if (n < minDocs) return new Set()
  const df: Record<string, number> = {} // nb de documents contenant le token
  const codes: Record<string, Set<string>> = {} // imputations distinctes où il apparaît
  for (const e of entries) {
    const cs = e.codes ?? []
    for (const t of Object.keys(e.deltas ?? {})) {
      df[t] = (df[t] ?? 0) + 1
      const set = (codes[t] ??= new Set())
      for (const c of cs) set.add(c)
    }
  }
  const out = new Set<string>()
  for (const [t, c] of Object.entries(df))
    if (c / n >= ratio && (codes[t]?.size ?? 0) >= minCodes) out.add(t)
  return out
}
