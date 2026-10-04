/*
 * Demandes toutes prêtes pour un LLM (étape 3 du plan
 * `classeur-fonctions-2026-10-04`). À l'export JSON d'un chapitre ou d'un
 * document, l'utilisateur coche ce qu'il attend du LLM au lieu de le rédiger.
 * Les demandes cochées deviennent `_metadata.demande` (dans le fichier) ET le
 * début du texte copié.
 *
 * Décisions : D25 = A (seulement dans le dialogue chapitre / document),
 * D26 = non (rien n'est mémorisé : poste partagé).
 *
 * Ordre du texte = ordre de `DEMANDES_LLM`, quel que soit l'ordre de cochage.
 * Les `id` sont stables (ils servent de clés à l'écran et dans les tests).
 */

export interface DemandeLlm {
  /** Identifiant stable, jamais renommé. */
  id: string
  /** Libellé court de la case. */
  libelle: string
  /** Précision affichée sous la case (ou en info-bulle). */
  aide: string
  /** Consigne complète envoyée au LLM. */
  consigne: string
}

export const DEMANDES_LLM: readonly DemandeLlm[] = [
  {
    id: 'corriger',
    libelle: 'Corriger',
    aide: "L'orthographe et la grammaire, sans changer le sens.",
    consigne:
      "Corrige l'orthographe, la grammaire, la ponctuation et les accents. Ne change ni le sens, ni la structure, ni l'ordre des paragraphes, ni la mise en forme.",
  },
  {
    id: 'etapes',
    libelle: 'Mettre en étapes',
    aide: 'Une action par étape numérotée.',
    consigne:
      "Mets les consignes sous forme d'étapes numérotées (`1. `, `2. `…) : une seule action par étape, verbe à l'infinitif en tête (« Vérifier… », « Appeler… »). Garde les titres, les encadrés et les images à leur place.",
  },
  {
    id: 'raccourcir',
    libelle: 'Raccourcir',
    aide: 'Phrases courtes, sans redites.',
    consigne:
      'Raccourcis le texte : phrases courtes, supprime les redites et les formules inutiles. Garde TOUTES les consignes, tous les chiffres (horaires, codes, numéros, températures) et toutes les images.',
  },
  {
    id: 'photos',
    libelle: 'Prévoir les photos',
    aide: 'Des emplacements « Image à insérer » là où une photo aide.',
    consigne:
      "Là où une photo aiderait le lecteur (un appareil, un bouton, un écran, un endroit), ajoute un emplacement d'image seul sur sa ligne : `![ce que la photo doit montrer](a-inserer)`, en décrivant précisément la prise de vue. N'invente jamais de chemin d'image ; ne retire aucune image existante.",
  },
  {
    id: 'avertissements',
    libelle: 'Ajouter les avertissements',
    aide: 'Encadrés « Attention » avant les gestes à risque.',
    consigne:
      "Avant chaque geste à risque (électricité, eau chaude, produit chimique, sécurité des personnes, argent), ajoute un encadré d'avertissement : une ligne `> [!WARNING]` puis le texte de l'avertissement sur des lignes commençant par `> `. Réserve-le aux vrais dangers ; n'en ajoute pas ailleurs.",
  },
  {
    id: 'traduire',
    libelle: 'Traduire en anglais',
    aide: 'Titres, descriptions et textes.',
    consigne:
      'Traduis en anglais les titres (`title`, `label`), les descriptions et les textes (`content`), légendes d\'images comprises. Ne traduis pas et ne modifie pas : les `uuid`, les `kind`, les chemins d\'images (entre parenthèses), les mots `a-inserer`, `"petite"`, `"moyenne"`, `"grande"`, `"pleine"`, `"entiere"`, `cadre=…`, les lignes `:::photos`, `:::etape`, `:::etape{photo=gauche}` et `:::`, les types d\'encadré (`[!WARNING]`…) ni les lignes `===`.',
  },
  {
    id: 'forme',
    libelle: 'Mettre en forme seulement',
    aide: 'Titres, listes, encadrés ; le texte ne change pas.',
    consigne:
      'Améliore seulement la mise en forme : titres, listes, tableaux, encadrés, lignes vides entre les paragraphes. Ne change AUCUN mot du texte (ni ajout, ni suppression, ni reformulation).',
  },
]

/** Demandes qui changent beaucoup de mots : une version MAJEURE à l'import. */
export const DEMANDES_MAJEURES: readonly string[] = ['traduire', 'raccourcir']

/**
 * Texte de la demande : une ligne par demande cochée (ordre de la liste,
 * chacune une seule fois, identifiants inconnus ignorés), puis le champ libre
 * recopié tel quel (bords seulement retirés), s'il n'est pas vide. `null` si
 * rien n'est demandé.
 */
export function composerDemande(
  ids: Iterable<string>,
  libre: string,
): string | null {
  const coches = new Set(ids)
  const lignes = DEMANDES_LLM.filter((d) => coches.has(d.id)).map(
    (d) => `- ${d.consigne}`,
  )
  const autre = libre.trim()
  if (autre !== '') lignes.push(`- ${autre}`)
  return lignes.length === 0 ? null : lignes.join('\n')
}

/**
 * Texte placé dans le presse-papiers : la demande en tête (« Demande : » puis
 * une ligne vide) s'il y en a une, puis le JSON. Sans demande : le JSON seul,
 * à l'identique.
 */
export function texteACopier(json: string, demande: string | null): string {
  return demande === null ? json : `Demande :\n${demande}\n\n${json}`
}

/** Vrai si l'une des demandes cochées produira une version majeure. */
export function demandeMajeure(ids: Iterable<string>): boolean {
  for (const id of ids) if (DEMANDES_MAJEURES.includes(id)) return true
  return false
}
