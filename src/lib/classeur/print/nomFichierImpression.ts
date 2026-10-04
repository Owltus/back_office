/*
 * Nom du fichier proposé par « Enregistrer au format PDF » (étape 9 du plan
 * `classeur-fonctions-2026-10-04`, décision D19 = A).
 *
 * Le navigateur propose comme nom de fichier le `<title>` du document
 * imprimé. Sans lui, l'utilisateur obtenait le titre de l'application pour
 * chaque impression. On pose donc « Classeur - Titre », nettoyé pour être
 * un nom de fichier valable sous Windows comme sous macOS :
 *
 * - `\ / : * ? " < > |` deviennent un tiret (« 04/10/2026 » → « 04-10-2026 ») ;
 * - caractères de contrôle et caractères invisibles de direction (qui
 *   permettent de maquiller une extension) retirés ;
 * - espaces fusionnés, tirets répétés fusionnés ;
 * - ni point, ni espace, ni tiret en tête ou en fin (Windows refuse un nom
 *   fini par un point ou une espace ; un point en tête cache le fichier
 *   sous macOS) ;
 * - longueur bornée à `LONGUEUR_MAX` caractères (sans couper un émoji) ;
 * - jamais vide : repli « Classeur ».
 *
 * PURE : aucune dépendance au DOM.
 */

export const LONGUEUR_MAX = 120
export const NOM_REPLI = 'Classeur'

/** Interdits dans un nom de fichier Windows ou macOS. */
const INTERDITS = /[\\/:*?"<>|]/g
/** Contrôles C0, DEL, C1. */
// eslint-disable-next-line no-control-regex
const CONTROLES = /[\u0000-\u001f\u007f-\u009f]/g
/** Largeur nulle et contrôles de direction (U+202E maquille une extension). */
const INVISIBLES = /[​-‏‪-‮⁠-⁩﻿]/g
/** Noms réservés par Windows (un fichier « CON.pdf » est refusé). */
const RESERVES = /^(con|prn|aux|nul|com\d|lpt\d)$/i
/** Ce qui ne doit ni commencer ni finir un nom. */
const BORDS = /^[\s.-]+|[\s.-]+$/g

function bornes(texte: string): string {
  return texte.replace(BORDS, '')
}

/**
 * Nettoie UN texte pour qu'il puisse servir de nom de fichier. Peut rendre
 * une chaîne vide (texte fait seulement de caractères retirés).
 */
export function nettoyerNomFichier(texte: string): string {
  let t = texte
    .replace(/\s+/g, ' ')
    .replace(CONTROLES, '')
    .replace(INVISIBLES, '')
    .replace(INTERDITS, '-')
    .replace(/\s+/g, ' ')
    .replace(/-+/g, '-')
    .replace(/(\s*-\s*){2,}/g, ' - ')
  t = bornes(t)
  const caracteres = Array.from(t)
  if (caracteres.length > LONGUEUR_MAX) {
    t = bornes(caracteres.slice(0, LONGUEUR_MAX).join(''))
  }
  return t
}

/**
 * Nom proposé pour le PDF : « Classeur - Titre ». Le titre seul si le
 * classeur manque ou s'il porte le même nom ; le classeur seul si le titre
 * manque ; « Classeur » si rien n'est utilisable.
 */
export function nomFichierImpression({
  classeur,
  titre,
}: {
  classeur?: string | null
  titre?: string | null
}): string {
  const c = nettoyerNomFichier(classeur ?? '')
  const t = nettoyerNomFichier(titre ?? '')
  let nom: string
  if (c && t && c.toLowerCase() !== t.toLowerCase()) nom = `${c} - ${t}`
  else nom = c || t
  nom = nettoyerNomFichier(nom)
  if (!nom) return NOM_REPLI
  if (RESERVES.test(nom)) return `${NOM_REPLI} - ${nom}`
  return nom
}
