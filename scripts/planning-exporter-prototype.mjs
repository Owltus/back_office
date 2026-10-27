#!/usr/bin/env node
// Exporte la base du prototype de planning (SQLite, `planning.db`) en un
// fichier JSON à importer dans la page Planning du back office (gestion :
// engrenage, « Importer le prototype »). Plan planning-portage-2026-10-27, D8 :
// les vrais noms ne passent JAMAIS par le dépôt, seulement par ce fichier,
// produit et importé par l'utilisateur.
//
// Usage :
//   node scripts/planning-exporter-prototype.mjs [chemin/planning.db] [sortie.json]
// Par défaut : C:\Users\Pierre-Louis\Desktop\planning\backend\planning.db, et
// planning-prototype.json sur le Bureau (jamais dans le dépôt : il contient
// les vrais noms ; `.gitignore` l'écarte aussi par prudence).
//
// Lecture seule (`readOnly`) : la base du prototype n'est jamais modifiée.
// Les absences, en périodes dans le prototype, sont étalées jour par jour
// (un week-end compris dans une période de congés est un jour de congé).

import { writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const source =
  process.argv[2] ??
  'C:/Users/Pierre-Louis/Desktop/planning/backend/planning.db'
const cible =
  process.argv[3] ?? join(homedir(), 'Desktop', 'planning-prototype.json')

const db = new DatabaseSync(source, { readOnly: true })
const version = db.prepare('pragma user_version').get().user_version
if (version !== 20) {
  console.error(
    `Base du prototype en version ${version}, attendue 20 : l'export suit le format v20.`,
  )
  process.exit(1)
}

const tout = (sql) => db.prepare(sql).all()
const json = (v, defaut) => {
  if (v === null || v === undefined || v === '') return defaut
  try {
    return JSON.parse(v)
  } catch {
    return defaut
  }
}
const bool = (v) => v === 1 || v === true || v === '1'

function jours(debut, fin) {
  const r = []
  const d = new Date(`${debut}T12:00:00Z`)
  const f = new Date(`${fin}T12:00:00Z`)
  for (; d <= f; d.setUTCDate(d.getUTCDate() + 1))
    r.push(d.toISOString().slice(0, 10))
  return r
}

const salaries = tout('select * from salarie order by id').map((x) => {
  const absences = []
  for (const a of json(x.absences, [])) {
    if (!a?.debut || !a?.fin || a.type_absence_id == null) continue
    for (const jour of jours(a.debut, a.fin)) {
      absences.push({ jour, motif_id: a.type_absence_id })
    }
  }
  // Un même jour posé deux fois : la dernière période l'emporte (comme le
  // prototype, qui lit les périodes dans l'ordre).
  const parJour = new Map(absences.map((a) => [a.jour, a]))
  return {
    id: x.id,
    prenom: x.prenom,
    nom: x.nom ?? '',
    groupe_id: x.groupe_id,
    type_contrat: x.type_contrat,
    heures_hebdo: Number(x.heures_hebdo),
    forfait_jours: bool(x.forfait_jours),
    mineur: bool(x.mineur),
    competences: json(x.competences, []),
    semaine_type: json(x.semaine_type, []),
    shifts_autorises: json(x.shifts_autorises, []),
    date_entree: x.date_entree || null,
    date_sortie: x.date_sortie || null,
    actif: bool(x.actif),
    suite_de: x.suite_de ?? null,
    absences: [...parJour.values()],
  }
})

const donnees = {
  format: 'planning-prototype-v20',
  exporte_le: new Date().toISOString(),
  horaires: tout('select * from typeshift order by id').map((h) => ({
    id: h.id,
    code: h.code,
    nom: h.nom,
    debut: h.debut,
    fin: h.fin,
    couleur: h.couleur,
    pause: h.pause,
    raccourci: h.raccourci,
    raccourci_debut: h.raccourci_debut,
  })),
  motifs: tout('select * from typeabsence order by id').map((m) => ({
    id: m.id,
    code: m.code,
    nom: m.nom,
    couleur: m.couleur,
    decompte: bool(m.decompte),
    nature: m.nature ?? 'absence',
  })),
  postes: tout('select * from poste order by id').map((p) => ({
    id: p.id,
    nom: p.nom,
    categorie: p.categorie,
    couleur: p.couleur,
    horaires_autorises: json(p.horaires_autorises, []),
    a_part: bool(p.a_part),
  })),
  groupes: tout('select * from groupestaff order by ordre, id').map((g) => ({
    id: g.id,
    nom: g.nom,
    ordre: g.ordre,
    postes_autorises: json(g.postes_autorises, []),
  })),
  salaries,
  besoins: tout('select * from besoin order by id').map((b) => ({
    id: b.id,
    poste_id: b.poste_id,
    jour: b.jour,
    horaire_id: b.type_shift_id,
    debut: b.debut,
    fin: b.fin,
    effectif: b.effectif,
    soutien: b.soutien,
    renfort: b.renfort,
  })),
  affectations: tout('select * from affectation order by id').map((a) => ({
    id: a.id,
    lundi: a.lundi,
    salarie_id: a.salarie_id,
    poste_id: a.poste_id,
    jour: a.jour,
    horaire_id: a.type_shift_id,
    debut: a.debut,
    fin: a.fin,
    epinglee: bool(a.epinglee),
    court: bool(a.court),
    pause: a.pause,
  })),
  verrous: tout('select lundi from semaineverrouillee order by lundi').map(
    (v) => v.lundi,
  ),
}

writeFileSync(cible, JSON.stringify(donnees, null, 1))
console.log(
  `Export écrit : ${cible}. ${donnees.salaries.length} personnes, ${donnees.postes.length} postes, ` +
    `${donnees.horaires.length} codes horaires, ${donnees.besoins.length} besoins, ` +
    `${donnees.affectations.length} shifts, ${donnees.verrous.length} semaines verrouillées.`,
)
