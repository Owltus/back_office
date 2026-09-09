import { describe, expect, it } from 'vitest'

import {
  homePage,
  homeRoute,
  orderedPages,
  sanitizePageOrder,
} from '#/lib/permissions/navigation.ts'
import type { PagePermissions } from '#/lib/permissions/index.ts'

// Droits d'un compte de réception type : tout sauf la facturation.
const RECEPTION: PagePermissions = {
  repjour: 'lecture',
  pdj: 'ecriture',
  parking: 'ecriture',
  rapro: 'ecriture',
  caisse: 'ecriture',
  affichage: 'lecture',
  literie: 'lecture',
}

// Le cas réel qui motive le chantier : un compte à une seule page.
const PARKING_SEUL: PagePermissions = { parking: 'lecture' }

const keys = (perms: PagePermissions, order: string[] | null) =>
  orderedPages(perms, 'utilisateur', order).map((p) => p.key)

describe('orderedPages', () => {
  it('sans préférence, rend l ordre du registre filtré par les droits', () => {
    expect(keys(RECEPTION, null)).toEqual([
      'repjour',
      'pdj',
      'parking',
      'rapro',
      'caisse',
      'affichage',
      'literie',
    ])
  })

  it('respecte la préférence, puis complète avec le reste du registre', () => {
    expect(keys(RECEPTION, ['caisse', 'pdj'])).toEqual([
      'caisse',
      'pdj',
      'repjour',
      'parking',
      'rapro',
      'affichage',
      'literie',
    ])
  })

  it('ignore une page dont le droit a été retiré depuis', () => {
    // `facturation` est dans la préférence mais n'est pas accordée.
    expect(keys(RECEPTION, ['facturation', 'caisse'])).toEqual([
      'caisse',
      'repjour',
      'pdj',
      'parking',
      'rapro',
      'affichage',
      'literie',
    ])
  })

  it('ignore une clé inconnue sans lever d erreur', () => {
    expect(keys(RECEPTION, ['inconnue', 'pdj'])).toEqual([
      'pdj',
      'repjour',
      'parking',
      'rapro',
      'caisse',
      'affichage',
      'literie',
    ])
  })

  it('ignore un doublon dans la préférence', () => {
    expect(keys(RECEPTION, ['pdj', 'pdj', 'caisse'])).toEqual([
      'pdj',
      'caisse',
      'repjour',
      'parking',
      'rapro',
      'affichage',
      'literie',
    ])
  })

  it('ne perd JAMAIS une page nouvellement accordée', () => {
    // La préférence date d'avant l'ajout de `literie` : elle ne la mentionne
    // pas. Elle doit malgré tout apparaître — sinon la page serait invisible
    // pour tous les comptes existants (le précédent de l'ajout de literie).
    const order = ['repjour', 'pdj', 'parking', 'rapro', 'caisse', 'affichage']
    expect(keys(RECEPTION, order)).toContain('literie')
  })

  it('un compte sans aucun droit ne voit aucune page', () => {
    expect(keys({}, ['pdj', 'caisse'])).toEqual([])
  })

  it('un admin voit les 8 pages, sans aucune ligne de permission', () => {
    // L'admin n'a AUCUNE ligne dans user_page_permissions : son accès total
    // vient du grade. C'est pourquoi la préférence vit sur `profiles`.
    expect(orderedPages({}, 'admin', ['literie', 'caisse'])).toHaveLength(8)
    expect(orderedPages({}, 'admin', ['literie', 'caisse'])[0].key).toBe(
      'literie',
    )
  })
})

describe('homePage', () => {
  it('est la tête de l ordre effectif', () => {
    expect(homePage(RECEPTION, 'utilisateur', ['caisse', 'pdj'])).toBe('caisse')
  })

  it('sans préférence, est la première page accordée du registre', () => {
    expect(homePage(PARKING_SEUL, 'utilisateur', null)).toBe('parking')
  })

  it('bascule sur la suivante si la tête n est plus autorisée', () => {
    // Le droit sur `caisse` a été retiré : l'accueil ne doit surtout pas
    // pointer dessus, sinon PageGuard renverrait ailleurs à chaque arrivée.
    expect(homePage(PARKING_SEUL, 'utilisateur', ['caisse', 'parking'])).toBe(
      'parking',
    )
  })

  it('ne renvoie JAMAIS une page non autorisée', () => {
    const home = homePage(PARKING_SEUL, 'utilisateur', ['facturation'])
    expect(home).toBe('parking')
  })

  it('renvoie null quand le compte n a accès à rien', () => {
    expect(homePage({}, 'utilisateur', ['pdj'])).toBeNull()
  })
})

describe('homeRoute', () => {
  it('rend la route de la page d accueil', () => {
    expect(homeRoute(RECEPTION, 'utilisateur', ['caisse'])).toBe('/caisse')
  })

  it('rend null quand le compte n a accès à rien', () => {
    expect(homeRoute({}, 'utilisateur', null)).toBeNull()
  })
})

describe('sanitizePageOrder', () => {
  it('retire les clés inconnues et les doublons, garde l ordre', () => {
    expect(sanitizePageOrder(['caisse', 'zzz', 'pdj', 'caisse'])).toEqual([
      'caisse',
      'pdj',
    ])
  })

  it('rend un tableau vide pour une entrée vide', () => {
    expect(sanitizePageOrder([])).toEqual([])
  })
})
