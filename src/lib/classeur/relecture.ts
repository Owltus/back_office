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
 * Le contenu des blocs de code (```) est ignoré.
 */

import {
  cadreDepuisTitre,
  estCheminImage,
  estImageAInserer,
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
}

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
}

/** Une étape de plus de ce nombre de mots est signalée (une action par étape). */
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

function extrait(s: string, max = 40): string {
  const t = s.trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

/**
 * @param imagesConnues images du classeur par chemin (en minuscules), ou
 *   `null` tant que la médiathèque n'est pas chargée (contrôles sautés).
 * @param pages pages paginées de l'aperçu (remplissage, sauts), facultatif.
 */
export function alertesRelecture(
  markdown: string,
  imagesConnues: ReadonlyMap<string, InfoImage> | null,
  pages: readonly InfoPage[] = [],
): Alerte[] {
  const lignes = markdown.split('\n')
  const alertes: Alerte[] = []
  let dansCode = false
  let niveauPrecedent = 0
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
          alertes.push({
            ligne,
            message: `Bloc mal écrit : « ${extrait(l)} ». Écrivez « :::photos » ou « :::etape » sans espace après les deux-points.`,
          })
        }
      } else if ((BLOCS as readonly string[]).includes(nom)) {
        pile.push({ nom, ligne })
      } else {
        alertes.push({
          ligne,
          message: `Bloc inconnu « :::${extrait(nom, 20)} » : seuls « :::photos » et « :::etape » existent, cette ligne sera imprimée telle quelle.`,
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
      if (!imagesConnues || !estCheminImage(src)) continue
      const info = imagesConnues.get(src.toLowerCase())
      if (!info) {
        alertes.push({
          ligne,
          message:
            'Image introuvable : elle a été supprimée de la médiathèque.',
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
          message:
            "Capture très large : une fois imprimé, son texte sera trop petit pour être lu. Cliquez sur l'image dans l'aperçu et recadrez sur la partie utile.",
        })
      } else if (ratio > 6 && boite.hauteur < 15) {
        alertes.push({
          ligne,
          message:
            "Bandeau très fin : cliquez sur l'image dans l'aperçu et recadrez sur l'élément utile (un bouton, une case).",
        })
      }
      if (boite.hauteur > DEMI_PAGE_MM) {
        alertes.push({
          ligne,
          message:
            tailleDepuisTitre(titre) === 'auto'
              ? `Capture très haute (environ ${String(Math.round(boite.hauteur / 10))} cm, plus d'une demi-page) : cliquez dessus dans l'aperçu et recadrez sur la partie utile.`
              : `Image très haute (environ ${String(Math.round(boite.hauteur / 10))} cm, plus d'une demi-page) : choisissez la taille Automatique ou recadrez-la.`,
        })
      }
    }

    // Du texte rangé dans une planche : une rangée entière à lui seul.
    if (bloc === 'photos' && jetons.length === 0 && l.trim() !== '') {
      alertes.push({
        ligne,
        message:
          'Planche de photos : ce texte occupera une rangée entière. Placez-le plutôt au-dessus de la planche, ou en légende d’une photo.',
      })
    }

    // Ligne en gras seule qui joue le titre (une phrase d'introduction
    // finie par « : » n'en est pas un).
    const faux = /^\s*(\*\*|__)([^*_]{1,80})\1\s*$/.exec(l)
    if (faux && !faux[2].trim().endsWith(':')) {
      alertes.push({
        ligne,
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

    // Émojis.
    if (EMOJI.test(l)) {
      alertes.push({
        ligne,
        message:
          "Émoji : il s'imprime mal en noir et blanc. Remplacez-le par un mot, ou par un encadré Attention, Important ou Astuce.",
      })
    }

    // Liens sans adresse (pas les images).
    for (const m of l.matchAll(/(!?)\[([^\]]*)\]\(\s*(https?:\/\/)?\s*\)/g)) {
      if (m[1] === '!') continue
      alertes.push({
        ligne,
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
          message: `Titre sauté : « ${extrait(titre[2])} » est un ${nomNiveau(niveau)} placé après un ${nomNiveau(niveauPrecedent)}.`,
        })
      }
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
      message: `${String(n)} ${n > 1 ? "emplacements d'image à remplir" : "emplacement d'image à remplir"} : cliquez sur le cadre gris dans l'aperçu pour y mettre la photo.`,
    })
  }

  // Images sans légende : UNE alerte, sur la première.
  if (sansLegende.length > 0) {
    const n = sansLegende.length
    alertes.push({
      ligne: sansLegende[0],
      message: `${String(n)} ${n > 1 ? 'images sans légende' : 'image sans légende'} : cliquez sur une image dans l'aperçu pour écrire ce qu'elle montre.`,
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
      message: `Saut de page : la page d'avant n'est remplie qu'à ${String(Math.round(p.remplissage * 100))} %. Retirez-le si rien ne l'impose, la mise en page s'en charge.`,
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
        alertes.push({
          ligne: i + 2,
          message: `Tableau : la ligne de séparation a ${String(sep)} « --- » pour ${String(n)} colonnes, il sera imprimé comme du texte.`,
        })
      }
      bloc.forEach((l, k) => {
        if (k === 1) return
        if (decouperLigne(l).some((c) => /^null$/i.test(c.trim()))) {
          alertes.push({
            ligne: i + k + 1,
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
          alertes.push({
            ligne: i + k + 1,
            message: `Tableau : cette ligne a ${String(cases)} ${cases > 1 ? 'cases' : 'case'} pour ${String(n)} colonnes.`,
          })
        }
      })
    } else if (
      bloc.length >= 2 &&
      bloc.every((l) => l.trim().startsWith('|'))
    ) {
      alertes.push({
        ligne: i + 1,
        message:
          'Tableau sans ligne de séparation « | --- | » sous l’en-tête : il sera imprimé comme du texte.',
      })
    }
    i = fin + 1
  }

  return alertes.sort((a, b) => a.ligne - b.ligne)
}
