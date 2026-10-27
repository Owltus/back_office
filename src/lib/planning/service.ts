/*
 * Lectures et écritures Supabase de la page Planning (tables `planning_*`,
 * migration 20261027110000). Colonnes explicites ; toute écriture relue
 * (`.select('id')`) : un update ou un delete refusé par la RLS rend 0 ligne
 * SANS erreur (CLAUDE.md, audit du 2026-09-28).
 *
 * Les opérations à plusieurs lignes passent par les RPC `security invoker`
 * (une transaction, RLS de l'appelant) : génération, échange de shifts,
 * absences, validation, vider, suppressions avec cascades.
 */

import { refusDroits } from '#/lib/planning/erreurs.ts'
import type { NouveauShift } from '#/lib/planning/semaine.ts'
import { ajouterJours, lundiDe } from '#/lib/planning/temps.ts'
import type {
  Absence,
  Affectation,
  Besoin,
  Groupe,
  Horaire,
  Motif,
  Poste,
  Referentiel,
  Salarie,
} from '#/lib/planning/types.ts'
import { supabase } from '#/lib/supabase.ts'

const COL_HORAIRE =
  'id, code, nom, debut, fin, couleur, pause, raccourci, raccourci_debut'
const COL_MOTIF = 'id, code, nom, couleur, decompte, nature'
const COL_POSTE = 'id, nom, categorie, couleur, horaires_autorises, a_part'
const COL_GROUPE = 'id, nom, ordre, postes_autorises'
const COL_SALARIE =
  'id, prenom, nom, groupe_id, type_contrat, heures_hebdo, forfait_jours, mineur, competences, semaine_type, shifts_autorises, date_entree, date_sortie, actif, suite_de'
const COL_BESOIN =
  'id, poste_id, jour, horaire_id, debut, fin, effectif, soutien, renfort'
const COL_AFFECTATION =
  'id, lundi, salarie_id, poste_id, jour, horaire_id, debut, fin, epinglee, court, pause, updated_at'
const COL_ABSENCE = 'id, salarie_id, jour, motif_id'

function verifier<T>(r: { data: T | null; error: unknown }): T {
  if (r.error) throw r.error
  return r.data as T
}

/** Une écriture qui doit toucher au moins une ligne. */
function auMoinsUne<T>(r: { data: T[] | null; error: unknown }): T[] {
  const lignes = (verifier(r) as T[] | null) ?? []
  if (lignes.length === 0) throw refusDroits()
  return lignes
}

const num = (v: unknown) => Number(v)

function normaliserSalarie(x: Salarie): Salarie {
  return {
    ...x,
    heures_hebdo: num(x.heures_hebdo),
    competences: x.competences,
    semaine_type: x.semaine_type,
    shifts_autorises: x.shifts_autorises.map(num),
  }
}

// ---------------------------------------------------------------- lectures

export async function fetchReferentiel(): Promise<Referentiel> {
  const [horaires, motifs, postes, groupes, salaries, besoins, verrous] =
    await Promise.all([
      supabase
        .from('planning_horaires')
        .select(COL_HORAIRE)
        .order('debut')
        .order('id'),
      supabase.from('planning_motifs').select(COL_MOTIF).order('id'),
      supabase.from('planning_postes').select(COL_POSTE).order('id'),
      supabase
        .from('planning_groupes')
        .select(COL_GROUPE)
        .order('ordre')
        .order('id'),
      supabase.from('planning_salaries').select(COL_SALARIE).order('id'),
      supabase
        .from('planning_besoins')
        .select(COL_BESOIN)
        .order('jour')
        .order('debut'),
      supabase
        .from('planning_semaines_verrouillees')
        .select('lundi')
        .order('lundi'),
    ])
  return {
    horaires: verifier(horaires),
    motifs: verifier(motifs),
    postes: (verifier(postes) as Poste[]).map((p) => ({
      ...p,
      horaires_autorises: p.horaires_autorises.map(num),
    })),
    groupes: (verifier(groupes) as Groupe[]).map((g) => ({
      ...g,
      postes_autorises: g.postes_autorises.map(num),
    })),
    salaries: (verifier(salaries) as Salarie[]).map(normaliserSalarie),
    besoins: verifier(besoins),
    verrous: (verifier(verrous) as Array<{ lundi: string }>).map(
      (v) => v.lundi,
    ),
  }
}

export interface DonneesShifts {
  affectations: Affectation[]
  absences: Absence[]
}

/** Shifts des semaines `lundis` et jours d'absence de `du` à `au` inclus. */
export async function fetchShifts(
  lundis: string[],
  du: string,
  au: string,
): Promise<DonneesShifts> {
  const [affectations, absences] = await Promise.all([
    supabase
      .from('planning_affectations')
      .select(COL_AFFECTATION)
      .in('lundi', lundis)
      .order('id'),
    supabase
      .from('planning_absences')
      .select(COL_ABSENCE)
      .gte('jour', du)
      .lte('jour', au)
      .order('jour'),
  ])
  return {
    affectations: verifier(affectations),
    absences: verifier(absences),
  }
}

/** La semaine `lundi`, ses deux voisines, et les absences de S-1 à S+1. */
export function fetchSemaine(lundi: string): Promise<DonneesShifts> {
  return fetchShifts(
    [ajouterJours(lundi, -7), lundi, ajouterJours(lundi, 7)],
    ajouterJours(lundi, -7),
    ajouterJours(lundi, 13),
  )
}

export async function fetchAbsencesSalarie(
  salarieId: number,
): Promise<Absence[]> {
  return verifier(
    await supabase
      .from('planning_absences')
      .select(COL_ABSENCE)
      .eq('salarie_id', salarieId)
      .order('jour'),
  )
}

/** Shifts d'une personne à partir de la semaine de `depuis` (fiche : ceux
 * qu'un jour d'école posé retirerait). */
export async function fetchShiftsSalarie(
  salarieId: number,
  depuis: string,
): Promise<Affectation[]> {
  return verifier(
    await supabase
      .from('planning_affectations')
      .select(COL_AFFECTATION)
      .eq('salarie_id', salarieId)
      .gte('lundi', lundiDe(depuis))
      .order('lundi')
      .order('jour'),
  )
}

/** État du planning d'une semaine, lu par la base : la génération le rend
 * à `planning_appliquer_generation`, qui refuse s'il a changé entre-temps. */
export async function fetchEtatSemaine(lundi: string): Promise<string> {
  return verifier(
    await supabase.rpc('planning_etat_semaine', { p_lundi: lundi }),
  ) as string
}

// ----------------------------------------------------------- le planning

export interface ShiftSaisi {
  salarie_id: number
  poste_id: number
  jour: number
  horaire_id: number | null
  debut: string
  fin: string
  court: boolean
  pause: number
  epinglee: boolean
}

export async function ajouterShift(
  lundi: string,
  s: ShiftSaisi,
): Promise<void> {
  auMoinsUne(
    await supabase
      .from('planning_affectations')
      .insert({ lundi, ...s })
      .select('id'),
  )
}

/** Valeurs finales d'un shift déplacé ou retouché ; sur une case occupée,
 * les deux shifts s'échangent (RPC). */
export async function modifierShift(
  id: number,
  maj: Partial<ShiftSaisi>,
): Promise<void> {
  verifier(
    await supabase.rpc('planning_modifier_shift', { p_id: id, p_maj: maj }),
  )
}

export async function supprimerShift(id: number): Promise<void> {
  auMoinsUne(
    await supabase
      .from('planning_affectations')
      .delete()
      .eq('id', id)
      .select('id'),
  )
}

export async function valider(
  lundi: string,
  salarieId: number | null,
  jour: number | null,
  epinglee: boolean,
): Promise<number> {
  return verifier(
    await supabase.rpc('planning_valider', {
      p_lundi: lundi,
      p_salarie: salarieId,
      p_jour: jour,
      p_epinglee: epinglee,
    }),
  ) as number
}

export async function vider(
  lundi: string,
  garderEpinglees: boolean,
): Promise<number> {
  return verifier(
    await supabase.rpc('planning_vider', {
      p_lundi: lundi,
      p_garder_epinglees: garderEpinglees,
    }),
  ) as number
}

export async function appliquerGeneration(args: {
  lundi: string
  etat: string
  depuis: number
  tout: boolean
  exclus: number[]
  sansEffacer: boolean
  nouvelles: NouveauShift[]
}): Promise<number> {
  return verifier(
    await supabase.rpc('planning_appliquer_generation', {
      p_lundi: args.lundi,
      p_etat: args.etat,
      p_depuis: args.depuis,
      p_tout: args.tout,
      p_exclus: args.exclus,
      p_sans_effacer: args.sansEffacer,
      p_nouvelles: args.nouvelles,
    }),
  ) as number
}

/** Pose un motif sur des jours (null : retire l'absence de ces jours). */
export async function poserAbsences(
  salarieId: number,
  jours: string[],
  motifId: number | null,
): Promise<void> {
  verifier(
    await supabase.rpc('planning_poser_absences', {
      p_salarie: salarieId,
      p_jours: jours,
      p_motif: motifId,
    }),
  )
}

export async function deplacerStatut(args: {
  lundi: string
  salarieId: number
  jour: number
  versSalarieId: number
  versJour: number
}): Promise<void> {
  verifier(
    await supabase.rpc('planning_deplacer_statut', {
      p_lundi: args.lundi,
      p_salarie: args.salarieId,
      p_jour: args.jour,
      p_vers_salarie: args.versSalarieId,
      p_vers_jour: args.versJour,
    }),
  )
}

export async function verrouiller(
  lundi: string,
  verrou: boolean,
): Promise<void> {
  if (verrou) {
    auMoinsUne(
      await supabase
        .from('planning_semaines_verrouillees')
        .insert({ lundi })
        .select('lundi'),
    )
  } else {
    auMoinsUne(
      await supabase
        .from('planning_semaines_verrouillees')
        .delete()
        .eq('lundi', lundi)
        .select('lundi'),
    )
  }
}

// ------------------------------------------------------------- paramétrage

type SansId<T> = Omit<T, 'id'>

async function enregistrer<T extends { id: number }>(
  table: string,
  valeurs: SansId<T>,
  id: number | null,
): Promise<number> {
  const lignes = valeurs as Record<string, unknown>
  const requete =
    id === null
      ? supabase.from(table).insert(lignes).select('id')
      : supabase.from(table).update(lignes).eq('id', id).select('id')
  const [ligne] = auMoinsUne(
    (await requete) as { data: Array<{ id: number }> | null; error: unknown },
  )
  return ligne.id
}

export const enregistrerHoraire = (v: SansId<Horaire>, id: number | null) =>
  enregistrer<Horaire>('planning_horaires', v, id)
export const enregistrerMotif = (v: SansId<Motif>, id: number | null) =>
  enregistrer<Motif>('planning_motifs', v, id)
export const enregistrerPoste = (v: SansId<Poste>, id: number | null) =>
  enregistrer<Poste>('planning_postes', v, id)
export const enregistrerGroupe = (v: SansId<Groupe>, id: number | null) =>
  enregistrer<Groupe>('planning_groupes', v, id)
export const enregistrerSalarie = (v: SansId<Salarie>, id: number | null) =>
  enregistrer<Salarie>('planning_salaries', v, id)

async function rpcSuppression(fonction: string, id: number): Promise<void> {
  verifier(await supabase.rpc(fonction, { p_id: id }))
}

export const supprimerHoraire = (id: number) =>
  rpcSuppression('planning_supprimer_horaire', id)
export const supprimerPoste = (id: number) =>
  rpcSuppression('planning_supprimer_poste', id)
export const supprimerMotif = (id: number) =>
  rpcSuppression('planning_supprimer_motif', id)
export const supprimerSalarie = (id: number) =>
  rpcSuppression('planning_supprimer_salarie', id)

export async function supprimerGroupe(id: number): Promise<void> {
  auMoinsUne(
    await supabase.from('planning_groupes').delete().eq('id', id).select('id'),
  )
}

/** Réordonne les catégories (ordre = position dans la liste). */
export async function ordonnerGroupes(ids: number[]): Promise<void> {
  await Promise.all(
    ids.map(async (id, ordre) => {
      auMoinsUne(
        await supabase
          .from('planning_groupes')
          .update({ ordre })
          .eq('id', id)
          .select('id'),
      )
    }),
  )
}

/**
 * Fixe l'effectif d'un (poste, horaire, jour) : crée, modifie, ou supprime
 * quand tout vaut 0 (prototype `regler_besoin`). `existant` : le besoin déjà
 * en base pour ce triplet, lu dans le référentiel.
 */
export async function reglerBesoin(
  v: SansId<Besoin>,
  existant: Besoin | undefined,
): Promise<void> {
  if (v.effectif === 0 && v.soutien === 0 && v.renfort === 0) {
    if (existant) {
      auMoinsUne(
        await supabase
          .from('planning_besoins')
          .delete()
          .eq('id', existant.id)
          .select('id'),
      )
    }
    return
  }
  if (existant) {
    auMoinsUne(
      await supabase
        .from('planning_besoins')
        .update({
          effectif: v.effectif,
          soutien: v.soutien,
          renfort: v.renfort,
          debut: v.debut,
          fin: v.fin,
        })
        .eq('id', existant.id)
        .select('id'),
    )
  } else {
    auMoinsUne(await supabase.from('planning_besoins').insert(v).select('id'))
  }
}

export async function supprimerBesoin(id: number): Promise<void> {
  auMoinsUne(
    await supabase.from('planning_besoins').delete().eq('id', id).select('id'),
  )
}

// ------------------------------------------------------------------ import

/** Importe un export du prototype (`scripts/planning-exporter-prototype.mjs`)
 * dans un planning vide, en une transaction (gestion). Rend les compteurs. */
export async function importerPrototype(
  donnees: unknown,
): Promise<Record<string, number>> {
  return verifier(
    await supabase.rpc('planning_importer', { p: donnees }),
  ) as Record<string, number>
}
