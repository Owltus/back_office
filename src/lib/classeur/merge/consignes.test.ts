import { describe, expect, it } from 'vitest'

import {
  consignesChapitre,
  consignesClasseur,
  consignesDocument,
} from '#/lib/classeur/merge/consignes.ts'
import {
  PERIODICITES,
  chapitre,
  classeur,
  document,
  etat,
} from '#/lib/classeur/merge/fixtures.ts'
import {
  construireExportChapitre,
  construireExportDocument,
} from '#/lib/classeur/merge/portee.ts'
import {
  NOTE_EXPORT,
  construireExport,
  parseImportJson,
} from '#/lib/classeur/merge/schema.ts'

/*
 * Mode d'emploi pour une IA (étape 2 du plan `classeur-echange-ia-2026-10-19`).
 * Oracle : la demande de l'utilisateur du 2026-10-19, découpée en six parties
 * (à qui tu parles, répondre, modifier, proposer, l'application, les limites)
 * et la règle du « quatrième mur ». Chaque partie est réclamée par des
 * MARQUEURS dans les TROIS exports ; le test « les TROIS exports » de
 * `portee.test.ts` garde, lui, les conventions de mise en page.
 */

const A = chapitre({ id: 10, label: 'Accueil' })
const doc = document({ id: 1, chapter_id: 10, title: 'Check-in' })
const contenu = etat([A], { documents: [doc] }).content

const LES_TROIS = {
  classeur: construireExport(classeur(), [A], contenu, PERIODICITES)._metadata
    ?.instructions,
  chapitre: construireExportChapitre(classeur(), A, contenu, PERIODICITES)
    ._metadata.instructions,
  document: construireExportDocument(classeur(), A, doc, PERIODICITES)._metadata
    .instructions,
}

const texte = (i: string[] | undefined) => (i ?? []).join('\n')

/** Marqueurs exigés, partie par partie (titre de la partie en tête). */
const PARTIES: Array<[string, string[]]> = [
  [
    '1. À QUI TU PARLES',
    [
      "personnel d'hôtel",
      'Mots simples, une chose à la fois',
      'Ne parle jamais de JSON',
      'commence par le lui demander',
      'poser une question sur le contenu',
      'mettre à jour ou corriger',
      'ajouter un chapitre, un document ou une feuille',
      'créer quelque chose à partir du contenu',
    ],
  ],
  [
    '2. RÉPONDRE À UNE QUESTION',
    [
      'uniquement à partir du contenu de ce fichier',
      "en citant le chapitre et le titre de l'élément",
      "Si l'information n'y est pas, dis-le",
      'Pas de JSON dans ce cas',
    ],
  ],
  [
    '3. MODIFIER',
    [
      'reformule ce que tu as compris',
      'propose un plan court',
      "attends l'accord",
      'dans un seul bloc de code',
      "comment l'importer",
      'montre chaque changement avant de valider',
    ],
  ],
  [
    '4. PROPOSER DES IDÉES',
    [
      'un document qui manque',
      'une étape floue',
      '`a-inserer`',
      '`[!WARNING]`',
      'une feuille de suivi pour un contrôle périodique',
      'une feuille de signature pour une formation ou une prise de connaissance',
      'un intercalaire',
    ],
  ],
  [
    "5. L'APPLICATION",
    [
      '4 natures',
      '`document`',
      '`tracking_sheet`',
      '`signature_sheet`',
      '`intercalaire`',
      '`_metadata.periodicites`, jamais inventé',
      'entier de 1 à 60',
    ],
  ],
  [
    '6. LIMITES',
    [
      'un LLM peut se tromper',
      'un document réglementaire se relit avant',
      'DANS LA CONVERSATION',
      // Le quatrième mur : jamais dans le contenu, qui est imprimé.
      "n'écris jamais dans un titre, une description ou un contenu du classeur",
      "une mention du LLM ou de l'IA, d'une vérification à faire, d'un brouillon ou d'un doute",
      'imprimé tel quel',
    ],
  ],
]

describe("mode d'emploi pour une IA — les six parties dans les TROIS exports", () => {
  it.each(Object.entries(LES_TROIS))(
    '%s : chaque partie, ses marqueurs, dans l’ordre',
    (_nom, instructions) => {
      const t = texte(instructions)
      let precedent = -1
      for (const [titre, marqueurs] of PARTIES) {
        const debut = t.indexOf(titre)
        expect(debut, titre).toBeGreaterThan(precedent)
        precedent = debut
        for (const m of marqueurs) expect(t, `${titre} : ${m}`).toContain(m)
      }
    },
  )

  it.each(Object.entries(LES_TROIS))(
    '%s : plus de règle « JSON seul » ni de remplacement imposé',
    (_nom, instructions) => {
      const t = texte(instructions)
      expect(t).not.toMatch(/ta réponse doit être le JSON complet/)
      expect(t).not.toMatch(/réimporte en REMPLACEMENT/)
      expect(t).not.toContain('_metadata.demande')
      // Le JSON ne vient qu'APRÈS l'accord.
      expect(t.indexOf("attends l'accord")).toBeLessThan(
        t.indexOf('un seul bloc de code'),
      )
    },
  )

  it.each(Object.entries(LES_TROIS))(
    '%s : `periodicite_id` et `nombre` deviennent modifiables (D4), le reste reste interdit',
    (_nom, instructions) => {
      const t = texte(instructions)
      const interdits = t.slice(t.indexOf('Ne modifie JAMAIS'))
      const phrase = interdits.slice(0, interdits.indexOf('.'))
      for (const cle of ['`uuid`', '`kind`', '`_metadata`', "chemins d'images"])
        expect(phrase, cle).toContain(cle)
      expect(phrase).not.toContain('periodicite_id')
      expect(phrase).not.toContain('`nombre`')
      const permis = t.slice(
        t.indexOf('Tu peux modifier'),
        t.indexOf('Ne modifie JAMAIS'),
      )
      expect(permis).toContain('`periodicite_id`')
      expect(permis).toContain('`nombre`')
    },
  )
})

describe("mode d'emploi — ce qui dépend de la portée", () => {
  it('classeur : importer depuis l’accueil, ajouter un chapitre', () => {
    const t = texte(LES_TROIS.classeur)
    expect(t).toMatch(/^PORTÉE : le classeur/)
    expect(t).toContain("sur l'accueil du classeur, ligne Importer :")
    // Étape 9 (2026-10-20) : plus aucun choix à l'import.
    expect(t).not.toContain('Fichier rendu par une IA')
    expect(t).toContain('coller le bloc')
    expect(t).not.toContain('enregistrer le bloc dans un fichier')
    expect(t).toContain('AJOUTER un chapitre')
    expect(t).toContain('AJOUTER un élément')
  })

  it('chapitre : bouton accolades, partie Réimporter ; pas d’ajout de chapitre', () => {
    const t = texte(LES_TROIS.chapitre)
    expect(t).toMatch(/^PORTÉE : le chapitre/)
    expect(t).toContain('sur la page du chapitre, bouton accolades {}')
    expect(t).toContain('partie Réimporter')
    expect(t).toContain('AJOUTER un élément')
    expect(t).not.toContain('AJOUTER un chapitre')
  })

  it('document : bouton accolades ; une question plus large demande un export plus large', () => {
    const t = texte(LES_TROIS.document)
    expect(t).toMatch(/^PORTÉE : le seul document/)
    expect(t).toContain('sur la page du document, bouton accolades {}')
    expect(t).toContain('pour une question plus large')
    expect(t).toContain("demande l'export du chapitre")
    expect(t).not.toContain('AJOUTER un')
  })

  it('la portée nomme ce qui est exporté', () => {
    expect(consignesClasseur('Registre X')[0]).toContain('Registre X')
    expect(consignesChapitre('Chapitre Y')[0]).toContain('Chapitre Y')
    const d = consignesDocument('Doc Z', 'Chap W')[0]
    expect(d).toContain('Doc Z')
    expect(d).toContain('Chap W')
  })
})

describe("mode d'emploi — un seul classeur (décision utilisateur)", () => {
  it('les TROIS exports interdisent de fusionner deux classeurs', () => {
    for (const [nom, i] of Object.entries(LES_TROIS))
      expect(texte(i), nom).toContain(
        "Un seul classeur par fichier : n'en fusionne jamais deux.",
      )
  })
})

describe("mode d'emploi — suppression explicite (décision du 2026-10-20)", () => {
  it.each(Object.entries(LES_TROIS))(
    '%s : ne jamais retirer, marquer `"supprimer": true`',
    (_nom, instructions) => {
      const t = texte(instructions)
      expect(t).toContain('Ne retire JAMAIS un élément du fichier')
      expect(t).toContain('garde-le et ajoute `"supprimer": true`')
      expect(t).toContain('corbeille')
      // Plus aucune case ni choix de provenance à l'import.
      expect(t).not.toMatch(
        /coche l'option|option à l'import|Fichier de Registre|Importer un JSON/,
      )
    },
  )

  it.each(Object.entries(LES_TROIS))(
    '%s : ce qui est créé à partir du contenu reste dans la conversation',
    (_nom, instructions) => {
      const t = texte(instructions)
      expect(t).toContain('reste dans la conversation')
      expect(t).toContain("sauf si elle veut l'ajouter au classeur")
    },
  )
})

describe("mode d'emploi — taille", () => {
  it('moins de 6 ko par export (JSON sérialisé)', () => {
    for (const [nom, i] of Object.entries(LES_TROIS)) {
      const octets = new TextEncoder().encode(JSON.stringify(i)).length
      expect(octets, nom).toBeLessThan(6000)
    }
  })
})

describe("mode d'emploi — réponse courte (navigateur, 2026-10-22)", () => {
  // Quatre LLM sur quatre recopiaient tout `_metadata` (schéma et mode
  // d'emploi : 14 ko sur 22) : sur un gros classeur, une réponse coupée.
  it.each(Object.entries(LES_TROIS))(
    '%s : ne garder de `_metadata` que `portee` et `periodicites`',
    (_nom, instructions) => {
      expect(texte(instructions)).toContain(
        "dans ta réponse, n'en garde que `portee` et `periodicites`",
      )
    },
  )

  it('la note du bloc dit la même chose (plus « Ne modifie pas ce bloc »)', () => {
    expect(NOTE_EXPORT).toContain('ne garde de ce bloc que `portee`')
    expect(NOTE_EXPORT).not.toContain('Ne modifie pas')
  })

  it('une réponse au `_metadata` réduit garde sa portée', () => {
    const complet = construireExportDocument(classeur(), A, doc, PERIODICITES)
    const reduit = {
      ...complet,
      _metadata: {
        portee: complet._metadata?.portee,
        periodicites: complet._metadata?.periodicites,
      },
    }
    const lu = parseImportJson(JSON.stringify(reduit))
    expect(lu._metadata?.portee).toEqual(complet._metadata?.portee)
    expect(lu._metadata?.periodicites).toEqual(complet._metadata?.periodicites)
  })

  it('« supprimer » vaut aussi pour un chapitre', () => {
    expect(texte(LES_TROIS.classeur)).toContain(
      'pour en supprimer un (ou un chapitre)',
    )
  })
})
