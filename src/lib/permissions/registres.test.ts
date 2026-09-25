import { describe, expect, it } from 'vitest'

import {
  GRADES,
  GRADE_LABELS,
  LEVEL_LABELS,
  PAGE_LEVELS,
  levelRank,
} from '#/lib/permissions/levels.ts'
import { PAGES, PAGE_BY_KEY } from '#/lib/permissions/pages.ts'

/*
 * Martin, 2026-09-15 — pourquoi ce fichier existe.
 *
 * Le test de matrice des autorisations parcourt `PAGE_LEVELS`, `GRADES` et la
 * liste des pages en les LISANT depuis le code qu'il est censé surveiller. Le
 * test de mutation l'a pris en défaut : vider ces registres (`PAGE_LEVELS = []`)
 * fait tourner ses boucles zéro fois, et la matrice passe au vert en n'ayant
 * rien vérifié du tout. Un test qui tire son propre périmètre de sa cible ne
 * protège que ce que sa cible veut bien lui montrer.
 *
 * Les valeurs sont donc RECOPIÉES ici, à la main. C'est volontairement
 * redondant : c'est la redondance qui fait le garde-fou.
 *
 * Enjeu concret pour les pages : ajouter une page demande de la déclarer à
 * TROIS endroits (le contrôle de `user_page_permissions`, celui de
 * `profiles.page_order`, et ce registre). Si ce test casse après un ajout,
 * c'est le rappel qu'il reste deux déclarations à faire côté base.
 */

describe('registre des niveaux d accès', () => {
  it('contient exactement les trois niveaux, du plus faible au plus fort', () => {
    expect(PAGE_LEVELS).toEqual(['lecture', 'ecriture', 'gestion'])
  })

  it('classe les niveaux dans cet ordre, et l absence de droit en dessous de tout', () => {
    // Oracle indépendant : les rangs doivent être strictement croissants dans
    // l'ordre du registre, et rien ne doit passer sous celui de « pas de droit ».
    const rangs = PAGE_LEVELS.map(levelRank)
    expect(rangs).toEqual([...rangs].sort((a, b) => a - b))
    expect(new Set(rangs).size).toBe(rangs.length)
    for (const rang of rangs) expect(rang).toBeGreaterThan(levelRank(null))
    expect(levelRank(undefined)).toBe(levelRank(null))
  })

  it('donne un libellé lisible à chaque niveau', () => {
    expect(LEVEL_LABELS).toEqual({
      lecture: 'Lecture',
      ecriture: 'Écriture',
      gestion: 'Gestion',
    })
  })
})

describe('registre des grades', () => {
  it('contient exactement les deux grades', () => {
    expect(GRADES).toEqual(['utilisateur', 'admin'])
  })

  it('donne un libellé lisible à chaque grade', () => {
    expect(GRADE_LABELS).toEqual({
      utilisateur: 'Utilisateur',
      admin: 'Administrateur',
    })
  })
})

describe('registre des pages', () => {
  /*
   * Les neuf clés, recopiées à la main. Toute page ajoutée ici doit AUSSI être
   * ajoutée aux deux contrôles en base (`user_page_permissions.page` et
   * `profiles.page_order`), sans quoi le compte qui reçoit le droit se verra
   * refuser l'écriture par la base.
   */
  const CLES_ATTENDUES = [
    'repjour',
    'pdj',
    'parking',
    'rapro',
    'caisse',
    'affichage',
    'facturation',
    'literie',
    'classeur',
  ]

  it('contient exactement les neuf pages connues', () => {
    expect(PAGES.map((p) => p.key)).toEqual(CLES_ATTENDUES)
  })

  it('donne à chaque page un libellé et une route non vides', () => {
    for (const page of PAGES) {
      expect(page.label, `libellé manquant pour ${page.key}`).toBeTruthy()
      expect(page.route, `route manquante pour ${page.key}`).toMatch(/^\/[a-z]/)
    }
  })

  it('n a ni doublon de clé ni doublon de route', () => {
    expect(new Set(PAGES.map((p) => p.key)).size).toBe(PAGES.length)
    expect(new Set(PAGES.map((p) => p.route)).size).toBe(PAGES.length)
  })

  it('indexe chaque page par sa clé, sans en perdre ni en inventer', () => {
    expect(Object.keys(PAGE_BY_KEY).sort()).toEqual([...CLES_ATTENDUES].sort())
    for (const page of PAGES) expect(PAGE_BY_KEY[page.key]).toBe(page)
  })
})
