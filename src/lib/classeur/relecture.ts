/*
 * Alertes de relecture d'un document — amélioration n° 18 de
 * `plan/classeur-editeur-ameliorations`. De simples AVERTISSEMENTS, jamais
 * un blocage de la sauvegarde. Chaque alerte porte sa ligne (1 = première)
 * pour que l'éditeur y amène le curseur.
 *
 * Ce qui est signalé, parce que la page imprimée en souffrirait :
 *   - une image du classeur qui n'existe plus (« Image indisponible ») ;
 *   - un lien sans adresse (`[texte]()` ou `[texte](https://)`) ;
 *   - un tableau dont une ligne n'a pas le nombre de cases de l'en-tête
 *     (des cases EN TROP disparaissent de la page), ou un tableau sans sa
 *     ligne de séparation `| --- |` (rendu comme du texte) ;
 *   - un titre qui saute un niveau (un sous-titre juste après un grand
 *     titre, sans titre de partie entre les deux).
 *
 * 2026-10-01 (plan `classeur-images-blocs`), pour GUIDER vers une page
 * propre plutôt que d'interdire :
 *   - une capture trop large pour être lue imprimée, une image très haute,
 *     un bandeau très fin (dimensions de la médiathèque) ;
 *   - les images sans légende, en UNE alerte par document ;
 *   - un bloc `:::photos` / `:::etape` mal écrit (espace après `:::`, nom
 *     inconnu, jamais fermé), du texte rangé dans une planche ;
 *   - une page remplie à moins de la moitié parce qu'un saut `===` l'a
 *     terminée (remplissage remonté par la pagination).
 *
 * Et l'ÉCRITURE (même jour, décision utilisateur) : une ligne en gras qui
 * joue le titre (elle peut rester seule en bas de page, un vrai titre non),
 * une étape de liste de plus de 35 mots (une action par étape), un émoji
 * (mal imprimé en noir et blanc), une case de tableau « null ».
 *
 * Et le « QUATRIÈME MUR » (plan `classeur-echange-ia-2026-10-19`, étape 7,
 * D9) : une phrase sur l'IA ou sur le texte lui-même (« généré par IA »,
 * « en tant qu'IA », « je peux me tromper », « vérifiez ce texte »,
 * « brouillon généré »…) serait imprimée telle quelle dans un registre.
 * Liste FERMÉE (`EXPRESSIONS_IA`), insensible à la casse et aux accents,
 * établie sur le contenu réel des classeurs (aucune alerte sur l'existant) :
 * « à vérifier » SEUL est légitime dans une procédure de contrôle, il n'est
 * jamais visé. Alerte non bloquante, à l'import comme dans l'éditeur.
 *
 * Le contenu des blocs de code (```) est ignoré.
 */

import {
  IMAGE_A_INSERER,
  ajustementDepuisTitre,
  cadreDepuisTitre,
  estCheminImage,
  estImageAInserer,
  jetonImage,
  tailleDepuisTitre,
} from '#/lib/classeur/images.ts'
import { estLegendeGenerique } from '#/lib/classeur/legende.ts'
import { boiteSurPage, estPhoto } from '#/lib/classeur/miseEnPageImage.ts'
import { BLOCS } from '#/lib/classeur/print/remarkBlocs.ts'
import { RE_SEPARATEUR, decouperLigne } from '#/lib/classeur/tableauMarkdown.ts'

export interface Alerte {
  /** Ligne concernée, 1 = première ligne du texte. */
  ligne: number
  message: string
  /**
   * Alerte sur le TITRE ou la DESCRIPTION (pas sur une ligne du texte) :
   * l'interface l'affiche sous ce nom au lieu de « Ligne N ».
   */
  champ?: 'titre' | 'description'
  /**
   * Alerte tirée de la MÉDIATHÈQUE (image introuvable, trop large, trop
   * haute, bandeau) : jamais émise tant qu'elle n'est pas chargée.
   */
  image?: true
  /**
   * Correction MÉCANIQUE (2026-10-24, demande utilisateur : « si elle sait
   * reconnaître un souci, elle peut sûrement le corriger ») : posée
   * seulement quand il n'y a qu'une bonne réponse. Ce qui demande de
   * comprendre le sens (étape longue, légende, recadrage) n'en a pas.
   */
  correction?: Correction
}

/**
 * Remplacement de lignes ENTIÈRES du texte relu. `avant` sert de garde : si
 * le texte a changé depuis la relecture, la correction est ignorée.
 */
export interface Correction {
  /** Ce que fait le bouton, en clair (« En faire un titre »). */
  libelle: string
  /** Première ligne remplacée (1 = première). */
  debut: number
  /** Lignes remplacées, telles qu'à la relecture. */
  avant: readonly string[]
  /** Lignes qui les remplacent (vide = lignes retirées). */
  apres: readonly string[]
}

/**
 * Applique des corrections au texte, de la DERNIÈRE à la première (les
 * numéros de ligne restent justes). Une correction caduque (texte changé
 * depuis) ou qui chevauche une correction déjà appliquée est sautée : la
 * relecture suivante la reproposera.
 */
export function appliquerCorrections(
  markdown: string,
  corrections: readonly Correction[],
): string {
  const lignes = markdown.split('\n')
  let borne = Number.POSITIVE_INFINITY
  const triees = [...corrections].sort((a, b) => b.debut - a.debut)
  for (const c of triees) {
    const i = c.debut - 1
    const fin = i + c.avant.length
    if (fin > borne || i < 0 || fin > lignes.length) continue
    if (c.avant.some((l, k) => lignes[i + k] !== l)) continue
    lignes.splice(i, c.avant.length, ...c.apres)
    borne = i
  }
  return lignes.join('\n')
}

/** Nom de bloc reconnu malgré une faute (« photo », « étapes »), sinon null. */
function blocVoisin(nom: string): string | null {
  const n = nom
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/s$/, '')
  if (n === 'photo') return 'photos'
  if (n === 'etape') return 'etape'
  return null
}

/** Une ligne de tableau réécrite à partir de ses cases. */
function ligneTableau(cases: readonly string[]): string {
  return `| ${cases.map((c) => c.replace(/\|/g, '\\|')).join(' | ')} |`
}

/**
 * Où la relecture est faite. `editeur` (défaut) : le document ouvert.
 * `import` : la réponse d'un LLM avant import (étape 2 du plan
 * `classeur-fonctions-2026-10-04`) — toute image absente de la médiathèque
 * y est signalée, même un chemin mal formé, parce que le LLM l'a inventée.
 */
export type ContexteRelecture = 'editeur' | 'import'

/** Ce que la relecture sait d'une image de la médiathèque. */
export interface InfoImage {
  largeur: number
  hauteur: number
  /** Nom dans la médiathèque (souvent le nom du fichier d'origine). */
  nom: string
}

/** Ce que la relecture sait d'une page paginée. */
export interface InfoPage {
  remplissage?: number
  saut?: number
  /** Ligne SOURCE du premier bloc de la page suivante (cause d'un vide). */
  suivante?: number
  /** Lignes SOURCE des schémas DÉCOUPÉS présents sur la page. */
  schemas?: number[]
}

/** Sous ce remplissage, une page (non finale, sans `===`) est signalée. */
const REMPLISSAGE_MIN = 0.6

/** Une étape de plus de ce nombre de mots est signalée (une action par étape). */
// Miroir dans `merge/consignes.ts` (RÈGLES D'ÉCRITURE) : le LLM suit la même règle.
const MOTS_PAR_ETAPE = 35

/** Pictogrammes et émojis (pas les flèches ni les signes typographiques). */
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2B55}]/u

/** Moitié de la hauteur utile d'une page de document, en mm. */
const DEMI_PAGE_MM = 115

const NOM_NIVEAU: Record<number, string> = {
  1: 'grand titre',
  2: 'titre de partie',
  3: 'sous-titre',
}

function nomNiveau(n: number): string {
  return NOM_NIVEAU[n] ?? `titre de niveau ${String(n)}`
}

// ---------------------------------------------------------------------------
// Quatrième mur : phrases sur l'IA ou sur le texte lui-même (étape 7)
// ---------------------------------------------------------------------------

/** Message unique d'une phrase sur l'IA (décision D9 : jamais bloquant). */
export const MESSAGE_IA =
  'Phrase sur le LLM dans le texte. Elle serait imprimée.'

/**
 * Minuscules, SANS ACCENTS, apostrophes droites, emphase Markdown retirée,
 * espaces simples : « Généré par **l’IA** » devient « genere par l'ia ».
 */
export function normaliserPhrase(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc`\u00b4]/g, "'")
    .replace(/[*_~]/g, '')
    .replace(/\s+/g, ' ')
}

/** Une IA nommée, après « généré par » (le verbe le dit déjà). */
const IA_LARGE =
  "(?:une |un |l'|le |la )?(?:ia|i\\.a\\.|intelligence artificielle|chat ?gpt|gpt(?:-?\\d+)?|llm|modele de langage|modele d'ia|claude|gemini|copilot|mistral)"
/** Après « rédigé par » : jamais un prénom (Claude) ni « l'assistant ». */
const IA_STRICTE =
  "(?:une |un |l'|le |la )?(?:ia|i\\.a\\.|intelligence artificielle|chat ?gpt|gpt(?:-?\\d+)?|llm|modele de langage|modele d'ia)"

/**
 * Liste FERMÉE, sur le texte NORMALISÉ (`normaliserPhrase`). Chaque entrée
 * vise l'IA ou le texte lui-même, jamais un geste de contrôle : ni « à
 * vérifier », ni « vérifier le contenu » (du coffre…), ni « en tant
 * qu'assistant » (de direction), ni « généré automatiquement » (le rapport
 * de nuit), ni « je peux vous proposer » (script de réception).
 */
export const EXPRESSIONS_IA: readonly string[] = [
  `genere(?:e|s|es)? (?:par|avec|grace a) ${IA_LARGE}`,
  `(?:redige|ecrit|cree|produit|traduit|reformule|resume)(?:e|s|es)? (?:par|avec|grace a) ${IA_STRICTE}`,
  '(?:contenu|texte|brouillon|resume|reponse)s? genere(?:e|s|es)?',
  "en tant qu'(?:ia|intelligence artificielle|assistant (?:virtuel|ia|numerique))",
  "en tant que (?:llm|modele de langage|modele d'ia|intelligence artificielle)",
  'je suis (?:une ia|un llm|une intelligence artificielle|un assistant (?:virtuel|ia|numerique)|un modele de langage)',
  'modele de langage',
  'je (?:peux|pourrais|suis susceptible de) (?:me tromper|faire des erreurs|commettre des erreurs)',
  '(?:ce|le|cette) (?:texte|contenu|resume|reponse|brouillon|document) (?:peut|pourrait) contenir des (?:erreurs|inexactitudes|approximations|imprecisions)',
  'contenir des inexactitudes',
  '(?:verifiez|verifier|relisez|relire) (?:ce|cette) (?:texte|contenu|brouillon|resume|proposition|reponse)',
  "(?:verifie|relu|valide|controle|verification|relecture|validation)(?:e|s|es)? (?:par un |d'un )?(?:etre )?humain(?:e|s)?",
  '(?:verification|relecture|validation) humaine',
  '(?:est|ceci est) un brouillon',
  'brouillon (?:genere|ia|llm|automatique|a verifier|a relire|a valider)',
  '[\\[(]brouillon[\\])]',
  'a (?:verifier|relire|valider) avant (?:impression|publication|diffusion)',
  'selon mes (?:connaissances|informations)',
  'date (?:de coupure|limite) de (?:mes )?connaissances',
  "j'ai (?:genere|reformule|restructure|reorganise|resume)",
  "(?:note|remarque|avertissement) (?:de l'ia|du llm|de l'assistant ia|du modele)",
  '(?:texte|contenu|informations?) non verifiee?s?',
  'as an ai',
  'as an llm',
  'ai[- ]generated',
  'generated (?:by|with) (?:an )?ai',
  'language model',
  'i (?:may|might|could) be wrong',
]

const RE_IA = new RegExp(
  `(?<![a-z0-9])(?:${EXPRESSIONS_IA.join('|')})(?![a-z0-9])`,
)

/** Une phrase sur l'IA ou sur le texte lui-même dans `texte` ? */
export function contientPhraseIa(texte: string): boolean {
  return RE_IA.test(normaliserPhrase(texte))
}

/**
 * Alertes du quatrième mur sur le titre et la description d'un élément
 * (toutes natures, chapitres compris).
 */
export function alertesChampsIa(champs: {
  title: string
  description?: string
}): Alerte[] {
  const alertes: Alerte[] = []
  if (contientPhraseIa(champs.title))
    alertes.push({ ligne: 1, champ: 'titre', message: MESSAGE_IA })
  if (champs.description !== undefined && contientPhraseIa(champs.description))
    alertes.push({ ligne: 1, champ: 'description', message: MESSAGE_IA })
  return alertes
}

function extrait(s: string, max = 40): string {
  const t = s.trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

/**
 * @param imagesConnues images du classeur par chemin (en minuscules), ou
 *   `null` tant que la médiathèque n'est pas chargée (contrôles sautés).
 * @param pages pages paginées de l'aperçu (remplissage, sauts), facultatif ;
 *   `null` = pas de pagination (alertes de page non produites).
 * @param contexte voir `ContexteRelecture`.
 */
export function alertesRelecture(
  markdown: string,
  imagesConnues: ReadonlyMap<string, InfoImage> | null,
  pagesOuNull: readonly InfoPage[] | null = [],
  contexte: ContexteRelecture = 'editeur',
): Alerte[] {
  const pages = pagesOuNull ?? []
  const lignes = markdown.split('\n')
  const alertes: Alerte[] = []
  let dansCode = false
  let niveauPrecedent = 0
  // Niveau du titre précédent UNE FOIS CORRIGÉ (titre sauté ramené) : une
  // ligne en gras devient un titre juste en dessous, même corrigée d'un coup.
  let niveauCorrige = 0
  const pile: { nom: string; ligne: number }[] = []
  const sansLegende: number[] = []
  const aInserer: number[] = []

  // Lignes hors blocs de code (les autres sont masquées par '').
  const utiles = lignes.map((l) => {
    if (/^\s*(```|~~~)/.test(l)) {
      dansCode = !dansCode
      return ''
    }
    return dansCode ? '' : l
  })

  /** Correction qui remplace la ligne `ligne` (1 = première). */
  const remplacer = (
    ligne: number,
    libelle: string,
    apres: readonly string[],
  ): Correction => ({
    libelle,
    debut: ligne,
    avant: [lignes[ligne - 1]],
    apres,
  })

  utiles.forEach((l, i) => {
    const ligne = i + 1

    // Blocs `:::` : ouverture, fermeture, fautes de frappe.
    const directive = /^\s*(:{3,})([^\s{[]*)/.exec(l)
    if (directive) {
      const nom = directive[2]
      if (nom === '') {
        if (/^\s*:{3,}\s*$/.test(l)) {
          if (pile.length > 0) pile.pop()
        } else {
          const colle = l.replace(/^(\s*:{3,})\s+/, '$1')
          const nomColle = /^\s*:{3,}([^\s{[]*)/.exec(colle)?.[1] ?? ''
          const voisin = blocVoisin(nomColle)
          alertes.push({
            ligne,
            message: `Bloc mal écrit : « ${extrait(l)} ». Écrivez « :::photos » ou « :::etape » sans espace après les deux-points.`,
            ...(voisin !== null && {
              correction: remplacer(ligne, "Retirer l'espace", [
                colle.replace(/^(\s*:{3,})[^\s{[]*/, `$1${voisin}`),
              ]),
            }),
          })
        }
      } else if ((BLOCS as readonly string[]).includes(nom)) {
        pile.push({ nom, ligne })
      } else {
        const voisin = blocVoisin(nom)
        alertes.push({
          ligne,
          message: `Bloc inconnu « :::${extrait(nom, 20)} » : seuls « :::photos » et « :::etape » existent, cette ligne sera imprimée telle quelle.`,
          ...(voisin !== null && {
            correction: remplacer(ligne, `Écrire :::${voisin}`, [
              l.replace(/^(\s*:{3,})[^\s{[]*/, `$1${voisin}`),
            ]),
          }),
        })
      }
      return
    }
    const bloc = pile.length > 0 ? pile[pile.length - 1].nom : null

    // Images : introuvables, trop larges, trop hautes, bandeaux, légendes.
    const jetons = Array.from(
      l.matchAll(/!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"([^"]*)")?\s*\)/g),
    )
    for (const m of jetons) {
      const [, alt, src, titre] = m
      if (estImageAInserer(src)) {
        aInserer.push(ligne)
        continue
      }
      if (estLegendeGenerique(alt)) sansLegende.push(ligne)
      if (!imagesConnues) continue
      // Dans l'éditeur, un chemin qui n'est pas du classeur est laissé à
      // l'encart du rendu ; dans un import, le LLM l'a inventé.
      if (contexte === 'editeur' && !estCheminImage(src)) continue
      const info = imagesConnues.get(src.toLowerCase())
      if (!info) {
        alertes.push({
          ligne,
          correction: remplacer(ligne, 'Mettre un emplacement à remplir', [
            lignes[i].replace(
              m[0],
              jetonImage(
                alt,
                IMAGE_A_INSERER,
                tailleDepuisTitre(titre),
                null,
                ajustementDepuisTitre(titre),
              ),
            ),
          ]),
          message:
            contexte === 'import'
              ? `Image introuvable dans la médiathèque : ${extrait(src)} (inventée par le LLM ?).`
              : 'Image introuvable : elle a été supprimée de la médiathèque.',
          image: true,
        })
        continue
      }
      // Dans une planche ou une étape, le cadre est imposé : rien à régler.
      if (bloc !== null) continue
      const photo = estPhoto(info.nom)
      // La zone CADRÉE (le fichier reste entier, 2026-10-01).
      const cadre = cadreDepuisTitre(titre)
      const largeur = cadre
        ? (info.largeur * cadre.largeur) / 100
        : info.largeur
      const hauteur = cadre
        ? (info.hauteur * cadre.hauteur) / 100
        : info.hauteur
      const boite = boiteSurPage(largeur, hauteur, tailleDepuisTitre(titre), {
        photo,
      })
      const ratio = largeur / Math.max(1, hauteur)
      if (largeur > 1100 && !photo) {
        alertes.push({
          ligne,
          image: true,
          message:
            contexte === 'import'
              ? "Capture très large : une fois imprimé, son texte sera trop petit pour être lu. Après l'import, recadrez-la dans l'éditeur sur la partie utile."
              : "Capture très large : une fois imprimé, son texte sera trop petit pour être lu. Cliquez sur l'image dans l'aperçu et recadrez sur la partie utile.",
        })
      } else if (ratio > 6 && boite.hauteur < 15) {
        alertes.push({
          ligne,
          image: true,
          message:
            contexte === 'import'
              ? "Bandeau très fin : après l'import, recadrez-le dans l'éditeur sur l'élément utile (un bouton, une case)."
              : "Bandeau très fin : cliquez sur l'image dans l'aperçu et recadrez sur l'élément utile (un bouton, une case).",
        })
      }
      if (boite.hauteur > DEMI_PAGE_MM) {
        const imposee = tailleDepuisTitre(titre) !== 'auto'
        alertes.push({
          ligne,
          image: true,
          ...(imposee && {
            correction: remplacer(ligne, 'Taille automatique', [
              lignes[i].replace(
                m[0],
                jetonImage(
                  alt,
                  src,
                  'auto',
                  cadreDepuisTitre(titre),
                  ajustementDepuisTitre(titre),
                ),
              ),
            ]),
          }),
          message:
            tailleDepuisTitre(titre) === 'auto'
              ? `Capture très haute (environ ${String(Math.round(boite.hauteur / 10))} cm, plus d'une demi-page) : ${contexte === 'import' ? "après l'import, recadrez-la dans l'éditeur sur la partie utile." : "cliquez dessus dans l'aperçu et recadrez sur la partie utile."}`
              : `Image très haute (environ ${String(Math.round(boite.hauteur / 10))} cm, plus d'une demi-page) : choisissez la taille Automatique ou recadrez-la.`,
        })
      }
    }

    // Du texte rangé dans une planche : une rangée entière à lui seul.
    if (bloc === 'photos' && jetons.length === 0 && l.trim() !== '') {
      const ouverture = pile[pile.length - 1].ligne
      alertes.push({
        ligne,
        correction: {
          libelle: 'Le mettre au-dessus',
          debut: ouverture,
          avant: lignes.slice(ouverture - 1, ligne),
          apres: [lignes[i], '', ...lignes.slice(ouverture - 1, ligne - 1)],
        },
        message:
          'Planche de photos : ce texte occupera une rangée entière. Placez-le plutôt au-dessus de la planche, ou en légende d’une photo.',
      })
    }

    // Ligne en gras seule qui joue le titre (une phrase d'introduction
    // finie par « : » n'en est pas un).
    const faux = /^\s*(\*\*|__)([^*_]{1,80})\1\s*$/.exec(l)
    if (faux && !faux[2].trim().endsWith(':')) {
      const niveau = Math.min(6, Math.max(2, niveauCorrige + 1))
      alertes.push({
        ligne,
        ...(bloc === null && {
          correction: remplacer(ligne, 'En faire un titre', [
            `${'#'.repeat(niveau)} ${faux[2].trim()}`,
          ]),
        }),
        message: `Ligne en gras utilisée comme titre : « ${extrait(faux[2])} ». Utilisez le bouton Sous-titre : un vrai titre ne reste jamais seul en bas de page.`,
      })
    }

    // Étape trop longue.
    const etape = /^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?(.*)$/.exec(l)
    if (etape) {
      const mots = etape[1]
        .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
        .split(/\s+/)
        .filter((m) => /[\p{L}\p{N}]/u.test(m)).length
      if (mots > MOTS_PAR_ETAPE) {
        alertes.push({
          ligne,
          message: `Étape longue (${String(mots)} mots) : découpez-la en étapes plus courtes, une action par étape.`,
        })
      }
    }

    // Quatrième mur : la ligne seule, ou avec la suivante (une phrase
    // coupée par un retour simple reste UN paragraphe une fois imprimée).
    const suivante = utiles.at(i + 1) ?? ''
    if (
      contientPhraseIa(l) ||
      (l.trim() !== '' &&
        suivante.trim() !== '' &&
        !contientPhraseIa(suivante) &&
        contientPhraseIa(`${l} ${suivante}`))
    ) {
      alertes.push({ ligne, message: MESSAGE_IA })
    }

    // Émojis.
    if (EMOJI.test(l)) {
      const sans = lignes[i]
        .replace(
          /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2B55}][\u{FE0F}\u{200D}]*\s?/gu,
          '',
        )
        .replace(/(\S) {2,}/g, '$1 ')
      alertes.push({
        ligne,
        correction: remplacer(ligne, "Retirer l'émoji", [sans]),
        message:
          "Émoji : il s'imprime mal en noir et blanc. Remplacez-le par un mot, ou par un encadré Attention, Important ou Astuce.",
      })
    }

    // Liens sans adresse (pas les images).
    for (const m of l.matchAll(/(!?)\[([^\]]*)\]\(\s*(https?:\/\/)?\s*\)/g)) {
      if (m[1] === '!') continue
      alertes.push({
        ligne,
        correction: remplacer(ligne, 'Garder le texte seul', [
          lignes[i].replace(m[0], m[2]),
        ]),
        message: `Lien sans adresse : « ${extrait(m[2] || 'lien')} ».`,
      })
    }

    // Titres qui sautent un niveau.
    const titre = /^(#{1,6})\s+(\S.*)$/.exec(l)
    if (titre) {
      const niveau = titre[1].length
      if (niveauPrecedent > 0 && niveau > niveauPrecedent + 1) {
        alertes.push({
          ligne,
          correction: remplacer(ligne, 'Corriger le niveau', [
            `${'#'.repeat(niveauPrecedent + 1)} ${titre[2]}`,
          ]),
          message: `Titre sauté : « ${extrait(titre[2])} » est un ${nomNiveau(niveau)} placé après un ${nomNiveau(niveauPrecedent)}.`,
        })
      }
      niveauCorrige =
        niveauPrecedent > 0 && niveau > niveauCorrige + 1
          ? niveauCorrige + 1
          : niveau
      niveauPrecedent = niveau
    }
  })

  // Blocs jamais fermés.
  for (const b of pile) {
    alertes.push({
      ligne: b.ligne,
      message: `Bloc « :::${b.nom} » jamais fermé : ajoutez une ligne « ::: » à sa fin, sinon tout ce qui suit y sera rangé.`,
    })
  }

  // Emplacements d'image encore vides : UNE alerte, sur le premier.
  if (aInserer.length > 0) {
    const n = aInserer.length
    alertes.push({
      ligne: aInserer[0],
      message: `${String(n)} ${n > 1 ? "emplacements d'image à remplir" : "emplacement d'image à remplir"} : ${contexte === 'import' ? "après l'import, ouvrez le document et cliquez sur chaque cadre gris pour y mettre la photo." : "cliquez sur le cadre gris dans l'aperçu pour y mettre la photo."}`,
    })
  }

  // Images sans légende : UNE alerte, sur la première.
  if (sansLegende.length > 0) {
    const n = sansLegende.length
    alertes.push({
      ligne: sansLegende[0],
      message: `${String(n)} ${n > 1 ? 'images sans légende' : 'image sans légende'} : ${contexte === 'import' ? "après l'import, ouvrez le document et cliquez sur chaque image pour écrire ce qu'elle montre." : "cliquez sur une image dans l'aperçu pour écrire ce qu'elle montre."}`,
    })
  }

  // Pages presque vides à cause d'un saut de page `===`.
  const lignesSaut = lignes.flatMap((l, k) =>
    /^===\s*$/.test(l) ? [k + 1] : [],
  )
  for (const p of pages) {
    if (p.saut === undefined || p.remplissage === undefined) continue
    if (p.remplissage >= 0.5) continue
    const ligne = lignesSaut[p.saut - 1] as number | undefined
    if (ligne === undefined) continue
    alertes.push({
      ligne,
      correction: remplacer(ligne, 'Retirer le saut de page', []),
      message: `Saut de page : la page d'avant n'est remplie qu'à ${String(Math.round(p.remplissage * 100))} %. Retirez-le si rien ne l'impose, la mise en page s'en charge.`,
    })
  }

  // Pages à moitié vides SANS saut de page : le bloc suivant (image,
  // planche, étape) ne tenait pas dans la place restante (relecture visuelle
  // du 2026-10-03 : « le logiciel n'a pas su »). L'alerte pointe ce bloc.
  pages.forEach((p, n) => {
    if (n === pages.length - 1 || p.saut !== undefined) return
    if (p.remplissage === undefined || p.remplissage >= REMPLISSAGE_MIN) return
    if (p.suivante === undefined) return
    alertes.push({
      ligne: p.suivante,
      message: `Page ${String(n + 1)} remplie à ${String(Math.round(p.remplissage * 100))} % : ce qui suit ne tenait pas dans la place restante. Une taille plus petite pour cette image, ou une étape plus courte, la ferait remonter.`,
    })
  })

  // Schémas trop grands pour une page, donc découpés (2026-10-03) : la
  // mise en page s'en charge, mais un schéma par page se lit mieux.
  const schemas = new Set(pages.flatMap((p) => p.schemas ?? []))
  for (const ligne of [...schemas].sort((a, b) => a - b)) {
    alertes.push({
      ligne,
      message:
        'Schéma trop grand pour une page : il est découpé sur plusieurs pages. Pour le garder sur une seule, coupez-le en deux schémas (par exemple un par groupe).',
    })
  }

  // Tableaux : blocs de lignes contiguës qui commencent par `|`.
  let i = 0
  while (i < utiles.length) {
    if (!utiles[i].trim().startsWith('|')) {
      i++
      continue
    }
    let fin = i
    while (fin + 1 < utiles.length && utiles[fin + 1].includes('|')) fin++
    const bloc = utiles.slice(i, fin + 1)
    if (bloc.length >= 2 && RE_SEPARATEUR.test(bloc[1])) {
      const n = decouperLigne(bloc[0]).length
      const sep = decouperLigne(bloc[1]).length
      if (sep !== n) {
        // GFM exige autant de marques que de colonnes, sinon pas de tableau.
        const marques = decouperLigne(bloc[1]).slice(0, n)
        while (marques.length < n) marques.push('---')
        alertes.push({
          ligne: i + 2,
          correction: remplacer(i + 2, 'Réparer le tableau', [
            ligneTableau(marques),
          ]),
          message: `Tableau : la ligne de séparation a ${String(sep)} « --- » pour ${String(n)} colonnes, il sera imprimé comme du texte.`,
        })
      }
      bloc.forEach((l, k) => {
        if (k === 1) return
        if (decouperLigne(l).some((c) => /^null$/i.test(c.trim()))) {
          alertes.push({
            ligne: i + k + 1,
            correction: remplacer(i + k + 1, 'Vider la case', [
              ligneTableau(
                decouperLigne(lignes[i + k]).map((c) =>
                  /^null$/i.test(c) ? '' : c,
                ),
              ),
            ]),
            message:
              'Tableau : une case contient « null ». Laissez-la vide, ou écrivez ce qui manque.',
          })
        }
        if (k === 0) return
        const cases = decouperLigne(l).length
        if (cases > n) {
          alertes.push({
            ligne: i + k + 1,
            message: `Tableau : cette ligne a ${String(cases)} cases pour ${String(n)} colonnes, les cases en trop n'apparaîtront pas.`,
          })
        } else if (cases < n) {
          const completes = decouperLigne(lignes[i + k])
          while (completes.length < n) completes.push('')
          alertes.push({
            ligne: i + k + 1,
            correction: remplacer(i + k + 1, 'Compléter la ligne', [
              ligneTableau(completes),
            ]),
            message: `Tableau : cette ligne a ${String(cases)} ${cases > 1 ? 'cases' : 'case'} pour ${String(n)} colonnes.`,
          })
        }
      })
    } else if (
      bloc.length >= 2 &&
      bloc.every((l) => l.trim().startsWith('|'))
    ) {
      const n = decouperLigne(bloc[0]).length
      alertes.push({
        ligne: i + 1,
        correction: {
          libelle: 'Ajouter la ligne de séparation',
          debut: i + 1,
          avant: [lignes[i]],
          apres: [lignes[i], ligneTableau(Array<string>(n).fill('---'))],
        },
        message:
          'Tableau sans ligne de séparation « | --- | » sous l’en-tête : il sera imprimé comme du texte.',
      })
    }
    i = fin + 1
  }

  // Un import ne s'édite pas : ses points n'ont pas de correction.
  if (contexte === 'import') for (const a of alertes) delete a.correction
  return alertes.sort((a, b) => a.ligne - b.ligne)
}

/**
 * Relecture d'une ligne de l'aperçu d'un import LLM (étape 2 du plan
 * `classeur-fonctions-2026-10-04`, étendue par l'étape 7 du plan
 * `classeur-echange-ia-2026-10-19`) : TOUTE ligne créée, modifiée ou
 * restaurée est relue sur son NOUVEL état — titre et description de toutes
 * les natures et des chapitres (quatrième mur), plus le texte d'un document
 * (toutes les règles, sans pagination : le dialogue n'en a pas). `null` =
 * ligne non relue (suppression : rien ne sera imprimé). `images` à `null`
 * tant que la médiathèque n'est pas chargée : aucune alerte d'image, plutôt
 * que de les dire toutes introuvables.
 */
export function relireLigneImport(
  ligne: {
    kind: string
    genre: string
    apres: { title?: string; description?: string; content: string }
  },
  images: ReadonlyMap<string, InfoImage> | null,
): Alerte[] | null {
  if (ligne.genre === 'suppression') return null
  const champs = alertesChampsIa({
    title: ligne.apres.title ?? '',
    description: ligne.apres.description ?? '',
  })
  if (ligne.kind !== 'document' || ligne.genre === 'chapitre') return champs
  return [
    ...champs,
    ...alertesRelecture(ligne.apres.content, images, null, 'import'),
  ]
}

/** Ce que la relecture d'un FICHIER entier lit de chaque élément. */
interface ElementRelu {
  kind: string
  title: string
  description?: string
  content?: string
}

/** Un élément (ou un chapitre) du fichier qui a des points à vérifier. */
export interface RelectureElement {
  chapitre: string
  kind: string
  titre: string
  alertes: Alerte[]
}

/**
 * Relecture d'un fichier ENTIER, sans aperçu (import comme nouveau
 * classeur, D7 : rien n'existe encore à comparer). Chapitres (libellé,
 * description) et éléments (titre, description, texte d'un document, sans
 * médiathèque : un classeur neuf n'a pas d'images). Seuls les éléments qui
 * ont des points à vérifier sont rendus, dans l'ordre du fichier.
 */
export function relireFichierImport(fichier: {
  chapters: ReadonlyArray<{
    label: string
    description: string
    items: readonly ElementRelu[]
  }>
}): RelectureElement[] {
  const resultat: RelectureElement[] = []
  for (const c of fichier.chapters) {
    const duChapitre = alertesChampsIa({
      title: c.label,
      description: c.description,
    })
    if (duChapitre.length > 0)
      resultat.push({
        chapitre: c.label,
        kind: 'chapter',
        titre: c.label,
        alertes: duChapitre,
      })
    for (const it of c.items) {
      const alertes = [
        ...alertesChampsIa({ title: it.title, description: it.description }),
        ...(it.kind === 'document'
          ? alertesRelecture(it.content ?? '', null, null, 'import')
          : []),
      ]
      if (alertes.length > 0)
        resultat.push({
          chapitre: c.label,
          kind: it.kind,
          titre: it.title,
          alertes,
        })
    }
  }
  return resultat
}
