/*
 * Points d'attention, purs (demande utilisateur du 2026-10-28 : le panneau
 * était « confusant et compliqué à lire »). UNE source pour le panneau de la
 * semaine, celui du mois et le chiffre de leurs boutons : on compte ce qu'on
 * montre.
 *
 * Ordre de lecture, du plus grave au moins grave : infractions à la loi,
 * shifts à pourvoir (par jour), présence du matin et du soir, puis le reste
 * par personne. « Pourquoi personne ? » est regroupé par raison, les extras
 * tiennent sur une ligne.
 */

import type { SemaineOut } from '#/lib/planning/semaine.ts'
import { ajouterJours } from '#/lib/planning/temps.ts'
import type { Poste, Salarie } from '#/lib/planning/types.ts'

const RAISON_EXTRA = 'extra disponible'
const SANS_RAISON = 'disponible, au détriment de ses heures'

export interface Raison {
  message: string
  noms: string[]
}

export interface ShiftAPourvoir {
  cle: string
  date: string
  poste: Poste | undefined
  debut: string
  fin: string
  manquant: number
  /** Extras disponibles : à appeler. */
  extras: string[]
  /** Pourquoi les autres ne le prennent pas, une ligne par raison. */
  raisons: Raison[]
}

export interface EcartPresence {
  cle: string
  date: string
  periode: 'matin' | 'soir'
  compte: number
  minimum: number
  maximum: number | null
  ecart: number
}

export interface PointPersonne {
  id: number
  nom: string
  /** Chaque message, précédé de sa semaine quand il y en a plusieurs. */
  messages: Array<{ semaine: string | null; texte: string }>
}

export interface PointsAttention {
  total: number
  infractions: PointPersonne[]
  aPourvoir: Array<{ date: string; shifts: ShiftAPourvoir[] }>
  presence: EcartPresence[]
  aVerifier: PointPersonne[]
}

/** `garder` : jours retenus (la vue mois ne garde que ceux du mois). */
export function pointsAttention(
  semaines: SemaineOut[],
  salaries: Salarie[],
  postes: Poste[],
  garder: (date: string) => boolean = () => true,
): PointsAttention {
  const parId = new Map(salaries.map((s) => [s.id, s]))
  const nom = (id: number) => parId.get(id)?.prenom ?? 'Inconnu'

  const shifts: ShiftAPourvoir[] = []
  const presence: EcartPresence[] = []
  for (const s of semaines) {
    for (const t of s.a_pourvoir) {
      const date = ajouterJours(s.lundi, t.jour)
      if (!garder(date)) continue
      const extras: string[] = []
      const parRaison = new Map<string, string[]>()
      for (const r of t.raisons) {
        if (parId.get(r.salarie_id)?.type_contrat === 'extra') {
          extras.push(nom(r.salarie_id))
          continue
        }
        const messages = r.messages.filter((m) => !m.startsWith(RAISON_EXTRA))
        for (const m of messages.length ? messages : [SANS_RAISON]) {
          parRaison.set(m, [...(parRaison.get(m) ?? []), nom(r.salarie_id)])
        }
      }
      shifts.push({
        cle: `${s.lundi}-${t.besoin_id}`,
        date,
        poste: postes.find((p) => p.id === t.poste_id),
        debut: t.debut,
        fin: t.fin,
        manquant: t.manquant,
        extras,
        raisons: [...parRaison]
          .map(([message, noms]) => ({ message, noms }))
          .sort((a, b) => b.noms.length - a.noms.length),
      })
    }
    for (const p of s.presence) {
      const date = ajouterJours(s.lundi, p.jour)
      if (p.ecart === 0 || !garder(date)) continue
      presence.push({ cle: `${date}-${p.periode}`, date, ...p })
    }
  }
  shifts.sort(
    (a, b) => a.date.localeCompare(b.date) || a.debut.localeCompare(b.debut),
  )
  presence.sort(
    (a, b) =>
      a.date.localeCompare(b.date) || a.periode.localeCompare(b.periode),
  )
  const aPourvoir: PointsAttention['aPourvoir'] = []
  for (const t of shifts) {
    const dernier = aPourvoir.at(-1)
    if (dernier?.date === t.date) dernier.shifts.push(t)
    else aPourvoir.push({ date: t.date, shifts: [t] })
  }

  // Alertes des personnes : par semaine (elles n'ont pas de jour). Une semaine
  // compte dès qu'un de ses jours est retenu.
  const retenues = semaines.filter((s) =>
    [0, 1, 2, 3, 4, 5, 6].some((j) => garder(ajouterJours(s.lundi, j))),
  )
  const plusieurs = retenues.length > 1
  const infractions: PointPersonne[] = []
  const aVerifier: PointPersonne[] = []
  for (const x of salaries) {
    const loi: PointPersonne['messages'] = []
    const autre: PointPersonne['messages'] = []
    for (const s of retenues) {
      const b = s.bilan.find((y) => y.salarie_id === x.id)
      for (const a of b?.alertes ?? []) {
        const m = { semaine: plusieurs ? s.lundi : null, texte: a.message }
        ;(a.nature === 'loi' ? loi : autre).push(m)
      }
    }
    if (loi.length) infractions.push({ id: x.id, nom: x.prenom, messages: loi })
    if (autre.length)
      aVerifier.push({ id: x.id, nom: x.prenom, messages: autre })
  }

  const compte = (l: PointPersonne[]) =>
    l.reduce((n, p) => n + p.messages.length, 0)
  return {
    total:
      compte(infractions) + shifts.length + presence.length + compte(aVerifier),
    infractions,
    aPourvoir,
    presence,
    aVerifier,
  }
}

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`

/** « Tout est en ordre », ou « 7 points : 5 shifts à pourvoir, 2 … ». */
export function resumePoints(p: PointsAttention): string {
  if (p.total === 0) return 'Tout est en ordre.'
  const morceaux: string[] = []
  const infractions = p.infractions.reduce((n, x) => n + x.messages.length, 0)
  if (infractions) morceaux.push(pluriel(infractions, 'infraction'))
  const shifts = p.aPourvoir.reduce((n, j) => n + j.shifts.length, 0)
  if (shifts) morceaux.push(`${pluriel(shifts, 'shift')} à pourvoir`)
  if (p.presence.length)
    morceaux.push(pluriel(p.presence.length, 'consigne') + ' de présence')
  const autres = p.aVerifier.reduce((n, x) => n + x.messages.length, 0)
  if (autres) morceaux.push(`${autres} à vérifier`)
  return `${pluriel(p.total, 'point')} : ${morceaux.join(', ')}.`
}
