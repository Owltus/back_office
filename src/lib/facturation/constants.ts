import type { SupplierRule } from '#/lib/facturation/types.ts'

/*
 * Constantes de la feature Facturation qui NE sont PAS des données mouvantes :
 *  - TAGS : vocabulaire FERMÉ des domaines transversaux (+ type `Tag`), couplé aux couleurs
 *    (GalaxyChart.DOMAIN_HEX) et à l'ordre (galaxy.DOMAIN_ORDER) de la galaxie. Reste EN DUR
 *    (la vérification d'exhaustivité du type se fait à la compilation).
 *  - SEED_RULES : graine de règles fournisseur → code (matching déterministe), qui doit rester
 *    TOUJOURS disponible côté client (amorçage à froid de `seedPool`). Reste EN DUR.
 *  - Constantes d'extraction / aperçu PDF.
 *
 * Le RÉFÉRENTIEL des imputations (codes, libellés, descriptions, tags) NE vit PLUS ici : il est
 * en base Supabase (table `facturation_budget_lines`), chargé par la query
 * ['facturation','budgetLines'] (useFacturationModel) et exposé de façon SYNCHRONE par
 * `budgetRegistry.ts` (`budgetLabel` / `budgetHint` / `budgetTag` / `allBudgetLines`).
 */

/** Domaines transversaux (au-delà des sections comptables), pour afficher et
 *  filtrer les lignes par métier dans le modal. Une ligne peut porter plusieurs
 *  tags. Toute couleur associée vit dans le composant Tag (table statique). */
export const TAGS = [
  'Technique',
  'Énergie & fluides',
  'Hébergement',
  'Restauration',
  'IT & logiciels',
  'Administratif',
  'RH',
  'Commercial',
  'Finance',
  'Prestataires',
  'Déplacements',
  'Location',
  'Revenus annexes',
] as const
export type Tag = (typeof TAGS)[number]

/**
 * Règles fournisseur → code analytique livrées avec l'app, DÉRIVÉES des
 * fournisseurs cités dans les `description` du plan analytique. Le matching
 * cherche `keywords` (déjà en minuscules, sans accent) dans le texte normalisé
 * de la facture ; on évite les sous-chaînes ambiguës (« eau », « free »…).
 * L'utilisateur en ajoute d'autres au fil de l'eau (règles « apprises »).
 */
export const SEED_RULES: SupplierRule[] = [
  {
    id: 'compta',
    supplier: 'Comptabilité / Audit / Paie',
    code: 'FACOMPTooo',
    keywords: ['mazars', 'kpmg', 'yooz', 'cleemy'],
  },
  {
    id: 'rh',
    supplier: 'Outils RH',
    code: 'FAFRAISRHo',
    keywords: ['poplee', 'flatchr', 'lamster'],
  },
  {
    id: 'ota',
    supplier: 'OTA / Distribution',
    code: 'HECOMMOTAo',
    keywords: ['booking', 'expedia', 'dayuse', 'bnetwork'],
  },
  {
    id: 'encaissement',
    supplier: 'Commissions encaissement',
    code: 'FACOMMENCo',
    keywords: ['adyen', 'amex', 'ancv'],
  },
  // Pas de règle mot-clé GÉNÉRIQUE recoupant le LIBELLÉ de l'imputation : « electricite »,
  // « gaz », « chauffage urbain », « alcool », « blanchissage »/« location linge »,
  // « gardiennage » ont été retirés. Ces mots provoquent des attributions incohérentes
  // (« gaz » frigorigène de clim → conso gaz de ville) : on impute par le NOM de la ligne
  // au lieu de l'ÉDUCATION du pull de mots. Ces cas sont laissés au contexte appris d'une
  // vraie facture. Ne restent ici que des noms de FOURNISSEURS spécifiques (marques).
  {
    id: 'telecom',
    supplier: 'Téléphonie / Internet',
    code: 'FMTELWEBoo',
    keywords: ['coriolis'],
  },
  {
    id: 'logiciels',
    supplier: 'Licences & logiciels',
    code: 'FENTICoooo',
    keywords: ['olakala', 'otainsight', 'loungeup', 'lightspeed', 'backyou'],
  },
  {
    id: 'info',
    supplier: 'Maintenance informatique',
    code: 'FMINFORMoo',
    keywords: ['hoist'],
  },
  {
    id: 'locmob',
    supplier: 'Locations mobilières',
    code: 'FELOCMOBoo',
    keywords: ['castalie', 'locam'],
  },
  {
    id: 'prestataires',
    supplier: 'Sous-traitance / Prestataires',
    code: 'FESSTDIVoo',
    keywords: ['loomis'],
  },
]

/** Nombre de caractères (hors espaces) par page en-dessous duquel on bascule OCR. */
export const OCR_CHAR_THRESHOLD = 24

/**
 * Échelle de rasterisation des aperçus de page (au-delà de 1 pour rester net).
 * Sert AUSSI de plafond d'agrandissement à l'écran : zoomer au-delà flouterait,
 * en-deçà gâcherait de la netteté disponible. Une seule valeur pour les deux.
 */
export const PREVIEW_RASTER_SCALE = 1.5
