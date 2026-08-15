/*
 * Format d'une imputation = COUPLE (code analytique + compte comptable) — logique PURE
 * (aucun React/DOM/Supabase). SOURCE UNIQUE du rendu du couple partout dans la facturation :
 * chips « déjà utilisé », CodePicker, ImputationList, historique, aperçu et tampon.
 *
 * On sépare la RÈGLE (le compte est-il présent ?) du séparateur d'affichage : `imputationParts`
 * porte la règle, `formatImputation` applique le rendu ÉCRAN (`code · compte`). Le tampon PDF
 * réutilise `imputationParts` pour conserver son propre alignement en colonnes (cf. stampLayout).
 */

export interface ImputationParts {
  code: string
  compte: string
  /** Vrai quand un compte non vide est renseigné pour ce code. */
  hasCompte: boolean
}

/** Décompose un couple en parties normalisées (compte détouré des espaces). */
export function imputationParts(code: string, compte: string): ImputationParts {
  const c = (compte ?? '').trim()
  return { code, compte: c, hasCompte: c.length > 0 }
}

/** Rendu TECHNIQUE homogène du couple : `code · compte` (NUMÉRO), ou `code` seul sans compte.
 *  Pour les surfaces techniques/de repli ; l'écran de travail préfère `formatImputationLabel`. */
export function formatImputation(code: string, compte: string): string {
  const p = imputationParts(code, compte)
  return p.hasCompte ? `${p.code} · ${p.compte}` : p.code
}

/** Rendu ÉCRAN du COMPTE : son NOM humain (via `compteName`, = compteLabel), ou vide si pas de
 *  compte. `compteName` retombe déjà sur le numéro pour un compte hors dictionnaire. */
export function formatCompteLabel(
  compte: string,
  compteName: (compte: string) => string,
): string {
  const c = (compte ?? '').trim()
  return c ? compteName(c) : ''
}

/** Rendu ÉCRAN du couple par le SENS : « poste · nom du compte », poste seul sans compte.
 *  `posteLabel` = budgetLabel(code) ; `compteName` = compteLabel. Aucun numéro affiché. */
export function formatImputationLabel(
  posteLabel: string,
  compte: string,
  compteName: (compte: string) => string,
): string {
  const c = formatCompteLabel(compte, compteName)
  return c ? `${posteLabel} · ${c}` : posteLabel
}

/** Affichage homogène d'une SECTION (famille). Le référentiel mêle des sections tout en
 *  MAJUSCULES et d'autres en Casse de Phrase (AA5) : on ramène les majuscules en casse de
 *  phrase, sans réécrire la donnée. */
export function formatSection(section: string): string {
  const s = (section ?? '').trim()
  if (!s || s !== s.toUpperCase()) return s
  return s.charAt(0) + s.slice(1).toLowerCase()
}
