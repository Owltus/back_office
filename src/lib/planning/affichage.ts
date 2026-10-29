/*
 * Aides d'affichage du planning, pures (prototype `frontend/src/api.ts`).
 */

import { posteEquite } from '#/lib/planning/semaine.ts'
import type { BilanOut, SemaineOut } from '#/lib/planning/semaine.ts'
import { ajouterJours, minutes, versJour } from '#/lib/planning/temps.ts'
import type {
  Groupe,
  Horaire,
  Motif,
  Niveau,
  Periode,
  Poste,
  Salarie,
} from '#/lib/planning/types.ts'

export const NIVEAUX: Record<Niveau, { libelle: string; aide: string }> = {
  titulaire: {
    libelle: 'Titulaire',
    aide: 'Tient le poste seul, au quotidien',
  },
  occasionnel: {
    libelle: 'Dépannage',
    aide: 'Peut le tenir seul, à éviter si possible',
  },
  soutien: {
    libelle: 'Soutien',
    aide: 'Apprenti ou stagiaire : ne compte pas seul',
  },
}

/** « 7h45 », « 8h » (format court des cartes et du bilan). */
export function heures(total: number): string {
  const h = Math.floor(total / 60)
  const m = total % 60
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
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
  horaire: { couleur: string } | undefined,
  poste: { couleur: string; presence: boolean } | undefined,
  defaut: string,
): string {
  if (poste && !poste.presence) return poste.couleur
  return horaire?.couleur ?? defaut
}

/** Couleur du texte d'un code « écrit en rouge » (`code_rouge`). */
export const ROUGE_CODE = '#dc2626'

/** Texte lisible (noir ou blanc) sur un fond donné. */
export function texteSur(couleur: string): string {
  const n = parseInt(couleur.slice(1), 16)
  const lum =
    (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) /
    255
  return lum > 0.62 ? '#111827' : '#ffffff'
}

/** Familles de codes, dans l'ordre de la journée, puis « à part » (direction,
 * supervision). Ordre des menus, du volet et de la page Horaires
 * (demande utilisateur du 2026-10-28 : « bien carré, par couleur, par
 * période »). */
export const FAMILLES: ReadonlyArray<{
  periode: Periode | null
  libelle: string
}> = [
  { periode: 'matin', libelle: 'Matin' },
  { periode: 'middle', libelle: 'Middle' },
  { periode: 'soir', libelle: 'Soir' },
  { periode: 'nuit', libelle: 'Nuit' },
  { periode: 'court', libelle: 'Court' },
  { periode: null, libelle: 'À part' },
]

const rangFamille = (p: Periode | null | undefined) =>
  FAMILLES.findIndex((f) => f.periode === (p ?? null))

/** Heure de début sur une journée de travail : minuit à 5 h vient APRÈS
 * 23 h (une nuit qui commence à minuit suit celle de 23 h). */
const debutDansLaJournee = (debut: string) => {
  const m = minutes(debut)
  return m < 5 * 60 ? m + 24 * 60 : m
}

/** Codes rangés : par famille, puis du plus tôt au plus tard, puis du plus
 * court au plus long. */
export function trierHoraires<
  T extends Pick<Horaire, 'periode' | 'debut' | 'fin' | 'code'>,
>(horaires: readonly T[]): T[] {
  return [...horaires].sort(
    (a, b) =>
      rangFamille(a.periode) - rangFamille(b.periode) ||
      debutDansLaJournee(a.debut) - debutDansLaJournee(b.debut) ||
      dureeHoraire(a.debut, a.fin) - dureeHoraire(b.debut, b.fin) ||
      a.code.localeCompare(b.code),
  )
}

/** Codes rangés et regroupés par famille (familles vides omises). */
export function grouperHoraires<
  T extends Pick<Horaire, 'periode' | 'debut' | 'fin' | 'code'>,
>(
  horaires: readonly T[],
): Array<{ periode: Periode | null; libelle: string; horaires: T[] }> {
  const tries = trierHoraires(horaires)
  return FAMILLES.map((f) => ({
    ...f,
    horaires: tries.filter((h) => (h.periode ?? null) === f.periode),
  })).filter((g) => g.horaires.length > 0)
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
): string {
  const ordre = { titulaire: 0, occasionnel: 1, soutien: 2 }
  return [...s.competences]
    .sort((a, b) => ordre[a.niveau] - ordre[b.niveau])
    .map((c) => postes.find((p) => p.id === c.poste_id)?.nom)
    .filter(Boolean)
    .join(' · ')
}

/** Libellé métier de la colonne staff : « Night », « Hôtelier », ou le poste. */
export function metier(
  s: Pick<Salarie, 'competences'>,
  postes: Poste[],
): string {
  const ordre = { titulaire: 0, occasionnel: 1, soutien: 2 }
  const noms = [...s.competences]
    .sort((a, b) => ordre[a.niveau] - ordre[b.niveau])
    .map((c) => postes.find((p) => p.id === c.poste_id))
    .filter((p): p is Poste => !!p)
    .map((p) =>
      p.categorie === 'veille_nuit'
        ? 'Night'
        : p.categorie === 'reception' || p.nom === 'Club'
          ? 'Hôtelier'
          : p.nom,
    )
  return [...new Set(noms)].join(' · ')
}

/** Range le staff par groupe (ordre choisi), puis « Sans groupe ». */
export function parGroupe<T extends Pick<Salarie, 'groupe_id'>>(
  salaries: T[],
  groupes: Groupe[],
): Array<{ id: number; nom: string; membres: T[] }> {
  const connus = new Set(groupes.map((g) => g.id))
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
 * garantie. `quoi` : « Planning » (semaine) ou « Mois ». */
export function messageGeneration(
  aPourvoir: number,
  quoi = 'Planning',
): string {
  if (aPourvoir <= 0) return `${quoi} complet généré.`
  return aPourvoir === 1
    ? `${quoi} généré. 1 place reste à pourvoir.`
    : `${quoi} généré. ${aPourvoir} places restent à pourvoir.`
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
): string {
  const presents = new Set<number>()
  const weekends = new Map<number, number>()
  for (const s of semaines) {
    const ceWeekend = new Set<number>()
    for (const a of s.affectations) {
      presents.add(a.salarie_id)
      if (a.jour >= 5) ceWeekend.add(a.salarie_id)
    }
    for (const id of ceWeekend) weekends.set(id, (weekends.get(id) ?? 0) + 1)
  }
  const parPoste = new Map<number, number[]>()
  for (const x of salaries) {
    const p = posteEquite(x)
    if (p === null || !presents.has(x.id)) continue
    parPoste.set(p, [...(parPoste.get(p) ?? []), weekends.get(x.id) ?? 0])
  }
  const morceaux: string[] = []
  for (const poste of postes) {
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

/** Un jour sans shift ni absence est un repos (pas « non attribué ») quand
 * c'est sûr : repos de la fiche, ou semaine déjà complète (repos déduits).
 * Sinon la case reste « non attribué » (décision utilisateur du 2026-10-27 :
 * retirer un shift doit remettre la case à vide, un repos n'est pas posé). */
export function jourDeRepos(b: BilanOut, jour: number): boolean {
  // Une semaine couverte par l'école ou les congés passe par les repos
  // déduits du moteur (qui n'en donne ni aux extras, ni aux apprentis, ni aux
  // stagiaires) : plus de seconde règle ici.
  return b.repos_fixes.includes(jour) || b.repos_deduits.includes(jour)
}

/** Sous contrat ce jour-là et proposé au planning. */
export const disponibleLe = (s: Salarie, date: string) =>
  s.actif && sousContrat(s, date, date)

/** Présent au moins un jour de [debut, fin]. */
export const sousContrat = (s: Salarie, debut: string, fin: string) =>
  (!s.date_entree || s.date_entree <= fin) &&
  (!s.date_sortie || s.date_sortie >= debut)

/** « École » ou « Absence » : le mot pour un jour de ce motif. */
export function genreMotif(m?: Motif): string {
  if (!m) return 'Absence'
  return m.nature === 'ecole' ? 'École' : 'Absence'
}

/** Journée étoile d'une carte : pas au forfait, plus de 35 h, et court ou 7 h. */
export function journeeEtoile(
  s: Pick<Salarie, 'forfait_jours' | 'heures_hebdo'>,
  shift: { court: boolean; duree: number },
): boolean {
  return (
    !s.forfait_jours &&
    Number(s.heures_hebdo) > 35 &&
    (shift.court || shift.duree === 7 * 60)
  )
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
