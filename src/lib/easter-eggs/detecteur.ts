/*
 * Détection des mots-clés d'easter egg, PARTOUT (demande utilisateur du
 * 2026-09-29 : « dans tous les champs de saisie, vraiment dans tous les
 * contextes, en respectant la sécurité »).
 *
 * MOT ENTIER, UNE SEULE MÉMOIRE (refonte du 2026-11-16, signalement
 * utilisateur : « je tape un mot-clé puis un a, ça redéclenche un autre mot »).
 * Avant, chaque mot-clé gardait SES dernières lettres, sans séparateur ni
 * remise à zéro commune : la fin d'un mot-clé plus une lettre en formait un
 * autre, « elle a » contenait un mot-clé de trois lettres, un mot-clé court
 * partait au milieu d'un mot plus long (« lucie » dans « lucien »). Désormais :
 *   - UN détecteur pour tous les mots-clés, une seule mémoire : le mot en
 *     cours de frappe, vidé après chaque déclenchement ;
 *   - un mot-clé ne part que s'il est tapé COMME UN MOT ENTIER : le mot
 *     commence après un séparateur (espace, ponctuation, Entrée, clic) et se
 *     termine par un séparateur ou une courte pause (`DELAI_FIN_DE_MOT_MS`).
 *     Attendre la fin du mot, c'est ce qui permet à « lea » et à un mot-clé
 *     plus long qui commence pareil de vivre ensemble ;
 *   - le tiret fait partie du mot (« pierre-louis »), le chiffre aussi
 *     (« lina2 » n'est pas « lina »).
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
 * Rien ne quitte le navigateur : seul le mot en cours est gardé, borné à la
 * longueur du plus long mot-clé.
 */

/** Minuscule, sans accent, lettres a-z seulement (« Chloé » → « chloe »). */
export function normaliser(texte: string): string {
  return texte
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z]/g, '')
}

/** Pause après la dernière lettre qui vaut fin de mot. */
export const DELAI_FIN_DE_MOT_MS = 700

/** Nombre minimal de lettres d'un mot-clé (un mot plus court part tout seul). */
export const LETTRES_MIN = 3

/** Ce qui lie deux parties d'un même mot sans compter comme une lettre. */
const LIAISON = /[-‐‑]/u
/** Ce qui fait partie d'un mot : lettre (de toute langue) ou chiffre. */
const DANS_UN_MOT = /[\p{L}\p{N}]/u

/** Un caractère qui continue un mot (lettre, chiffre ou tiret). */
export function continueUnMot(c: string | undefined): boolean {
  return c !== undefined && c !== '' && (DANS_UN_MOT.test(c) || LIAISON.test(c))
}

/**
 * Pourquoi ce mot-clé ne peut pas servir, ou `null` s'il convient. `autres` :
 * les mots-clés déjà enregistrés (sans celui qu'on modifie).
 */
export function problemeMotCle(
  motCle: string,
  autres: readonly string[],
): string | null {
  const brut = motCle.trim()
  if ([...brut].some((c) => !continueUnMot(c)))
    return 'Un seul mot, sans espace ni ponctuation (le tiret est permis).'
  const cle = normaliser(brut)
  if (cle.length < LETTRES_MIN)
    return `Au moins ${LETTRES_MIN} lettres, sinon il partirait sans le vouloir.`
  const pareil = autres.find((a) => normaliser(a) === cle)
  if (pareil !== undefined) return `Ce mot existe déjà (${pareil}).`
  return null
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
 * Le mot en cours de frappe, commun à tous les mots-clés.
 *
 * - `ajouter(texte)` : texte tapé ; rend le mot-clé (normalisé) qu'un
 *   séparateur vient de terminer, sinon `null`.
 * - `composer(texte)` : texte en cours de composition au clavier virtuel
 *   (le navigateur renvoie à chaque lettre TOUT le mot composé).
 * - `vide()` : aucun mot commencé.
 * - `enAttente()` : le mot en cours EST un mot-clé, il n'attend que sa fin
 *   (séparateur ou pause).
 * - `finirMot()` : fin de mot sans caractère (pause, Entrée, clic) ; rend le
 *   mot-clé terminé, sinon `null`.
 * - `marquerColle()` : le mot touche des lettres déjà présentes dans le champ
 *   (frappe au milieu d'un mot) : il ne peut plus être un mot entier.
 * - `vider()` : oubli du mot (effacement, collage, mot de passe…).
 */
export function creerDetecteur(motsCles: readonly string[]) {
  const cibles = new Set(
    motsCles.map(normaliser).filter((m) => m.length >= LETTRES_MIN),
  )
  const longueurMax = Math.max(0, ...[...cibles].map((m) => m.length))
  let mot = ''
  let colle = false
  // Mot tel qu'il était au début de la composition en cours (clavier virtuel).
  let avantComposition: { mot: string; colle: boolean } | null = null

  function oublier() {
    mot = ''
    colle = false
  }

  function finir(): string | null {
    const trouve = !colle && cibles.has(mot) ? mot : null
    oublier()
    return trouve
  }

  function lire(texte: string): string | null {
    let trouve: string | null = null
    for (const c of texte) {
      if (LIAISON.test(c)) continue
      if (!DANS_UN_MOT.test(c)) {
        trouve = finir() ?? trouve
        continue
      }
      const lettres = normaliser(c)
      // Chiffre, ou lettre qui n'a pas d'équivalent a-z : le mot continue,
      // mais ce n'est plus un mot-clé.
      if (lettres === '') colle = true
      else if (!colle) mot += lettres
      if (mot.length > longueurMax) {
        mot = ''
        colle = true
      }
    }
    return trouve
  }

  return {
    actif: cibles.size > 0,
    ajouter(texte: string): string | null {
      avantComposition = null
      return lire(texte)
    },
    composer(texte: string): string | null {
      if (avantComposition === null) avantComposition = { mot, colle }
      mot = avantComposition.mot
      colle = avantComposition.colle
      return lire(texte)
    },
    /** Aucun mot commencé : la prochaine lettre ouvre un mot. */
    vide(): boolean {
      return mot === '' && !colle
    },
    enAttente(): boolean {
      return !colle && cibles.has(mot)
    },
    finirMot(): string | null {
      avantComposition = null
      return finir()
    },
    marquerColle() {
      colle = true
      mot = ''
    },
    vider() {
      avantComposition = null
      oublier()
    },
  }
}

export type Detecteur = ReturnType<typeof creerDetecteur>
