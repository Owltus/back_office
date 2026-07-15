import type { BudgetLine, SupplierRule } from '#/lib/facturation/types.ts'

/*
 * Données de démonstration du prototype Facturation. INVENTÉES — codes inspirés
 * du plan comptable mais fictifs, à remplacer par le vrai référentiel plus tard.
 * Aucune n'est lue depuis Supabase : c'est un jeu d'essai autonome.
 */

/** Lignes budgétaires fictives, groupées par catégorie (sert les <optgroup>). */
export const BUDGET_LINES: BudgetLine[] = [
  { code: '606110', label: 'Électricité', category: 'Énergie & fluides' },
  { code: '606120', label: 'Gaz', category: 'Énergie & fluides' },
  { code: '606130', label: 'Eau', category: 'Énergie & fluides' },
  {
    code: '602600',
    label: 'Denrées — petit-déjeuner',
    category: 'Restauration',
  },
  { code: '607100', label: 'Boissons — minibar', category: 'Restauration' },
  { code: '604100', label: 'Blanchisserie & linge', category: 'Exploitation' },
  { code: '606300', label: "Produits d'entretien", category: 'Exploitation' },
  { code: '615500', label: 'Maintenance & réparations', category: 'Technique' },
  { code: '613200', label: 'Locations & crédit-bail', category: 'Technique' },
  { code: '626000', label: 'Télécom & Internet', category: 'Communication' },
  { code: '623400', label: 'Commissions OTA', category: 'Commercial' },
  { code: '606400', label: 'Fournitures de bureau', category: 'Administratif' },
  { code: '616000', label: 'Assurances', category: 'Administratif' },
]

/** Index code → libellé (mémoïsé une fois au chargement du module). */
const LABEL_BY_CODE = new Map(BUDGET_LINES.map((l) => [l.code, l.label]))

/** Libellé d'une ligne budgétaire, ou le code brut si inconnu. */
export function budgetLabel(code: string): string {
  return LABEL_BY_CODE.get(code) ?? code
}

/**
 * Règles fournisseur → code livrées avec l'app. Le matching cherche `keywords`
 * (déjà en minuscules, sans accent) dans le texte normalisé de la facture.
 * L'utilisateur en ajoute d'autres au fil de l'eau (règles « apprises »).
 */
export const SEED_RULES: SupplierRule[] = [
  {
    id: 'edf',
    supplier: 'EDF',
    code: '606110',
    keywords: ['edf', 'electricite'],
  },
  {
    id: 'engie',
    supplier: 'Engie',
    code: '606120',
    keywords: ['engie', 'gaz'],
  },
  {
    id: 'veolia',
    supplier: 'Veolia / Suez',
    code: '606130',
    keywords: ['veolia', 'suez', 'eau'],
  },
  {
    id: 'metro',
    supplier: 'Metro / Transgourmet',
    code: '602600',
    keywords: ['metro', 'transgourmet', 'pomona', 'brake'],
  },
  {
    id: 'elis',
    supplier: 'Elis / Initial',
    code: '604100',
    keywords: ['elis', 'initial', 'rld', 'blanchisserie', 'linge'],
  },
  {
    id: 'orange',
    supplier: 'Orange / SFR',
    code: '626000',
    keywords: ['orange', 'sfr', 'bouygues', 'telecom'],
  },
  {
    id: 'booking',
    supplier: 'Booking / Expedia',
    code: '623400',
    keywords: ['booking', 'expedia', 'hrs', 'commission'],
  },
  {
    id: 'otis',
    supplier: 'Otis / Kone (ascenseur)',
    code: '615500',
    keywords: ['otis', 'kone', 'schindler', 'ascenseur', 'maintenance'],
  },
  {
    id: 'lyreco',
    supplier: 'Lyreco / Bureau Vallée',
    code: '606400',
    keywords: ['lyreco', 'bureau vallee', 'fournitures'],
  },
]

/** Nombre de caractères (hors espaces) par page en-dessous duquel on bascule OCR. */
export const OCR_CHAR_THRESHOLD = 24
