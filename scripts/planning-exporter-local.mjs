#!/usr/bin/env node
/*
 * Export du planning de la base LOCALE (dev) au format de l'import du
 * prototype (`planning-prototype-v20`, RPC `planning_importer`) : équipe,
 * postes, horaires, motifs, catégories, besoins, jours d'absence, shifts et
 * semaines verrouillées, tels qu'ils sont en dev.
 *
 * Sert à reprendre en production un planning commencé en dev (demande
 * utilisateur du 2026-10-27). Le fichier s'importe dans l'app, onglet
 * Planning, engrenage, « Importer le prototype » (gestion, planning vide).
 *
 * Lecture seule de la base locale (conteneur Docker de `supabase start`).
 * Le JSON contient de VRAIS NOMS : il est écrit sur le Bureau, jamais dans
 * le dépôt (`planning-prototype*.json` est ignoré par git).
 *
 *   node scripts/planning-exporter-local.mjs [sortie.json]
 */

import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const CONTENEUR = 'supabase_db_back-office'
const sortie =
  process.argv[2] ?? join(homedir(), 'Desktop', 'planning-prototype-dev.json')

const SQL = `
select jsonb_build_object(
  'format', 'planning-prototype-v20',
  'source', 'base locale du back office',
  'horaires', coalesce((select jsonb_agg(to_jsonb(h) - 'created_at' - 'updated_at' order by h.id) from public.planning_horaires h), '[]'),
  'motifs', coalesce((select jsonb_agg(to_jsonb(m) - 'created_at' - 'updated_at' order by m.id) from public.planning_motifs m), '[]'),
  'postes', coalesce((select jsonb_agg(to_jsonb(p) - 'created_at' - 'updated_at' order by p.id) from public.planning_postes p), '[]'),
  'groupes', coalesce((select jsonb_agg(to_jsonb(g) - 'created_at' - 'updated_at' order by g.ordre, g.id) from public.planning_groupes g), '[]'),
  'salaries', coalesce((select jsonb_agg(
      (to_jsonb(s) - 'created_at' - 'updated_at')
      || jsonb_build_object('absences', coalesce((
           select jsonb_agg(jsonb_build_object('jour', a.jour, 'motif_id', a.motif_id) order by a.jour)
             from public.planning_absences a where a.salarie_id = s.id), '[]'))
      order by s.id) from public.planning_salaries s), '[]'),
  'besoins', coalesce((select jsonb_agg(to_jsonb(b) - 'id' - 'created_at' - 'updated_at' order by b.id) from public.planning_besoins b), '[]'),
  'affectations', coalesce((select jsonb_agg(to_jsonb(a) - 'id' - 'created_at' - 'updated_at' - 'created_by' order by a.lundi, a.salarie_id, a.jour) from public.planning_affectations a), '[]'),
  'verrous', coalesce((select jsonb_agg(v.lundi order by v.lundi) from public.planning_semaines_verrouillees v), '[]')
)::text`

const json = execFileSync(
  'docker',
  [
    'exec',
    CONTENEUR,
    'psql',
    '-U',
    'postgres',
    '-d',
    'postgres',
    '-At',
    '-c',
    SQL,
  ],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
).trim()
const d = JSON.parse(json)
writeFileSync(sortie, JSON.stringify(d, null, 2))
const nAbs = d.salaries.reduce((n, s) => n + s.absences.length, 0)
console.log(
  `Export écrit : ${sortie}. ${d.salaries.length} personnes, ${d.postes.length} postes, ` +
    `${d.horaires.length} codes horaires, ${d.besoins.length} besoins, ${nAbs} jours d'absence, ` +
    `${d.affectations.length} shifts, ${d.verrous.length} semaines verrouillées.`,
)
