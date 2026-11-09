/*
 * Les ZONES de l'établissement (2026-11-06, lot 2, A5) : des postes tenus
 * ensemble, avec leur tableau (un chiffre par jour et par moment). À l'hôtel,
 * une zone : l'accueil (Réception, Club, Veille de nuit). Une zone se tient
 * en continu ou non ; tenue en continu, elle a la passation FIXE entre les
 * équipes (décision utilisateur du 2026-11-06, `regles.ts` : continuité,
 * passation avec la nuit, relève, équipe du soir ensemble). Le calcul ne lit jamais un nom de zone : la zone d'un poste
 * (`zone_id`), celle d'une consigne (`zone_id`), celle d'un créneau (`zone`).
 * Un poste de zone compte dans chaque moment du tableau que ses horaires
 * touchent, le jour comme la nuit.
 */

import { estNuit, MOMENTS_HOTEL, momentPropose } from '#/lib/planning/moment.ts'
import type { Moments } from '#/lib/planning/moment.ts'
import type { Horaire, Poste, Zone } from '#/lib/planning/types.ts'

/** Une zone telle que le calcul la lit. Identifiant en texte (celui de la
 * base). */
export interface ZoneRegle {
  id: string
  nom: string
  /** Tenue en continu : aucun trou d'une équipe à l'autre, d'un veilleur à
   * l'autre, passation avec la nuit, relève, équipe du soir ensemble
   * (règles fixes du 2026-11-06) ; personne seule évitée. */
  continue: boolean
}

/** La zone de l'hôtel quand la base n'en porte aucune (données de test) :
 * l'accueil, tenu en continu. */
export function zoneParDefaut(): ZoneRegle {
  return { id: '1', nom: 'Accueil', continue: true }
}

/** Les zones d'une liste de la base, rangées (ordre, puis id). */
export function lireZones(
  lignes: readonly Zone[] | null | undefined,
  defaut: ZoneRegle,
): readonly ZoneRegle[] {
  if (!lignes?.length) return [defaut]
  return [...lignes]
    .sort((a, b) => a.ordre - b.ordre || a.id - b.id)
    .map((z) => ({
      id: String(z.id),
      nom: z.nom,
      continue: z.continue,
    }))
}

/** La zone d'un poste ouvert, ou null (hors zone, fermé). */
export function zoneDuPoste(
  poste: Pick<Poste, 'zone_id' | 'ferme'> | undefined,
): string | null {
  if (!poste || poste.ferme || poste.zone_id == null) return null
  return String(poste.zone_id)
}

/** Les zones en service : celles qui ont au moins un poste ouvert. */
export function zonesEnService(
  postes: Iterable<Pick<Poste, 'zone_id' | 'ferme'>>,
): Set<string> {
  const r = new Set<string>()
  for (const p of postes) {
    const z = zoneDuPoste(p)
    if (z !== null) r.add(z)
  }
  return r
}

/** Un horaire tel que les zones le lisent : son moment, ou ses heures
 * (moment pas encore calculé, données de test). */
type HoraireZone = Pick<Horaire, 'id' | 'periode'> &
  Partial<Pick<Horaire, 'debut' | 'fin' | 'pause'>>

const deNuit = (h: HoraireZone, l: Moments) =>
  estNuit(
    l,
    h.periode ??
      (h.debut && h.fin
        ? momentPropose({ debut: h.debut, fin: h.fin, pause: h.pause ?? 0 }, l)
        : null),
  )

/** Les horaires que le poste permet (liste vide : tous). */
function horairesDuPoste(
  poste: Pick<Poste, 'horaires_autorises'>,
  horaires: Iterable<HoraireZone>,
) {
  const permis = new Set(poste.horaires_autorises)
  return [...horaires].filter((h) => !permis.size || permis.has(h.id))
}

/** Le poste de zone tient-il la nuit (un de ses horaires est de nuit) ? */
export function tientLaNuit(
  poste: Pick<Poste, 'zone_id' | 'ferme' | 'horaires_autorises'> | undefined,
  horaires: Iterable<HoraireZone>,
  l: Moments = MOMENTS_HOTEL,
): boolean {
  if (zoneDuPoste(poste) === null || !poste) return false
  return horairesDuPoste(poste, horaires).some((h) => deNuit(h, l))
}

/** Le poste de zone ne tient-il QUE la nuit (la veille de nuit) ? Il n'a ni
 * ouverture ni fermeture (ses passations le tiennent), ni le partage du
 * jour : il garde son groupe. */
export function seulementLaNuit(
  poste: Pick<Poste, 'zone_id' | 'ferme' | 'horaires_autorises'> | undefined,
  horaires: Iterable<HoraireZone>,
  l: Moments = MOMENTS_HOTEL,
): boolean {
  if (zoneDuPoste(poste) === null || !poste) return false
  const siens = horairesDuPoste(poste, horaires)
  return siens.length > 0 && siens.every((h) => deNuit(h, l))
}

/** Rang d'une zone dans la liste (0 la première), -1 inconnue. */
export const rangZone = (zones: readonly ZoneRegle[], id: string) =>
  zones.findIndex((z) => z.id === id)

/** La zone, ou la première (une consigne de test sans zone). */
export function zoneDe(
  zones: readonly ZoneRegle[],
  id: string | null | undefined,
): ZoneRegle {
  return zones.find((z) => z.id === id) ?? zones[0]
}

/** L'identifiant de poste d'une zone entière dans les sorties (`TrouOut`,
 * `APourvoirOut`) : 0 pour la première zone, -1 la deuxième… Jamais un
 * poste réel (ids positifs). */
export const posteIdZone = (zones: readonly ZoneRegle[], id: string) => {
  const r = rangZone(zones, id)
  return r <= 0 ? 0 : -r
}

/** La zone d'un identifiant de poste de zone (`posteIdZone`), ou null pour
 * un vrai poste. */
export const zoneDuPosteId = (
  zones: readonly ZoneRegle[],
  posteId: number,
): ZoneRegle | null => (posteId <= 0 ? (zones[-posteId] ?? null) : null)

// ------------------------------------------------- une zone à la fois

/** Ce que le calcul lit d'un problème pour une zone. */
interface ProblemeZones {
  creneaux: ReadonlyArray<{
    poste: string
    accueil: boolean
    zone?: string | null
    indispensable?: boolean
  }>
  consignes: ReadonlyArray<{ zone?: string }>
  releveMinutes?: number
  regles?: { zones: readonly ZoneRegle[] }
  veilleDuLundi?: ReadonlyArray<{ zone?: string }>
}

/** Les zones d'un problème (absentes : celle de l'hôtel). */
const zonesDe = (p: ProblemeZones): readonly ZoneRegle[] =>
  p.regles?.zones ?? [zoneParDefaut()]

/** La zone de chaque poste d'un problème : celle de ses créneaux, sinon la
 * première zone pour un poste qui a un candidat (`accueil`). */
export function zonesDesPostes(p: ProblemeZones): Map<string, string> {
  const premiere = zonesDe(p)[0].id
  const r = new Map<string, string>()
  for (const c of p.creneaux) {
    if (r.has(c.poste)) continue
    if (c.zone != null) r.set(c.poste, c.zone)
    else if (c.accueil) r.set(c.poste, premiere)
  }
  return r
}

/**
 * Le problème vu d'une zone : ses créneaux (ceux de ses postes), ses
 * consignes, sa relève. Le calcul d'une zone (trous, passations, relève,
 * équipes) se fait zone par zone, sans rien mélanger. Une zone sans créneau
 * ni consigne n'est pas rendue. La relève du problème (`RELEVE_MINUTES`
 * quand la zone est en service, posée par semaine.ts) ne vaut que pour une
 * zone tenue en continu ; ailleurs, aucune (règle fixe du 2026-11-06).
 */
export function vuesZones<P extends ProblemeZones>(
  p: P,
): Array<{ zone: ZoneRegle; p: P }> {
  const zones = zonesDe(p)
  const premiere = zones[0].id
  const desPostes = zonesDesPostes(p)
  const zoneDuCreneau = (c: P['creneaux'][number]) =>
    c.zone ?? desPostes.get(c.poste) ?? null

  const r: Array<{ zone: ZoneRegle; p: P }> = []
  for (const z of zones) {
    const creneaux = p.creneaux.filter((c) => zoneDuCreneau(c) === z.id)
    const consignes = p.consignes.filter((k) => (k.zone ?? premiere) === z.id)
    if (!creneaux.length && !consignes.length) continue
    const releve = z.continue ? p.releveMinutes : 0
    r.push({
      zone: z,
      p: {
        ...p,
        creneaux,
        consignes,
        releveMinutes: releve,
        veilleDuLundi: p.veilleDuLundi?.filter(
          (v) => (v.zone ?? premiere) === z.id,
        ),
      },
    })
  }
  return r
}

/** La zone d'un créneau d'un problème (`vuesZones`), ou null. */
export function zoneDuCreneau(
  p: ProblemeZones,
  c: ProblemeZones['creneaux'][number],
): string | null {
  return c.zone ?? zonesDesPostes(p).get(c.poste) ?? null
}

// ------------------------------------------- qui accompagne (2026-11-09)

/** Ce que l'accompagnement lit d'un créneau. */
type CreneauGroupe = {
  poste: string
  accueil?: boolean
  zone?: string | null
  indispensable?: boolean
}

/** Le lieu d'un poste indispensable, dit en clair. */
export const LIEU_INDISPENSABLES = 'sur les postes indispensables'

/** Où une personne qui n'est jamais seule (soutien, contrat « jamais sans un
 * salarié confirmé ») cherche qui l'accompagne : `groupe` rend une clé, la
 * même pour deux créneaux où l'un accompagne l'autre ; `lieu` la dit en
 * clair.
 *
 * Décision de l'utilisateur du 2026-11-09 : « peu importe sur le poste, mais
 * il faut du monde… je ne veux pas de poste en dur ». Un poste rangé dans une
 * zone (page Postes) : toute la ZONE (un apprenti à un poste, un salarié
 * confirmé à un autre poste de la même zone : accompagné). Un poste sans
 * zone : le poste seul. La zone d'un créneau est celle de `zoneDuCreneau`
 * (un candidat de l'accueil sans zone, données de test : la première).
 * Aucun nom ni id lu : le nom de la zone n'est que pour le texte.
 *
 * POSTES INDISPENSABLES (décision de l'utilisateur du même jour : « je ne
 * peux pas laisser tourner un hôtel avec juste des stagiaires et
 * apprentis… tu peux avoir un stagiaire seul en réception et un employé
 * non stagiaire au club, c'est ok ») : tous les postes indispensables
 * (`estIndispensable`, réglage du poste) forment UN groupe, quelle que soit
 * leur zone. Un poste non indispensable garde sa zone, sinon lui-même. */
export function accompagnement(p: ProblemeZones): {
  groupe: (c: CreneauGroupe) => string
  lieu: (c: CreneauGroupe) => string
} {
  const desPostes = zonesDesPostes(p)
  const zones = zonesDe(p)
  const zoneDe_ = (c: CreneauGroupe) => c.zone ?? desPostes.get(c.poste) ?? null
  return {
    groupe: (c) => {
      if (c.indispensable) return 'indispensables'
      const z = zoneDe_(c)
      return z === null ? `poste:${c.poste}` : `zone:${z}`
    },
    lieu: (c) => {
      if (c.indispensable) return LIEU_INDISPENSABLES
      const z = zoneDe_(c)
      const nom = z === null ? undefined : zones.find((x) => x.id === z)?.nom
      return nom === undefined ? 'sur ce poste' : `dans la zone ${nom}`
    },
  }
}
