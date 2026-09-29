/*
 * Détection d'un mot-clé d'easter egg, PARTOUT (demande utilisateur du
 * 2026-09-29 : « dans tous les champs de saisie, vraiment dans tous les
 * contextes, en respectant la sécurité »). Remplace la garde du 2026-09-28
 * qui ignorait toute frappe faite dans un champ.
 *
 * Deux sources, jamais les deux pour la même frappe :
 *   - hors champ : `keydown` (touche d'une lettre) ;
 *   - dans un champ (input texte, textarea, contenteditable) : `beforeinput`,
 *     c'est-à-dire le TEXTE inséré. C'est la seule source fiable au clavier
 *     virtuel d'un téléphone (Android envoie `key: "Unidentified"`), et elle
 *     voit aussi une lettre accentuée composée.
 *
 * SÉCURITÉ : un champ de mot de passe (type `password`, ou `autocomplete`
 * de mot de passe / code à usage unique — ce qui couvre un mot de passe
 * affiché en clair par l'œil) n'est JAMAIS lu, et sa saisie vide la mémoire.
 * Rien ne quitte le navigateur : seules les N dernières lettres (N = longueur
 * du mot-clé) sont gardées, en mémoire, le temps de la comparaison.
 */

/** Minuscule, sans accent, lettres a-z seulement (« Chloé » → « chloe »). */
export function normaliser(texte: string): string {
  return texte
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z]/g, '')
}

const AUTOCOMPLETE_SECRET =
  /(^|\s)(current-password|new-password|one-time-code)(\s|$)/i

/** Champ dont la saisie ne doit JAMAIS être lue. */
export function estChampSecret(el: Element | null): boolean {
  if (!(el instanceof HTMLInputElement)) return false
  if (el.type === 'password') return true
  return AUTOCOMPLETE_SECRET.test(el.getAttribute('autocomplete') ?? '')
}

const TYPES_TEXTE = new Set(['text', 'search', 'email', 'url', 'tel', ''])

/** Champ où l'on TAPE du texte (sa saisie est lue par `beforeinput`). */
export function estChampTexte(el: Element | null): boolean {
  if (el instanceof HTMLTextAreaElement) return true
  if (el instanceof HTMLInputElement) return TYPES_TEXTE.has(el.type)
  return el instanceof HTMLElement && el.isContentEditable === true
}

/**
 * Mémoire glissante des dernières lettres ; `ajouter` rend `true` quand le
 * mot-clé vient d'être complété (et repart alors de zéro).
 */
export function creerDetecteur(motCle: string) {
  const cible = normaliser(motCle)
  let memoire = ''
  return {
    actif: cible !== '',
    ajouter(texte: string): boolean {
      if (cible === '') return false
      const lettres = normaliser(texte)
      if (lettres === '') return false
      memoire = (memoire + lettres).slice(-cible.length)
      if (memoire !== cible) return false
      memoire = ''
      return true
    },
    vider() {
      memoire = ''
    },
  }
}
