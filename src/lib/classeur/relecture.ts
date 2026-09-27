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
 * Le contenu des blocs de code (```) est ignoré.
 */

import { estCheminImage } from '#/lib/classeur/images.ts'
import { RE_SEPARATEUR, decouperLigne } from '#/lib/classeur/tableauMarkdown.ts'

export interface Alerte {
  /** Ligne concernée, 1 = première ligne du texte. */
  ligne: number
  message: string
}

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
 * @param imagesConnues chemins des images du classeur (en minuscules), ou
 *   `null` tant que la médiathèque n'est pas chargée (contrôle sauté).
 */
export function alertesRelecture(
  markdown: string,
  imagesConnues: ReadonlySet<string> | null,
): Alerte[] {
  const lignes = markdown.split('\n')
  const alertes: Alerte[] = []
  let dansCode = false
  let niveauPrecedent = 0

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

    // Images du classeur introuvables.
    if (imagesConnues) {
      for (const m of l.matchAll(/!\[[^\]]*\]\(\s*<?([^)\s>]+)>?/g)) {
        const src = m[1]
        if (estCheminImage(src) && !imagesConnues.has(src.toLowerCase())) {
          alertes.push({
            ligne,
            message:
              'Image introuvable : elle a été supprimée de la médiathèque.',
          })
        }
      }
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
        if (k <= 1) return
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
