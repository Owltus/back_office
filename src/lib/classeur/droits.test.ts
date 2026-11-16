import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  VISIBILITES,
  aLaGestion,
  capacites,
  estVisibilite,
  niveauEffectif,
  niveauPage,
  peutChangerAuteur,
  peutChangerType,
  peutCreerClasseur,
  peutEtreAuteur,
  peutReordonnerListe,
  rangementVers,
  sectionDe,
  sectionsVisibles,
  typesCreables,
} from '#/lib/classeur/droits.ts'
import type {
  ClasseurPourDroits,
  Moi,
  NiveauEffectif,
  NiveauPage,
  Section,
  Visibilite,
} from '#/lib/classeur/droits.ts'

/*
 * Miroir de `private.classeur_niveau_de` et `private.classeur_garde`
 * (migration `20261116120000_classeur_visibilite`) : la même matrice que
 * `supabase/tests/04_classeur_acces.test.sql`, qui l'éprouve en base. Si l'un
 * change, l'autre doit changer.
 *
 * Les oracles ci-dessous sont écrits INDÉPENDAMMENT du code (tables lues dans
 * l'en-tête de la migration), puis comparés sur TOUTE la matrice
 * page × admin × type × auteur × identifiant.
 */

const MOI = '00000000-0000-0000-0000-000000000001'
const AUTRE = '00000000-0000-0000-0000-000000000002'

const PAGES: NiveauPage[] = [null, 'lecture', 'ecriture', 'gestion']
const AUTEURS = [MOI, AUTRE, null] as const
const IDS = [MOI, null] as const

interface Cas {
  moi: Moi
  classeur: ClasseurPourDroits
}

/** Toute la matrice : 4 pages × 2 admin × 3 types × 3 auteurs × 2 ids. */
function matrice(): Cas[] {
  const cas: Cas[] = []
  for (const page of PAGES)
    for (const admin of [false, true])
      for (const visibilite of VISIBILITES)
        for (const created_by of AUTEURS)
          for (const userId of IDS)
            cas.push({
              moi: { page, admin, userId },
              classeur: { visibilite, created_by },
            })
  return cas
}

const nomCas = ({ moi, classeur }: Cas) =>
  `page=${moi.page} admin=${moi.admin} id=${moi.userId === MOI ? 'moi' : 'aucun'} ` +
  `type=${classeur.visibilite} auteur=${
    classeur.created_by === MOI
      ? 'moi'
      : classeur.created_by === AUTRE
        ? 'autre'
        : 'aucun'
  }`

/* ------------------------------------------------------------- oracles --- */

/** Suis-je l'auteur ? (un identifiant absent n'est l'auteur de rien) */
function oracleAuteur({ moi, classeur }: Cas): boolean {
  if (moi.userId === null || moi.userId === undefined) return false
  if (classeur.created_by === null) return false
  return moi.userId === classeur.created_by
}

/** Niveau hors admin, par type, par niveau de page, selon « je suis l'auteur ». */
const TABLE_NIVEAU: Record<
  Visibilite,
  Record<'lecture' | 'ecriture' | 'gestion', [NiveauEffectif, NiveauEffectif]>
> = {
  //            [pas l'auteur, l'auteur]
  public: {
    lecture: ['lecture', 'lecture'],
    ecriture: ['ecriture', 'ecriture'],
    gestion: ['gestion', 'gestion'],
  },
  prive: {
    lecture: ['aucun', 'lecture'],
    ecriture: ['aucun', 'gestion'],
    gestion: ['aucun', 'gestion'],
  },
  gestion: {
    lecture: ['aucun', 'aucun'],
    ecriture: ['aucun', 'aucun'],
    gestion: ['gestion', 'gestion'],
  },
}

function oracleNiveau(c: Cas): NiveauEffectif {
  if (c.moi.page === null) return 'aucun'
  if (c.moi.admin) return 'gestion'
  return TABLE_NIVEAU[c.classeur.visibilite][c.moi.page][
    oracleAuteur(c) ? 1 : 0
  ]
}

const voitEnEcriture = (n: NiveauEffectif) =>
  n === 'ecriture' || n === 'gestion'
const oracleGestion = (moi: Moi) => moi.admin || moi.page === 'gestion'

function oracleType(c: Cas, cible: Visibilite): boolean {
  if (cible === c.classeur.visibilite) return false
  if (!voitEnEcriture(oracleNiveau(c))) return false
  const touchGestion =
    cible === 'gestion' || c.classeur.visibilite === 'gestion'
  if (touchGestion) return oracleGestion(c.moi)
  return oracleGestion(c.moi) || oracleAuteur(c)
}

function oracleChangerAuteur(c: Cas): boolean {
  if (!voitEnEcriture(oracleNiveau(c))) return false
  return oracleGestion(c.moi) || oracleAuteur(c)
}

function oracleSection(c: Cas): Section {
  const v = c.classeur.visibilite
  if (v === 'public') return 'public'
  if (v === 'gestion') return 'gestion'
  return oracleAuteur(c) ? 'mesPrives' : 'privesAutres'
}

/* --------------------------------------------------------------- tests --- */

describe('niveauEffectif — toute la matrice contre l’oracle', () => {
  it.each(matrice().map((c) => [nomCas(c), c] as const))('%s', (_n, c) => {
    expect(niveauEffectif(c.moi, c.classeur)).toBe(oracleNiveau(c))
  })

  it('cas nommés de la demande', () => {
    const gestion: Moi = { page: 'gestion', admin: false, userId: MOI }
    const admin: Moi = { page: 'gestion', admin: true, userId: MOI }
    const ecriture: Moi = { page: 'ecriture', admin: false, userId: MOI }
    const prive = (auteur: string | null): ClasseurPourDroits => ({
      visibilite: 'prive',
      created_by: auteur,
    })
    // La gestion ne voit PAS le privé d'un autre ; l'admin oui.
    expect(niveauEffectif(gestion, prive(AUTRE))).toBe('aucun')
    expect(niveauEffectif(admin, prive(AUTRE))).toBe('gestion')
    // L'auteur d'un privé le gère dès qu'il a l'écriture sur la page.
    expect(niveauEffectif(ecriture, prive(MOI))).toBe('gestion')
    // Un compte en écriture modifie TOUS les publics, pas seulement les siens.
    expect(
      niveauEffectif(ecriture, { visibilite: 'public', created_by: AUTRE }),
    ).toBe('ecriture')
    // Un classeur de gestion est invisible hors gestion.
    expect(
      niveauEffectif(ecriture, { visibilite: 'gestion', created_by: MOI }),
    ).toBe('aucun')
    // Un orphelin privé n'est à personne (hors admin).
    expect(niveauEffectif(ecriture, prive(null))).toBe('aucun')
  })

  it('classeur non chargé : aucun hors admin (on masque)', () => {
    for (const page of PAGES)
      expect(niveauEffectif({ page, admin: false, userId: MOI }, null)).toBe(
        'aucun',
      )
  })

  it('propriété : jamais au-dessus du droit de page hors admin et privé à soi', () => {
    const rang = { aucun: 0, lecture: 1, ecriture: 2, gestion: 3 } as const
    fc.assert(
      fc.property(
        fc.constantFrom(...PAGES),
        fc.boolean(),
        fc.constantFrom(...VISIBILITES),
        fc.constantFrom(...AUTEURS),
        fc.constantFrom(...IDS),
        (page, admin, visibilite, created_by, userId) => {
          const c: Cas = {
            moi: { page, admin, userId },
            classeur: { visibilite, created_by },
          }
          const n = niveauEffectif(c.moi, c.classeur)
          if (page === null) return n === 'aucun'
          if (admin) return n === 'gestion'
          // Seule exception : l'auteur d'un privé en écriture le GÈRE.
          if (visibilite === 'prive' && oracleAuteur(c) && page === 'ecriture')
            return n === 'gestion'
          return rang[n] <= rang[page]
        },
      ),
      { numRuns: 500, seed: 20261116 },
    )
  })
})

describe('capacités — plus de gestion des accès', () => {
  it('écriture : modifier oui ; suppression, restauration, purge non', () => {
    expect(capacites('ecriture')).toEqual({
      lire: true,
      modifier: true,
      supprimerClasseur: false,
      restaurer: false,
      viderHistorique: false,
    })
  })
  it('gestion : tout ; lecture : lire seulement ; aucun : rien', () => {
    expect(Object.values(capacites('gestion')).every(Boolean)).toBe(true)
    expect(capacites('lecture')).toEqual({
      lire: true,
      modifier: false,
      supprimerClasseur: false,
      restaurer: false,
      viderHistorique: false,
    })
    expect(Object.values(capacites('aucun')).some(Boolean)).toBe(false)
    expect(capacites('gestion')).not.toHaveProperty('gererAcces')
  })
})

describe('peutChangerType / peutChangerAuteur — garde de la base', () => {
  const lignes = matrice().flatMap((c) =>
    VISIBILITES.map((cible) => [`${nomCas(c)} → ${cible}`, c, cible] as const),
  )
  it.each(lignes)('type %s', (_n, c, cible) => {
    expect(peutChangerType(c.moi, c.classeur, cible)).toBe(oracleType(c, cible))
  })
  it.each(matrice().map((c) => [nomCas(c), c] as const))(
    'auteur %s',
    (_n, c) => {
      expect(peutChangerAuteur(c.moi, c.classeur)).toBe(oracleChangerAuteur(c))
    },
  )
  it('cas nommés', () => {
    const ecriture: Moi = { page: 'ecriture', admin: false, userId: MOI }
    const gestion: Moi = { page: 'gestion', admin: false, userId: MOI }
    const publicAMoi: ClasseurPourDroits = {
      visibilite: 'public',
      created_by: MOI,
    }
    const publicAutre: ClasseurPourDroits = {
      visibilite: 'public',
      created_by: AUTRE,
    }
    // L'auteur passe son public en privé, pas en gestion.
    expect(peutChangerType(ecriture, publicAMoi, 'prive')).toBe(true)
    expect(peutChangerType(ecriture, publicAMoi, 'gestion')).toBe(false)
    // Un compte en écriture ne range pas le public d'un autre.
    expect(peutChangerType(ecriture, publicAutre, 'prive')).toBe(false)
    expect(peutChangerAuteur(ecriture, publicAutre)).toBe(false)
    // La gestion, oui (sauf un privé d'un autre, qu'elle ne voit pas).
    expect(peutChangerType(gestion, publicAutre, 'gestion')).toBe(true)
    expect(peutChangerAuteur(gestion, publicAutre)).toBe(true)
    expect(
      peutChangerAuteur(gestion, { visibilite: 'prive', created_by: AUTRE }),
    ).toBe(false)
    // L'auteur en lecture seule ne change rien.
    expect(
      peutChangerType(
        { page: 'lecture', admin: false, userId: MOI },
        publicAMoi,
        'prive',
      ),
    ).toBe(false)
  })
})

describe('peutEtreAuteur, typesCreables, création, ordre', () => {
  it('peutEtreAuteur : tout compte de la page hors gestion (lecture comprise, 2026-11-16), gestion partout', () => {
    const attendu: Record<string, Record<Visibilite, boolean>> = {
      null: { public: false, prive: false, gestion: false },
      lecture: { public: true, prive: true, gestion: false },
      ecriture: { public: true, prive: true, gestion: false },
      gestion: { public: true, prive: true, gestion: true },
    }
    for (const p of PAGES)
      for (const v of VISIBILITES)
        expect(peutEtreAuteur(p, v), `${p} ${v}`).toBe(attendu[String(p)][v])
  })
  it('typesCreables', () => {
    const t = (page: NiveauPage, admin = false) =>
      typesCreables({ page, admin, userId: MOI })
    expect(t(null)).toEqual([])
    expect(t('lecture')).toEqual([])
    expect(t('ecriture')).toEqual(['public', 'prive'])
    expect(t('gestion')).toEqual(['public', 'prive', 'gestion'])
    expect(t('gestion', true)).toEqual(['public', 'prive', 'gestion'])
  })
  it('création et ordre de la liste', () => {
    expect(PAGES.map(peutCreerClasseur)).toEqual([false, false, true, true])
    expect(PAGES.map(peutReordonnerListe)).toEqual([false, false, false, true])
  })
  it('aLaGestion et estVisibilite', () => {
    expect(aLaGestion({ page: 'ecriture', admin: true, userId: MOI })).toBe(
      true,
    )
    expect(aLaGestion({ page: 'ecriture', admin: false, userId: MOI })).toBe(
      false,
    )
    expect(VISIBILITES.every(estVisibilite)).toBe(true)
    expect(['aucun', 'lecture', null, 'Public'].some(estVisibilite)).toBe(false)
  })
  it('niveauPage lit le plus haut niveau accordé', () => {
    const can = (max: string) => (_p: 'classeur', n: string) =>
      ['lecture', 'ecriture', 'gestion'].indexOf(n) <=
      ['lecture', 'ecriture', 'gestion'].indexOf(max)
    expect(niveauPage(can('lecture'))).toBe('lecture')
    expect(niveauPage(can('ecriture'))).toBe('ecriture')
    expect(niveauPage(can('gestion'))).toBe('gestion')
    expect(niveauPage(() => false)).toBeNull()
  })
})

describe('tableaux : sectionsVisibles, sectionDe', () => {
  it('sectionsVisibles', () => {
    const s = (page: NiveauPage, admin = false) =>
      sectionsVisibles({ page, admin, userId: MOI })
    expect(s('lecture')).toEqual(['public', 'mesPrives'])
    expect(s('ecriture')).toEqual(['public', 'mesPrives'])
    expect(s('gestion')).toEqual(['public', 'mesPrives', 'gestion'])
    expect(s('gestion', true)).toEqual([
      'public',
      'mesPrives',
      'privesAutres',
      'gestion',
    ])
  })
  it('« privesAutres » n’existe que pour l’admin', () => {
    for (const page of PAGES) {
      expect(
        sectionsVisibles({ page, admin: false, userId: MOI }),
      ).not.toContain('privesAutres')
      expect(sectionsVisibles({ page, admin: true, userId: MOI })).toContain(
        'privesAutres',
      )
    }
  })
  it.each(matrice().map((c) => [nomCas(c), c] as const))(
    'sectionDe %s',
    (_n, c) => {
      expect(sectionDe(c.moi, c.classeur)).toBe(oracleSection(c))
    },
  )
})

describe('rangementVers — glisser-déposer entre tableaux', () => {
  const SECTIONS: Section[] = ['public', 'mesPrives', 'privesAutres', 'gestion']

  it('propriétés sur toute la matrice', () => {
    // Un admin a la gestion de toutes les pages (`niveauPage(can)`) : les
    // combinaisons admin sans la gestion de la page n'existent pas.
    const reelles = matrice().filter(
      (c) => !c.moi.admin || c.moi.page === 'gestion',
    )
    for (const c of reelles)
      for (const cible of SECTIONS) {
        const r = rangementVers(c.moi, c.classeur, cible)
        const ctx = `${nomCas(c)} → ${cible}`
        if (oracleSection(c) === cible) {
          expect(r, ctx).toBeNull()
          continue
        }
        if (!sectionsVisibles(c.moi).includes(cible)) {
          expect(r, ctx).toBeNull()
          continue
        }
        if (r === null) continue
        // Le classeur rangé atterrit bien dans la section visée.
        const apres: ClasseurPourDroits = {
          visibilite: r.visibilite,
          created_by:
            r.created_by !== undefined ? r.created_by : c.classeur.created_by,
        }
        expect(oracleSection({ moi: c.moi, classeur: apres }), ctx).toBe(cible)
        // Chaque changement est permis par la garde de la base.
        if (r.visibilite !== c.classeur.visibilite)
          expect(oracleType(c, r.visibilite), ctx).toBe(true)
        if (
          r.created_by !== undefined &&
          r.created_by !== c.classeur.created_by
        ) {
          expect(oracleChangerAuteur(c), ctx).toBe(true)
          // Le nouvel auteur (moi) peut l'être.
          const p = c.moi.admin ? 'gestion' : c.moi.page
          expect(peutEtreAuteur(p, r.visibilite), ctx).toBe(true)
        }
        // On ne se cache jamais un classeur en le rangeant.
        expect(oracleNiveau({ moi: c.moi, classeur: apres }), ctx).not.toBe(
          'aucun',
        )
      }
  })

  it('« mesPrives » d’un classeur d’un autre : privé et à moi, seulement si je peux changer l’auteur', () => {
    for (const c of matrice()) {
      if (c.classeur.created_by === MOI || c.moi.userId !== MOI) continue
      if (c.classeur.visibilite === 'prive' && c.classeur.created_by === null)
        continue
      const r = rangementVers(c.moi, c.classeur, 'mesPrives')
      const ctx = nomCas(c)
      if (oracleChangerAuteur(c))
        expect(r, ctx).toEqual({ visibilite: 'prive', created_by: MOI })
      else expect(r, ctx).toBeNull()
    }
  })

  it('« mesPrives » de mon public : privé sans changer d’auteur', () => {
    const moi: Moi = { page: 'ecriture', admin: false, userId: MOI }
    expect(
      rangementVers(
        moi,
        { visibilite: 'public', created_by: MOI },
        'mesPrives',
      ),
    ).toEqual({ visibilite: 'prive' })
  })

  it('un compte en écriture ne range rien dans Gestion ni depuis Gestion', () => {
    const moi: Moi = { page: 'ecriture', admin: false, userId: MOI }
    for (const visibilite of VISIBILITES)
      for (const created_by of AUTEURS) {
        expect(
          rangementVers(moi, { visibilite, created_by }, 'gestion'),
        ).toBeNull()
        if (visibilite === 'gestion')
          for (const cible of SECTIONS)
            expect(
              rangementVers(moi, { visibilite, created_by }, cible),
            ).toBeNull()
      }
  })

  it('« privesAutres » : admin seul, garde l’auteur', () => {
    const admin: Moi = { page: 'gestion', admin: true, userId: MOI }
    const gestion: Moi = { page: 'gestion', admin: false, userId: MOI }
    const publicAutre: ClasseurPourDroits = {
      visibilite: 'public',
      created_by: AUTRE,
    }
    expect(rangementVers(admin, publicAutre, 'privesAutres')).toEqual({
      visibilite: 'prive',
    })
    expect(rangementVers(gestion, publicAutre, 'privesAutres')).toBeNull()
    // Le sien ou un orphelin : pas d'autre auteur à garder.
    expect(
      rangementVers(
        admin,
        { visibilite: 'public', created_by: MOI },
        'privesAutres',
      ),
    ).toBeNull()
    expect(
      rangementVers(
        admin,
        { visibilite: 'public', created_by: null },
        'privesAutres',
      ),
    ).toBeNull()
  })

  it('la gestion range un public dans Gestion, et le reprend en public', () => {
    const gestion: Moi = { page: 'gestion', admin: false, userId: MOI }
    expect(
      rangementVers(
        gestion,
        { visibilite: 'public', created_by: AUTRE },
        'gestion',
      ),
    ).toEqual({ visibilite: 'gestion' })
    expect(
      rangementVers(
        gestion,
        { visibilite: 'gestion', created_by: AUTRE },
        'public',
      ),
    ).toEqual({ visibilite: 'public' })
  })
})
