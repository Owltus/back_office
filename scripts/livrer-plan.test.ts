import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fc, test } from '@fast-check/vitest'

import {
  REF_PROD,
  arretAvantProd,
  arretsReglagesFonctions,
  arretsSansClavier,
  changementsConfig,
  bilanEchec,
  choixControles,
  descriptionLivraison,
  ecartSchema,
  fonctionsModifiees,
  lignesDestructrices,
  lignesJson,
  planEnvoi,
  nomsSecrets,
  secretsManquants,
} from './livrer-plan.mjs'

// Oracle : le plan (étape 9) — contrôles avant toute prod, LIVRER exact,
// seconde confirmation si une migration retire quelque chose, ordre base →
// fonctions → site, jamais le seed.

const TOUTES = ['create-user', 'delete-user', 'import-report', 'send-report']

const etatSain = {
  branche: 'main',
  arbrePropre: true,
  enRetard: false,
  etiquetteProd: true,
  controles: [
    { nom: 'tsc', ok: true },
    { nom: 'test', ok: true },
  ],
  migrationsNonJoueesEnLocal: [] as Array<string>,
}

describe('arretAvantProd', () => {
  it('état sain : aucune raison d’arrêt', () => {
    expect(arretAvantProd(etatSain)).toBeNull()
  })

  it.each([
    [{ branche: 'essai' }, 'main'],
    [{ arbrePropre: false }, 'commitées'],
    [{ enRetard: true }, 'git pull'],
    [{ etiquetteProd: false }, 'amorçage'],
    [{ controles: [{ nom: 'tsc', ok: false }] }, 'tsc'],
    [
      { migrationsNonJoueesEnLocal: ['20261101000000_x.sql'] },
      '20261101000000_x.sql',
    ],
  ])('%o → arrêt (%s)', (modif, mot) => {
    const r = arretAvantProd({ ...etatSain, ...modif })
    expect(r).toContain(mot)
  })

  test.prop([
    fc.record({
      branche: fc.constantFrom('main', 'autre'),
      arbrePropre: fc.boolean(),
      enRetard: fc.boolean(),
      etiquetteProd: fc.boolean(),
      controles: fc.array(fc.record({ nom: fc.string(), ok: fc.boolean() }), {
        maxLength: 4,
      }),
      migrationsNonJoueesEnLocal: fc.array(fc.string(), { maxLength: 2 }),
    }),
  ])('aucun arrêt SEULEMENT si tout est sain', (e) => {
    const sain =
      e.branche === 'main' &&
      e.arbrePropre &&
      !e.enRetard &&
      e.etiquetteProd &&
      e.controles.every((c) => c.ok) &&
      e.migrationsNonJoueesEnLocal.length === 0
    expect(arretAvantProd(e) === null).toBe(sain)
  })
})

describe('planEnvoi', () => {
  const base = {
    reponse: 'LIVRER',
    confirmationSuppression: null,
    migrations: [
      { nom: '20261101000000_a.sql', destructrices: [] as Array<string> },
    ],
    fonctions: ['import-report', 'send-report'],
    commits: 3,
  }

  it('ordre base → fonctions → site → étiquette', () => {
    const { etapes } = planEnvoi(base)
    expect(etapes.map((e) => e.nom)).toEqual([
      'Base de données',
      'Fonction import-report',
      'Fonction send-report',
      'Site (Vercel)',
      'Étiquette prod',
    ])
    expect(etapes[0].cmd).toEqual([
      'supabase',
      'db',
      'push',
      '--linked',
      '--yes',
    ])
    expect(etapes[1].cmd).toEqual([
      'supabase',
      'functions',
      'deploy',
      'import-report',
      '--project-ref',
      REF_PROD,
      '--no-verify-jwt',
    ])
    expect(etapes[2].cmd).not.toContain('--no-verify-jwt')
    expect(etapes[3].cmd).toEqual(['git', 'push', 'origin', 'main'])
  })

  it('montre-resume part sans vérification JWT (la montre n’a pas de session)', () => {
    // Oracle : la montre appelle avec la seule clé X-Montre-Cle, sans JWT ;
    // une vérification JWT réactivée au déploiement la couperait (401).
    const { etapes } = planEnvoi({ ...base, fonctions: ['montre-resume'] })
    expect(etapes[1].cmd).toEqual([
      'supabase',
      'functions',
      'deploy',
      'montre-resume',
      '--project-ref',
      REF_PROD,
      '--no-verify-jwt',
    ])
  })

  test.prop([fc.string()])(
    'toute autre réponse que LIVRER : rien ne part',
    (r) => {
      fc.pre(r.trim() !== 'LIVRER')
      expect(planEnvoi({ ...base, reponse: r }).etapes).toEqual([])
    },
  )

  it('LIVRER entouré d’espaces est accepté, livrer en minuscules non', () => {
    expect(
      planEnvoi({ ...base, reponse: '  LIVRER\n' }).etapes.length,
    ).toBeGreaterThan(0)
    expect(planEnvoi({ ...base, reponse: 'livrer' }).etapes).toEqual([])
  })

  it('migration destructrice sans SUPPRIMER : rien ne part ; avec : tout part', () => {
    const d = {
      ...base,
      migrations: [{ nom: 'x.sql', destructrices: ['drop column y'] }],
    }
    expect(planEnvoi(d).etapes).toEqual([])
    expect(planEnvoi({ ...d, confirmationSuppression: 'non' }).etapes).toEqual(
      [],
    )
    expect(
      planEnvoi({ ...d, confirmationSuppression: 'SUPPRIMER' }).etapes.length,
    ).toBe(5)
    expect(
      planEnvoi({ ...d, confirmationSuppression: ' SUPPRIMER\n' }).etapes
        .length,
    ).toBe(5)
  })

  it('jamais le seed, jamais --include-seed', () => {
    for (const e of planEnvoi(base).etapes)
      expect(e.cmd.join(' ')).not.toMatch(/seed/i)
  })

  it('sans migration ni fonction ni commit : rien à livrer', () => {
    const r = planEnvoi({ ...base, migrations: [], fonctions: [], commits: 0 })
    expect(r.etapes).toEqual([])
    expect(r.raison).toContain('déjà à jour')
  })

  it('seulement du code : site et étiquette', () => {
    expect(
      planEnvoi({ ...base, migrations: [], fonctions: [] }).etapes.map(
        (e) => e.nom,
      ),
    ).toEqual(['Site (Vercel)', 'Étiquette prod'])
  })
})

describe('fonctionsModifiees', () => {
  it('les dossiers touchés, triés, sans doublon', () => {
    expect(
      fonctionsModifiees(
        [
          'supabase/functions/send-report/index.ts',
          'src/x.ts',
          'supabase/functions/send-report/marker.ts',
          'supabase/functions/create-user/index.ts',
        ],
        TOUTES,
      ),
    ).toEqual(['create-user', 'send-report'])
  })

  it('_shared touché : toutes', () => {
    expect(
      fonctionsModifiees(['supabase/functions/_shared/send-mail.ts'], TOUTES),
    ).toEqual([...TOUTES].sort())
  })

  it('chemins Windows et dossiers inconnus', () => {
    expect(
      fonctionsModifiees(
        [
          'supabase\\functions\\delete-user\\index.ts',
          'supabase/functions/disparue/x.ts',
        ],
        TOUTES,
      ),
    ).toEqual(['delete-user'])
  })
})

describe('lignesDestructrices', () => {
  it('repère drop, rename, truncate ; ignore les commentaires et create', () => {
    const sql = [
      'create table t (id int);',
      '-- drop table t;  (commentaire)',
      'alter table t drop column x;',
      'ALTER TABLE t RENAME COLUMN a TO b;',
      'drop policy "p" on t;',
      '  truncate t;',
      'select 1; -- rename to',
      'create policy "drop" on t using (true);',
    ].join('\n')
    expect(lignesDestructrices(sql)).toEqual([
      'alter table t drop column x',
      'ALTER TABLE t RENAME COLUMN a TO b',
      'drop policy "p" on t',
      'truncate t',
    ])
  })

  // Faux négatifs trouvés par la revue adverse du 2026-10-13.
  it.each([
    'alter table t drop constraint c',
    'alter table t drop col',
    'drop materialized view v',
    'drop sequence s',
    'drop extension e',
    'alter type e rename value $$a$$ to $$b$$',
    'alter table if exists x rename constraint a to b',
    'revoke select on t from authenticated',
    'alter table t alter column c type bigint',
    'alter table t alter column c set data type text',
    'alter table t alter column c set not null',
    'delete from t',
    'update public.t set a = 1',
    'drop\n  table\n  t',
    'DROP /* x */ TABLE t',
  ])('destructif : %s', (sql) => {
    expect(lignesDestructrices(`${sql};`)).toHaveLength(1)
  })

  it.each([
    'alter table t alter column c drop default',
    'alter table t alter column c drop not null',
    'create table t (a int references u on delete cascade)',
    'create trigger x before insert or update on t for each row execute function f()',
    'grant update on t to authenticated',
    '-- drop table t',
    '/* drop table t */ select 1',
  ])('pas destructif : %s', (sql) => {
    expect(lignesDestructrices(`${sql};`)).toEqual([])
  })
})

describe('lignesJson', () => {
  it('tableau nu (personne) et { rows } (agent), avant-propos ignoré', () => {
    expect(lignesJson('[{"a":1}]')).toEqual([{ a: 1 }])
    expect(lignesJson('Initialising login role...\n[]')).toEqual([])
    expect(
      lignesJson('{"boundary":"x","rows":[{"a":2}],"warning":"w"}'),
    ).toEqual([{ a: 2 }])
  })
  it('illisible : erreur claire', () => {
    expect(() => lignesJson('rien')).toThrow('illisible')
    expect(() => lignesJson('{"autre":1}')).toThrow('illisible')
  })
})

describe('normaliserSchema', () => {
  it('ignore les lignes volatiles d’un dump', () => {
    expect(
      ecartSchema(
        'a\n\\restrict ABC\nb\n\\unrestrict ABC',
        'a\n\\restrict XYZ\n-- Dumped from database version 17.7\nb',
      ),
    ).toEqual({ absentes: [], ajoutees: [] })
  })
})

describe('ecartSchema', () => {
  it('fins de ligne et espaces de fin ignorés', () => {
    expect(ecartSchema('a\r\nb  \n', 'a\nb')).toEqual({
      absentes: [],
      ajoutees: [],
    })
  })

  it('lignes disparues et apparues, doublons comptés', () => {
    expect(ecartSchema('a\nb\nb', 'a\nb\nc')).toEqual({
      absentes: ['b'],
      ajoutees: ['c'],
    })
  })

  test.prop([fc.array(fc.string({ unit: fc.constantFrom('a', 'b', ' ') }))])(
    'un schéma est sans écart avec lui-même',
    (l) => {
      const s = l.join('\n')
      expect(ecartSchema(s, s)).toEqual({ absentes: [], ajoutees: [] })
    },
  )
})

describe('bilanEchec et secrets', () => {
  it('ce qui est parti, ce qui ne l’est pas', () => {
    const etapes = [{ nom: 'A' }, { nom: 'B' }, { nom: 'C' }].map((e) => ({
      ...e,
      cmd: [] as Array<string>,
    }))
    expect(bilanEchec(etapes, 1)).toEqual({
      parti: ['A'],
      echoue: 'B',
      pasParti: ['C'],
      peutEtreEnPartie: false,
    })
    expect(bilanEchec(etapes, 0)).toEqual({
      parti: [],
      echoue: 'A',
      pasParti: ['B', 'C'],
      peutEtreEnPartie: false,
    })
  })

  it('échec pendant la base : peut-être en partie', () => {
    const etapes = [
      { nom: 'Base de données', cmd: [] as Array<string> },
      { nom: 'Site (Vercel)', cmd: [] as Array<string> },
    ]
    expect(bilanEchec(etapes, 0).peutEtreEnPartie).toBe(true)
    expect(bilanEchec(etapes, 1).peutEtreEnPartie).toBe(false)
  })

  it('secrets manquants', () => {
    expect(secretsManquants(['A', 'B', 'C'], ['B', 'X'])).toEqual(['A', 'C'])
  })

  it('noms des secrets : forme réelle de la CLI 2.120 (objet secrets), suivie de son avis de version', () => {
    expect(
      nomsSecrets(
        '{"secrets":[{"name":"IMPORT_SECRET","value":"63ab","updated_at":"2026-08-07T21:25:49.500Z"},{"name":"SUPABASE_URL","value":"a4f6","updated_at":"2026-09-29T08:43:18.289Z"}],"message":""}\nA new version of Supabase CLI is available: v2.121.0 (currently installed v2.120.0)',
      ),
    ).toEqual(['IMPORT_SECRET', 'SUPABASE_URL'])
  })

  it('noms des secrets : JSON, tableau ASCII, tableau Unicode', () => {
    expect(
      nomsSecrets(
        'Bavardage\n[{"name":"RESEND_API_KEY","value":"ab"},{"name":"SB_SECRET_KEY","value":"cd"}]',
      ),
    ).toEqual(['RESEND_API_KEY', 'SB_SECRET_KEY'])
    expect(
      nomsSecrets(
        '  NAME | DIGEST\n  -----|------\n  REPORT_FROM | 12ab\n  IMPORT_SECRET | 34cd\n',
      ),
    ).toEqual(['REPORT_FROM', 'IMPORT_SECRET'])
    expect(
      nomsSecrets('│ NAME          │ DIGEST │\n│ IMPORT_SECRET │ 34cd   │\n'),
    ).toEqual(['IMPORT_SECRET'])
  })

  it('noms des secrets : une liste illisible est une erreur, jamais « tout manque »', () => {
    expect(() => nomsSecrets('')).toThrow('illisible')
    expect(() => nomsSecrets('Error: unauthorized')).toThrow('illisible')
  })
})

describe('choixControles', () => {
  it('ne rejoue rien sur un commit déjà vérifié', () => {
    const c = choixControles({
      dejaVerifie: true,
      copieDeLaProd: false,
      migrationsModifiees: ['supabase/migrations/x.sql'],
    })
    expect(c).toMatchObject({ jouer: false, testsBase: false })
  })

  it('saute les tests de la base sur une copie de la prod sans migration', () => {
    const c = choixControles({
      dejaVerifie: false,
      copieDeLaProd: true,
      migrationsModifiees: [],
    })
    expect(c).toMatchObject({ jouer: true, testsBase: false })
    expect(c.note).toMatch(/copie de la prod/)
  })

  it('exige les tests de la base dès qu’une migration part', () => {
    const c = choixControles({
      dejaVerifie: false,
      copieDeLaProd: true,
      migrationsModifiees: ['supabase/migrations/20261020000000_x.sql'],
    })
    expect(c).toEqual({ jouer: true, testsBase: true, note: null })
  })

  it('joue tout sur des données fictives', () => {
    expect(
      choixControles({
        dejaVerifie: false,
        copieDeLaProd: false,
        migrationsModifiees: [],
      }),
    ).toEqual({ jouer: true, testsBase: true, note: null })
  })
})

describe('descriptionLivraison', () => {
  it('ne dépend pas de l’ordre, mais de chaque élément', () => {
    const a = descriptionLivraison({
      head: 'h',
      migrations: ['2', '1'],
      fonctions: ['b', 'a'],
    })
    expect(
      descriptionLivraison({
        head: 'h',
        migrations: ['1', '2'],
        fonctions: ['a', 'b'],
      }),
    ).toBe(a)
    expect(
      descriptionLivraison({
        head: 'h2',
        migrations: ['1', '2'],
        fonctions: ['a', 'b'],
      }),
    ).not.toBe(a)
    expect(
      descriptionLivraison({
        head: 'h',
        migrations: ['1'],
        fonctions: ['a', 'b'],
      }),
    ).not.toBe(a)
    expect(
      descriptionLivraison({
        head: 'h',
        migrations: ['1', '2'],
        fonctions: ['a'],
      }),
    ).not.toBe(a)
  })
})

describe('arretsSansClavier', () => {
  const rien = { destructives: [], configToml: false, worker: false }
  it('laisse passer une livraison ordinaire', () => {
    expect(arretsSansClavier(rien)).toEqual([])
  })
  it('arrête sur une migration destructive, config.toml ou le Worker', () => {
    expect(
      arretsSansClavier({ ...rien, destructives: ['1_x.sql'] })[0],
    ).toMatch(/SUPPRIMER/)
    expect(arretsSansClavier({ ...rien, configToml: true })).toHaveLength(1)
    expect(arretsSansClavier({ ...rien, worker: true })).toHaveLength(1)
  })
  it('reprend les arrêts des réglages de fonctions', () => {
    expect(
      arretsSansClavier({ ...rien, reglagesFonctions: ['x', 'y'] }),
    ).toEqual(['x', 'y'])
  })
})

// Oracle : décision utilisateur du 2026-10-16 — seul un changement HORS
// [functions.*] (Auth…) exige le clavier ; un réglage de fonction doit partir
// avec sa fonction et rester d'accord avec SANS_VERIF_JWT.
describe('changementsConfig', () => {
  const base = [
    'project_id = "back_office"',
    '[auth]',
    'site_url = "http://localhost:3000"',
    '# commentaire',
    '[functions.import-report]',
    'verify_jwt = false',
  ].join('\n')

  it('rien de changé', () => {
    expect(changementsConfig(base, base)).toEqual({
      horsFonctions: false,
      fonctions: [],
    })
  })
  it('commentaires et lignes vides ne comptent pas', () => {
    const apres = base.replace('# commentaire', '\n# autre\n\n')
    expect(changementsConfig(base, apres).horsFonctions).toBe(false)
  })
  it('section de fonction ajoutée : seulement cette fonction', () => {
    const apres = `${base}\n\n# montre\n[functions.montre-resume]\nverify_jwt = false\n`
    expect(changementsConfig(base, apres)).toEqual({
      horsFonctions: false,
      fonctions: ['montre-resume'],
    })
  })
  it('section de fonction retirée ou modifiée : comptée', () => {
    const sans = base.replace(
      '[functions.import-report]\nverify_jwt = false',
      '',
    )
    expect(changementsConfig(base, sans).fonctions).toEqual(['import-report'])
    const autre = base.replace('verify_jwt = false', 'verify_jwt = true')
    expect(changementsConfig(base, autre).fonctions).toEqual(['import-report'])
  })
  it('réglage Auth changé : hors fonctions', () => {
    const apres = base.replace('localhost:3000', 'exemple.test')
    expect(changementsConfig(base, apres).horsFonctions).toBe(true)
  })
  it('préambule ou nouvelle section non fonction : hors fonctions', () => {
    expect(changementsConfig(base, `x = 1\n${base}`).horsFonctions).toBe(true)
    expect(
      changementsConfig(base, `${base}\n[auth.email]\nenable_signup = true`)
        .horsFonctions,
    ).toBe(true)
  })
  it('une ligne déplacée d’une section Auth vers une fonction : hors fonctions', () => {
    const apres = base
      .replace('site_url = "http://localhost:3000"\n', '')
      .concat('\nsite_url = "http://localhost:3000"')
    expect(changementsConfig(base, apres).horsFonctions).toBe(true)
  })
  test.prop([fc.string(), fc.string()])(
    'toute ligne ajoutée hors [functions.*] est vue',
    (cle, val) => {
      const ligne = `${cle.replace(/[\r\n#[\]]/g, '')}k = "${val.replace(/[\r\n]/g, '')}"`
      const apres = base.replace('[auth]', `[auth]\n${ligne}`)
      expect(changementsConfig(base, apres).horsFonctions).toBe(true)
    },
  )
})

describe('arretsReglagesFonctions', () => {
  const toml = [
    '[functions.import-report]',
    'verify_jwt = false',
    '[functions.montre-resume]',
    'verify_jwt = false',
  ].join('\n')
  const sansVerif = new Set(['import-report', 'montre-resume'])

  it('cas de la montre : rien à redire', () => {
    expect(
      arretsReglagesFonctions({
        apres: toml,
        changees: ['montre-resume'],
        deployees: ['montre-resume'],
        sansVerif,
      }),
    ).toEqual([])
  })
  it('section changée pour une fonction qui ne part pas : arrêt', () => {
    expect(
      arretsReglagesFonctions({
        apres: toml,
        changees: ['montre-resume'],
        deployees: [],
        sansVerif,
      })[0],
    ).toMatch(/ne part pas/)
  })
  it('verify_jwt = false absent de SANS_VERIF_JWT : arrêt', () => {
    expect(
      arretsReglagesFonctions({
        apres: toml,
        changees: [],
        deployees: [],
        sansVerif: new Set(['import-report']),
      })[0],
    ).toMatch(/montre-resume.*SANS_VERIF_JWT/)
  })
  it('SANS_VERIF_JWT sans verify_jwt = false : arrêt', () => {
    expect(
      arretsReglagesFonctions({
        apres: toml.replace(/verify_jwt = false$/, 'verify_jwt = true'),
        changees: [],
        deployees: [],
        sansVerif,
      })[0],
    ).toMatch(/montre-resume.*diffèrent/)
  })
  it('le vrai config.toml est d’accord avec le vrai SANS_VERIF_JWT', () => {
    const vrai = readFileSync(
      join(import.meta.dirname, '..', 'supabase', 'config.toml'),
      'utf8',
    )
    expect(
      arretsReglagesFonctions({ apres: vrai, changees: [], deployees: [] }),
    ).toEqual([])
  })
})
