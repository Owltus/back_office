import { describe, expect, it } from 'vitest'

import {
  SHELL_VARIANT,
  skeletonVariant,
} from '#/components/shared/skeleton/RouteSkeleton.tsx'
import { CHAMBRES_PAR_ETAGE } from '#/components/shared/skeleton/PageShapes.tsx'
import { ALL_ROOMS } from '#/lib/hotel/rooms.ts'

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
 * Garde-fou des silhouettes : elles sont des REFLETS du contenu, donc elles
 * peuvent dériver en silence si un board change. On ne peut pas tester des
 * pixels ici, mais on peut tester les invariants COMPTABLES dont dépend la
 * hauteur — c'est ce qui aurait attrapé l'écart de +58 % sur /pdj.
 */
describe('silhouettes — invariants de hauteur', () => {
  it('la silhouette PDJ a autant d’étages et de chambres que l’hôtel', () => {
    expect(CHAMBRES_PAR_ETAGE).toHaveLength(6)
    expect(CHAMBRES_PAR_ETAGE.reduce((s, n) => s + n, 0)).toBe(ALL_ROOMS.length)
    expect(ALL_ROOMS.length).toBe(80)
  })

  it('aucun étage n’est vide', () => {
    // Un étage à zéro ligne ferait un tableau plat dans le squelette, puis un
    // tableau plein à l'arrivée des données : exactement le saut à éviter.
    for (const n of CHAMBRES_PAR_ETAGE) expect(n).toBeGreaterThan(0)
  })
})
