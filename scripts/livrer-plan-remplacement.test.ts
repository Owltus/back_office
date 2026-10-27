import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  lignesDestructrices,
  lignesDonnees,
  workerModifie,
} from './livrer-plan.mjs'

// Oracle : demande utilisateur du 2026-10-17 (« ce ne sont pas des mises à
// jour destructrices ») — un REMPLACEMENT ne doit pas exiger SUPPRIMER ni
// --avec-donnees ; un vrai retrait, si.

describe('remplacements : pas destructifs', () => {
  it.each([
    'drop policy if exists "p" on public.t; create policy "p" on public.t using (true);',
    'drop policy "p" on t; create policy "p" on t for select using (true);',
    'drop trigger if exists x on public.t; create trigger x before update on public.t for each row execute function f();',
    'create or replace function public.f() returns trigger language plpgsql as $$ begin return new; end $$; revoke all on function public.f() from public;',
    'create function private.g() returns void language sql as $$ select 1 $$; revoke execute on function private.g() from public, anon, authenticated;',
    // Décision utilisateur du 2026-10-27 : une contrainte CHECK recréée.
    'alter table public.t drop constraint if exists t_c_check; alter table public.t add constraint t_c_check check (c in (1, 2));',
    'alter table t\n  drop constraint "Ma_regle";\nalter table only t\n  add constraint "Ma_regle"\n  check (c > 0);',
  ])('%s', (sql) => {
    expect(lignesDestructrices(sql)).toEqual([])
  })

  it('le corps d’une fonction créée ne compte ni comme retrait ni comme contenu', () => {
    const sql =
      'create or replace function private.f(u uuid) returns void language plpgsql as $$ begin delete from auth.sessions where user_id = u; update t set a = 1; end $$;'
    expect(lignesDestructrices(sql)).toEqual([])
    expect(lignesDonnees(sql)).toEqual([])
  })
})

describe('vrais retraits : toujours détectés', () => {
  it.each([
    // Policy retirée sans être recréée, ou recréée sur une AUTRE table.
    'drop policy if exists "p" on public.t;',
    'drop policy "p" on public.t; create policy "p" on public.u using (true);',
    'drop policy "p" on public.t; create policy "q" on public.t using (true);',
    // Revoke sur une fonction que la migration ne crée pas, ou sur une table.
    'revoke all on function public.existante() from authenticated;',
    'create function public.f() returns int language sql as $$ select 1 $$; revoke select on public.t from anon;',
    // Un `do $$ … $$` exécute son corps.
    'do $$ begin delete from public.t; end $$;',
    'drop table public.t;',
    'alter table public.t drop column c;',
    // Contrainte retirée sans être recréée, recréée ailleurs, sous un autre
    // nom, ou recréée autrement qu'en CHECK.
    'alter table public.t drop constraint t_c_check;',
    'alter table public.t drop constraint t_c_check; alter table public.u add constraint t_c_check check (c > 0);',
    'alter table public.t drop constraint t_c_check; alter table public.t add constraint t_d_check check (c > 0);',
    'alter table public.t drop constraint t_fk; alter table public.t add constraint t_fk foreign key (c) references public.u (id);',
    'alter table public.t drop constraint t_c_check cascade; alter table public.t add constraint t_c_check check (c > 0);',
  ])('%s', (sql) => {
    expect(lignesDestructrices(sql).length).toBeGreaterThan(0)
  })

  it('un `do $$ … $$` qui écrit reste du contenu', () => {
    expect(
      lignesDonnees('do $$ begin update public.t set a = 1; end $$;'),
    ).toHaveLength(1)
  })
})

describe('migrations du 2026-10-17 : livrables sans clavier', () => {
  it.each([
    '20261017100000_caisse_cautions_rapro_sheets_figees.sql',
    '20261017110000_regles_ecriture.sql',
    '20261017120000_auth_mot_de_passe_et_wordpool.sql',
  ])('%s', (nom) => {
    const sql = readFileSync(`supabase/migrations/${nom}`, 'utf8')
    expect(lignesDestructrices(sql)).toEqual([])
    expect(lignesDonnees(sql)).toEqual([])
  })
})

describe('migration de la page Planning (2026-10-27) : livrable sans clavier', () => {
  it('ses deux contraintes de pages sont recréées, rien n est retiré', () => {
    const sql = readFileSync(
      'supabase/migrations/20261027100000_page_planning.sql',
      'utf8',
    )
    expect(lignesDestructrices(sql)).toEqual([])
    expect(lignesDonnees(sql)).toEqual([])
  })
})

describe('workerModifie', () => {
  it('un fichier de test ne compte pas', () => {
    expect(workerModifie(['cloudflare/worker.audit.test.ts'])).toBe(false)
    expect(workerModifie(['cloudflare\\worker.test.js', 'src/a.ts'])).toBe(
      false,
    )
  })

  it('le code du Worker compte', () => {
    expect(workerModifie(['cloudflare/worker.js'])).toBe(true)
    expect(workerModifie(['cloudflare/wrangler.toml'])).toBe(true)
    expect(workerModifie(['worker/index.ts'])).toBe(true)
  })
})
