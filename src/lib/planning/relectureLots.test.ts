import { describe, expect, it } from 'vitest'

import {
  erreursSaisie,
  saisieDepuis,
} from '#/components/planning/parametres/equipe/reglesContrats.ts'
import {
  phraseCycle,
  pointsAttention,
} from '#/components/planning/attention.ts'
import { codesUniques } from '#/components/planning/codesCase.ts'
import { nettoyerHoraire } from '#/components/planning/parametres/reglages/validation.ts'
import { texteCarte } from '#/components/planning/semaine/Cartes.tsx'
import { NIVEAUX } from '#/lib/planning/niveaux.ts'
import { donneesGeneration } from '#/components/planning/hooks/usePlanning.ts'
import { premierLundiGeneration } from '#/lib/planning/semaine.ts'
import {
  differenceMoments,
  erreursMoments,
  nomsDAttente,
  raisonHorsTableau,
} from '#/components/planning/parametres/reglages/moments.ts'
import { messageErreur } from '#/lib/planning/erreurs.ts'
import { leMoment, lireMoments } from '#/lib/planning/moment.ts'

import { verifierReglages } from '#/lib/planning/coherence.ts'
import { plafondHebdo } from '#/lib/planning/regles.ts'
import { analyser, idPlaceAccueil } from '#/lib/planning/semaine.ts'
import { hotelAccueil } from '#/lib/planning/test/hotelAccueil.ts'
import { lusAvec, momentsAvec } from '#/lib/planning/test/momentsTest.ts'
import type { Fiche } from '#/lib/planning/regles.ts'
import {
  lireRegles,
  listeContrats,
  REGLES_PAR_DEFAUT,
} from '#/lib/planning/reglesEtablissement.ts'
import type {
  ModeleContrat,
  Reglages,
  Poste,
  Salarie,
} from '#/lib/planning/types.ts'
import type { SemaineOut } from '#/lib/planning/semaine.ts'

/*
 * Relecture adverse des lots 1a à 2b du chantier « moteur configurable »
 * (2026-11-06). Un test par défaut, rouge avant le correctif.
 */

const H = 60

const LIGNES_HOTEL: ModeleContrat[] = listeContrats(REGLES_PAR_DEFAUT).map(
  (m) => ({
    type_contrat: m.code,
    nom: m.nom,
    ordre: m.ordre,
    jour_max_minutes: m.jourMaxMinutes,
    mineur_possible: m.mineurPossible,
    forfait_possible: m.forfaitPossible,
    fin_obligatoire: m.finObligatoire,
    journees_imposees: m.journeesImposees,
    journee_etoile: m.journeeEtoile,
    placement_manuel: m.placementManuel,
    contrat_indicatif: m.contratIndicatif,
    ferie_rattrape: m.ferieRattrape,
    feries_jour_meme: m.feriesJourMeme,
    alternance: m.alternance,
  }),
)

describe('1. la loi du temps partiel ne se lève par aucune case', () => {
  const ficheDe = (
    modifs: Partial<ModeleContrat>,
    minutesHebdo: number,
  ): Fiche => {
    const regles = lireRegles({
      modelesContrat: LIGNES_HOTEL.map((m) =>
        m.type_contrat === 'cdi' ? { ...m, ...modifs } : m,
      ),
    })
    return {
      id: 'x',
      postes: new Set(),
      typeContrat: 'cdi',
      minutesHebdo,
      regles,
    }
  }

  it('un CDI de 24 h posé à la main : 32 h, pas 48 h', () => {
    expect(plafondHebdo(ficheDe({ placement_manuel: true }, 24 * H))).toBe(
      32 * H,
    )
  })

  it('un CDI de 24 h aux heures indicatives et posé à la main : 32 h', () => {
    expect(
      plafondHebdo(
        ficheDe({ placement_manuel: true, contrat_indicatif: true }, 24 * H),
      ),
    ).toBe(32 * H)
  })

  it('un CDI de 24 h aux heures indicatives : 32 h', () => {
    expect(plafondHebdo(ficheDe({ contrat_indicatif: true }, 24 * H))).toBe(
      32 * H,
    )
  })

  it('accepté : un contrat sans heures fixées posé à la main garde 48 h', () => {
    const regles = lireRegles({ modelesContrat: LIGNES_HOTEL })
    const extra: Fiche = {
      id: 'e',
      postes: new Set(),
      typeContrat: 'extra',
      minutesHebdo: 0,
      regles,
    }
    expect(plafondHebdo(extra)).toBe(48 * H)
  })
})

describe('2. un moment sorti du tableau qui garde ses chiffres', () => {
  const donnees = () => {
    const referentiel = hotelAccueil(true)
    referentiel.moments = momentsAvec({ soir: { compte_dans_tableau: false } })
    return {
      lundi: '2026-11-02',
      referentiel,
      absences: [],
      affectations: [],
      avant: [],
      apres: [],
    }
  }

  it('ses chiffres ne comptent plus : ni ligne, ni place à pourvoir', () => {
    const d = donnees()
    expect(d.referentiel.consignes.some((c) => c.periode === 'soir')).toBe(true)
    const s = analyser(d)
    expect(s.presence.some((x) => x.periode === 'soir')).toBe(false)
    expect(s.a_pourvoir.some((x) => x.moment === 'soir')).toBe(false)
  })

  it('les identifiants des places de l’accueil restent uniques', () => {
    const s = analyser(donnees())
    const ids = s.a_pourvoir.map((x) => x.besoin_id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('refusé : aucun identifiant pour un moment hors du tableau', () => {
    const l = lusAvec({ soir: { compte_dans_tableau: false } })
    expect(() => idPlaceAccueil(0, 'soir', l)).toThrow()
    expect(() => idPlaceAccueil(0, 'middle')).toThrow()
    expect(idPlaceAccueil(0, 'matin', l)).toBeLessThan(0)
  })
})

describe('8. aucun mot de l’hôtel écrit dans le code', () => {
  it('la personne à appeler porte le nom de son contrat', () => {
    const regles = lireRegles({
      modelesContrat: LIGNES_HOTEL.map((m) =>
        m.type_contrat === 'extra' ? { ...m, nom: 'Vacataire' } : m,
      ),
    })
    const salaries = [
      {
        id: 4,
        prenom: 'Max',
        nom: 'Nom4',
        type_contrat: 'extra',
        competences: [{ poste_id: 9, niveau: 'titulaire' }],
      },
    ] as unknown as Salarie[]
    const postes = [{ id: 9, nom: 'Réception', couleur: '#000' }] as Poste[]
    const semaine = {
      lundi: '2026-10-26',
      presence: [],
      bilan: [],
      a_pourvoir: [
        {
          besoin_id: 1,
          poste_id: 9,
          jour: 0,
          type_shift_id: null,
          debut: '07:00',
          fin: '15:00',
          duree: 480,
          manquant: 1,
          raisons: [
            {
              salarie_id: 4,
              messages: ['extra disponible : à appeler et poser à la main'],
              regles: ['EXTRA'],
            },
          ],
          remplacants: [],
          raison_commune: null,
        },
      ],
    } as unknown as SemaineOut
    const p = pointsAttention([semaine], salaries, postes, undefined, regles)
    expect(p.aPourvoir[0].shifts[0].personnes[0].role.libelle).toBe('vacataire')
  })

  it('l’article d’un moment se règle, l’hôtel garde ses phrases', () => {
    expect(leMoment(lireMoments(), 'soir')).toBe('le soir')
    expect(leMoment(lireMoments(), 'nuit')).toBe('la nuit')
    const l = lusAvec({ soir: { nom: 'Soirée', article: 'la' } })
    expect(leMoment(l, 'soir')).toBe('la soirée')
    const a = lusAvec({ middle: { nom: 'Après-midi', article: "l'" } })
    expect(leMoment(a, 'middle')).toBe("l'après-midi")
  })
})

describe('2. écran : la case du tableau se garde tant qu’il y a des chiffres', () => {
  const consignes = [
    { periode: 'soir', minimum: 2, maximum: 2 },
    { periode: 'matin', minimum: 0, maximum: 0 },
  ]
  it('refusé : un moment qui a des chiffres', () => {
    expect(raisonHorsTableau('soir', consignes)).toMatch(/chiffres/)
    const liste = momentsAvec({ soir: { compte_dans_tableau: false } })
    expect(erreursMoments(liste, consignes).join(' ')).toMatch(/Soir/)
  })
  it('accepté : des chiffres à 0, ou aucun', () => {
    expect(raisonHorsTableau('matin', consignes)).toBeNull()
    expect(raisonHorsTableau('middle', consignes)).toBeNull()
    const liste = momentsAvec({ matin: { compte_dans_tableau: false } })
    expect(erreursMoments(liste, consignes)).toEqual([])
  })
})

describe('6. échanger les noms de deux moments', () => {
  const avant = momentsAvec()
  const apres = avant.map((m) =>
    m.id === 'matin'
      ? { ...m, nom: 'Soir' }
      : m.id === 'soir'
        ? { ...m, nom: 'Matin' }
        : m,
  )

  it('les deux passent d’abord par un nom d’attente', () => {
    const { ecrire } = differenceMoments(avant, apres)
    const attente = nomsDAttente(avant, ecrire)
    expect(attente.map((m) => m.id).sort()).toEqual(['matin', 'soir'])
    const noms = new Set(avant.map((m) => m.nom))
    for (const m of attente) expect(noms.has(m.nom)).toBe(false)
    expect(new Set(attente.map((m) => m.nom)).size).toBe(attente.length)
  })

  it('accepté : sans échange, aucune écriture de plus', () => {
    const renomme = avant.map((m) =>
      m.id === 'matin' ? { ...m, nom: 'Aube' } : m,
    )
    expect(
      nomsDAttente(avant, differenceMoments(avant, renomme).ecrire),
    ).toEqual([])
  })

  it('un nom déjà pris se dit en clair', () => {
    const err = {
      code: '23505',
      message:
        'duplicate key value violates unique constraint "planning_zones_nom_unique"',
    }
    expect(messageErreur(err, 'La zone n’a pas pu être renommée')).toMatch(
      /porte déjà ce nom/,
    )
  })
})

describe('3. la fenêtre du partage suit le réglage', () => {
  const LUNDI = '2026-11-16'
  const referentiel = hotelAccueil(true)
  referentiel.reglages = {
    ...referentiel.reglages,
    equite_semaines: 8,
  } as Reglages
  const shift = (lundi: string, id: number) =>
    ({
      id,
      lundi,
      salarie_id: 1,
      poste_id: 1,
      jour: 0,
      horaire_id: null,
      debut: '07:00',
      fin: '15:00',
      pause: 0,
      epinglee: true,
    }) as never

  it('8 semaines réglées : les 8 semaines d’avant sont lues', () => {
    const d = donneesGeneration(LUNDI, referentiel, {
      affectations: [
        shift('2026-10-26', 1),
        shift('2026-09-21', 2),
        shift('2026-09-14', 3),
      ],
      absences: [],
    } as never)
    // 2026-09-21 : 8 semaines avant ; 2026-09-14 : 9, hors de la fenêtre.
    expect((d.historique ?? []).map((a) => a.id).sort()).toEqual([1, 2])
  })

  it('la lecture remonte aussi loin', () => {
    expect(premierLundiGeneration(LUNDI, 0, 8) <= '2026-09-21').toBe(true)
    expect(premierLundiGeneration(LUNDI, 0, 12) <= '2026-08-24').toBe(true)
  })
})

describe('5. les vues lisent les moments de l’établissement', () => {
  const l = lusAvec({ soir: { nom: 'Soirée', article: 'la' } })
  const horaire = {
    id: 1,
    nom: 'x',
    debut: '15:00',
    fin: '23:00',
    pause: 0,
    couleur: '#000000',
    periode: 'soir',
  }

  it('la carte d’un shift', () => {
    const lignes = texteCarte(
      {
        debut: '15:00',
        fin: '23:00',
        horaire,
        epinglee: true,
        etoile: false,
        role: null,
        alertes: [],
      },
      NIVEAUX,
      l,
    )
    expect(lignes[0]).toMatch(/^Soirée/)
  })

  it('le nom écrit d’un horaire', () => {
    const { id: _id, nom: _nom, ...saisie } = horaire
    expect(nettoyerHoraire(saisie, l).nom).toMatch(/^Soirée/)
  })

  it('la liste des horaires d’une case, rangée par moment', () => {
    // La soirée passe avant le matin dans la journée de cet établissement.
    const ordre = lusAvec({ soir: { ordre: 0 } })
    const matin = {
      ...horaire,
      id: 2,
      debut: '07:00',
      fin: '15:00',
      periode: 'matin',
    }
    const ligne = (h: typeof horaire) => ({ horaire: h, alerte: null })
    const r = {
      rubriques: [
        {
          poste: { id: 9 },
          niveau: 'titulaire',
          lignes: [ligne(matin), ligne(horaire)],
          permis: {},
        },
      ],
      texte: null,
      actuel: null,
      moments: ordre,
    } as never
    const u = codesUniques(r, { competences: [] }, [{ id: 9 }])
    expect(u.codes.map((c) => c.horaire.id)).toEqual([1, 2])
  })

  it('une phrase du tableau', () => {
    const phrase = phraseCycle(
      { periode: 'soir', ecart: -1 } as never,
      'lundi',
      l,
    )
    expect(phrase).toMatch(/la soirée/)
  })
})

describe('9b. un besoin qui ne demande que du soutien (niveaux fixes)', () => {
  it('« À vérifier » le dit : le soutien n’est jamais seul', () => {
    const r = hotelAccueil(true)
    const aPart = r.postes.find((p) => p.zone_id == null) as Poste
    r.besoins = [
      ...r.besoins,
      {
        id: 9001,
        poste_id: aPart.id,
        jour: 0,
        horaire_id: null,
        debut: '09:00',
        fin: '17:00',
        effectif: 0,
        soutien: 1,
        renfort: 0,
        niveaux: [{ niveau: 'soutien', nombre: 1 }],
      } as never,
    ]
    const points = verifierReglages(r, { aujourdhui: '2026-11-01' })
    const p = points.find((x) => x.id === `soutien-seul:${aPart.id}`)
    expect(p?.texte).toMatch(/Soutien, qui n’est jamais seul/)
    expect(p?.texte).toMatch(/un titulaire ou un dépannage/)
  })
})

describe('9c. un poste dans une zone sans chiffres', () => {
  it('« À vérifier » le dit', () => {
    const r = hotelAccueil(true)
    const aPart = r.postes.find((p) => p.zone_id == null) as Poste
    r.zones = [
      {
        id: 1,
        nom: 'Accueil',
        ordre: 0,
        continue: true,
      },
      {
        id: 2,
        nom: 'Room service',
        ordre: 1,
        continue: true,
      },
    ]
    r.postes = r.postes.map((p) =>
      p.id === aPart.id ? { ...p, zone_id: 2 } : p,
    )
    const points = verifierReglages(r, { aujourdhui: '2026-11-01' })
    const p = points.find((x) => x.id === 'zone-sans-chiffres:2')
    expect(p?.texte).toMatch(/Room service/)
    // Accepté : l'accueil a ses chiffres, rien à dire de lui.
    expect(points.some((x) => x.id === 'zone-sans-chiffres:1')).toBe(false)
  })
})

describe('7. les jours du week-end se suivent dans la semaine', () => {
  const avec = (weekend_jours: number[]) =>
    erreursSaisie({
      ...saisieDepuis({}),
      weekend_jours,
    }).filter((e) => /week-end/i.test(e))

  it('refusé : dimanche et lundi, ou deux jours séparés', () => {
    expect(avec([6, 0]).join(' ')).toMatch(/se suivent/)
    expect(avec([4, 6]).join(' ')).toMatch(/se suivent/)
  })
  it('accepté : samedi et dimanche, vendredi à dimanche', () => {
    expect(avec([5, 6])).toEqual([])
    expect(avec([4, 5, 6])).toEqual([])
    expect(avec([6])).toEqual([])
  })
})
