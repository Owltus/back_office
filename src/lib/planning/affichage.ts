/*
 * Aides d'affichage du planning, pures (prototype `frontend/src/api.ts`).
 */

import { estJourneeEtoile } from '#/lib/planning/etoile.ts'
import {
  estNuit,
  MOMENTS_HOTEL,
  momentDe,
  rangMoment,
} from '#/lib/planning/moment.ts'
import type { Moments } from '#/lib/planning/moment.ts'
import {
  estJourWeekend,
  REGLES_PAR_DEFAUT,
} from '#/lib/planning/reglesEtablissement.ts'
import type { RegleEtablissement } from '#/lib/planning/reglesEtablissement.ts'
import { posteIdZone, zoneDuPoste } from '#/lib/planning/zones.ts'
import { posteEquite } from '#/lib/planning/semaine.ts'
import type { BilanOut, SemaineOut } from '#/lib/planning/semaine.ts'
import {
  ajouterJours,
  heureAffichee,
  minutes,
  versJour,
} from '#/lib/planning/temps.ts'
import type {
  Groupe,
  Horaire,
  Motif,
  Periode,
  Poste,
  Salarie,
} from '#/lib/planning/types.ts'
import { NIVEAUX, positionNiveau } from '#/lib/planning/niveaux.ts'
import type { Niveaux, NiveauSolveur } from '#/lib/planning/niveaux.ts'

/** Repère visuel d'un niveau : le préféré (plein), un autre niveau
 * autonome (cerclé), un niveau qui ne tient pas une place seul (pointillé). */
export type GenreNiveau = 'prefere' | 'autre' | 'accompagne'

export function genreNiveau(
  niveaux: Niveaux,
  id: string | null | undefined,
): GenreNiveau | null {
  const n = id ? niveaux.parId.get(id) : undefined
  if (!n) return null
  if (!n.autonome) return 'accompagne'
  return n.rang === 0 ? 'prefere' : 'autre'
}

/** Ce qu'un niveau veut dire : la phrase des trois niveaux fixes
 * (`niveaux.ts`, 2026-11-06). */
export function aideNiveau(n: Pick<NiveauSolveur, 'phrase'>): string {
  return n.phrase
}

/** « Réception », « Réception et Club », « Bar, Réception et Club ». */
export function listeEt(l: readonly string[]): string {
  return l.length < 2
    ? (l[0] ?? '')
    : `${l.slice(0, -1).join(', ')} et ${l[l.length - 1]}`
}

/** « Titulaire », « Titulaire ou Dépannage », « A, B ou C ». */
export function listeOu(l: readonly string[]): string {
  return l.length < 2
    ? (l[0] ?? '')
    : `${l.slice(0, -1).join(', ')} ou ${l[l.length - 1]}`
}

/** « 7h45 », « 8h » (format court des cartes et du bilan). */
export function heures(total: number): string {
  const h = Math.floor(total / 60)
  const m = total % 60
  // Toujours les minutes : « 3h00 », jamais « 3h » (demande utilisateur
  // du 2026-11-12).
  return `${h}h${String(m).padStart(2, '0')}`
}

/** Durée de debut à fin, en minutes (fin <= debut : le lendemain). */
export function dureeHoraire(debut: string, fin: string): number {
  const d = minutes(fin) - minutes(debut)
  return d > 0 ? d : d + 24 * 60
}

/** Numéro de semaine ISO (S45…). */
export function numeroSemaine(lundi: string): number {
  const jeudi = ajouterJours(lundi, 3)
  const debutAnnee = `${jeudi.slice(0, 4)}-01-01`
  return Math.floor((versJour(jeudi) - versJour(debutAnnee)) / 7) + 1
}

/** « 03/11 ». */
export function dateCourte(iso: string): string {
  const [, mois, jour] = iso.split('-')
  return `${jour}/${mois}`
}

export function initiales(s: Pick<Salarie, 'prenom' | 'nom'>): string {
  return `${s.prenom.charAt(0)}${s.nom.charAt(0)}`.toUpperCase()
}

export function nomComplet(s: Pick<Salarie, 'prenom' | 'nom'>): string {
  return `${s.prenom} ${s.nom}`.trim()
}

/**
 * Le nom court de chaque personne : son prénom, suivi de l'initiale du nom
 * quand un autre a le même prénom (« Léa B. », « Léa M. »), et du nom entier
 * si l'initiale ne suffit pas. Les listes qui ne montrent que les prénoms
 * (points d'attention, personnes libres) restent ainsi lisibles.
 */
export function nomsCourts(
  salaries: ReadonlyArray<Pick<Salarie, 'id' | 'prenom' | 'nom'>>,
): Map<number, string> {
  const cle = (t: string) => t.trim().toLocaleLowerCase('fr')
  const compter = (cles: string[]) => {
    const n = new Map<string, number>()
    for (const c of cles) n.set(c, (n.get(c) ?? 0) + 1)
    return n
  }
  const parPrenom = compter(salaries.map((s) => cle(s.prenom)))
  const avecInitiale = (s: Pick<Salarie, 'prenom' | 'nom'>) => {
    const i = s.nom.trim().charAt(0).toLocaleUpperCase('fr')
    return i ? `${s.prenom.trim()} ${i}.` : s.prenom.trim()
  }
  const doubles = salaries.filter(
    (s) => (parPrenom.get(cle(s.prenom)) ?? 0) > 1,
  )
  const parInitiale = compter(doubles.map((s) => cle(avecInitiale(s))))
  return new Map(
    salaries.map((s) => {
      if ((parPrenom.get(cle(s.prenom)) ?? 0) < 2) return [s.id, s.prenom]
      const court = avecInitiale(s)
      return [
        s.id,
        (parInitiale.get(cle(court)) ?? 0) < 2 ? court : nomComplet(s),
      ]
    }),
  )
}

/**
 * Couleur d'un shift à l'écran : celle de son POSTE quand le poste ne compte
 * pas dans la présence (direction, adjointes, supervision, technique, nuit),
 * sinon celle de son code (hôteliers : jaune le matin, vert le soir).
 * Décision utilisateur du 2026-10-27.
 */
export function couleurShift(
  horaire: { couleur: string; periode?: string | null } | undefined,
  poste:
    { couleur: string; zone_id?: number | null; ferme?: boolean } | undefined,
  defaut: string,
  /** Les moments : un shift de nuit d'une zone garde la couleur du poste. */
  l: Moments = MOMENTS_HOTEL,
): string {
  // Le jour d'une zone (l'accueil) : la couleur de l'horaire ; tout autre
  // poste, et la nuit d'une zone : celle du poste (2026-11-06).
  if (poste && (zoneDuPoste(poste) === null || estNuit(l, horaire?.periode)))
    return poste.couleur
  return horaire?.couleur ?? defaut
}

/** Texte lisible (noir ou blanc) sur un fond donné. */
export function texteSur(couleur: string): string {
  const n = parseInt(couleur.slice(1), 16)
  const lum =
    (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) /
    255
  return lum > 0.62 ? '#111827' : '#ffffff'
}

/** Moments des horaires, dans l'ordre de la journée, puis « à part ».
 * Ordre des menus, du volet et de la page Horaires (demande utilisateur du
 * 2026-10-28 : « bien carré, par couleur, par période »). Depuis le
 * 2026-10-31, un horaire n'a plus de code : il se lit par ses heures et
 * son moment. */
export function familles(l: Moments = MOMENTS_HOTEL): ReadonlyArray<{
  periode: Periode | null
  libelle: string
}> {
  return [
    ...l.liste.map((m) => ({ periode: m.id, libelle: m.nom })),
    { periode: null, libelle: 'À part' },
  ]
}

/** Les moments de l'hôtel (données de test, aide). */
export const FAMILLES = familles()

const rangFamille = (p: Periode | null | undefined, l: Moments) => {
  if (p == null) return l.liste.length
  const r = rangMoment(l, p)
  return r < 0 ? l.liste.length : r
}

/** Heure de début sur une journée de travail : minuit à 5 h vient APRÈS
 * 23 h (une nuit qui commence à minuit suit celle de 23 h). */
const debutDansLaJournee = (debut: string) => {
  const m = minutes(debut)
  return m < 5 * 60 ? m + 24 * 60 : m
}

/** Horaires rangés : par moment, puis du plus tôt au plus tard, puis du
 * plus court au plus long. */
export function trierHoraires<
  T extends Pick<Horaire, 'id' | 'periode' | 'debut' | 'fin'>,
>(horaires: readonly T[], l: Moments = MOMENTS_HOTEL): T[] {
  return [...horaires].sort(
    (a, b) =>
      rangFamille(a.periode, l) - rangFamille(b.periode, l) ||
      debutDansLaJournee(a.debut) - debutDansLaJournee(b.debut) ||
      dureeHoraire(a.debut, a.fin) - dureeHoraire(b.debut, b.fin) ||
      a.id - b.id,
  )
}

/** « 07:00–15:45 » : un horaire se lit par ses heures (plus de code depuis
 * le 2026-10-31, décision utilisateur : « ce qui importe, ce sont les
 * horaires »). Deux horaires n'ont jamais les mêmes heures (contrainte
 * `planning_horaires_heures_unique`). */
export function libelleHoraire(h: Pick<Horaire, 'debut' | 'fin'>): string {
  return `${heureAffichee(h.debut)}–${heureAffichee(h.fin)}`
}

/** « 7 h », « 15 h 45 », « minuit » : une heure dans une phrase. */
function heureEnLettres(h: string): string {
  const m = minutes(h) % (24 * 60)
  if (m === 0) return 'minuit'
  const hh = Math.floor(m / 60)
  const mm = m % 60
  return mm ? `${hh} h ${String(mm).padStart(2, '0')}` : `${hh} h`
}

/** Nom rangé en base (colonne `nom`, obligatoire) : « Matin de 7 h à
 * 15 h 45 », écrit par l'app, jamais saisi (plus de code ni de nom à
 * inventer depuis le 2026-10-31). */
export function nomHoraire(
  h: Pick<Horaire, 'debut' | 'fin' | 'periode'>,
  l: Moments = MOMENTS_HOTEL,
): string {
  return `${libelleMoment(h.periode, l)} de ${heureEnLettres(h.debut)} à ${heureEnLettres(h.fin)}`
}

/** Libellé d'un moment (« Matin »…), « À part » sans moment. */
export function libelleMoment(
  p: Periode | null | undefined,
  l: Moments = MOMENTS_HOTEL,
): string {
  return momentDe(l, p)?.nom ?? 'À part'
}

export { momentPropose } from '#/lib/planning/moment.ts'

/** Horaires rangés et regroupés par moment (moments vides omis). */
export function grouperHoraires<
  T extends Pick<Horaire, 'id' | 'periode' | 'debut' | 'fin'>,
>(
  horaires: readonly T[],
  l: Moments = MOMENTS_HOTEL,
): Array<{ periode: Periode | null; libelle: string; horaires: T[] }> {
  const tries = trierHoraires(horaires, l)
  const connus = new Set(l.liste.map((m) => m.id))
  return familles(l)
    .map((f) => ({
      ...f,
      horaires: tries.filter((h) =>
        f.periode === null
          ? h.periode == null || !connus.has(h.periode)
          : h.periode === f.periode,
      ),
    }))
    .filter((g) => g.horaires.length > 0)
}

/** Postes proposés dans la fiche d'un membre de cette catégorie. */
export function postesDuGroupe(postes: Poste[], groupe?: Groupe): Poste[] {
  const permis = groupe?.postes_autorises ?? []
  return permis.length ? postes.filter((p) => permis.includes(p.id)) : postes
}

/** « Réception · Club » : les postes tenus, titulaire d'abord. */
export function postesTenus(
  s: Pick<Salarie, 'competences'>,
  postes: Poste[],
  niveaux: Niveaux = NIVEAUX,
): string {
  return [...s.competences]
    .sort(
      (a, b) =>
        positionNiveau(niveaux, a.niveau) - positionNiveau(niveaux, b.niveau),
    )
    .map((c) => postes.find((p) => p.id === c.poste_id)?.nom)
    .filter(Boolean)
    .join(' · ')
}

/** Libellé métier de la colonne staff : les NOMS de ses postes, du
 * titulaire au soutien (2026-11-06 : plus de « Veilleur » ni « Hôtelier »
 * écrits dans le code ; le nom du poste de nuit dit déjà ce qu'il est). */
export function metier(
  s: Pick<Salarie, 'competences'>,
  postes: Poste[],
  niveaux: Niveaux = NIVEAUX,
): string {
  const noms = [...s.competences]
    .sort(
      (a, b) =>
        positionNiveau(niveaux, a.niveau) - positionNiveau(niveaux, b.niveau),
    )
    .map((c) => postes.find((p) => p.id === c.poste_id)?.nom)
    .filter((n): n is string => !!n)
  return [...new Set(noms)].join(' · ')
}

/** Rang d'une personne dans l'organigramme (2026-11-03) : la place, dans
 * `postes` (déjà dans l'ordre), de son poste le plus haut tenu en
 * titulaire ; sans titulaire, celui de ses autres postes, après tous les
 * titulaires ; sans poste, en dernier. */
export function rangOrganigramme(
  s: Partial<Pick<Salarie, 'competences'>>,
  postes: ReadonlyArray<Pick<Poste, 'id'>>,
  niveaux: Niveaux = NIVEAUX,
): number {
  const place = new Map(postes.map((p, i) => [p.id, i]))
  const n = postes.length
  let rang = 2 * n
  for (const c of s.competences ?? []) {
    const i = place.get(c.poste_id)
    if (i === undefined) continue
    rang = Math.min(rang, niveaux.parId.get(c.niveau)?.rang === 0 ? i : n + i)
  }
  return rang
}

/** Range le staff par groupe (ordre choisi), puis « Sans groupe ». Dans un
 * groupe, par l'organigramme (`rangOrganigramme`, quand `postes` est
 * donné), puis dans l'ordre reçu. */
export function parGroupe<
  T extends Pick<Salarie, 'groupe_id'> & Partial<Pick<Salarie, 'competences'>>,
>(
  salaries: T[],
  groupes: Groupe[],
  postes?: ReadonlyArray<Pick<Poste, 'id'>>,
): Array<{ id: number; nom: string; membres: T[] }> {
  const connus = new Set(groupes.map((g) => g.id))
  if (postes) {
    const rangs = new Map(salaries.map((s) => [s, rangOrganigramme(s, postes)]))
    salaries = [...salaries].sort((a, b) => rangs.get(a)! - rangs.get(b)!)
  }
  return [
    ...[...groupes]
      .sort((a, b) => a.ordre - b.ordre || a.id - b.id)
      .map((g) => ({
        id: g.id,
        nom: g.nom,
        membres: salaries.filter((s) => s.groupe_id === g.id),
      })),
    {
      id: 0,
      nom: 'Sans groupe',
      membres: salaries.filter(
        (s) => s.groupe_id === null || !connus.has(s.groupe_id),
      ),
    },
  ].filter((g) => g.membres.length > 0)
}

/** Message de fin de génération. « Complet » seulement s'il ne reste aucune
 * place à pourvoir : la génération est une meilleure tentative, jamais une
 * garantie. `quoi` : « Planning » (semaine) ou « Mois ». `proposes` : les
 * shifts que la génération vient de proposer (le résumé en tête, D18). */
export function messageGeneration(
  aPourvoir: number,
  quoi = 'Planning',
  proposes?: number,
): string {
  const resume =
    proposes === undefined
      ? ''
      : proposes === 0
        ? ' Aucun shift proposé.'
        : proposes === 1
          ? ' 1 shift proposé.'
          : ` ${proposes} shifts proposés.`
  if (aPourvoir <= 0) return `${quoi} complet généré.${resume}`
  const reste =
    aPourvoir === 1
      ? '1 place reste à pourvoir.'
      : `${aPourvoir} places restent à pourvoir.`
  return `${quoi} généré.${resume} ${reste}`
}

/**
 * Équité (D15) en une ligne, pour le message de fin d'une génération de
 * plusieurs semaines : combien de week-ends chacun travaille, par poste
 * principal (le même groupe que le moteur). Seules comptent les personnes
 * qui ont au moins un shift sur la période ; un poste à une seule personne
 * n'apparaît pas. Vide s'il n'y a rien à comparer.
 * « Week-ends travaillés par personne : Réception de 1 à 3, Club 2 chacun. »
 */
export function resumeEquite(
  semaines: ReadonlyArray<Pick<SemaineOut, 'affectations'>>,
  salaries: Salarie[],
  postes: Poste[],
  /** Règles de l'établissement (jours du week-end) ; absentes : défauts. */
  regles: RegleEtablissement = REGLES_PAR_DEFAUT,
  /** Les horaires (la nuit seule garde son groupe). */
  horaires: Iterable<Pick<Horaire, 'id' | 'periode'>> = [],
): string {
  const presents = new Set<number>()
  const weekends = new Map<number, number>()
  for (const s of semaines) {
    const ceWeekend = new Set<number>()
    for (const a of s.affectations) {
      presents.add(a.salarie_id)
      if (estJourWeekend(regles, a.jour)) ceWeekend.add(a.salarie_id)
    }
    for (const id of ceWeekend) weekends.set(id, (weekends.get(id) ?? 0) + 1)
  }
  const parPoste = new Map<number, number[]>()
  const parId = new Map(postes.map((p) => [p.id, p]))
  for (const x of salaries) {
    const p = posteEquite(x, parId, regles, horaires)
    if (p === null || !presents.has(x.id)) continue
    parPoste.set(p, [...(parPoste.get(p) ?? []), weekends.get(x.id) ?? 0])
  }
  const morceaux: string[] = []
  // L'accueil entier (Q16) d'abord, puis les autres postes.
  for (const poste of [
    ...regles.zones.map((z) => ({
      id: posteIdZone(regles.zones, z.id),
      nom: z.nom,
    })),
    ...postes,
  ]) {
    const n = parPoste.get(poste.id)
    if (!n || n.length < 2) continue
    const min = Math.min(...n)
    const max = Math.max(...n)
    morceaux.push(
      min === max
        ? `${poste.nom} ${min} chacun`
        : `${poste.nom} de ${min} à ${max}`,
    )
  }
  return morceaux.length
    ? `Week-ends travaillés par personne : ${morceaux.join(', ')}.`
    : ''
}

/** Un jour sans shift ni absence n'est un repos que s'il est OFFICIEL : un
 * repos de la semaine type. Sinon la case reste « non attribué » (décisions
 * utilisateur du 2026-10-27, puis du 2026-11-03 : « en temps normal, leur
 * planning est censé être vide ; les repos ne se posent qu'à la main ou par
 * la génération »). Les repos d'une génération sont ENREGISTRÉS en
 * proposition (`reposAProposer`) : ils passent par les absences, comme un
 * repos posé, et se retirent avec « Vider la case ». */
export function jourDeRepos(b: BilanOut, jour: number): boolean {
  return b.repos_fixes.includes(jour)
}

/** Sous contrat ce jour-là et proposé au planning. */
export const disponibleLe = (s: Salarie, date: string) =>
  s.actif && sousContrat(s, date, date)

/** Présent au moins un jour de [debut, fin]. */
export const sousContrat = (s: Salarie, debut: string, fin: string) =>
  (!s.date_entree || s.date_entree <= fin) &&
  (!s.date_sortie || s.date_sortie >= debut)

/** « École », « Repos » ou « Absence » : le mot pour un jour de ce motif. */
export function genreMotif(m?: Motif): string {
  if (!m) return 'Absence'
  if (m.nature === 'repos') return 'Repos'
  return m.nature === 'ecole' ? 'École' : 'Absence'
}

/** Journée étoile d'une carte (D5 du 2026-11-02, calculée) : contrat de
 * plus de 35 h, ni forfait ni extra, sur un horaire de moins de 8 h
 * (`duree` : travail, pause déduite). Même règle que `ShiftOut.etoile`. */
export function journeeEtoile(
  s: Pick<Salarie, 'forfait_jours' | 'heures_hebdo' | 'type_contrat'>,
  shift: { duree: number },
  regles?: RegleEtablissement,
): boolean {
  return estJourneeEtoile(s, shift.duree, regles)
}

export function horaireLibelle(h: Horaire | undefined): string {
  return h ? h.nom : 'Horaire spécifique'
}

/** Regroupe des dates (AAAA-MM-JJ) consécutives de même motif en périodes. */
export function enPeriodes(
  jours: Array<{ jour: string; motif_id: number }>,
): Array<{ debut: string; fin: string; motif_id: number; jours: string[] }> {
  const tries = [...jours].sort((a, b) => (a.jour < b.jour ? -1 : 1))
  const r: Array<{
    debut: string
    fin: string
    motif_id: number
    jours: string[]
  }> = []
  for (const j of tries) {
    const dernier = r.at(-1)
    if (
      dernier &&
      dernier.motif_id === j.motif_id &&
      ajouterJours(dernier.fin, 1) === j.jour
    ) {
      dernier.fin = j.jour
      dernier.jours.push(j.jour)
    } else {
      r.push({
        debut: j.jour,
        fin: j.jour,
        motif_id: j.motif_id,
        jours: [j.jour],
      })
    }
  }
  return r
}

/** Toutes les dates de debut à fin incluses. */
export function datesEntre(debut: string, fin: string): string[] {
  const r: string[] = []
  for (let d = debut; d <= fin; d = ajouterJours(d, 1)) r.push(d)
  return r
}

/** « de Thomas », « d'Alice », « d'Yves » : la préposition avant un prénom. */
export function deNom(nom: string): string {
  return /^[aeiouyhàâäéèêëîïôöùûü]/i.test(nom) ? `d'${nom}` : `de ${nom}`
}
