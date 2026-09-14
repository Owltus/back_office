import { describe, expect, it } from 'vitest'

import {
  SHELL_VARIANT,
  skeletonVariant,
} from '#/components/shared/skeleton/RouteSkeleton.tsx'

/*
 * L'application est une SPA dont le shell HTML est PRÉRENDU UNE SEULE FOIS puis
 * servi tel quel pour toutes les routes (rewrite Vercel vers `_shell.html`).
 * Vérifié en production le 2026-09-14 : le HTML servi sur /pdj et sur /profil a
 * la MÊME empreinte.
 *
 * Conséquence : tout ce qui dépend du chemin au PREMIER rendu client fait
 * diverger le DOM de celui déjà affiché, et React lève une erreur d'hydratation
 * (#418). C'est ce qui se produisait sur /profil, /comptes et les analytiques.
 */
describe('skeletonVariant', () => {
  it('range chaque famille de page', () => {
    expect(skeletonVariant('/profil')).toBe('profil')
    expect(skeletonVariant('/comptes')).toBe('comptes')
    expect(skeletonVariant('/pdj/analytique')).toBe('analytique')
    expect(skeletonVariant('/parking/analytique/2026/9')).toBe('analytique')
    expect(skeletonVariant('/pdj')).toBe('board')
    expect(skeletonVariant('/repjour')).toBe('board')
    expect(skeletonVariant('/caisse')).toBe('board')
  })

  it('la racine donne bien la variante du shell', () => {
    // Le shell est prérendu pour `/`. Si cette égalité tombe, le shell ne
    // contient plus ce que `SHELL_VARIANT` annonce, et l'hydratation diverge
    // de nouveau sur toutes les pages.
    expect(skeletonVariant('/')).toBe(SHELL_VARIANT)
  })

  it('les pages « board » ne divergeaient PAS du shell', () => {
    // C'est pourquoi /pdj n'a jamais montré ce défaut-là : sa silhouette est
    // déjà celle du shell. Le défaut ne frappait que les trois autres familles.
    for (const p of ['/pdj', '/repjour', '/parking', '/rapro', '/caisse', '/gestion']) {
      expect(skeletonVariant(p), p).toBe(SHELL_VARIANT)
    }
  })

  it('les familles qui divergent du shell sont connues et limitées', () => {
    const divergentes = ['/profil', '/comptes', '/pdj/analytique']
      .map(skeletonVariant)
      .filter((v) => v !== SHELL_VARIANT)
    expect(divergentes).toEqual(['profil', 'comptes', 'analytique'])
  })
})
