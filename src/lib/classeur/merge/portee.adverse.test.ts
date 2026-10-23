import { describe, expect, it } from 'vitest'

import {
  PERIODICITES,
  chJson,
  classeur,
  chapitre,
  document,
  etat,
  fichier,
  itJson,
} from '#/lib/classeur/merge/fixtures.ts'
import { planifierFusion } from '#/lib/classeur/merge/merge.ts'
import {
  construireExportChapitre,
  extraireJson,
} from '#/lib/classeur/merge/portee.ts'
import { parseImportJson } from '#/lib/classeur/merge/schema.ts'

/*
 * Relecture adverse du 2026-10-04 (import JSON pour un LLM) : cas qui
 * cassaient l'import d'un chapitre retravaillé par un LLM.
 */

const ch = chapitre({ id: 1, label: 'Réception' })
const docX = document({
  id: 5,
  chapter_id: 1,
  title: 'Check-in',
  content: 'ancien',
  sort_order: 1,
})

describe('un même élément local ne peut être apparié deux fois', () => {
  it('élément sans uuid au titre d’un élément déjà apparié par uuid : créé, pas fusionné dans le premier', () => {
    const f = fichier([
      chJson({
        label: 'Réception',
        uuid: 'ch-1',
        items: [
          itJson({
            kind: 'document',
            uuid: 'doc-5',
            title: 'Check-in',
            content: 'version A',
            sort_order: 1,
          }),
          itJson({
            kind: 'document',
            title: 'Check-in',
            content: 'version B (nouvelle)',
            sort_order: 2,
          }),
        ],
      }),
    ])
    const plan = planifierFusion(etat([ch], { documents: [docX] }), f, {
      replace: true,
    })
    expect(
      plan.actions.filter((a) => a.type === 'modifierItem' && a.id === 5),
    ).toHaveLength(1)
    expect(plan.actions.filter((a) => a.type === 'creerItem')).toHaveLength(1)
  })
})

describe('E9 : uuid déjà pris, apparié par titre à un AUTRE élément', () => {
  it("n'adopte pas le uuid déjà pris (unique en base)", () => {
    const docY = document({
      id: 6,
      chapter_id: 1,
      title: 'Check-out',
      content: 'y',
      sort_order: 2,
    })
    const f = fichier([
      chJson({
        label: 'Réception',
        uuid: 'ch-1',
        items: [
          itJson({
            kind: 'document',
            uuid: 'doc-5',
            title: 'Check-in',
            sort_order: 1,
          }),
          itJson({
            kind: 'document',
            uuid: 'doc-5',
            title: 'Check-out',
            sort_order: 2,
          }),
        ],
      }),
    ])
    const plan = planifierFusion(etat([ch], { documents: [docX, docY] }), f, {
      replace: true,
    })
    const surY = plan.actions.find(
      (a) => a.type === 'modifierItem' && a.id === 6,
    )
    expect(surY).toBeDefined()
    expect(surY).not.toHaveProperty('uuid')
  })
})

describe('extraireJson face à une accolade avant le JSON', () => {
  const exportJson = () =>
    JSON.stringify(
      construireExportChapitre(
        classeur(),
        ch,
        etat([ch], { documents: [docX] }).content,
        PERIODICITES,
        new Date('2026-10-04T10:00:00Z'),
      ),
      null,
      2,
    )

  it('une réponse de LLM qui cite `:::etape{photo=gauche}` avant le JSON', () => {
    const json = exportJson()
    const reponse = `J'ai gardé les lignes \`:::etape{photo=gauche}\` intactes.\n\`\`\`json\n${json}\n\`\`\`\nN'hésitez pas.`
    expect(() => parseImportJson(extraireJson(reponse))).not.toThrow()
  })

  // Réponses RÉELLES d'un LLM sur la base locale (2026-10-22) : nos
  // consignes lui font écrire « bouton accolades {} » APRÈS le bloc.
  const avecProse = (json: string, apres = '') =>
    `C'est fait.

\`\`\`json
${json}
\`\`\`

${apres}`

  it('des accolades {} dans la prose APRÈS le bloc', () => {
    const json = exportJson()
    const reponse = avecProse(
      json,
      'Cliquez sur le bouton accolades {} (Échange avec un LLM), puis collez.',
    )
    expect(extraireJson(reponse)).toBe(json)
  })

  it('des accolades dans une chaîne du JSON ne coupent pas le fichier', () => {
    const brut = JSON.parse(exportJson()) as {
      chapters: { items: { content?: string }[] }[]
    }
    brut.chapters[0].items[0].content = 'Bloc :::etape{photo=gauche} } { "x'
    const json = JSON.stringify(brut, null, 2)
    expect(extraireJson(avecProse(json, 'bouton {}'))).toBe(json)
  })

  it('une réponse coupée le dit, sans jargon', () => {
    const json = exportJson()
    expect(() =>
      extraireJson(avecProse(json.slice(0, json.length - 40), '')),
    ).toThrow(/coupée/)
    expect(() => extraireJson(json.slice(0, 300))).toThrow(/coupée/)
  })

  it('deux versions différentes : refus ; deux fois la même : acceptée', () => {
    const json = exportJson()
    const autre = json.replace('"Réception"', '"Accueil"')
    expect(() =>
      extraireJson(`Avant :
${json}
Après :
${autre}
bouton {}`),
    ).toThrow(/plusieurs listes/)
    expect(
      extraireJson(`${json}
de nouveau :
${json}`),
    ).toBe(json)
  })

  it('un texte sans fichier le dit', () => {
    expect(() =>
      extraireJson('Voici la procédure : appeler le 18, sortir.'),
    ).toThrow(/ne contient pas de changements/)
  })

  it('un JSON qui n’est pas un export passe à la lecture, qui dira pourquoi', () => {
    expect(extraireJson('voici {"a": 1} fin')).toBe('{"a": 1}')
  })
})
