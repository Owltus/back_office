import { describe, expect, it } from 'vitest'

import {
  evolutionVersion,
  libelleVersion,
} from '#/lib/classeur/versionDocument.ts'
import type { EtatDocument } from '#/lib/classeur/versionDocument.ts'

const V = { majeure: 1, mineure: 2 }
const doc = (
  content: string,
  title = 'Titre',
  description = 'Objet',
): EtatDocument => ({
  title,
  description,
  content,
})
const BASE = `## Accès

Prendre les clés de la chaufferie à la réception. Ouvrir la porte du local technique situé au sous-sol.

### 1. Ouvrir la vanne

Tourner la poignée rouge d'un quart de tour vers la gauche, sans forcer, jusqu'à la butée.

### 2. Lire le thermomètre

La température doit dépasser 55 °C au départ du ballon.

> [!WARNING]
> Ne jamais fermer les deux vannes en même temps.
`
const evo = (apres: string, avant = BASE) =>
  evolutionVersion(doc(avant), doc(apres), V)

describe('numéro de version automatique', () => {
  it('libellé X.Y', () => {
    expect(libelleVersion({ majeure: 3, mineure: 4 })).toBe('3.4')
  })

  it('forme seulement : espaces, ponctuation, majuscules → inchangé', () => {
    const e = evo(
      BASE.replace('Prendre les clés', 'prendre  les clés,').replace(
        'butée.',
        'butée !',
      ),
    )
    expect(e).toEqual({ saut: 'aucun', raison: '', suivante: V })
  })

  it('une faute corrigée (≤ 3 mots) → inchangé', () => {
    expect(evo(BASE.replace('poignée rouge', 'poignee rouge')).saut).toBe(
      'aucun',
    )
    expect(evo(BASE.replace('sans forcer', 'sans trop forcer')).saut).toBe(
      'aucun',
    )
  })

  it('un chiffre changé n’est jamais une correction → + 0.1', () => {
    const e = evo(BASE.replace('55 °C', '60 °C'))
    expect(e.saut).toBe('mineur')
    expect(e.suivante).toEqual({ majeure: 1, mineure: 3 })
    expect(e.raison).toBe('valeur modifiée')
  })

  it('phrase réécrite → + 0.1', () => {
    const e = evo(
      BASE.replace(
        "Tourner la poignée rouge d'un quart de tour vers la gauche",
        'Pousser le levier bleu complètement vers le haut puis le bloquer',
      ),
    )
    expect(e.saut).toBe('mineur')
    expect(e.raison).toBe('texte modifié')
  })

  it('image ajoutée ou remplacée → + 0.1', () => {
    const avec = `${BASE}\n![Vanne](5/a.webp)\n`
    expect(evo(avec).raison).toBe('image ajoutée')
    expect(evo(avec.replace('5/a.webp', '5/b.webp'), avec).raison).toBe(
      'image remplacée',
    )
    expect(evo(avec.replace('5/a.webp', 'a-inserer'), avec).saut).toBe('mineur')
  })

  it('titre ou description du document changés → + 0.1', () => {
    expect(
      evolutionVersion(doc(BASE), doc(BASE, 'Autre titre complet'), V).raison,
    ).toBe('titre modifié')
    expect(
      evolutionVersion(doc(BASE), doc(BASE, 'Titre', 'Nouvel objet'), V).raison,
    ).toBe('description modifiée')
  })

  it('étape ajoutée ou retirée → version majeure X+1.0', () => {
    const ajout = BASE.replace(
      '> [!WARNING]',
      '### 3. Noter la valeur\n\nNoter la valeur.\n\n> [!WARNING]',
    )
    expect(evo(ajout)).toEqual({
      saut: 'majeur',
      raison: 'étape ajoutée',
      suivante: { majeure: 2, mineure: 0 },
    })
    expect(evo(BASE, ajout).raison).toBe('étape retirée')
    expect(evo(`${BASE}\n1. Un\n2. Deux\n`).raison).toBe('2 étapes ajoutées')
  })

  it('partie ajoutée, retirée ou renommée → majeure', () => {
    expect(evo(BASE.replace('## Accès', '## Accès au local')).raison).toBe(
      'partie renommée',
    )
    expect(evo(`${BASE}\n## Annexe\n\nTexte.\n`).raison).toBe('partie ajoutée')
  })

  it('encadré Attention changé → majeure ; une Note → mineure', () => {
    expect(
      evo(BASE.replace('les deux vannes', 'la vanne du retour')).raison,
    ).toBe('consigne de sécurité modifiée')
    const note = `${BASE}\n> [!NOTE]\n> Une remarque utile sur le carnet de suivi et sa tenue.\n`
    expect(evo(note).saut).toBe('mineur')
  })

  it('plus de 30 % du texte changé → majeure', () => {
    const autre = BASE.replace(
      'Prendre les clés de la chaufferie à la réception. Ouvrir la porte du local technique situé au sous-sol.',
      'Demander le badge au veilleur de nuit, descendre par l’escalier de service, longer le couloir des réserves, désactiver l’alarme du local, puis allumer la lumière.',
    ).replace(
      "Tourner la poignée rouge d'un quart de tour vers la gauche, sans forcer, jusqu'à la butée.",
      'Repérer le volant noir derrière la pompe et le manœuvrer lentement dans le sens horaire.',
    )
    expect(evo(autre).raison).toBe('texte largement réécrit')
  })

  it('le pire changement l’emporte : correction + étape = majeure', () => {
    const e = evo(
      BASE.replace('poignée rouge', 'poignee rouge') + '\n### 3. Fermer\n',
    )
    expect(e.saut).toBe('majeur')
  })

  it('un titre dans un bloc de code n’est pas une partie', () => {
    const code = `${BASE}\n\`\`\`\n## Exemple\n\`\`\`\n`
    expect(evo(code).saut).not.toBe('majeur')
  })

  it('part toujours du numéro ACTUEL (reprise d’une ancienne version)', () => {
    // Le document est en 2.1 ; on reprend le texte d'une ancienne 1.2 :
    // nouveau numéro, jamais l'ancien.
    const ancien = BASE.replace('55 °C', '50 °C')
    const e = evolutionVersion(doc(BASE), doc(ancien), {
      majeure: 2,
      mineure: 1,
    })
    expect(e.suivante).toEqual({ majeure: 2, mineure: 2 })
  })
})

describe('audit du 2026-10-04 : cas corrigés', () => {
  const v = { majeure: 1, mineure: 0 }
  const evo2 = (a: string, b: string) => evolutionVersion(doc(a), doc(b), v)
  it('première rédaction d’un document vide : il reste en 1.0', () => {
    const e = evo2('', 'Bonjour à tous, voici la consigne.')
    expect(e.suivante).toEqual(v)
    expect(e.raison).toBe('première rédaction')
  })
  it('deux étapes inversées → majeure', () => {
    const a =
      '1. Couper le courant\n2. Ouvrir le tableau\n3. Remplacer le fusible'
    const b =
      '1. Ouvrir le tableau\n2. Couper le courant\n3. Remplacer le fusible'
    expect(evo2(a, b).raison).toBe('ordre des étapes modifié')
  })
  it('une négation ajoutée n’est jamais une correction de forme', () => {
    const a = `${BASE}\nIl faut couper le courant avant toute intervention sur le tableau électrique.`
    const b = `${BASE}\nIl ne faut pas couper le courant avant toute intervention sur le tableau électrique.`
    expect(evo2(a, b).saut).toBe('mineur')
    expect(evo2(a, b).raison).toMatch(/consigne/)
  })
  it('cocher une case, remplir un emplacement : pas de version majeure', () => {
    const a = '- [ ] Vérifier la vanne\n- [ ] Noter la valeur'
    expect(evo2(a, a.replace('- [ ] Vérifier', '- [x] Vérifier')).saut).toBe(
      'aucun',
    )
    const e = '![Vanne](a-inserer)\n\nTexte court.'
    expect(
      evo2(
        e,
        e.replace('a-inserer', '5/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.webp'),
      ).saut,
    ).toBe('mineur')
  })
  it('puces passées en liste numérotée : simple mise en forme', () => {
    const a = '- Ouvrir\n- Vérifier\n- Fermer'
    const b = '1. Ouvrir\n2. Vérifier\n3. Fermer'
    expect(evo2(a, b).saut).toBe('aucun')
  })
  it('document court : deux mots changés ne font pas une réécriture', () => {
    expect(evo2('Fermer la porte.', 'Ouvrir la fenêtre.').saut).toBe('mineur')
  })
})
