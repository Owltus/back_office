import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { POSTER } from '#/lib/poster/config.ts'
import {
  calculateAutoSizes,
  calculateIconSize,
} from '#/lib/poster/sizeCalculator.ts'

/*
 * `sizeCalculator` ne mesure RIEN dans le navigateur : aucune `canvas`, aucun
 * `measureText`. Il estime la largeur d'un caractère par un facteur fixe de la
 * taille de police. Il n'y a donc rien à simuler : les tests appellent la
 * fonction telle quelle.
 *
 * Oracles utilisés (jamais une sortie observée) :
 *   - BORNES : plages déclarées dans le calculateur et rappelées par l'UI
 *     (titre 20-80 px, message 12-40 px, infos 10-28 px ; icône 80-180 px,
 *     « Limites de sécurité ») ;
 *   - HIÉRARCHIE : un titre n'est jamais plus petit que le message, ni le
 *     message que les infos (règle typographique de toute affiche) ;
 *   - MONOTONIE : allonger un texte ne peut pas faire GRANDIR une police ;
 *   - TIENT DANS L'AFFICHE : modèle INDÉPENDANT (`hauteurReelle` ci-dessous),
 *     qui coupe les lignes mot par mot comme le navigateur
 *     (`overflow-wrap: break-word`, `styles/poster.css`) avec les interlignes
 *     du CSS (1,1 / 1,6 / 2) ; la zone vient de `POSTER` (A3 moins marges).
 */

const RUNS = 2000

const BORNES = {
  titre: { min: 20, max: 80 },
  message: { min: 12, max: 40 },
  infos: { min: 10, max: 28 },
  icone: { min: 80, max: 180 },
}

// Texte « humain » : mots de 1 à 14 lettres, accents, ponctuation, retours.
const mot = fc
  .array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzéèàçôû'.split('')), {
    minLength: 1,
    maxLength: 14,
  })
  .map((l) => l.join(''))
const texte = (maxMots: number) =>
  fc
    .array(fc.tuple(mot, fc.constantFrom(' ', ' ', ' ', ', ', '\n')), {
      maxLength: maxMots,
    })
    .map((ms) =>
      ms
        .map(([m, s]) => m + s)
        .join('')
        .trim(),
    )

const options = fc.record({
  icone: fc.boolean(),
  dates: fc.boolean(),
  heures: fc.boolean(),
  anglais: fc.boolean(),
})

type Options = {
  icone: boolean
  dates: boolean
  heures: boolean
  anglais: boolean
}

function tailles(
  t: { titreFr: string; messageFr: string; titreEn: string; messageEn: string },
  o: Options,
) {
  return calculateAutoSizes(
    t.titreFr,
    t.messageFr,
    t.titreEn,
    t.messageEn,
    o.icone,
    o.dates,
    o.heures,
    o.anglais,
  )
}

const contenu = fc.record({
  titreFr: texte(8),
  messageFr: texte(80),
  titreEn: texte(8),
  messageEn: texte(80),
})

function verifierBornes(s: ReturnType<typeof calculateAutoSizes>) {
  expect(s.fontSizeTitle).toBeGreaterThanOrEqual(BORNES.titre.min)
  expect(s.fontSizeTitle).toBeLessThanOrEqual(BORNES.titre.max)
  expect(s.fontSizeMessage).toBeGreaterThanOrEqual(BORNES.message.min)
  expect(s.fontSizeMessage).toBeLessThanOrEqual(BORNES.message.max)
  expect(s.fontSizeInfo).toBeGreaterThanOrEqual(BORNES.infos.min)
  expect(s.fontSizeInfo).toBeLessThanOrEqual(BORNES.infos.max)
  // Une taille de police CSS en px entière : l'UI l'affiche sur un curseur
  // à pas de 1.
  expect(Number.isInteger(s.fontSizeTitle)).toBe(true)
  expect(Number.isInteger(s.fontSizeMessage)).toBe(true)
  expect(Number.isInteger(s.fontSizeInfo)).toBe(true)
}

/*
 * Modèle indépendant de rendu : coupure GLOUTONNE mot par mot (ce que fait le
 * navigateur), un mot plus long que la ligne coupé en morceaux
 * (`overflow-wrap: break-word`), un `\n` = nouvelle ligne seulement si le CSS
 * garde les retours. Le message est en `max-width: 90 %`. Largeur moyenne
 * d'un glyphe : hypothèse de 0,55 em pour le titre (gras) et 0,50 em pour le
 * corps — ordre de grandeur de Poppins, c'est la seule donnée partagée avec
 * le calculateur (une vraie mesure demanderait un navigateur).
 */
function lignes(texteBrut: string, largeurPx: number, glyphePx: number) {
  const parLigne = Math.max(1, Math.floor(largeurPx / glyphePx))
  let n = 0
  for (const paragraphe of texteBrut.split('\n')) {
    const mots = paragraphe.split(/\s+/).filter((m) => m.length > 0)
    let ligne = 0
    let compte = mots.length === 0 ? 1 : 0
    for (const m of mots) {
      const l = [...m].length
      if (l > parLigne) {
        if (ligne > 0) compte++
        compte += Math.floor(l / parLigne)
        ligne = l % parLigne
        if (ligne === 0) compte--
        continue
      }
      const besoin = ligne === 0 ? l : ligne + 1 + l
      if (besoin <= parLigne) ligne = besoin
      else {
        compte++
        ligne = l
      }
    }
    if (ligne > 0) compte++
    n += compte
  }
  return Math.max(1, n)
}

function hauteurReelle(
  titre: string,
  message: string,
  s: ReturnType<typeof calculateAutoSizes>,
  nbInfos: number,
  largeurTexte: number,
) {
  // Le titre est un `<h1>` en `white-space: normal` : un retour y vaut une
  // espace. Le message, lui, rend chaque retour en `<br />` (`Poster.tsx`).
  const titreRendu = titre.replace(/\n/g, ' ')
  const hTitre =
    s.fontSizeTitle *
    1.1 *
    lignes(titreRendu, largeurTexte, s.fontSizeTitle * 0.55)
  const hMessage =
    s.fontSizeMessage *
    1.6 *
    lignes(message, largeurTexte * 0.9, s.fontSizeMessage * 0.5)
  const hInfos = nbInfos * s.fontSizeInfo * 2
  return hTitre + hMessage + hInfos
}

describe('calculateAutoSizes — propriétés', () => {
  it('BORNES : toutes les tailles restent dans leur plage, quel que soit le texte', () => {
    fc.assert(
      fc.property(contenu, options, (t, o) => {
        verifierBornes(tailles(t, o))
      }),
      { numRuns: RUNS },
    )
  })

  it('BORNES : même sur des chaînes arbitraires (unicode, émojis, contrôles)', () => {
    const libre = fc.string({ unit: 'binary', maxLength: 600 })
    fc.assert(
      fc.property(libre, libre, libre, libre, options, (a, b, c, d, o) => {
        verifierBornes(
          tailles({ titreFr: a, messageFr: b, titreEn: c, messageEn: d }, o),
        )
      }),
      { numRuns: RUNS },
    )
  })

  it('HIÉRARCHIE : titre ≥ message ≥ infos', () => {
    fc.assert(
      fc.property(contenu, options, (t, o) => {
        const s = tailles(t, o)
        expect(s.fontSizeTitle).toBeGreaterThanOrEqual(s.fontSizeMessage)
        expect(s.fontSizeMessage).toBeGreaterThanOrEqual(s.fontSizeInfo)
      }),
      { numRuns: RUNS },
    )
  })

  it('DÉTERMINISME : même entrée, même sortie (calcul pur, aucun état)', () => {
    fc.assert(
      fc.property(contenu, options, (t, o) => {
        expect(tailles(t, o)).toEqual(tailles(t, o))
      }),
      { numRuns: 300 },
    )
  })

  it('MONOTONIE (icône masquée) : DOUBLER le message FR ne fait jamais grandir les tailles', () => {
    // Doubler garde la même longueur moyenne de mot : seule la quantité change.
    fc.assert(
      fc.property(contenu, options, (t, o) => {
        const opt = { ...o, icone: false }
        const avant = tailles(t, opt)
        const apres = tailles(
          { ...t, messageFr: `${t.messageFr} ${t.messageFr}`.trim() },
          opt,
        )
        expect(apres.fontSizeTitle).toBeLessThanOrEqual(avant.fontSizeTitle)
        expect(apres.fontSizeMessage).toBeLessThanOrEqual(avant.fontSizeMessage)
        expect(apres.fontSizeInfo).toBeLessThanOrEqual(avant.fontSizeInfo)
      }),
      { numRuns: RUNS },
    )
  })

  /*
   * DÉFAUT : le nombre de lignes du message est estimé depuis la LONGUEUR
   * MOYENNE des mots. Ajouter un mot court (« a ») fait baisser la moyenne,
   * donc monter le nombre de mots par ligne, donc BAISSER le nombre de lignes
   * estimé : le texte s'allonge et le titre grandit (78 → 80 px). Oracle :
   * monotonie (plus de texte ⇒ pas plus gros). Même sans icône.
   */
  it.fails(
    'DÉFAUT : ajouter un mot court au message fait grandir le titre (sans icône)',
    () => {
      fc.assert(
        fc.property(
          contenu,
          fc.constantFrom('a', 'à', 'y', 'ô'),
          options,
          (t, ajout, o) => {
            const opt = { ...o, icone: false }
            const avant = tailles(t, opt)
            const apres = tailles(
              { ...t, messageFr: `${t.messageFr} ${ajout}`.trim() },
              opt,
            )
            expect(apres.fontSizeTitle).toBeLessThanOrEqual(avant.fontSizeTitle)
          },
        ),
        { numRuns: 10000 },
      )
    },
  )

  it.fails(
    'DÉFAUT (reproduction) : « … aaaaaaa » + « a » → titre 78 → 80 px',
    () => {
      const titre = 'aaa aaaaaaaaaaaa aaaaaaaa aaa aaaaaaaaa'
      const message =
        'aaaaaaaa aaaaaaaaa aaaaaaaaaaa, aaaaaaaaaaaa a aaaaaa, aaaaaaa'
      const avant = calculateAutoSizes(
        titre,
        message,
        '',
        '',
        false,
        false,
        true,
        true,
      )
      const apres = calculateAutoSizes(
        titre,
        `${message} a`,
        '',
        '',
        false,
        false,
        true,
        true,
      )
      expect(apres.fontSizeTitle).toBeLessThanOrEqual(avant.fontSizeTitle)
    },
  )

  it('MONOTONIE (icône masquée) : allonger le titre FR ne fait jamais grandir le titre', () => {
    fc.assert(
      fc.property(contenu, mot, options, (t, ajout, o) => {
        const opt = { ...o, icone: false }
        const avant = tailles(t, opt)
        const apres = tailles(
          { ...t, titreFr: `${t.titreFr} ${ajout}`.trim() },
          opt,
        )
        expect(apres.fontSizeTitle).toBeLessThanOrEqual(avant.fontSizeTitle)
      }),
      { numRuns: RUNS },
    )
  })

  it('MONOTONIE : ajouter la ligne des heures ne fait jamais grandir le titre', () => {
    fc.assert(
      fc.property(contenu, options, (t, o) => {
        const sans = tailles(t, { ...o, heures: false })
        const avec = tailles(t, { ...o, heures: true })
        expect(avec.fontSizeTitle).toBeLessThanOrEqual(sans.fontSizeTitle)
      }),
      { numRuns: RUNS },
    )
  })

  it('MONOTONIE : afficher l’icône ne fait jamais grandir le titre (elle prend de la place)', () => {
    fc.assert(
      fc.property(contenu, options, (t, o) => {
        const sans = tailles(t, { ...o, icone: false })
        const avec = tailles(t, { ...o, icone: true })
        expect(avec.fontSizeTitle).toBeLessThanOrEqual(sans.fontSizeTitle)
      }),
      { numRuns: RUNS },
    )
  })

  /*
   * DÉFAUT : avec l'icône affichée, allonger le texte peut faire GRANDIR le
   * titre. `calculateIconSize` rétrécit l'icône par paliers (175 → 160 px à
   * 101 caractères) ; les 15 px libérés peuvent suffire à faire tenir un cran
   * de police de plus, alors que le texte ajouté n'occupait aucune ligne
   * nouvelle. Sur l'affiche, taper un caractère fait sauter le titre vers le
   * haut. Oracle : la monotonie demandée (plus de texte ⇒ pas plus gros).
   */
  it.fails(
    'DÉFAUT : avec icône, allonger le message peut faire grandir le titre',
    () => {
      fc.assert(
        fc.property(contenu, texte(30), options, (t, ajout, o) => {
          const opt = { ...o, icone: true }
          const avant = tailles(t, opt)
          const apres = tailles(
            { ...t, messageFr: `${t.messageFr} ${ajout}`.trim() },
            opt,
          )
          expect(apres.fontSizeTitle).toBeLessThanOrEqual(avant.fontSizeTitle)
        }),
        { numRuns: RUNS },
      )
    },
  )

  // Reproduction figée (contre-exemple réduit par fast-check) : l'ajout de
  // 65 caractères au message FR fait passer le total de 46 à 111 caractères,
  // l'icône de 175 à 160 px, et le titre GRANDIT.
  it.fails(
    'DÉFAUT (reproduction) : +65 caractères, le titre passe au cran supérieur',
    () => {
      const en = 'a\naaaaaaaaa, aaa\naaaaaa aaaaaaa\naaaa'
      const ajout =
        'aaaaaaaa, aaaaaaaaaa aaaaaa aaaaaaaaaa a aaaaaaaaaaaa, aaaaaa aa'
      const avant = calculateAutoSizes('', '', 'a', en, true, false, true, true)
      const apres = calculateAutoSizes(
        '',
        ajout,
        'a',
        en,
        true,
        false,
        true,
        true,
      )
      expect(apres.fontSizeTitle).toBeLessThanOrEqual(avant.fontSizeTitle)
    },
  )

  it('TIENT DANS L’AFFICHE : texte coupé mot à mot + infos ≤ hauteur utile de l’A3', () => {
    // Zone = A3 moins les marges verticales, moins le logo (toujours là),
    // moins l'icône réellement calculée. Large : on vérifie qu'on ne SORT pas
    // de la feuille, pas le remplissage fin.
    const largeurTexte = POSTER.width - 2 * POSTER.padding.horizontal - 120
    fc.assert(
      fc.property(contenu, options, (t, o) => {
        const s = tailles(t, o)
        const auMinimum =
          s.fontSizeTitle === BORNES.titre.min &&
          s.fontSizeMessage === BORNES.message.min
        fc.pre(!auMinimum) // au plancher, le texte trop long PEUT déborder (assumé)
        const nbInfos = (o.dates ? 1 : 0) + (o.heures ? 1 : 0)
        const icone = o.icone
          ? calculateIconSize(
              t.titreFr,
              t.messageFr,
              t.titreEn,
              t.messageEn,
              o.anglais,
            )
          : 0
        const zone = POSTER.height - 2 * POSTER.padding.vertical - 100 - icone
        const total =
          hauteurReelle(t.titreFr, t.messageFr, s, nbInfos, largeurTexte) +
          (o.anglais
            ? hauteurReelle(t.titreEn, t.messageEn, s, nbInfos, largeurTexte)
            : 0)
        expect(total).toBeLessThanOrEqual(zone)
      }),
      { numRuns: RUNS },
    )
  })
})

describe('calculateAutoSizes — cas limites', () => {
  const sansRien: Options = {
    icone: false,
    dates: false,
    heures: false,
    anglais: false,
  }

  it('affiche vide : la plus grande taille de titre (rien ne la contraint)', () => {
    // Oracle : objectif déclaré « remplir au maximum », borne haute = 80.
    const s = tailles(
      { titreFr: '', messageFr: '', titreEn: '', messageEn: '' },
      sansRien,
    )
    expect(s.fontSizeTitle).toBe(BORNES.titre.max)
    // Ratios déclarés : message = round(80 × 0,48) = 38, infos = round(38 × 0,74) = 28.
    expect(s.fontSizeMessage).toBe(Math.round(80 * 0.48))
    expect(s.fontSizeInfo).toBe(
      Math.min(28, Math.round(Math.round(80 * 0.48) * 0.74)),
    )
  })

  it('texte très long (10 000 mots) : tombe aux minimums, sans planter', () => {
    // Oracle : repli documenté « contenu très long → minimums ».
    const long = 'lorem ipsum dolor sit amet '.repeat(2500)
    const s = tailles(
      { titreFr: long, messageFr: long, titreEn: long, messageEn: long },
      { icone: true, dates: true, heures: true, anglais: true },
    )
    expect(s).toEqual({
      fontSizeTitle: BORNES.titre.min,
      fontSizeMessage: BORNES.message.min,
      fontSizeInfo: BORNES.infos.min,
    })
  })

  it('un seul mot géant (800 lettres) : reste borné et plus petit qu’un mot court', () => {
    const geant = 'a'.repeat(800)
    const court = tailles(
      { titreFr: '', messageFr: 'a', titreEn: '', messageEn: '' },
      sansRien,
    )
    const s = tailles(
      { titreFr: '', messageFr: geant, titreEn: '', messageEn: '' },
      sansRien,
    )
    verifierBornes(s)
    expect(s.fontSizeTitle).toBeLessThanOrEqual(court.fontSizeTitle)
  })

  it('titre d’un seul mot géant : borné et ≤ celui d’un titre court', () => {
    const court = tailles(
      { titreFr: 'Fermé', messageFr: '', titreEn: '', messageEn: '' },
      sansRien,
    )
    const s = tailles(
      {
        titreFr: 'Anticonstitutionnellement'.repeat(20),
        messageFr: '',
        titreEn: '',
        messageEn: '',
      },
      sansRien,
    )
    verifierBornes(s)
    expect(s.fontSizeTitle).toBeLessThan(court.fontSizeTitle)
  })

  it('accents et émojis : bornes respectées, aucun NaN', () => {
    const s = tailles(
      {
        titreFr: 'Piscine fermée 🏊‍♀️⛔',
        messageFr: 'Réouverture prévue à 14 h — désolé·e·s 😊 Ça s’améliore !',
        titreEn: 'Pool closed 🏊',
        messageEn: 'Reopening at 2 PM 😊',
      },
      { icone: true, dates: true, heures: true, anglais: true },
    )
    verifierBornes(s)
    expect(Object.values(s).every(Number.isFinite)).toBe(true)
  })

  it('message fait de seuls blancs / retours : traité comme un message vide côté bornes', () => {
    const s = tailles(
      { titreFr: 'Titre', messageFr: ' \n\n \t ', titreEn: '', messageEn: '' },
      sansRien,
    )
    verifierBornes(s)
  })

  it('anglais masqué : le texte anglais n’influence plus rien', () => {
    // Oracle : `showEnglish = false` → section anglaise absente de l'affiche.
    fc.assert(
      fc.property(contenu, texte(80), options, (t, autre, o) => {
        const opt = { ...o, anglais: false }
        expect(tailles(t, opt)).toEqual(
          tailles({ ...t, messageEn: autre, titreEn: autre }, opt),
        )
      }),
      { numRuns: 500 },
    )
  })

  it('une seule langue : au moins autant de place, donc un titre ≥ à deux langues', () => {
    // Oracle : la section anglaise et son séparateur occupent de la hauteur.
    fc.assert(
      fc.property(contenu, options, (t, o) => {
        const deux = tailles(
          { ...t, titreEn: t.titreFr, messageEn: t.messageFr },
          {
            ...o,
            icone: false,
            anglais: true,
          },
        )
        const une = tailles(t, { ...o, icone: false, anglais: false })
        expect(une.fontSizeTitle).toBeGreaterThanOrEqual(deux.fontSizeTitle)
      }),
      { numRuns: RUNS },
    )
  })
})

describe('calculateIconSize', () => {
  const chaine = fc.string({ maxLength: 700 })

  it('BORNES : toujours entre 80 et 180 px (« Limites de sécurité »)', () => {
    fc.assert(
      fc.property(
        chaine,
        chaine,
        chaine,
        chaine,
        fc.boolean(),
        (a, b, c, d, en) => {
          const v = calculateIconSize(a, b, c, d, en)
          expect(v).toBeGreaterThanOrEqual(BORNES.icone.min)
          expect(v).toBeLessThanOrEqual(BORNES.icone.max)
          expect(Number.isInteger(v)).toBe(true)
        },
      ),
      { numRuns: RUNS },
    )
  })

  it('MONOTONIE : plus de texte ⇒ icône jamais plus grande', () => {
    fc.assert(
      fc.property(chaine, chaine, chaine, fc.boolean(), (a, b, ajout, en) => {
        expect(calculateIconSize(a + ajout, b, '', '', en)).toBeLessThanOrEqual(
          calculateIconSize(a, b, '', '', en),
        )
      }),
      { numRuns: RUNS },
    )
  })

  it('une seule langue ⇒ icône au moins aussi grande (commentaire du source)', () => {
    fc.assert(
      fc.property(chaine, chaine, (a, b) => {
        expect(calculateIconSize(a, b, '', '', false)).toBeGreaterThanOrEqual(
          calculateIconSize(a, b, '', '', true),
        )
      }),
      { numRuns: RUNS },
    )
  })

  it('anglais masqué : sa longueur ne compte pas', () => {
    fc.assert(
      fc.property(chaine, chaine, chaine, (a, b, c) => {
        expect(calculateIconSize(a, b, c, c, false)).toBe(
          calculateIconSize(a, b, '', '', false),
        )
      }),
      { numRuns: 500 },
    )
    // Cas qui franchit les paliers : 1 000 caractères anglais masqués.
    const anglais = 'x'.repeat(500)
    expect(calculateIconSize('', '', anglais, anglais, false)).toBe(
      calculateIconSize('', '', '', '', false),
    )
  })

  it('peu de contenu ⇒ grande icône, beaucoup ⇒ petite (extrémités du barème)', () => {
    // Oracle : « Beaucoup plus grand si très peu de contenu » / palier > 900.
    expect(calculateIconSize('', '', '', '', true)).toBe(175)
    expect(calculateIconSize('x'.repeat(1000), '', '', '', true)).toBe(85)
    // Une langue : ×1,15, plafonné à 180.
    expect(calculateIconSize('', '', '', '', false)).toBe(180)
  })
})
