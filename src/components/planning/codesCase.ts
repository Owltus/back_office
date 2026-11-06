/*
 * Codes permis pour une case du planning (vue mois, vue semaine, éditeur) :
 * rassemble ce que l'écran sait du jour (bilan de la semaine, shifts de la
 * veille et du lendemain) et le passe à la règle unique `codesPermis`
 * (`lib/planning/eligibilite.ts`). Aucun repli ici : ce qui n'est pas
 * permis n'est pas proposé, et la raison se lit dans le menu.
 *
 * Mode manuel (`rubriquesDeLaCase`) : tous les codes de la personne, rangés
 * par casquette (un poste de sa fiche), la coupure de repos choisissable
 * avec son alerte.
 *
 * Journée étoile (`etoileDeLaCase`, décision utilisateur du 2026-11-02) : les
 * horaires de 7 h qui remplacent l'horaire de 8 h d'un shift, ou l'inverse.
 */

import {
  estPrefere,
  lireNiveaux,
  positionNiveau,
} from '#/lib/planning/niveaux.ts'
import {
  dureeHoraire,
  heures,
  libelleHoraire,
  trierHoraires,
} from '#/lib/planning/affichage.ts'
import {
  codesPermis,
  posteDeReference,
  rubriqueEtoile,
} from '#/lib/planning/eligibilite.ts'
import type {
  CodesPermis,
  EntreeCodesPermis,
  RaisonCodes,
  RubriqueEtoile,
  Voisin,
} from '#/lib/planning/eligibilite.ts'
import type { OuvertureSpecifique } from '#/components/planning/HoraireSpecifique.tsx'
import { lireRegles } from '#/lib/planning/reglesEtablissement.ts'
import { estEcole } from '#/lib/planning/semaine.ts'
import type { SemaineOut, ShiftOut } from '#/lib/planning/semaine.ts'
import { JOURS } from '#/lib/planning/types.ts'
import type {
  Horaire,
  Motif,
  Niveau,
  Poste,
  Referentiel,
  Salarie,
} from '#/lib/planning/types.ts'

/** Un shift d'une semaine voisine, tel que lu en base (`donnees.avant` /
 * `donnees.apres`) ou analysé. */
export interface ShiftVoisin {
  id: number
  salarie_id: number
  jour: number
  debut: string
  fin: string
}

/** La semaine de la case, et les shifts des semaines voisines (coupure de
 * repos avec le dimanche d'avant ou le lundi d'après, comme le moteur :
 * `finServicePrecedent`, `debutServiceSuivant`). Sans voisines, la coupure
 * n'est vérifiée qu'à l'intérieur de la semaine. */
export interface SourceCase {
  semaine: SemaineOut | null | undefined
  avant?: readonly ShiftVoisin[] | null
  apres?: readonly ShiftVoisin[] | null
}

/** Shifts de cette personne les autres jours, dans le repère de la semaine. */
export function voisinsDe(
  source: SourceCase,
  salarieId: number,
  jour: number,
  sauf?: number,
): Voisin[] {
  const siens = (
    l: readonly ShiftVoisin[] | null | undefined,
    decalage: number,
  ) =>
    (l ?? [])
      .filter((a) => a.salarie_id === salarieId && a.id !== sauf)
      .map((a) => ({ jour: a.jour + decalage, debut: a.debut, fin: a.fin }))
  return [
    ...siens(source.avant, -7),
    ...siens(source.semaine?.affectations, 0),
    ...siens(source.apres, 7),
  ].filter((v) => v.jour !== jour)
}

/** Le code actuel du shift de la case quand il n'est plus permis : montré
 * grisé, marqué actuel, avec la raison (null : il est permis, ou pas de
 * shift). */
export function actuelNonPermis(
  permis: CodesPermis<Horaire>,
  horaires: readonly Horaire[],
  actuel: number | null | undefined,
): { horaire: Horaire; texte: string } | null {
  if (actuel == null || permis.codes.some((h) => h.id === actuel)) return null
  const horaire = horaires.find((h) => h.id === actuel)
  if (!horaire) return null
  const ecarte = permis.ecartes.find((e) => e.horaire.id === actuel)
  return {
    horaire,
    texte: ecarte?.texte ?? permis.texte ?? "N'est plus permis ici",
  }
}

interface EntreeCase {
  referentiel: Pick<Referentiel, 'horaires' | 'postes' | 'motifs'> &
    Partial<Pick<Referentiel, 'reglages' | 'modelesContrat' | 'niveaux'>>
  personne: Salarie
  posteId: number | undefined
  jour: number
  source: SourceCase
  /** Shift en cours de modification : il ne compte pas comme voisin. */
  sauf?: number
}

/** Ce que la règle unique attend, lu sur l'écran (bilan de la semaine,
 * shifts voisins). */
function entreeDeLaCase({
  referentiel,
  personne,
  posteId,
  jour,
  source,
  sauf,
}: EntreeCase): EntreeCodesPermis<Horaire> & { personne: Salarie } {
  const semaine = source.semaine
  const bilan = semaine?.bilan.find((b) => b.salarie_id === personne.id)
  const motifId = bilan && jour in bilan.absences ? bilan.absences[jour] : null
  const motif = referentiel.motifs.find((m) => m.id === motifId)
  return {
    personne,
    poste: referentiel.postes.find((p) => p.id === posteId),
    jour,
    horaires: referentiel.horaires,
    journee: {
      ecole: !!motif && estEcole(motif),
      horsContrat: !!bilan?.hors_contrat.includes(jour),
    },
    lundi: semaine?.lundi,
    voisins: voisinsDe(source, personne.id, jour, sauf),
    regles: lireRegles(referentiel),
  }
}

export function codesDeLaCase(e: EntreeCase): CodesPermis<Horaire> {
  return codesPermis(entreeDeLaCase(e))
}

/** Raisons qui ferment le jour : l'horaire spécifique n'y est pas permis
 * non plus (école, repos ou absence fixés, hors contrat, code fixé par la
 * semaine type ailleurs). « Aucun commun » et la coupure de repos laissent
 * l'horaire spécifique possible, jamais choisi d'office. */
const JOUR_FERME: ReadonlySet<RaisonCodes> = new Set<RaisonCodes>([
  'ecole',
  'absence-fixe',
  'repos-fixe',
  'hors-contrat',
  'code-fixe-hors-poste',
])
export const jourFerme = (p: Pick<CodesPermis<unknown>, 'raison'>) =>
  p.raison !== null && JOUR_FERME.has(p.raison)

/** La fenêtre « Horaire spécifique » d'une case (clic droit, 2026-11-03) :
 * le shift spécifique de la case à modifier, sinon un point de départ (les
 * heures du shift, ou 09:00-17:00) ; les postes OUVERTS qu'elle tient (et
 * celui du shift), ou tous les postes ouverts si elle n'en tient aucun ; et
 * la même règle que le volet pour un jour fermé (`jourFerme`), sauf
 * l'horaire spécifique déjà posé là. Un poste hors de la liste (fermé,
 * inconnu) n'est jamais permis. Le poste de départ est le premier permis
 * parmi : celui du shift, celui de la place à pourvoir (`placePosteId`),
 * ses postes de titulaire, ses autres postes (relecture adverse du
 * 2026-11-03 : il pouvait partir sur un poste fermé et caché). */
export function ouvertureSpecifique(
  e: Omit<EntreeCase, 'posteId' | 'sauf'> & {
    shift?: Pick<
      ShiftOut,
      'id' | 'poste_id' | 'type_shift_id' | 'debut' | 'fin' | 'pause'
    >
    titre: string
    placePosteId?: number
  },
): OuvertureSpecifique {
  const { referentiel, personne, shift } = e
  const niveaux = new Map(
    personne.competences.map((c) => [c.poste_id, c.niveau]),
  )
  const tenus = referentiel.postes.filter(
    (p) => (niveaux.has(p.id) && !p.ferme) || p.id === shift?.poste_id,
  )
  const postes = tenus.length
    ? tenus
    : referentiel.postes.filter((p) => !p.ferme)
  const interdit = (id: number): string | null => {
    if (shift && shift.type_shift_id === null && shift.poste_id === id)
      return null
    if (!postes.some((p) => p.id === id)) return 'Choisissez un poste.'
    const p = codesDeLaCase({ ...e, posteId: id, sauf: shift?.id })
    return jourFerme(p) || p.raison === 'poste-ferme'
      ? (p.texte ?? "Pas d'horaire spécifique ce jour-là.")
      : null
  }
  const candidats = [
    shift?.poste_id,
    e.placePosteId,
    ...personne.competences
      .filter((c) => estPrefere(lireNiveaux(referentiel.niveaux), c.niveau))
      .map((c) => c.poste_id),
    ...postes.map((p) => p.id),
  ].filter(
    (id): id is number => id !== undefined && postes.some((p) => p.id === id),
  )
  const posteId =
    candidats.find((id) => interdit(id) === null) ?? candidats[0] ?? 0
  return {
    titre: e.titre,
    modification: !!shift && shift.type_shift_id === null,
    initial: shift
      ? {
          debut: shift.debut,
          fin: shift.fin,
          pause: shift.pause,
          poste_id: posteId,
        }
      : { debut: '09:00', fin: '17:00', pause: 0, poste_id: posteId },
    postes,
    niveau: (id) => niveaux.get(id),
    interdit,
    // La ligne du menu se ferme seulement si AUCUN poste ne le permet.
    ferme: postes.every((p) => interdit(p.id) !== null)
      ? (interdit(posteId) ?? "Pas d'horaire spécifique ce jour-là.")
      : null,
  }
}

/** Rubrique « Journée étoile » d'une case : celle du moteur
 * (`rubriqueEtoile`), sur le poste du shift, et les autres jours de la
 * semaine où la personne a déjà une journée étoile (une seule par semaine
 * pour un 39 h : l'écran le rappelle, la règle le signale). */
export interface EtoileCase extends RubriqueEtoile<Horaire> {
  /** Poste du shift : l'horaire choisi y reste. */
  posteId: number
  /** Jours (0 à 6) des autres journées étoile de la semaine. */
  deja: number[]
}

/**
 * La rubrique « Journée étoile » d'un shift (décision utilisateur du
 * 2026-11-02, remplace le bouton qui retirait une heure) : les horaires de
 * 7 h contenus dans son horaire de 8 h (`versionsEtoile`), ou, s'il en est
 * déjà un, l'horaire de 8 h dont il est la version (« Journée normale »),
 * permis pour la personne sur ce poste ce jour-là. Null : rien à montrer
 * (contrat sans journée étoile, horaire spécifique, rien de permis).
 */
export function etoileDeLaCase(
  e: EntreeCase & { posteId: number; horaireId: number | null },
): EtoileCase | null {
  const r = rubriqueEtoile({ ...entreeDeLaCase(e), horaireId: e.horaireId })
  if (!r) return null
  const deja = (e.source.semaine?.affectations ?? [])
    .filter(
      (a) =>
        a.salarie_id === e.personne.id &&
        a.etoile &&
        a.jour !== e.jour &&
        a.id !== e.sauf,
    )
    .map((a) => a.jour)
    .sort((a, b) => a - b)
  return { ...r, posteId: e.posteId, deja }
}

/** « Déjà une journée étoile le mardi. » (null : aucune autre). */
export function texteEtoileDeja(deja: readonly number[]): string | null {
  if (!deja.length) return null
  const jours = deja.map((j) => JOURS[j].toLowerCase())
  const liste =
    jours.length === 1
      ? jours[0]
      : `${jours.slice(0, -1).join(', ')} et ${jours.at(-1)}`
  return `Déjà une journée étoile le ${liste}.`
}

// ------------------------------------------------- rubriques (mode manuel)

/** Un code proposé dans une rubrique. `alerte` : il est choisissable mais
 * enfreint une règle que l'on peut passer à la main (coupure de repos) ; la
 * phrase est montrée sur la ligne. */
export interface LigneCode {
  horaire: Horaire
  alerte: string | null
}

/** Les codes d'UNE casquette de la personne (un poste de sa fiche). */
export interface Rubrique {
  poste: Poste
  /** Niveau sur ce poste ; null : poste du shift, absent de sa fiche, montré
   * seulement pour pouvoir le garder. */
  niveau: Niveau | null
  lignes: LigneCode[]
  /** Résultat brut de la règle unique pour ce poste. */
  permis: CodesPermis<Horaire>
}

export interface RubriquesCase {
  /** Rubriques non vides : titulaire, puis dépannage, puis soutien, puis
   * l'ordre des postes ; le poste du shift hors fiche en dernier. */
  rubriques: Rubrique[]
  /** Pourquoi aucune rubrique (null : il y en a au moins une). */
  texte: string | null
  /** Code actuel du shift qui n'est plus choisissable sur son poste : montré
   * grisé, marqué actuel, avec la raison (null : rien à montrer). */
  actuel: { horaire: Horaire; texte: string } | null
}

/**
 * Tous les codes que cette personne peut tenir ce jour-là, rangés par
 * casquette : une rubrique par poste de sa fiche, chacune calculée par la
 * règle unique (`codesDeLaCase`), sans repli. Mode MANUEL (décision
 * utilisateur du 2026-10-30) : un code qui casse la coupure de repos
 * quotidien reste choisissable, avec son alerte ; les autres raisons restent
 * bloquantes. Le générateur, lui, ne la passe jamais.
 */
export function rubriquesDeLaCase({
  referentiel,
  personne,
  jour,
  source,
  shift,
  sauf,
  garderActuel = false,
}: {
  referentiel: EntreeCase['referentiel']
  personne: Salarie
  jour: number
  source: SourceCase
  /** Shift de la case : son poste reste montré même hors fiche. */
  shift?: { poste_id: number; type_shift_id: number | null } | null
  /** Shift en cours de modification : il ne compte pas comme voisin. */
  sauf?: number
  /** Éditeur : le code actuel reste choisissable sur son poste (sa raison en
   * alerte) au lieu d'une ligne grisée à part. */
  garderActuel?: boolean
}): RubriquesCase {
  const { postes, horaires } = referentiel
  const niveaux = lireNiveaux(referentiel.niveaux)
  const rang = (id: number) => postes.findIndex((p) => p.id === id)
  const candidats: Array<{ poste: Poste; niveau: Niveau | null }> = [
    ...personne.competences,
  ]
    .filter((c) => rang(c.poste_id) >= 0)
    .sort(
      (a, b) =>
        positionNiveau(niveaux, a.niveau) - positionNiveau(niveaux, b.niveau) ||
        rang(a.poste_id) - rang(b.poste_id),
    )
    .filter((c, i, l) => l.findIndex((x) => x.poste_id === c.poste_id) === i)
    .map((c) => ({ poste: postes[rang(c.poste_id)], niveau: c.niveau }))
  if (
    shift &&
    rang(shift.poste_id) >= 0 &&
    !candidats.some((c) => c.poste.id === shift.poste_id)
  ) {
    candidats.push({ poste: postes[rang(shift.poste_id)], niveau: null })
  }

  let actuel: RubriquesCase['actuel'] = null
  const toutes = candidats.map(({ poste, niveau }): Rubrique => {
    const permis = codesDeLaCase({
      referentiel,
      personne,
      posteId: poste.id,
      jour,
      source,
      sauf,
    })
    const alertes = new Map<number, string | null>(
      permis.codes.map((h) => [h.id, null]),
    )
    for (const e of permis.ecartes) alertes.set(e.horaire.id, e.texte)
    if (shift?.poste_id === poste.id && shift.type_shift_id != null) {
      const hors = alertes.has(shift.type_shift_id)
        ? null
        : actuelNonPermis(permis, horaires, shift.type_shift_id)
      if (hors && garderActuel) alertes.set(hors.horaire.id, hors.texte)
      else actuel = hors
    }
    const lignes = trierHoraires(horaires.filter((h) => alertes.has(h.id))).map(
      (h) => ({ horaire: h, alerte: alertes.get(h.id) ?? null }),
    )
    return { poste, niveau, lignes, permis }
  })
  const rubriques = toutes.filter((r) => r.lignes.length > 0)
  const texte = rubriques.length
    ? null
    : !toutes.length
      ? 'Aucun poste dans sa fiche'
      : toutes.every((r) => r.permis.raison === 'aucun-commun')
        ? 'Aucun horaire commun entre sa fiche et ses postes'
        : (toutes[0].permis.texte ?? "Aucun horaire n'est permis ce jour-là")
  return { rubriques, texte, actuel }
}

/** La rubrique et la ligne d'un code sur un poste (null : pas proposé). */
export function ligneDe(
  r: RubriquesCase,
  posteId: number,
  horaireId: number | null | undefined,
): { rubrique: Rubrique; ligne: LigneCode } | null {
  const rubrique = r.rubriques.find((x) => x.poste.id === posteId)
  const ligne = rubrique?.lignes.find((l) => l.horaire.id === horaireId)
  return rubrique && ligne ? { rubrique, ligne } : null
}

// ------------------------------------- une liste, chaque code une fois

/**
 * Poste DÉDUIT pour un code (décision utilisateur du 2026-10-30, « je ne
 * dois voir qu'une seule fois chaque code ») :
 * 1. le poste IMPOSÉ (celui de la place à pourvoir) s'il permet ce code ;
 * 2. sinon le meilleur NIVEAU de la fiche qui le permet (titulaire, puis
 *    dépannage, puis soutien) : M6 / M9 d'une adjointe vont toujours sur
 *    Adjoint, même si son shift du jour est en Réception ;
 * 3. à niveau égal, le poste préféré (celui du shift existant) : un shift du
 *    Club changé en S4 reste au Club ; sinon l'ordre de la fiche.
 * undefined : aucun poste ne le permet.
 */
export function posteDeduit(
  rubriques: readonly Rubrique[],
  horaireId: number,
  prefere?: number,
  impose?: number,
): Poste | undefined {
  const candidats = rubriques.filter((r) =>
    r.lignes.some((l) => l.horaire.id === horaireId),
  )
  const premier = candidats.at(0)
  if (!premier) return undefined
  const force = candidats.find((r) => r.poste.id === impose)
  if (force) return force.poste
  // Les rubriques sont déjà triées par niveau : le premier candidat a le
  // meilleur niveau.
  const memeNiveau = candidats.filter((r) => r.niveau === premier.niveau)
  return (memeNiveau.find((r) => r.poste.id === prefere) ?? premier).poste
}

/** Un code de la liste unique. */
export interface CodeUnique {
  horaire: Horaire
  /** Alerte sur la ligne (coupure de repos) ; null : aucune. */
  alerte: string | null
  /** Poste sur lequel le code sera posé. */
  poste: Poste
  /** Tous les postes de la fiche qui le permettent (ordre des rubriques). */
  postes: Poste[]
  /** Le poste déduit n'est pas le métier habituel (non affiché). */
  horsHabituel: boolean
  /** Le shift existant changerait de poste avec ce code (décision
   * utilisateur du 2026-10-30 : prévenir, jamais en silence) ; null sinon. */
  changePoste: Poste | null
}

/** Avertissement du volet quand le shift change de poste. */
export function changementDePoste(
  avant: string | undefined,
  apres: string | undefined,
): string {
  return avant && apres
    ? `Ce shift passe de ${avant} à ${apres}.`
    : 'Ce shift change de poste.'
}

/** Avertissement d'une ligne de code qui fait changer le shift de poste. */
export function texteChangementPoste(poste: { nom: string }): string {
  return `Passe en ${poste.nom}`
}

export interface CodesUniquesCase {
  /** Chaque code une seule fois, triés du matin au soir. */
  codes: CodeUnique[]
  texte: string | null
  actuel: RubriquesCase['actuel']
}

/**
 * La liste des codes de la case : l'UNION des rubriques (`rubriquesDeLaCase`,
 * règle unique par poste), chaque code une fois, son poste déduit par
 * `posteDeduit`. Choisissable si au moins un poste le permet ; l'alerte est
 * celle du poste déduit (la coupure est la même pour tous les postes).
 */
export function codesUniques(
  r: RubriquesCase,
  personne: Pick<Salarie, 'competences'>,
  postes: ReadonlyArray<{ id: number }>,
  prefere?: number,
  impose?: number,
): CodesUniquesCase {
  const habituel = posteDeReference(personne, postes)
  const vus = new Map<number, Horaire>()
  for (const rub of r.rubriques)
    for (const l of rub.lignes) vus.set(l.horaire.id, l.horaire)
  const codes = trierHoraires([...vus.values()]).flatMap((h): CodeUnique[] => {
    const poste = posteDeduit(r.rubriques, h.id, prefere, impose)
    if (!poste) return []
    const ligne = ligneDe(r, poste.id, h.id)
    return [
      {
        horaire: h,
        alerte: ligne?.ligne.alerte ?? null,
        poste,
        postes: r.rubriques
          .filter((x) => x.lignes.some((l) => l.horaire.id === h.id))
          .map((x) => x.poste),
        horsHabituel: poste.id !== habituel,
        changePoste:
          prefere !== undefined && poste.id !== prefere ? poste : null,
      },
    ]
  })
  return { codes, texte: r.texte, actuel: r.actuel }
}

/** Heures et temps de travail d'un horaire, comme sur la ligne d'un menu :
 * « 07:00–15:45 · 8h » (pause déduite). */
export function heuresEtDuree(
  h: Pick<Horaire, 'debut' | 'fin' | 'pause'>,
): string {
  return `${libelleHoraire(h)} · ${heures(dureeHoraire(h.debut, h.fin) - h.pause)}`
}

/** Nom accessible d'une ligne d'horaire : heures, durée, alertes (le poste
 * seulement quand il change, comme à l'écran). */
export function nomLigneCode(c: {
  horaire: Pick<Horaire, 'debut' | 'fin' | 'pause'>
  alerte: string | null
  changePoste?: { nom: string } | null
}): string {
  return [
    libelleHoraire(c.horaire),
    heures(dureeHoraire(c.horaire.debut, c.horaire.fin) - c.horaire.pause),
    ...(c.alerte ? [c.alerte] : []),
    ...(c.changePoste ? [texteChangementPoste(c.changePoste)] : []),
  ].join(', ')
}

/** Repos et absences qu'on pose sur un jour, comme un code (clic droit des
 * deux vues, volet) : le repos (motif de nature « repos », le même jour
 * sans travail que celui de la semaine type, décision utilisateur du
 * 2026-10-31) à part, pour être en tête ; puis les absences dans l'ordre
 * des réglages, l'école jamais (elle se pose dans la fiche). Un motif
 * réservé au forfait jours (case du motif, 2026-11-06, à la place du nom
 * « forfait ») n'est proposé qu'aux personnes au forfait jours. */
export function motifsDuJour<
  M extends Pick<Motif, 'nature' | 'reserve_forfait'>,
>(
  motifs: ReadonlyArray<M>,
  personne: Pick<Salarie, 'forfait_jours'>,
): { repos: M[]; autres: M[] } {
  const forfait = (m: M) => !!m.reserve_forfait
  return {
    repos: motifs.filter((m) => m.nature === 'repos'),
    autres: motifs.filter(
      (m) =>
        m.nature !== 'repos' &&
        !estEcole(m) &&
        (personne.forfait_jours || !forfait(m)),
    ),
  }
}
