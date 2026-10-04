import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  DEMANDES_LLM,
  composerDemande,
  demandeMajeure,
  texteACopier,
} from '#/lib/classeur/llmDemandes.ts'

/*
 * Demandes toutes prêtes (étape 3). Oracles écrits à la main : l'ordre est
 * celui de la liste, chaque demande cochée paraît UNE fois, le champ libre est
 * recopié tel quel (bords retirés), rien demandé ⇒ `null`, et le texte copié
 * sans demande est le JSON à l'identique.
 */

const IDS = DEMANDES_LLM.map((d) => d.id)
const consigne = (id: string) => DEMANDES_LLM.find((d) => d.id === id)!.consigne

/** Texte libre piégeux : guillemets, antislash, retours, émojis, balises. */
const libreArb = fc.oneof(
  fc.string({ unit: 'grapheme', maxLength: 40 }),
  fc.constantFrom(
    '"',
    '\\',
    'a\nb\r\nc',
    '😀 👍🏽',
    '</script><script>alert(1)</script>',
    '  \t ',
    '',
    '- [ ] ``` ===',
  ),
)

describe('liste des demandes', () => {
  it('identifiants uniques et attendus, dans cet ordre', () => {
    expect(IDS).toEqual([
      'corriger',
      'etapes',
      'raccourcir',
      'photos',
      'avertissements',
      'traduire',
      'forme',
    ])
  })

  it('chaque demande a un libellé, une aide et une consigne distincts', () => {
    for (const d of DEMANDES_LLM) {
      expect(d.libelle.length, d.id).toBeGreaterThan(3)
      expect(d.aide.length, d.id).toBeGreaterThan(5)
      expect(d.consigne.length, d.id).toBeGreaterThan(60)
    }
    expect(new Set(DEMANDES_LLM.map((d) => d.consigne)).size).toBe(IDS.length)
  })

  it('les consignes suivent les conventions de la page', () => {
    expect(consigne('photos')).toContain('(a-inserer)')
    expect(consigne('avertissements')).toContain('> [!WARNING]')
    for (const garde of ['uuid', 'chemins d', ':::photos', ':::etape', '===']) {
      expect(consigne('traduire'), garde).toContain(garde)
    }
    expect(consigne('raccourcir')).toMatch(/TOUTES les consignes/)
    expect(consigne('forme')).toMatch(/AUCUN mot/)
    expect(consigne('corriger')).toMatch(/orthographe/)
    expect(consigne('etapes')).toMatch(/étapes numérotées/)
  })
})

describe('composerDemande', () => {
  it('rien de coché et champ vide ⇒ null', () => {
    expect(composerDemande([], '')).toBeNull()
    expect(composerDemande([], '  \n\t ')).toBeNull()
    expect(composerDemande(['inconnu'], '')).toBeNull()
  })

  it('exemples écrits à la main', () => {
    expect(composerDemande(['corriger'], '')).toBe(`- ${consigne('corriger')}`)
    expect(composerDemande(['traduire', 'corriger'], '  Vouvoyer.  ')).toBe(
      `- ${consigne('corriger')}\n- ${consigne('traduire')}\n- Vouvoyer.`,
    )
    expect(composerDemande([], 'Juste ça')).toBe('- Juste ça')
  })

  it('propriété : chaque demande cochée une seule fois, dans l’ordre de la liste', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...IDS, 'inconnu'), { maxLength: 14 }),
        libreArb,
        (coches, libre) => {
          const texte = composerDemande(coches, libre)
          const attendues = IDS.filter((id) => coches.includes(id))
          if (attendues.length === 0 && libre.trim() === '') {
            expect(texte).toBeNull()
            return
          }
          expect(texte).not.toBeNull()
          const t = texte!
          let dernier = -1
          for (const id of IDS) {
            const c = consigne(id)
            const n = t.split(c).length - 1
            expect(n, id).toBe(attendues.includes(id) ? 1 : 0)
            if (n === 1) {
              const pos = t.indexOf(c)
              expect(pos).toBeGreaterThan(dernier)
              dernier = pos
            }
          }
          // Une ligne « - » par demande, puis le champ libre.
          const lignesDemandes = t
            .split('\n')
            .filter((l) => IDS.some((id) => l === `- ${consigne(id)}`))
          expect(lignesDemandes).toHaveLength(attendues.length)
        },
      ),
      { numRuns: 500, seed: 3 },
    )
  })

  it('propriété : le champ libre est recopié tel quel (bords seulement retirés), à la fin', () => {
    fc.assert(
      fc.property(fc.subarray(IDS), libreArb, (coches, libre) => {
        const texte = composerDemande(coches, libre)
        const autre = libre.trim()
        if (autre === '') {
          if (coches.length === 0) expect(texte).toBeNull()
          else expect(texte!.endsWith(consigne(coches.at(-1)!))).toBe(true)
          return
        }
        expect(texte!.endsWith(`- ${autre}`)).toBe(true)
        // JSON : la demande traverse la sérialisation à l'identique.
        const rond = JSON.parse(JSON.stringify({ demande: texte })) as {
          demande: string
        }
        expect(rond.demande).toBe(texte)
      }),
      { numRuns: 500, seed: 4 },
    )
  })

  it('l’ordre de cochage n’a aucun effet', () => {
    fc.assert(
      fc.property(fc.subarray(IDS), fc.string(), (coches, libre) => {
        expect(composerDemande([...coches].reverse(), libre)).toBe(
          composerDemande(coches, libre),
        )
      }),
      { numRuns: 200, seed: 5 },
    )
  })
})

describe('texteACopier', () => {
  it('sans demande : le JSON seul, à l’identique', () => {
    fc.assert(
      fc.property(fc.string(), (json) => {
        expect(texteACopier(json, null)).toBe(json)
      }),
      { numRuns: 200, seed: 6 },
    )
  })

  it('avec demande : « Demande : », la demande, une ligne vide, puis le JSON', () => {
    expect(texteACopier('{"a":1}', '- Corriger.')).toBe(
      'Demande :\n- Corriger.\n\n{"a":1}',
    )
  })
})

describe('demandeMajeure', () => {
  it('seulement Traduire et Raccourcir', () => {
    expect(demandeMajeure([])).toBe(false)
    expect(demandeMajeure(['corriger', 'photos', 'forme'])).toBe(false)
    expect(demandeMajeure(['traduire'])).toBe(true)
    expect(demandeMajeure(['corriger', 'raccourcir'])).toBe(true)
    expect(demandeMajeure(new Set(['etapes', 'avertissements']))).toBe(false)
  })
})
