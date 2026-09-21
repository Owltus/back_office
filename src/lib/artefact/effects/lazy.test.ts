import { describe, expect, it } from 'vitest'

import { EFFECTS } from '#/lib/artefact/effects/index.ts'
import { LAZY_EFFECTS } from '#/lib/artefact/effects/lazy.ts'

/*
 * Les effets d'easter egg sont désormais décrits à DEUX endroits :
 *   - `index.ts` : le registre complet, avec le code d'animation. Utilisé par la
 *     page admin `/easter-eggs`, qui les prévisualise. Elle vit dans son propre
 *     chunk de route, le poids n'y est payé que par elle.
 *   - `lazy.ts` : le même inventaire réduit à un identifiant et un `import()`.
 *     Utilisé par `<EasterEggs>`, monté sur TOUTE l'application authentifiée.
 *
 * Ce dédoublement est délibéré — il retire 44 150 octets bruts du chunk d'entrée
 * (audit du 2026-09-21) — mais une autorité dupliquée diverge toujours en
 * silence si rien ne la surveille. Le projet s'est déjà fait mordre deux fois de
 * cette façon (les policies RLS du 2026-08-04, les copies Edge du rapport).
 *
 * Symptôme d'une divergence, sans ce test : un easter egg configuré en base
 * cesse simplement de se déclencher, sans erreur, sans trace. Personne ne le
 * remarque avant des mois.
 *
 * Si ce test casse, reporter l'ajout ou le retrait dans les DEUX fichiers.
 * Ne jamais l'ajuster pour le faire taire.
 */

describe('registres d’effets — les deux inventaires ne doivent pas diverger', () => {
  const idsComplets = EFFECTS.map((e) => e.id).sort()
  const idsParesseux = LAZY_EFFECTS.map((e) => e.id).sort()

  it('contiennent exactement les mêmes identifiants', () => {
    expect(idsParesseux).toEqual(idsComplets)
  })

  it('ne contiennent aucun doublon', () => {
    expect(new Set(idsParesseux).size).toBe(idsParesseux.length)
    expect(new Set(idsComplets).size).toBe(idsComplets.length)
  })

  it('chargent bien l’effet portant l’identifiant annoncé', async () => {
    // Oracle : `LAZY_EFFECTS[i].load()` doit rendre l'effet dont l'id est
    // `LAZY_EFFECTS[i].id`. Une inversion de deux lignes dans le registre —
    // l'erreur de copier-coller typique — déclencherait le mauvais effet sur le
    // bon mot-clé, et rien d'autre ne le signalerait.
    for (const entree of LAZY_EFFECTS) {
      const effet = await entree.load()
      expect(effet.id, `mauvais module derrière « ${entree.id} »`).toBe(
        entree.id,
      )
    }
  })
})
