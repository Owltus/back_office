/*
 * Aides d'affichage du planning, pures (prototype `frontend/src/api.ts`).
 */

import type { BilanOut } from '#/lib/planning/semaine.ts'
import { ajouterJours, minutes, versJour } from '#/lib/planning/temps.ts'
import type {
  Groupe,
  Horaire,
  Motif,
  Niveau,
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
  soutien: { libelle: 'Soutien', aide: 'En renfort uniquement, jamais seul' },
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
  return `${s.prenom[0] ?? ''}${s.nom[0] ?? ''}`.toUpperCase()
}

export function nomComplet(s: Pick<Salarie, 'prenom' | 'nom'>): string {
  return `${s.prenom} ${s.nom}`.trim()
}

/** Texte lisible (noir ou blanc) sur un fond donné. */
export function texteSur(couleur: string): string {
  const n = parseInt(couleur.slice(1), 16)
  const lum =
    (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) /
    255
  return lum > 0.62 ? '#111827' : '#ffffff'
}

/** Codes horaires proposés pour un poste (tous s'il n'en restreint aucun). */
export function horairesDuPoste<T extends { id: number }>(
  horaires: T[],
  poste?: Poste,
): T[] {
  const autorises = poste?.horaires_autorises ?? []
  return autorises.length
    ? horaires.filter((h) => autorises.includes(h.id))
    : horaires
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

/** Range le staff par catégorie (ordre choisi), puis « Sans catégorie ». */
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
      nom: 'Sans catégorie',
      membres: salaries.filter(
        (s) => s.groupe_id === null || !connus.has(s.groupe_id),
      ),
    },
  ].filter((g) => g.membres.length > 0)
}

/** Un jour sans shift ni absence est un repos (pas « non attribué ») quand
 * la personne est organisée cette semaine. */
export function jourDeRepos(
  b: BilanOut,
  jour: number,
  planifiee: boolean,
): boolean {
  if (
    b.repos_fixes.includes(jour) ||
    b.repos_deduits.includes(jour) ||
    planifiee
  )
    return true
  return b.minutes_contrat === 0 && Object.keys(b.absences).length > 0
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
    const dernier = r[r.length - 1]
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
