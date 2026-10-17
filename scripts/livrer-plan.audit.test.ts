import { describe, expect, it } from 'vitest'
import { lignesDestructrices, lignesDonnees } from './livrer-plan.mjs'

/*
 * Audit de sécurité du 2026-10-17 — détection des migrations destructrices
 * (exigent SUPPRIMER au clavier) et des migrations qui écrivent du contenu
 * (exigent --avec-donnees). Les blocs FINDING passaient (non détecté) ; ils
 * prouvent désormais le correctif (tokeniseur `instructionsSql`, motifs
 * élargis).
 */

describe('FINDING corrigé — destructif détecté (exige SUPPRIMER)', () => {
  it.each([
    // `COLUMN` est FACULTATIF en PostgreSQL (ALTER [ COLUMN ] … TYPE).
    'alter table public.t alter c type bigint;',
    'alter table public.t alter c set data type text;',
    'alter table public.t alter c set not null;',
    // Déplacer une table = la renommer pour l'ancien code.
    'alter table public.t set schema private;',
    // `--` DANS une chaîne : le reste de la ligne est pris pour un commentaire.
    "comment on table public.t is 'a -- b'; drop table public.t;",
  ])('%s', (sql) => {
    expect(lignesDestructrices(sql).length).toBeGreaterThan(0)
  })

  it('le `drop` posé derrière une chaîne à `--` est rendu tel quel', () => {
    expect(
      lignesDestructrices(
        "comment on table public.t is 'a -- b'; drop table public.t;",
      ),
    ).toEqual(['drop table public.t'])
  })
})

describe('FINDING corrigé — écriture de contenu détectée (exige --avec-donnees)', () => {
  it.each([
    'update public.profiles p set role = $$admin$$ where p.id = 1;',
    'update only public.t set a = 1;',
    'merge into public.t using public.s on t.id = s.id when matched then update set a = s.a;',
    "comment on table public.t is 'x -- y'; insert into public.t values (1);",
  ])('%s', (sql) => {
    expect(lignesDonnees(sql).length).toBeGreaterThan(0)
  })
})

describe('tokeniseur : ce qui est dans une chaîne ou un nom ne compte pas', () => {
  it.each([
    "comment on table t is 'drop table t; delete from t';",
    "comment on table t is 'l''apostrophe -- drop table t';",
    "comment on table t is E'\\' drop table t';",
    'create policy "drop table x" on t using (true);',
    'create table t (a int references u on update set null);',
    "select 'a;b' /* drop /* imbriqué */ table */;",
  ])('%s', (sql) => {
    expect(lignesDestructrices(sql)).toEqual([])
    expect(lignesDonnees(sql)).toEqual([])
  })

  it('un `;` dans une chaîne ou un corps $tag$ ne coupe pas l’instruction', () => {
    expect(
      lignesDestructrices(
        "create function f() returns void language sql as $f$ select 'x;y'; $f$; drop view v;",
      ),
    ).toEqual(['drop view v'])
    expect(
      lignesDonnees('do $$ begin update public.t set a = 1; end $$;'),
    ).toEqual(['do $$ begin update public.t set a = 1; end $$'])
  })
})

describe('ce qui tient', () => {
  it.each([
    'alter table t drop column c;',
    'alter table t drop c;',
    'ALTER TABLE t ALTER COLUMN c TYPE int;',
    'drop policy if exists p on t;',
    'alter table t rename to u;',
    'revoke select on t from anon;',
    'truncate t;',
    'delete from t where id = 1;',
    'update public.t set a = 1;',
    '/* rien */ drop\n  table t;',
  ])('destructif détecté : %s', (sql) => {
    expect(lignesDestructrices(sql).length).toBeGreaterThan(0)
  })

  it.each([
    'insert into t values (1);',
    'copy t from stdin;',
    'delete from t;',
  ])('données détectées : %s', (sql) => {
    expect(lignesDonnees(sql).length).toBeGreaterThan(0)
  })
})
