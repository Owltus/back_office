/*
 * Types du prototype « Facturation » — suivi/tamponnage des factures fournisseurs.
 *
 * SANS IA : lecture du PDF (texte natif ou OCR), détection en deux couches (règles
 * déterministes + nuages de mots statistiques) et tampon vectoriel se font côté
 * navigateur. Seule donnée serveur : les nuages de mots d'imputation, agrégés
 * (compteurs de tokens) dans Supabase — ni PDF ni texte de facture n'y sont stockés.
 */

/** Une ligne budgétaire = un code comptable + son libellé, rangé par catégorie.
 * `hint` = descriptions/fournisseurs agrégés du plan, texte de RECHERCHE seul
 * (jamais affiché) pour retrouver une ligne par son fournisseur dans le modal.
 * `tags` = domaines transversaux (Technique, Hébergement…) affichés et filtrables
 * dans le modal, au-delà de la section comptable. */
export interface BudgetLine {
  code: string
  label: string
  category: string
  hint?: string
  tags: string[]
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

/** Résultat de la détection. `code`/`supplier`/`confidence` = meilleur candidat ;
 *  `codes` = tous les codes retenus (règles + nuages), pré-sélectionnés.
 *  `scores` = candidats des nuages avec proba et mots votants (explicabilité) ;
 *  `abstained` = preuve trop mince, à imputer à la main. */
export interface Detection {
  supplier: string | null
  code: string | null
  codes: string[]
  matchedKeyword: string | null
  confidence: number
  learned: boolean
  hints: InvoiceHints
  scores?: {
    code: string
    proba: number
    words: string[]
    /** Origine de la suggestion : prior émetteur, mots du document, ou règle. */
    source?: 'issuer' | 'words' | 'rule'
  }[]
  abstained?: boolean
  /** Vrai quand l'imputation vient du SEUL prior émetteur (mots muets) : proposée par
   *  habitude, À VÉRIFIER par un humain (badge). Alimente la future file de revue. */
  fromIssuerOnly?: boolean
}

/** Données apposées dans le cartouche du tampon. Plusieurs imputations possibles
 *  (une ligne par code) ; le libellé de chaque code se dérive du plan. */
export interface StampData {
  codes: string[]
  comment: string
  invoiceDate: string
  processedDate: string
  /** Facteur d'échelle du cartouche (1 = taille par défaut). */
  scale: number
}

/**
 * Une facture chargée dans l'atelier : le fichier, son état de lecture, l'aperçu
 * multi-pages, et les champs d'imputation/tampon éditables. Vit dans le store
 * module-level `facturationStore` (survit à la navigation ; en mémoire de session).
 */
export interface InvoiceRecord {
  id: string
  file: File
  fileName: string
  status: 'processing' | 'ready' | 'error'
  method: ExtractMethod | null
  pageCount: number
  text: string
  detection: Detection | null
  previews: PagePreview[]
  position: StampPosition | null
  stampScale: number
  codes: string[]
  supplierName: string
  /** Vrai une fois le PDF tamponné + téléchargé (indépendant de l'apprentissage :
   *  reste vrai même si l'utilisateur décoche « mémoriser »). Sert au marqueur « validé ». */
  stamped?: boolean
  /** Vrai une fois la facture apprise (au tamponnage) — garde anti-double-comptage. */
  learned: boolean
  /** Vrai dès que l'utilisateur a modifié l'imputation/émetteur/date à la main — la
   *  re-détection en séance ne doit alors plus écraser ses choix. */
  userEdited?: boolean
  comment: string
  invoiceDate: string
  processedDate: string
  error: string | null
}
