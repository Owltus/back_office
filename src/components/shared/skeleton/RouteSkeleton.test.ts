import { describe, expect, it } from 'vitest'

import {
  SHELL_VARIANT,
  VARIANTES_DIVERGENTES,
  skeletonVariant,
} from '#/components/shared/skeleton/RouteSkeleton.tsx'
import type { SkeletonVariant } from '#/components/shared/skeleton/RouteSkeleton.tsx'

/*
 * L'application est une SPA dont le shell HTML est PRÉRENDU UNE SEULE FOIS puis
 * servi tel quel pour toutes les routes (rewrite Vercel vers `_shell.html`).
 * Vérifié en production le 2026-09-14 : le HTML servi sur /pdj et sur /profil a
 * la MÊME empreinte.
 *
 * Conséquence : tout ce qui dépend du chemin au PREMIER rendu client fait
 * diverger le DOM de celui déjà affiché, et React lève une erreur d'hydratation
 * (#418).
 *
 * ⚠ CE QUI A CHANGÉ LE 2026-09-23. Jusque-là, /pdj, /repjour, /caisse et les
 * autres boards partageaient tous la variante `board`, donc celle du shell —
 * et un test vérifiait cette égalité. Elle n'est PLUS vraie, délibérément : ces
 * pages ont désormais leur propre silhouette, parce que la variante unique
 * dessinait 789 px sur toutes les pages contre 1 243 px de contenu réel sur
 * /pdj (+58 %, mesuré).
 *
 * Ce n'est pas un retour du bug d'hydratation, et c'est le point à ne pas
 * confondre : la protection n'a JAMAIS été « toutes les pages ont la même
 * variante », c'est `AppAuthGate` qui force `SHELL_VARIANT` tant que
 * `hydrated` est faux. La divergence n'existe qu'APRÈS l'hydratation, quand le
 * DOM prérendu n'est plus l'autorité.
 */
describe('skeletonVariant', () => {
  it('donne à chaque page sa propre silhouette', () => {
    expect(skeletonVariant('/profil')).toBe('profil')
    expect(skeletonVariant('/comptes')).toBe('comptes')
    expect(skeletonVariant('/pdj')).toBe('pdj')
    expect(skeletonVariant('/repjour')).toBe('repjour')
    expect(skeletonVariant('/caisse')).toBe('caisse')
    expect(skeletonVariant('/literie')).toBe('literie')
  })

  it('range les analytiques AVANT leur page mère', () => {
    // L'ordre des tests dans `skeletonVariant` compte : sans lui,
    // `/pdj/analytique` tomberait sur la silhouette du board PDJ (six tableaux
    // par étage) au lieu de celle d'une analytique (cartes + tableau + graphes).
    expect(skeletonVariant('/pdj/analytique')).toBe('analytique')
    expect(skeletonVariant('/repjour/analytique')).toBe('analytique')
    expect(skeletonVariant('/caisse/analytique/2026/9')).toBe('analytique')
    expect(skeletonVariant('/parking/analytique/2026/9')).toBe('analytique')
  })

  it('garde le repli pour les pages dont l’écart était déjà nul', () => {
    // Mesuré le 2026-09-23 : /parking 789 px de contenu contre 789 px de
    // squelette, /rapro 809 contre 789. Leur donner une silhouette dédiée
    // serait du travail pour rien — et une occasion de dérive de plus.
    expect(skeletonVariant('/parking')).toBe('board')
    expect(skeletonVariant('/rapro')).toBe('board')
    expect(skeletonVariant('/gestion')).toBe('board')
  })

  it('la racine donne bien la variante du shell', () => {
    // Le shell est prérendu pour `/`. Si cette égalité tombe, le shell ne
    // contient plus ce que `SHELL_VARIANT` annonce, et l'hydratation diverge
    // de nouveau sur toutes les pages.
    expect(skeletonVariant('/')).toBe(SHELL_VARIANT)
  })
})

/*
 * Bornage de la DIVERGENCE post-hydratation.
 *
 * ⚠ Ce test remplace le bloc « invariants de hauteur » qui vivait ici et qui
 * ne pouvait pas échouer : il vérifiait que la somme d'une partition
 * d'`ALL_ROOMS` par étage égale `ALL_ROOMS.length` (vrai par construction) et
 * qu'aucune classe de cette partition n'est vide (impossible par
 * construction). Les vrais invariants de forme sont désormais testés PAR LE
 * RENDU dans `PageShapes.test.tsx`.
 *
 * Ce qui se teste ici est ce que ce fichier est seul à pouvoir tester :
 * l'ÉTENDUE de l'ensemble des familles qui, après hydratation, affichent autre
 * chose que le shell prérendu. Cet ensemble est passé de 3 sur 4 à 7 sur 8 le
 * 2026-09-23. Ce n'est pas un bug — la protection réelle est que
 * `AppAuthGate` force `SHELL_VARIANT` tant que l'authentification n'a pas
 * rendu la main — mais c'est la mesure du dégât SI cette protection tombait.
 * Le test qui bornait cet ensemble avait été supprimé sans remplacement.
 */
describe('étendue de la divergence post-hydratation', () => {
  it('énumère exactement les familles qui divergent du shell', () => {
    const familles: SkeletonVariant[] = [
      'profil',
      'comptes',
      'analytique',
      'pdj',
      'repjour',
      'caisse',
      'literie',
      'board',
    ]
    expect(familles.filter((v) => v !== SHELL_VARIANT)).toEqual(
      VARIANTES_DIVERGENTES,
    )
  })

  it('aucune route ne rend une famille absente de cette liste', () => {
    // Si un préfixe est ajouté à `skeletonVariant` sans être déclaré
    // divergent, ce test le signale — c'est le seul endroit qui plafonne la
    // surface exposée à une régression d'hydratation.
    const chemins = [
      '/',
      '/profil',
      '/comptes',
      '/pdj',
      '/pdj/analytique',
      '/repjour',
      '/repjour/analytique/2026/9',
      '/caisse',
      '/literie',
      '/parking',
      '/rapro',
      '/gestion',
    ]
    for (const c of chemins) {
      const v = skeletonVariant(c)
      if (v !== SHELL_VARIANT) expect(VARIANTES_DIVERGENTES).toContain(v)
    }
  })
})

describe('skeletonVariant — bornage des préfixes', () => {
  it('ne confond pas une route voisine avec une page', () => {
    // `startsWith('/pdj')` aurait donné la silhouette PDJ à `/pdjXXX`. Sans
    // conséquence aujourd'hui, mais la fonction est passée de 3 à 7 préfixes.
    expect(skeletonVariant('/pdjXXX')).toBe(SHELL_VARIANT)
    expect(skeletonVariant('/profilage')).toBe(SHELL_VARIANT)
    expect(skeletonVariant('/pdj/2026-09-24')).toBe('pdj')
  })
})
