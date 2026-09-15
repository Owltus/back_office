import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/*
 * Le rapport journalier est rendu à TROIS endroits : l'écran, le PDF du bouton
 * « Imprimer », et l'e-mail envoyé chaque nuit par l'Edge Function. Les deux
 * premiers vivent sous `src/lib/repjour/` ; le troisième tourne sous Deno et
 * lit une COPIE de ces fichiers, sous `supabase/functions/_shared/repjour/`.
 *
 * Les deux arbres sont disjoints à la compilation — alias `#/` et Vite d'un
 * côté, spécificateurs relatifs Deno de l'autre. Rien ne les relie : le seul
 * garde-fou jusqu'ici était un commentaire. `businessDay.sync.test.ts` a déjà
 * posé ce filet pour la fenêtre d'automatisation ; celui-ci le pose pour le
 * contenu du rapport.
 *
 * Le symptôme d'une divergence serait silencieux et tardif : l'e-mail reçu le
 * matin ne dirait plus la même chose que la page consultée dans la journée, et
 * personne ne saurait laquelle des deux a raison. Le projet s'est déjà fait
 * mordre par une autorité dupliquée qui divergeait sans bruit (le « revert
 * silencieux » des policies RLS, 2026-08-04).
 *
 * Ce test échoue au premier écart. S'il casse, c'est qu'une modification n'a
 * été portée que d'un côté : reporter la même sur l'autre, ne jamais ajuster
 * ce test pour le faire taire.
 */

/** Les trois fichiers qui doivent rester des copies EXACTES l'un de l'autre. */
const MIROIRS = [
  'summaryMetrics.ts',
  'format.ts',
  'reportHtml.ts',
] as const

/**
 * Seule différence légitime entre les deux copies : le chemin d'import. Côté
 * navigateur `'#/lib/repjour/types.ts'`, côté Deno `'./types.ts'`. On ramène
 * les deux au nom de fichier nu pour ne comparer que ce qui compte.
 *
 * Les fins de ligne sont normalisées aussi : l'arbre `src/` est en CRLF,
 * `supabase/` en LF. Ce n'est pas une divergence de logique.
 */
function corpsUtile(chemin: string): string {
  return readFileSync(chemin, 'utf-8')
    .replace(/\r\n/g, '\n')
    .replace(/from '[^']*\/([A-Za-z0-9_]+\.ts)'/g, "from '$1'")
}

describe('rapport journalier — les copies Edge ne doivent pas diverger', () => {
  for (const nom of MIROIRS) {
    it(`${nom} est identique des deux côtés`, () => {
      const navigateur = corpsUtile(`src/lib/repjour/${nom}`)
      const edge = corpsUtile(`supabase/functions/_shared/repjour/${nom}`)
      expect(edge).toBe(navigateur)
    })
  }

  it('les quatre cartes de synthèse portent les mêmes libellés des deux côtés', () => {
    // Contrôle de second niveau, lisible par un humain : même si la comparaison
    // littérale ci-dessus venait à être assouplie un jour, les libellés affichés
    // à l'écran, dans le PDF et dans l'e-mail doivent rester les mêmes mots.
    const libelles = [
      'Pris depuis la veille',
      'Effort restant',
      'Avance sur le budget',
      'Pris depuis le 1er',
    ]
    const sources = [
      'src/components/repjour/SummaryCards.tsx',
      'src/lib/repjour/pdf.ts',
      'src/lib/repjour/reportHtml.ts',
      'supabase/functions/_shared/repjour/pdf.ts',
      'supabase/functions/_shared/repjour/reportHtml.ts',
    ]
    for (const source of sources) {
      const texte = readFileSync(source, 'utf-8')
      for (const libelle of libelles) {
        expect(texte, `${libelle} manque dans ${source}`).toContain(libelle)
      }
    }
  })

  it('le nettoyage des espaces insécables du PDF se comporte pareil des deux côtés', () => {
    /*
     * Ici les deux copies s'écrivent DIFFÉREMMENT tout en faisant la même
     * chose, et c'est voulu : `src` écrit la séquence d'échappement
     * `\u202f\u00a0`, l'Edge écrit les deux caractères eux-mêmes. Une
     * comparaison de texte crierait à tort.
     *
     * L'enjeu est réel : `Intl.NumberFormat('fr-FR')` sépare les milliers par
     * une espace insécable FINE (U+202F), que le moteur PDF ne sait pas dessiner
     * — d'où le remplacement par une espace ordinaire avant écriture. On vérifie
     * donc le COMPORTEMENT des deux expressions, pas leur orthographe.
     */
    const extraireClasse = (chemin: string): string => {
      const source = readFileSync(chemin, 'utf-8')
      const trouve = source.match(/replace\(\/\[([^\]]*)\]\/g/)
      expect(trouve, `aucun nettoyage d'espaces trouvé dans ${chemin}`).not.toBe(
        null,
      )
      return trouve![1]
    }

    const classeNavigateur = extraireClasse('src/lib/repjour/pdf.ts')
    const classeEdge = extraireClasse('supabase/functions/_shared/repjour/pdf.ts')

    // Un nombre formaté en français contient les deux espèces d'espace visées.
    const echantillon = `1\u202f234\u00a0€`
    const nettoyeNavigateur = echantillon.replace(
      new RegExp(`[${classeNavigateur}]`, 'g'),
      ' ',
    )
    const nettoyeEdge = echantillon.replace(
      new RegExp(`[${classeEdge}]`, 'g'),
      ' ',
    )

    expect(nettoyeEdge).toBe(nettoyeNavigateur)
    expect(nettoyeNavigateur).toBe('1 234 €')
    // Et surtout : plus aucune insécable ne survit, c'était tout l'objet.
    expect(/[\u202f\u00a0]/.test(nettoyeNavigateur)).toBe(false)
  })
})
