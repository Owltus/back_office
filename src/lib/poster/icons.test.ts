import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  ICONS,
  getAvailableIcons,
  getIconName,
  getIconSvg,
} from '#/lib/poster/icons.ts'

/*
 * La clé d'icône vient de la BASE (`affiche_templates.icon`) : toute chaîne
 * doit donner un SVG, y compris les noms hérités du prototype d'`Object`, qui
 * plantaient l'aperçu (`undefined.replace`).
 */
describe('getIconSvg / getIconName', () => {
  it('rend l’icône demandée quand la clé existe', () => {
    expect(getIconSvg('salad')).toBe(ICONS.salad.svg)
    expect(getIconName('salad')).toBe('Végé')
  })

  it.each([
    'constructor',
    'toString',
    '__proto__',
    'hasOwnProperty',
    'valueOf',
    'inconnue',
    '',
  ])('replie sur Alerte pour une clé hors registre : %s', (cle) => {
    expect(getIconSvg(cle)).toBe(ICONS.alert.svg)
    expect(typeof getIconSvg(cle)).toBe('string')
    expect(getIconName(cle)).toBe('Alerte')
  })

  it('la liste des icônes ne contient que les clés propres', () => {
    expect(getAvailableIcons()).not.toContain('constructor')
    expect(getAvailableIcons()).toContain('alert')
  })
})

/*
 * La contrainte CHECK de `supabase/affiche_templates_icon_check_2026-09-28.sql`
 * doit lister EXACTEMENT les clés du registre : une clé en moins et la base
 * refuserait l'enregistrement d'un modèle portant cette icône.
 */
describe('contrainte SQL affiche_templates_icon_check', () => {
  it('liste exactement les clés de ICONS', () => {
    const sql = readFileSync(
      'supabase/affiche_templates_icon_check_2026-09-28.sql',
      'utf8',
    )
    const bloc = sql.slice(sql.indexOf('check (icon in ('))
    const liste = bloc.slice(0, bloc.indexOf('))'))
    const cles = [...liste.matchAll(/'([a-z_0-9]+)'/g)].map((m) => m[1])
    expect([...cles].sort()).toEqual(Object.keys(ICONS).sort())
  })
})
