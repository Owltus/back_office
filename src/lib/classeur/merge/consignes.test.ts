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
import { lireChangements } from '#/lib/classeur/merge/changements.ts'
import { NOTE_EXPORT, construireExport } from '#/lib/classeur/merge/schema.ts'

/*
 * Mode d'emploi pour une IA (étape 2 du plan `classeur-echange-ia-2026-10-19`).
 * Oracle : la demande de l'utilisateur du 2026-10-19, découpée en sept parties
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
      // Questions et contrôle (2026-10-23).
      'pose UNE question à la fois',
      'des choix courts (A ou B ?)',
      'qui lira le document',
      'ne pose que la question la plus importante',
      // Sans friction (2026-10-25) : choix cliquables quand l'outil existe.
      'questions à choix cliquables (Claude en a un)',
      'ton choix conseillé en premier',
      "numérote les choix pour qu'on réponde d'un chiffre",
      "Ne demande jamais à la personne d'écrire elle-même une consigne",
    ],
  ],
  [
    '2. RÉPONDRE À UNE QUESTION',
    [
      'uniquement à partir du contenu de ce fichier',
      "en citant le chapitre et le titre de l'élément",
      "Si l'information n'y est pas, dis-le",
      'Pas de JSON dans ce cas',
      "n'invente JAMAIS un fait",
      'numéro de téléphone',
      'règle légale',
      'demande-le à la personne',
    ],
  ],
  [
    '3. MODIFIER',
    [
      'reformule ce que tu as compris',
      'propose un plan court',
      "attends l'accord",
      "accord d'avance (faites directement), passe au résultat sans plan",
      "si un point est flou, pose d'abord ta question",
      "Une suppression que la personne n'a pas nommée elle-même se confirme à part",
      'dans un seul bloc de code',
      'À SUPPRIMER',
      'À DÉPLACER',
      'À MODIFIER',
      'À AJOUTER',
      'qui disent exactement la même chose que la liste',
      "comment l'importer",
      'montre chaque changement avant de valider',
    ],
  ],
  [
    '4. COHÉRENCE',
    [
      'relis tout le fichier comme un contrôleur',
      'gauche ici, droite là',
      'un doublon',
      'une étape qui manque ou dans le désordre',
      'rangé dans le mauvais chapitre',
      'Dis précisément où (chapitre, élément, étape)',
      'ne tranche jamais seul',
      'Une modification ne doit créer aucune contradiction',
      'les autres endroits qui la citent',
      // Essai à blanc du 2026-10-23 : trois hésitations levées.
      'mets-les à jour dans les mêmes changements et dis-le dans la liste',
      'sans bloc de code',
      // Sans friction (2026-10-25) : le LLM propose de lui-même.
      "N'attends pas qu'on te le demande : dès ta première réponse",
      'tout corriger, voir la liste, ou plus tard',
      'propose de même ce qui reste',
      'Rien ne change sans son accord',
      'fais cet audit en entier',
      'le plus grave en premier',
      "une légende d'image qui ne correspond pas au texte",
      "ce qui s'imprime mal (les règles d'écriture de la partie 6",
    ],
  ],
  [
    '5. PROPOSER DES IDÉES',
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
    "6. L'APPLICATION",
    [
      '4 natures',
      '`document`',
      '`tracking_sheet`',
      '`signature_sheet`',
      '`intercalaire`',
      '`_metadata.periodicites`, jamais inventé',
      'entier de 1 à 60',
      // Images (2026-10-23) : à venir, mise en page logique, chemins repris.
      'tu ne vois pas les images',
      "n'en invente jamais",
      'même vers un autre élément de ce fichier',
      'sinon, demande',
      'IMAGE À VENIR',
      'jamais pour décorer',
      'MISE EN PAGE, la même pour une image du classeur et une image à venir',
      'une consigne qui va avec sa photo → bloc `:::etape`',
      'plusieurs photos à comparer ou à repérer → bloc `:::photos`',
      'une capture d\'écran à lire → image seule, `"pleine"`',
      "le titre de l'étape reste AU-DESSUS du bloc",
      'jamais un bloc dans un autre',
      'elle règle la largeur de la colonne photo',
      'Dans `:::photos`, pas de taille',
      // Règles d'écriture (2026-10-24), miroir de la relecture de l'app.
      "RÈGLES D'ÉCRITURE",
      'une action par étape, 35 mots au plus',
      'jamais une ligne en gras seule',
      'pas de niveau de titre sauté',
      "chaque image a une légende qui dit ce qu'elle montre",
      // Essai à blanc du 2026-10-23 : la syntaxe de la taille n'était pas montrée.
      'entre guillemets après le chemin (`![légende](chemin "pleine")`)',
    ],
  ],
  [
    '7. LIMITES',
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

describe("mode d'emploi pour une IA — les sept parties dans les TROIS exports", () => {
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
        t.indexOf('Tu peux changer'),
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

describe("mode d'emploi — changements balisés (décision du 2026-10-23)", () => {
  it.each(Object.entries(LES_TROIS))(
    '%s : seulement les changements, chacun avec son action',
    (_nom, instructions) => {
      const t = texte(instructions)
      expect(t).toContain(
        'Ne renvoie JAMAIS le classeur ni ce qui ne change pas',
      )
      for (const a of ['"modifier"', '"supprimer"', '"deplacer"', '"ajouter"'])
        expect(t, a).toContain(`\`${a}\``)
      expect(t).toContain('les SEULS champs qui changent')
      expect(t).toContain('le `title` actuel')
      // Essai à blanc du 2026-10-23 : deux LLM sur deux hésitaient pour un chapitre.
      expect(t).toContain('`title` (ou `label`) actuel')
      expect(t).toContain('jamais un numéro')
      expect(t).toContain('Un changement sans `action` est ignoré')
      expect(t).toContain('corbeille')
      // L'ancien format a disparu.
      expect(t).not.toContain('"supprimer": true')
      expect(t).not.toContain('Ne retire JAMAIS un élément du fichier')
      expect(t).not.toMatch(/fichier COMPLET|Garde dans ta réponse TOUS/)
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

  it('la liste en clair précède le bloc, et parle à la personne', () => {
    const t = texte(LES_TROIS.classeur)
    expect(t.indexOf('À SUPPRIMER')).toBeLessThan(
      t.indexOf('un seul bloc de code'),
    )
    expect(t).toContain('sans titre vide')
  })
})

describe("mode d'emploi — taille", () => {
  it('moins de 11 ko par export (JSON sérialisé)', () => {
    for (const [nom, i] of Object.entries(LES_TROIS)) {
      const octets = new TextEncoder().encode(JSON.stringify(i)).length
      expect(octets, nom).toBeLessThan(11000)
    }
  })
})

describe("mode d'emploi — réponse courte (navigateur, 2026-10-22)", () => {
  // Quatre LLM sur quatre recopiaient tout `_metadata` (schéma et mode
  // d'emploi : 14 ko sur 22) : sur un gros classeur, une réponse coupée.
  it.each(Object.entries(LES_TROIS))(
    '%s : ne garder de `_metadata` que `portee`, `periodicites` et `generated_at`',
    (_nom, instructions) => {
      expect(texte(instructions)).toContain(
        '`{ "_metadata": { "portee", "periodicites", "generated_at" }, "changements": [ … ] }`',
      )
    },
  )

  it('la note du bloc dit la même chose (plus « Ne modifie pas ce bloc »)', () => {
    expect(NOTE_EXPORT).toContain('ne garde de ce bloc que `portee`')
    expect(NOTE_EXPORT).not.toContain('Ne modifie pas')
  })

  it('une réponse au `_metadata` réduit garde sa portée et sa date', () => {
    const complet = construireExportDocument(classeur(), A, doc, PERIODICITES)
    const lu = lireChangements(
      JSON.stringify({
        _metadata: {
          portee: complet._metadata.portee,
          periodicites: complet._metadata.periodicites,
          generated_at: complet._metadata.generated_at,
        },
        changements: [],
      }),
    )
    expect(lu.portee).toEqual(complet._metadata.portee)
    expect(lu.periodicites).toEqual(complet._metadata.periodicites)
    expect(lu.exporteLe).toBe(complet._metadata.generated_at)
  })

  it('un chapitre se supprime, se déplace et s’ajoute depuis le classeur', () => {
    const t = texte(LES_TROIS.classeur)
    expect(t).toContain('Supprimer un chapitre emporte ses éléments')
    expect(t).toContain('`"chapitre": "nouveau-1"`')
    expect(texte(LES_TROIS.chapitre)).toContain(
      "pour ajouter, supprimer ou déplacer un chapitre, il faut l'export du classeur entier",
    )
  })
})
