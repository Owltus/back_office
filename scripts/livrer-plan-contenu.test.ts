import { describe, expect, it } from 'vitest'

import {
  arretAvantProd,
  arretsSansClavier,
  ecartNonCapture,
  lignesDonnees,
} from './livrer-plan.mjs'

// Oracle : demande utilisateur du 2026-10-15 — la STRUCTURE part en prod,
// jamais le CONTENU de la base de dev ; une structure changée sans
// migration ne doit ni partir en silence ni être effacée en silence.

describe('lignesDonnees', () => {
  it('repère les écritures de contenu, pas la structure', () => {
    const sql = `create table t (id int);
      alter table t add column x text;
      -- insert into t values (0);
      insert into t values (1);
      update public.t set x = 'a' where id = 1;
      delete from t where id = 2;
      create policy p on t using (true);`
    expect(lignesDonnees(sql)).toEqual([
      'insert into t values (1)',
      "update public.t set x = 'a' where id = 1",
      'delete from t where id = 2',
    ])
  })

  it('vide pour une migration de pure structure', () => {
    expect(
      lignesDonnees('create function f() returns int as $$ select 1 $$;'),
    ).toEqual([])
  })
})

describe('ecartNonCapture', () => {
  it('vide quand la CLI ne trouve rien', () => {
    expect(
      ecartNonCapture(
        'Diffing schemas\nNo schema changes found\n{"diff":"\\n","file":null}',
      ),
    ).toBe('')
  })

  it('rend le SQL de l’écart', () => {
    expect(
      ecartNonCapture('x\n{"diff":"alter table t add column y int;\\n"}'),
    ).toBe('alter table t add column y int;')
  })

  it('refuse une sortie illisible', () => {
    expect(() => ecartNonCapture('erreur de connexion')).toThrow(/illisible/)
  })
})

describe('arrêts liés au contenu et à la structure', () => {
  it('une migration à données exige l’accord', () => {
    const e = { destructives: [], configToml: false, worker: false }
    expect(arretsSansClavier({ ...e, avecDonnees: ['1_x.sql'] })[0]).toMatch(
      /CONTENU/,
    )
    expect(
      arretsSansClavier({
        ...e,
        avecDonnees: ['1_x.sql'],
        donneesAcceptees: true,
      }),
    ).toEqual([])
  })

  it('une structure locale non capturée arrête la livraison', () => {
    const base = {
      branche: 'main',
      arbrePropre: true,
      enRetard: false,
      etiquetteProd: true,
      controles: [],
      migrationsNonJoueesEnLocal: [],
    }
    expect(arretAvantProd(base)).toBeNull()
    expect(
      arretAvantProd({ ...base, ecartNonCapture: 'alter table t add y int;' }),
    ).toMatch(/SANS migration/)
  })
})
