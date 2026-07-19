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
export const DOC_STOP_RATIO = 0.5 // token présent sur ≥ 50 % des documents → parasite
export const DOC_STOP_MIN_DOCS = 8 // garde cold-start (réf. MAXDF_MIN_CODES)

/**
 * Couche 2 — denylist ADAPTATIVE : tokens présents sur une trop grande PART des DOCUMENTS du
 * journal (quel que soit le code d'imputation) → boilerplate / noms / adresses propres au
 * contexte, à ne plus faire voter ni afficher. `Set` vide tant que le journal est trop petit
 * (< minDocs) → totalement inerte (dégradation gracieuse, aucun risque de sur-filtrage à froid).
 */
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
