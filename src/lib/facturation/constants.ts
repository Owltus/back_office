import type { BudgetLine, SupplierRule } from '#/lib/facturation/types.ts'

/*
 * Référentiel d'imputation du prototype Facturation. Repris du VRAI plan
 * analytique OKKO (doc/plan_analytique.json, scan converti) : sections, codes
 * analytiques et libellés. Codes conservés TELS QUELS (le remplissage « o » du
 * scan est laissé intact, non converti en zéros). Une seule ligne par code
 * analytique, dédupliquée sur les comptes du plan ; `hint` agrège les
 * descriptions/fournisseurs de ces comptes — texte de RECHERCHE invisible (le
 * modal de sélection s'en sert), jamais affiché sur le tampon. `tags` = domaines
 * transversaux (voir TAGS) pour retrouver vite une ligne par métier.
 * Aucune n'est lue depuis Supabase : jeu de référence autonome, côté navigateur.
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

/** Lignes du plan analytique, groupées par section (sert les groupes du modal). */
export const BUDGET_LINES: BudgetLine[] = [
  // FRAIS ADMINISTRATIFS ET GENERAUX
  {
    code: 'FAABONoooo',
    label: 'Abonnements Administratifs',
    category: 'FRAIS ADMINISTRATIFS ET GENERAUX',
    hint: 'umih, club hotelier',
    tags: ['Administratif'],
  },
  {
    code: 'HEFORMoooo',
    label: 'Formation du personnel + Frais RH',
    category: 'FRAIS ADMINISTRATIFS ET GENERAUX',
    hint: 'formation du personnel',
    tags: ['RH'],
  },
  {
    code: 'FACOMPTooo',
    label: 'Frais de Comptabilité et Audit, RH',
    category: 'FRAIS ADMINISTRATIFS ET GENERAUX',
    hint: 'Mazars compta, GT paie; KPMG; yooz, cleemy',
    tags: ['Administratif', 'Finance'],
  },
  {
    code: 'FAFRAISRHo',
    label: 'Frais de Comptabilité et Audit, RH',
    category: 'FRAIS ADMINISTRATIFS ET GENERAUX',
    hint: "formation du personnel; frais d'actes; affranchissement; CSE, partenariats école; médecine du Travail; skello, lamster, poplee, flatchr",
    tags: ['RH', 'Administratif'],
  },
  {
    code: 'FADIVooooo',
    label: 'Divers charges et produits de gestions courantes',
    category: 'FRAIS ADMINISTRATIFS ET GENERAUX',
    hint: 'affranchissement; autres charges de gestion courante',
    tags: ['Administratif'],
  },
  {
    code: 'RECACALLoo',
    label: 'Divers charges et produits de gestions courantes',
    category: 'FRAIS ADMINISTRATIFS ET GENERAUX',
    hint: 'cooperation commerciale avec laurent perrier, proachat',
    tags: ['Commercial'],
  },
  {
    code: 'FAFOURNDIV',
    label: 'Fournitures diverses (Admin / petit outillage / equipe)',
    category: 'FRAIS ADMINISTRATIFS ET GENERAUX',
    hint: "Petits matériels / fourniture, petit matériel informatique, fournitures administratives; fournitures administratives; frais d'actes; la poste",
    tags: ['Administratif', 'IT & logiciels'],
  },
  {
    code: 'FASERVBQoo',
    label: 'Services bancaires',
    category: 'FRAIS ADMINISTRATIFS ET GENERAUX',
    hint: 'frais bancaires',
    tags: ['Finance'],
  },
  {
    code: 'HESEMINToo',
    label: 'Séminaires internes',
    category: 'FRAIS ADMINISTRATIFS ET GENERAUX',
    hint: 'nourriture et soft séminaire interne; avion, train, transports en commun, ...; restaurants, séminaires internes',
    tags: ['RH', 'Restauration', 'Déplacements'],
  },
  {
    code: 'FEDEPLACET',
    label: 'Voyages et déplacements',
    category: 'FRAIS ADMINISTRATIFS ET GENERAUX',
    hint: 'avion, train, transports en commun, ...; restaurants',
    tags: ['Déplacements'],
  },
  // FRAIS COMMERCIAUX ET MARKETING
  {
    code: 'FCOUTILooo',
    label: 'Outils de communication',
    category: 'FRAIS COMMERCIAUX ET MARKETING',
    hint: "Nouveaux imprimés d'exploitation, gifting, accessoires d'animation; sponso/pub Facebook; Gratification CM; Droits photos J.Galland",
    tags: ['Commercial'],
  },
  {
    code: 'HECOMMOTAo',
    label: 'Commissions distribution OTA & GDS',
    category: 'FRAIS COMMERCIAUX ET MARKETING',
    hint: 'OTA: booking, expedia, hrs, dayuse, bnetwork, hotels et préférences...',
    tags: ['Commercial'],
  },
  {
    code: 'FCINVITooo',
    label: 'Invitation commerciale (clients/Fournisseurs)',
    category: 'FRAIS COMMERCIAUX ET MARKETING',
    hint: 'Invitations à déjeuner institutionnels',
    tags: ['Commercial', 'Restauration'],
  },
  {
    code: 'FCOFFERToo',
    label: 'Remise clientèle - offerts',
    category: 'FRAIS COMMERCIAUX ET MARKETING',
    hint: 'Remise clientèle - offerts',
    tags: ['Commercial'],
  },
  // Frais de Perso
  {
    code: 'FAFREEXTRA',
    label: "Salaires renforts (CDD d'usage)",
    category: 'Frais de Perso',
    hint: 'personnel intérimaire; Mise à disposition de personnel',
    tags: ['RH'],
  },
  {
    code: 'HERENFORTo',
    label: "Salaires renforts (CDD d'usage)",
    category: 'Frais de Perso',
    hint: 'personnel intérimaire',
    tags: ['RH'],
  },
  // FRAIS EXPLOITATION / OPERATION
  {
    code: 'FMCHAUFFUo',
    label: 'Chauffage Urbain',
    category: 'FRAIS EXPLOITATION / OPERATION',
    hint: 'chauffage urbain',
    tags: ['Énergie & fluides'],
  },
  {
    code: 'FMEAUooooo',
    label: 'Eau',
    category: 'FRAIS EXPLOITATION / OPERATION',
    hint: 'eau',
    tags: ['Énergie & fluides'],
  },
  {
    code: 'FMELECoooo',
    label: 'Electricité',
    category: 'FRAIS EXPLOITATION / OPERATION',
    hint: 'electricité',
    tags: ['Énergie & fluides'],
  },
  {
    code: 'FMGAZooooo',
    label: 'Gaz',
    category: 'FRAIS EXPLOITATION / OPERATION',
    hint: 'gaz',
    tags: ['Énergie & fluides'],
  },
  {
    code: 'FMPONCTUEL',
    label: 'Entretien Ponctuel',
    category: 'FRAIS EXPLOITATION / OPERATION',
    hint: "entretien ponctuel: pièce ou réparation, AVEC ou sans Contrat, hors périmètre du contrat (ex: réparation du chauffage, achat d'une pièce, passer en FM ponctuel et non en FMOBLI; bien qu'on ait un contrat)",
    tags: ['Technique'],
  },
  {
    code: 'FMNONOBLIo',
    label: 'Maintenance non obligatoire',
    category: 'FRAIS EXPLOITATION / OPERATION',
    hint: 'TPE ADYEN; Machine à café, équipement cuisine, autres maintenances non obligatoires, ...; audit HACCP, dératisation désourisation, traitements des déchets',
    tags: ['Technique', 'Restauration'],
  },
  {
    code: 'FMOBLIoooo',
    label: 'Maintenance obligatoire',
    category: 'FRAIS EXPLOITATION / OPERATION',
    hint: "ascenseurs, portes automatique, extincteur, désenfumage, SSI, contrôle périodique de Bureau véritas, CVC, ECS, CDO, étanchéité, pompe à chaleur; analyse légionnelle, maintenance liée à l'hygiène",
    tags: ['Technique'],
  },
  {
    code: 'FMSINISTRE',
    label: 'Réparation sur Sinistre',
    category: 'FRAIS EXPLOITATION / OPERATION',
    hint: 'entretien et frais liés à un sinistre',
    tags: ['Technique'],
  },
  {
    code: 'FEABONNEoo',
    label: 'Abonnements metier (Music/Journaux/plantes)',
    category: 'FRAIS EXPLOITATION / OPERATION',
    hint: 'fleurs et déco de Noel, diverses décorations animations; journaux; abonnements; sacem et spré',
    tags: ['Administratif', 'Hébergement'],
  },
  {
    code: 'FACOMMENCo',
    label: 'Commissions sur les encaissements',
    category: 'FRAIS EXPLOITATION / OPERATION',
    hint: 'commissions sur encaissement - banque; commission AMEX et autre; commission sur encaissement - ADYEN; commissions sur encaissement - ANCV',
    tags: ['Finance'],
  },
  {
    code: 'FEMATERIEL',
    label: "Consommable d'exploitation",
    category: 'FRAIS EXPLOITATION / OPERATION',
    hint: "uniformes; produit d'entretien; clef de #, parapluie, sac pressing, sac kraft, gaz enomatic/castalie, mug, allumettes..; Papeterie, fournitures bureau; décoration, fleurs, plantes",
    tags: ['Technique', 'Administratif', 'Hébergement'],
  },
  {
    code: 'HEMATERIEL',
    label: "Consommable d'exploitation",
    category: 'FRAIS EXPLOITATION / OPERATION',
    hint: "literie (oreiller, drap, ...); Consommables d'exploitations hébergement (non-inventoriés)",
    tags: ['Hébergement'],
  },
  {
    code: 'FMMATTECHo',
    label: "Consommable d'exploitation",
    category: 'FRAIS EXPLOITATION / OPERATION',
    hint: 'petit matériel du RT; petit matériel technique',
    tags: ['Technique'],
  },
  {
    code: 'REMATERIEL',
    label: "Consommable d'exploitation",
    category: 'FRAIS EXPLOITATION / OPERATION',
    hint: 'vaisselle; petit matériel restauration; vaisselle pour la restauration; décoration pour la restauration',
    tags: ['Restauration'],
  },
  {
    code: 'RAFBOUT',
    label: "Consommable d'exploitation",
    category: 'FRAIS EXPLOITATION / OPERATION',
    hint: 'article de boutique',
    tags: ['Revenus annexes'],
  },
  {
    code: 'FENTICoooo',
    label: 'Frais de Licences & logiciels',
    category: 'FRAIS EXPLOITATION / OPERATION',
    hint: 'connexion H&P (pms, 3ds, gds care), olakala, otainsight, channel manager, META, RMS, module pascoworking, backyou, etis, stay in touch, loungeup, lightspeed, skello, social express, ad notam, mon courtier energie',
    tags: ['IT & logiciels', 'Commercial', 'RH'],
  },
  {
    code: 'FELOCMOBoo',
    label: 'Locations mobilières',
    category: 'FRAIS EXPLOITATION / OPERATION',
    hint: 'locations matériels, spectre, copieur, diffuseur parfum, castalie, tragfood/locam, yoghurt kitchen',
    tags: ['Technique', 'Administratif'],
  },
  {
    code: 'FESSTDIVoo',
    label: 'Sous-traitances diverses / Prestataires externes',
    category: 'FRAIS EXPLOITATION / OPERATION',
    hint: 'gardiennage, loomis, classification 4*, déclaration tertiaire; sous traitance ponctuelle diverse',
    tags: ['Prestataires'],
  },
  {
    code: 'FMINFORMoo',
    label: 'Maintenance Informatique',
    category: 'FRAIS EXPLOITATION / OPERATION',
    hint: 'uth, hoist; logiciel informatique',
    tags: ['IT & logiciels', 'Technique'],
  },
  {
    code: 'FMTELWEBoo',
    label: 'Telephone / Internet / VOD',
    category: 'FRAIS EXPLOITATION / OPERATION',
    hint: 'coriolis, free',
    tags: ['IT & logiciels'],
  },
  // Hebergement
  {
    code: 'HEDELOoooo',
    label: 'Délogements',
    category: 'Hebergement',
    hint: 'délogement',
    tags: ['Hébergement'],
  },
  {
    code: 'HELINGEooo',
    label: 'Location / Blanchissage du linge',
    category: 'Hebergement',
    hint: 'location linge',
    tags: ['Hébergement'],
  },
  {
    code: 'HEPDACCooo',
    label: "Produits d'accueil",
    category: 'Hebergement',
    hint: "produits d'accueil",
    tags: ['Hébergement'],
  },
  {
    code: 'HEAPERITIo',
    label: 'Aperitivo',
    category: 'Hebergement',
    hint: 'nourriture et soft apéritivo',
    tags: ['Hébergement', 'Restauration'],
  },
  {
    code: 'HESNACKooo',
    label: 'Snacking',
    category: 'Hebergement',
    hint: 'nourriture et soft snacking',
    tags: ['Hébergement', 'Restauration'],
  },
  {
    code: 'FAPERTECoo',
    label: 'Pertes sur créances irrécouvrables / Dépréciation Client',
    category: 'Hebergement',
    hint: 'chargeback-impayés',
    tags: ['Finance'],
  },
  {
    code: 'HESSTCHBoo',
    label: 'Sous-traitance Nettoyage Chambres + Blanchisserie',
    category: 'Hebergement',
    hint: 'sous traitance nettoyage chambre / lavage couettes, oreillers etc',
    tags: ['Hébergement', 'Prestataires'],
  },
  {
    code: 'HESSTVIToo',
    label: 'Sous-traitance Nettoyage Vitres',
    category: 'Hebergement',
    hint: 'sous traitance nettoyage vitre',
    tags: ['Prestataires'],
  },
  // LOCATION D'ESPACES
  {
    code: 'LOMATERIEL',
    label: 'Fournitures et petits matériels',
    category: "LOCATION D'ESPACES",
    hint: "stock; achat petit matériel pour la location d'espace; vaisselle pour la location salle; décoration pour la location de salle; produits d'accueil pour la location d'espace",
    tags: ['Location', 'Restauration'],
  },
  {
    code: 'LOSSTDIVoo',
    label: 'Sous-traitance diverse',
    category: "LOCATION D'ESPACES",
    hint: "sous traitance pour la location d'espace",
    tags: ['Location', 'Prestataires'],
  },
  // Redevances
  {
    code: 'RDEVMARKoo',
    label: 'Redevance Marketing et Publicité',
    category: 'Redevances',
    hint: 'redevances marque',
    tags: ['Commercial', 'Finance'],
  },
  {
    code: 'RDEVRBOooo',
    label: 'Redevances de gestion (sur RBO)',
    category: 'Redevances',
    hint: 'redevances RBO',
    tags: ['Finance'],
  },
  // RESTAURATION
  {
    code: 'RESSTDIVoo',
    label: 'Sous-traitance diverses',
    category: 'RESTAURATION',
    hint: 'sous traitance (autre que traiteur)',
    tags: ['Restauration', 'Prestataires'],
  },
  {
    code: 'RESSTFBooo',
    label: 'Sous-traitance F&B',
    category: 'RESTAURATION',
    hint: 'traiteur; frais de livraison',
    tags: ['Restauration'],
  },
  {
    code: 'REBEALCOOL',
    label: 'Alcool',
    category: 'RESTAURATION',
    hint: 'achat alcool',
    tags: ['Restauration'],
  },
  {
    code: 'REFOODoooo',
    label: 'Food ALC',
    category: 'RESTAURATION',
    hint: 'nourriture et soft à la carte',
    tags: ['Restauration'],
  },
  {
    code: 'REPDJFBooo',
    label: 'Achats PDJ',
    category: 'RESTAURATION',
    hint: 'nourriture et soft petit dejeuner',
    tags: ['Restauration'],
  },
  // REVENUS ANNEXES
  {
    code: 'RAFBOUTooo',
    label: 'Articles de Boutique',
    category: 'REVENUS ANNEXES',
    hint: 'achats boutiques',
    tags: ['Revenus annexes'],
  },
  {
    code: 'RAFCONGooo',
    label: 'Frais de Conciergerie & Pressing',
    category: 'REVENUS ANNEXES',
    hint: "prestations qu'on refactures aux clients; achats qu'on refacture aux clients",
    tags: ['Revenus annexes', 'Hébergement'],
  },
]

/** Index code → libellé (mémoïsé une fois au chargement du module). */
const LABEL_BY_CODE = new Map(BUDGET_LINES.map((l) => [l.code, l.label]))

/** Libellé d'une ligne budgétaire, ou le code brut si inconnu. */
export function budgetLabel(code: string): string {
  return LABEL_BY_CODE.get(code) ?? code
}

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
  {
    id: 'electricite',
    supplier: 'Électricité',
    code: 'FMELECoooo',
    keywords: ['electricite'],
  },
  {
    id: 'gaz',
    supplier: 'Gaz',
    code: 'FMGAZooooo',
    keywords: ['gaz'],
  },
  {
    id: 'chauffage',
    supplier: 'Chauffage urbain',
    code: 'FMCHAUFFUo',
    keywords: ['chauffage urbain'],
  },
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
    keywords: ['loomis', 'gardiennage'],
  },
  {
    id: 'alcool',
    supplier: 'Alcool',
    code: 'REBEALCOOL',
    keywords: ['alcool'],
  },
  {
    id: 'linge',
    supplier: 'Linge / Blanchissage',
    code: 'HELINGEooo',
    keywords: ['blanchissage', 'location linge'],
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
