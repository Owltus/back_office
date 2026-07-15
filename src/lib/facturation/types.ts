/*
 * Types du prototype « Facturation » — suivi/tamponnage des factures fournisseurs.
 *
 * Tout est CÔTÉ NAVIGATEUR et SANS IA : la lecture du PDF (texte natif ou OCR),
 * la détection du code comptable (matching déterministe par règles) et le tampon
 * (dessin vectoriel sur le PDF) ne touchent jamais le réseau applicatif ni la
 * base Supabase. Page de test : rien n'est persisté hors `localStorage`.
 */

/** Une ligne budgétaire = un code comptable + son libellé, rangé par catégorie. */
export interface BudgetLine {
  code: string
  label: string
  category: string
}

/**
 * Règle de correspondance fournisseur → code comptable. Le matching est
 * déterministe : on cherche les `keywords` (nom de marque, mot-clé récurrent)
 * dans le texte extrait. `learned` distingue les règles apprises (mémorisées par
 * l'utilisateur au fil des factures) des règles de départ livrées avec l'app.
 */
export interface SupplierRule {
  id: string
  supplier: string
  code: string
  keywords: string[]
  learned?: boolean
}

/** Méthode d'obtention du texte : couche texte native du PDF, ou OCR d'un scan. */
export type ExtractMethod = 'native' | 'ocr'

/**
 * Aperçu image de la première page. `width`/`height` sont en POINTS PDF
 * (viewport échelle 1) — le même espace de coordonnées que pdf-lib, pour que la
 * position du tampon choisie à la souris se rejoue à l'identique sur le PDF.
 */
export interface PagePreview {
  dataUrl: string
  width: number
  height: number
}

/**
 * Position du tampon : la PAGE ciblée (index 0-based) et le coin haut-gauche du
 * cartouche en points PDF sur cette page, origine EN HAUT à gauche.
 */
export interface StampPosition {
  page: number
  x: number
  y: number
}

/** Résultat brut de la lecture d'un PDF. */
export interface ExtractResult {
  text: string
  method: ExtractMethod
  pageCount: number
  previews: PagePreview[]
}

/**
 * Indices best-effort récupérés par regex sur le texte (facultatifs, montrés à
 * titre d'aide — jamais critiques : une mise en page inhabituelle peut les rater).
 */
export interface InvoiceHints {
  date: string | null
  invoiceNumber: string | null
  amount: string | null
}

/** Résultat de la détection déterministe pour une facture. */
export interface Detection {
  supplier: string | null
  code: string | null
  matchedKeyword: string | null
  confidence: number
  learned: boolean
  hints: InvoiceHints
}

/** Données apposées dans le cartouche du tampon. */
export interface StampData {
  code: string
  label: string
  comment: string
  invoiceDate: string
  processedDate: string
}
