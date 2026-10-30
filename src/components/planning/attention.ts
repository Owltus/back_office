/*
 * Points d'attention, purs (demande utilisateur du 2026-10-28 : le panneau
 * était « confusant et compliqué à lire »). UNE source pour le panneau de la
 * semaine, celui du mois et le chiffre de leurs boutons : on compte ce qu'on
 * montre.
 *
 * Ordre de lecture, du plus grave au moins grave : infractions à la loi,
 * shifts à pourvoir (par jour), personnes par cycle (matin, soir, nuit),
 * trous entre équipes, puis le reste par personne. « Pourquoi personne ? » est regroupé par raison, les extras
 * tiennent sur une ligne.
 */

import { nomsCourts } from '#/lib/planning/affichage.ts'
import {
  estPossible,
  phraseCommune,
  raisonsClaires,
} from '#/lib/planning/raisonsPlaces.ts'
import type { RaisonClaire } from '#/lib/planning/raisonsPlaces.ts'
import type { SemaineOut } from '#/lib/planning/semaine.ts'
import { ORDRE_PERIODES } from '#/lib/planning/presence.ts'
import { ajouterJours } from '#/lib/planning/temps.ts'
import { JOURS } from '#/lib/planning/types.ts'
import type {
  Horaire,
  PeriodePresence,
  Poste,
  Salarie,
} from '#/lib/planning/types.ts'

const RAISON_EXTRA = 'extra disponible'
const SANS_RAISON = 'disponible ce jour-là'

export interface Raison {
  message: string
  noms: string[]
}

/** Titulaire, puis dépannage, puis extra (D13 : le moteur préfère un
 * titulaire ; l'extra s'appelle). */
export type RolePlace = 'titulaire' | 'occasionnel' | 'extra'
const ORDRE_ROLE: Record<RolePlace, number> = {
  titulaire: 0,
  occasionnel: 1,
  extra: 2,
}

/** Une personne qui tient le poste, face à UNE place. */
export interface PersonnePlace {
  id: number
  nom: string
  role: RolePlace
  raisons: RaisonClaire[]
  /** Rien ne l'empêche de prendre la place, sinon ses heures ou un appel. */
  possible: boolean
}

export interface ShiftAPourvoir {
  cle: string
  date: string
  /** Jour dans sa semaine (0 = lundi). */
  jour: number
  posteId: number
  horaireId: number | null
  poste: Poste | undefined
  debut: string
  fin: string
  manquant: number
  /** Extras disponibles : à appeler. */
  extras: string[]
  /** Pourquoi les autres ne le prennent pas, une ligne par raison. */
  raisons: Raison[]
  /** Chaque personne qui tient le poste, titulaires d'abord (D13). */
  personnes: PersonnePlace[]
  /** La règle qui bloque tout le monde, sur ce code comme sur les autres
   * codes du même cycle, dite pour la place (`phraseCommune`) : « Je ne peux
   * pas remplir ce M3. ». Null : quelqu'un pourrait, ou pas de règle
   * commune ; on montre alors les raisons par personne. */
  raisonCommune: { regle: string; phrase: string } | null
  /** Autres codes du même cycle qu'une personne (hors extras) pourrait
   * tenir alors que le code imposé lui est fermé. Rare : le moteur l'aurait
   * pris ; place laissée vide à la main ou pas encore générée. */
  autresCodes: Array<{ horaireId: number; noms: string[] }>
}

export interface EcartPresence {
  cle: string
  date: string
  periode: PeriodePresence
  compte: number
  minimum: number
  maximum: number | null
  ecart: number
}

/** Un moment d'un poste sans personne entre deux équipes. */
export interface TrouAttention {
  cle: string
  date: string
  posteId: number
  poste: Poste | undefined
  /** Heures d'horloge, fin exclue. */
  debut: string
  fin: string
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
  trous: TrouAttention[]
  aRegarder: PointPersonne[]
}

/** Ce qu'un écran montre : les JOURS retenus (places, présence) et les
 * SEMAINES retenues (alertes d'une personne, qui portent sur sa semaine).
 * Décision utilisateur du 2026-10-28 : un mois ne montre que ce qui le
 * concerne, une semaine que ce qui la concerne. */
export interface Portee {
  jour: (date: string) => boolean
  semaine: (lundi: string) => boolean
}

/** Vue semaine : à partir d'aujourd'hui (un jour passé ne se génère plus). */
export const porteeSemaine = (aujourdhui: string): Portee => ({
  jour: (d) => d >= aujourdhui,
  semaine: (l) => ajouterJours(l, 6) >= aujourdhui,
})

/** Vue mois : les jours du mois ; les semaines du mois, une semaine
 * appartenant au mois de son jeudi (semaines ISO). Avec `aujourdhui` : à
 * partir d'aujourd'hui (« Points d'attention ») ; sans : passé compris
 * (bouclier « règles HCR », une semaine réalisée reste contrôlable). */
export const porteeMois = (mois: string, aujourdhui?: string): Portee => ({
  jour: (d) => d.startsWith(mois) && (!aujourdhui || d >= aujourdhui),
  semaine: (l) =>
    ajouterJours(l, 3).startsWith(mois) &&
    (!aujourdhui || ajouterJours(l, 6) >= aujourdhui),
})

const TOUT: Portee = { jour: () => true, semaine: () => true }

/** Nombre d'infractions à la loi retenues (le chiffre du bouclier). */
export const nombreInfractions = (p: PointsAttention) =>
  p.infractions.reduce((n, x) => n + x.messages.length, 0)

/** `portee` : ce que l'écran montre (`porteeSemaine`, `porteeMois`). */
export function pointsAttention(
  semaines: SemaineOut[],
  salaries: Salarie[],
  postes: Poste[],
  portee: Portee = TOUT,
): PointsAttention {
  const garder = portee.jour
  const parId = new Map(salaries.map((s) => [s.id, s]))
  // Prénom, avec l'initiale du nom quand deux personnes le partagent.
  const courts = nomsCourts(salaries)
  const nom = (id: number) => courts.get(id) ?? 'Inconnu'

  const shifts: ShiftAPourvoir[] = []
  const presence: EcartPresence[] = []
  const trous: TrouAttention[] = []
  for (const s of semaines) {
    for (const t of s.a_pourvoir) {
      const date = ajouterJours(s.lundi, t.jour)
      if (!garder(date)) continue
      const extras: string[] = []
      const parRaison = new Map<string, string[]>()
      const personnes: PersonnePlace[] = []
      for (const r of t.raisons) {
        const x = parId.get(r.salarie_id)
        const niveau = x?.competences.find(
          (c) => c.poste_id === t.poste_id,
        )?.niveau
        const claires = raisonsClaires(r.salarie_id, r.regles, r.messages)
        personnes.push({
          id: r.salarie_id,
          nom: nom(r.salarie_id),
          role:
            x?.type_contrat === 'extra'
              ? 'extra'
              : niveau === 'occasionnel'
                ? 'occasionnel'
                : 'titulaire',
          raisons: claires,
          possible: estPossible(claires),
        })
        if (parId.get(r.salarie_id)?.type_contrat === 'extra') {
          extras.push(nom(r.salarie_id))
          continue
        }
        const messages = r.messages.filter((m) => !m.startsWith(RAISON_EXTRA))
        for (const m of messages.length ? messages : [SANS_RAISON]) {
          parRaison.set(m, [...(parRaison.get(m) ?? []), nom(r.salarie_id)])
        }
      }
      const commune = phraseCommune(t.raison_commune)
      // Autres codes : seulement les personnes à qui le code imposé est fermé.
      const ouvertes = new Set(
        personnes.filter((x) => x.possible).map((x) => x.id),
      )
      const autresCodes: ShiftAPourvoir['autresCodes'] = []
      // Données d'avant le 2026-10-30 (et fixtures) : pas de remplaçants.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      for (const r of t.remplacants ?? []) {
        const noms = r.raisons
          .filter(
            (x) =>
              !ouvertes.has(x.salarie_id) &&
              parId.get(x.salarie_id)?.type_contrat !== 'extra' &&
              estPossible(raisonsClaires(x.salarie_id, x.regles, x.messages)),
          )
          .map((x) => nom(x.salarie_id))
        if (noms.length) autresCodes.push({ horaireId: r.type_shift_id, noms })
      }
      shifts.push({
        cle: `${s.lundi}-${t.besoin_id}`,
        date,
        jour: t.jour,
        posteId: t.poste_id,
        horaireId: t.type_shift_id,
        poste: postes.find((p) => p.id === t.poste_id),
        debut: t.debut,
        fin: t.fin,
        manquant: t.manquant,
        extras,
        raisons: [...parRaison]
          .map(([message, noms]) => ({ message, noms }))
          .sort((a, b) => b.noms.length - a.noms.length),
        // Tri stable : l'ordre du référentiel tient à rôle égal.
        personnes: personnes.sort(
          (a, b) => ORDRE_ROLE[a.role] - ORDRE_ROLE[b.role],
        ),
        raisonCommune:
          commune && t.raison_commune
            ? { regle: t.raison_commune, phrase: commune }
            : null,
        autresCodes,
      })
    }
    for (const p of s.presence) {
      const date = ajouterJours(s.lundi, p.jour)
      if (p.ecart === 0 || !garder(date)) continue
      presence.push({ cle: `${date}-${p.periode}`, date, ...p })
    }
    // Données d'avant le 2026-10-30 (et fixtures) : pas de trous.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    for (const t of s.trous ?? []) {
      const date = ajouterJours(s.lundi, t.jour)
      if (!garder(date)) continue
      trous.push({
        cle: `${date}-${t.poste_id}-${t.debut}`,
        date,
        posteId: t.poste_id,
        poste: postes.find((p) => p.id === t.poste_id),
        debut: t.debut,
        fin: t.fin,
      })
    }
  }
  shifts.sort(
    (a, b) => a.date.localeCompare(b.date) || a.debut.localeCompare(b.debut),
  )
  presence.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      ORDRE_PERIODES[a.periode] - ORDRE_PERIODES[b.periode],
  )
  // Tri stable : dans un jour, l'ordre réel de l'analyse (une nuit qui passe
  // minuit reste après le soir).
  trous.sort((a, b) => a.date.localeCompare(b.date))
  const aPourvoir: PointsAttention['aPourvoir'] = []
  for (const t of shifts) {
    const dernier = aPourvoir.at(-1)
    if (dernier?.date === t.date) dernier.shifts.push(t)
    else aPourvoir.push({ date: t.date, shifts: [t] })
  }

  // Alertes des personnes : par semaine (elles n'ont pas de jour).
  const retenues = semaines.filter((s) => portee.semaine(s.lundi))
  const plusieurs = retenues.length > 1
  const infractions: PointPersonne[] = []
  const aRegarder: PointPersonne[] = []
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
    if (loi.length)
      infractions.push({ id: x.id, nom: nom(x.id), messages: loi })
    if (autre.length)
      aRegarder.push({ id: x.id, nom: nom(x.id), messages: autre })
  }

  const compte = (l: PointPersonne[]) =>
    l.reduce((n, p) => n + p.messages.length, 0)
  return {
    total:
      compte(infractions) +
      shifts.length +
      presence.length +
      trous.length +
      compte(aRegarder),
    infractions,
    aPourvoir,
    presence,
    trous,
    aRegarder,
  }
}

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`

/** La famille « Personnes par cycle » dans le résumé, avec les mots de ses
 * phrases (`phraseCycle` : « Il manque… », « … de trop ») : « 2 cycles à
 * compléter » si tous manquent de monde, « 1 cycle avec du monde en trop »
 * si tous en ont trop, sinon « 3 écarts de personnes par cycle ». */
export function resumeCycles(
  presence: ReadonlyArray<Pick<EcartPresence, 'ecart'>>,
): string {
  const n = presence.length
  if (presence.every((e) => e.ecart < 0))
    return `${pluriel(n, 'cycle')} à compléter`
  if (presence.every((e) => e.ecart > 0))
    return `${pluriel(n, 'cycle')} avec du monde en trop`
  return `${pluriel(n, 'écart')} de personnes par cycle`
}

/** « Tout est en ordre », ou « 7 points : 5 shifts à pourvoir, 2 … ». */
export function resumePoints(p: PointsAttention): string {
  if (p.total === 0) return 'Tout est en ordre.'
  const morceaux: string[] = []
  const infractions = p.infractions.reduce((n, x) => n + x.messages.length, 0)
  if (infractions) morceaux.push(pluriel(infractions, 'infraction'))
  const shifts = p.aPourvoir.reduce((n, j) => n + j.shifts.length, 0)
  if (shifts) morceaux.push(`${pluriel(shifts, 'shift')} à pourvoir`)
  if (p.presence.length) morceaux.push(resumeCycles(p.presence))
  if (p.trous.length)
    morceaux.push(pluriel(p.trous.length, 'trou') + ' entre équipes')
  const autres = p.aRegarder.reduce((n, x) => n + x.messages.length, 0)
  if (autres) morceaux.push(`${autres} à regarder`)
  return `${pluriel(p.total, 'point')} : ${morceaux.join(', ')}.`
}

// ------------------------------------------------------------- regroupement

/** Une raison d'une personne, sur une partie des jours du groupe ou tous
 * (`dates` null). */
export interface RaisonGroupe extends RaisonClaire {
  dates: string[] | null
}

export interface PersonneGroupe {
  id: number
  nom: string
  role: RolePlace
  raisons: RaisonGroupe[]
}

/** Places identiques (même poste, même code, mêmes heures) sur plusieurs
 * jours : une ligne « Club, M1 : lundi, mardi et jeudi ». */
export interface GroupePlaces {
  cle: string
  poste: Poste | undefined
  posteId: number
  /** Code de l'horaire, ou null (place sans code : on montre les heures). */
  code: string | null
  debut: string
  fin: string
  /** Une par jour, dans l'ordre des dates. */
  places: ShiftAPourvoir[]
  /** Toutes les personnes vues sur les places, titulaires d'abord. */
  personnes: PersonneGroupe[]
  /** Phrase de la règle qui bloque tout le monde, la même sur toutes les
   * places du groupe (elle entre dans sa clé), ou null. */
  raisonCommune: string | null
  /** Autres codes possibles (« Possible en M6 : Alba »), toutes places
   * confondues, code affiché (ou heures si inconnu). */
  autresCodes: Array<{ code: string; noms: string[] }>
}

const JOURS_LONGS = JOURS.map((j) => j.toLowerCase())
const enDate = (x: string) => new Date(`${x}T12:00:00Z`)
const rangJour = (x: string) => (enDate(x).getUTCDay() + 6) % 7

/** Nom de chaque jour d'une liste : le nom seul quand toutes les dates sont
 * dans une même semaine (« mardi »), avec le numéro sinon (« mardi 3 »). */
export function nommerJours(
  dates: readonly string[],
): (date: string) => string {
  const l = [...new Set(dates)].sort()
  if (!l.length) return (x) => JOURS_LONGS[rangJour(x)]
  const premier = l[0]
  const dernier = l[l.length - 1]
  const ecart = (enDate(dernier).getTime() - enDate(premier).getTime()) / 864e5
  const memeSemaine = ecart < 7 && rangJour(dernier) >= rangJour(premier)
  return (x) =>
    memeSemaine
      ? JOURS_LONGS[rangJour(x)]
      : `${JOURS_LONGS[rangJour(x)]} ${enDate(x).getUTCDate()}`
}

/** « Alba », « Alba et Bruno », « Alba, Bruno et Céleste ». */
export const enListe = (n: readonly string[]) =>
  n.length <= 1
    ? (n[0] ?? '')
    : `${n.slice(0, -1).join(', ')} et ${n[n.length - 1]}`

/** Les jours d'un groupe : le nom seul dans une même semaine (« lundi,
 * mardi et jeudi »), avec le numéro sinon (« lundi 2 et lundi 9 »). */
export function joursDesPlaces(dates: readonly string[]): string {
  const l = [...new Set(dates)].sort()
  const nom = nommerJours(l)
  return enListe(l.map(nom))
}

const MOMENT: Record<PeriodePresence, string> = {
  matin: 'le matin',
  soir: 'le soir',
  nuit: 'la nuit',
}

/** Un écart à la consigne d'un cycle, en une phrase : « Il manque 1
 * personne le matin mardi », « 1 personne de trop le soir mardi ».
 * `jour` : le nom du jour (`nommerJours`). */
export function phraseCycle(
  e: Pick<EcartPresence, 'periode' | 'ecart'>,
  jour: string,
): string {
  const n = pluriel(Math.abs(e.ecart), 'personne')
  return e.ecart < 0
    ? `Il manque ${n} ${MOMENT[e.periode]} ${jour}`
    : `${n} de trop ${MOMENT[e.periode]} ${jour}`
}

/** « 15 h », « 15 h 30 » ; minuit en fin de plage : « 0 h ». */
export function heureParlee(h: string): string {
  const [hh, mm] = h.split(':').map(Number)
  const heure = hh % 24
  return mm ? `${heure} h ${String(mm).padStart(2, '0')}` : `${heure} h`
}

/** « Réception mardi : personne de 15 h à 16 h ». */
export function phraseTrou(t: TrouAttention, jour: string): string {
  return `${t.poste?.nom ?? 'Poste'} ${jour} : personne de ${heureParlee(t.debut)} à ${heureParlee(t.fin)}`
}

/** Regroupe les places identiques ; groupes dans l'ordre de leur première
 * date, puis de l'heure. `horaires` donne le code affiché. */
export function regrouperPlaces(
  shifts: readonly ShiftAPourvoir[],
  horaires: readonly Pick<Horaire, 'id' | 'code'>[] = [],
): GroupePlaces[] {
  const codes = new Map(horaires.map((h) => [h.id, h.code]))
  const groupes = new Map<string, GroupePlaces>()
  const tries = [...shifts].sort(
    (a, b) => a.date.localeCompare(b.date) || a.debut.localeCompare(b.debut),
  )
  for (const t of tries) {
    const cle = `${t.posteId}|${t.horaireId ?? ''}|${t.debut}|${t.fin}|${t.raisonCommune?.regle ?? ''}`
    let g = groupes.get(cle)
    if (!g) {
      g = {
        cle,
        poste: t.poste,
        posteId: t.posteId,
        code: t.horaireId === null ? null : (codes.get(t.horaireId) ?? null),
        debut: t.debut,
        fin: t.fin,
        places: [],
        personnes: [],
        raisonCommune: t.raisonCommune?.phrase ?? null,
        autresCodes: [],
      }
      groupes.set(cle, g)
    }
    g.places.push(t)
  }
  for (const g of groupes.values()) {
    const autres = new Map<string, Set<string>>()
    for (const place of g.places) {
      // Fixtures d'avant le 2026-10-30 : pas de champ.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      for (const a of place.autresCodes ?? []) {
        const code = codes.get(a.horaireId) ?? `code ${a.horaireId}`
        const noms = autres.get(code) ?? new Set<string>()
        for (const n of a.noms) noms.add(n)
        autres.set(code, noms)
      }
    }
    g.autresCodes = [...autres].map(([code, noms]) => ({
      code,
      noms: [...noms],
    }))
    const nbDates = new Set(g.places.map((p) => p.date)).size
    const parPersonne = new Map<
      number,
      { p: PersonneGroupe; raisons: Map<string, RaisonGroupe> }
    >()
    for (const place of g.places) {
      for (const x of place.personnes) {
        let e = parPersonne.get(x.id)
        if (!e) {
          e = {
            p: { id: x.id, nom: x.nom, role: x.role, raisons: [] },
            raisons: new Map(),
          }
          parPersonne.set(x.id, e)
        }
        for (const r of x.raisons) {
          const deja = e.raisons.get(r.cle)
          if (deja) deja.dates?.push(place.date)
          else e.raisons.set(r.cle, { ...r, dates: [place.date] })
        }
      }
    }
    g.personnes = [...parPersonne.values()]
      .map(({ p, raisons }) => ({
        ...p,
        raisons: [...raisons.values()].map((r) => ({
          ...r,
          dates: r.dates && new Set(r.dates).size === nbDates ? null : r.dates,
        })),
      }))
      .sort((a, b) => ORDRE_ROLE[a.role] - ORDRE_ROLE[b.role])
  }
  return [...groupes.values()]
}
