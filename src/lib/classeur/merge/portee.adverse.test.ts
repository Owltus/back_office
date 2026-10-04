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
  planifierFusionPortee,
} from '#/lib/classeur/merge/portee.ts'
import { parseImportJson } from '#/lib/classeur/merge/schema.ts'
import { composerDemande, texteACopier } from '#/lib/classeur/llmDemandes.ts'

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
  it('LLM qui scinde un document en gardant le uuid sur les deux moitiés : pas deux modifications du même document', () => {
    const f = fichier([
      chJson({
        label: 'Réception',
        uuid: 'ch-1',
        items: [
          itJson({
            kind: 'document',
            uuid: 'doc-5',
            title: 'Check-in (1/2)',
            content: 'première moitié',
            sort_order: 1,
          }),
          itJson({
            kind: 'document',
            uuid: 'doc-5',
            title: 'Check-in (2/2)',
            content: 'seconde moitié',
            sort_order: 2,
          }),
        ],
      }),
    ])
    const plan = planifierFusionPortee(
      etat([ch], { documents: [docX] }),
      f,
      { type: 'chapitre', chapitreId: 1 },
      { supprimerAbsents: false },
    )
    const modifs = plan.actions.filter(
      (a) => a.type === 'modifierItem' && a.id === 5,
    )
    expect(modifs).toHaveLength(1)
    const creations = plan.actions.filter((a) => a.type === 'creerItem')
    expect(creations).toHaveLength(1)
    // uuid unique en base : la copie est créée SANS le uuid déjà pris.
    expect(creations[0]).toMatchObject({ uuid: null })
  })

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

describe('extraireJson face à une demande copiée (étape 3)', () => {
  const exportJson = () =>
    JSON.stringify(
      construireExportChapitre(
        classeur(),
        ch,
        etat([ch], { documents: [docX] }).content,
        PERIODICITES,
        new Date('2026-10-04T10:00:00Z'),
        composerDemande(['traduire'], ''),
      ),
      null,
      2,
    )

  it('le texte COPIÉ (demande « Traduire » en tête) se réimporte tel quel', () => {
    const json = exportJson()
    const copie = texteACopier(json, composerDemande(['traduire'], ''))
    expect(() => parseImportJson(extraireJson(copie))).not.toThrow()
  })

  it('une réponse de LLM qui cite `:::etape{photo=gauche}` avant le JSON', () => {
    const json = exportJson()
    const reponse = `J'ai gardé les lignes \`:::etape{photo=gauche}\` intactes.\n\`\`\`json\n${json}\n\`\`\`\nN'hésitez pas.`
    expect(() => parseImportJson(extraireJson(reponse))).not.toThrow()
  })
})
