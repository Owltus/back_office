/*
 * Les moments de l'établissement à l'écran (2026-11-06, lot 2, A6 : la liste
 * `planning_moments`, réglée dans la section Moments de la page Besoins).
 * Le moment d'un horaire se CALCULE d'après ses heures (`momentPropose`) ;
 * avant d'enregistrer, la page montre les horaires qui changeraient de
 * moment (`changementsDeMoment`).
 */

import { lireMoments, momentPropose } from '#/lib/planning/moment.ts'
import { lireRegles } from '#/lib/planning/reglesEtablissement.ts'
import type {
  Consigne,
  Horaire,
  Moment,
  Periode,
  Referentiel,
} from '#/lib/planning/types.ts'

/** Les moments enregistrés, rangés. */
export function momentsDepuis(
  referentiel: Partial<Pick<Referentiel, 'reglages' | 'moments'>>,
): Moment[] {
  return [...lireRegles(referentiel).moments.liste]
}

export interface ChangementMoment {
  horaire: Horaire
  avant: Periode
  apres: Periode
}

/** Les horaires dont le moment changerait avec la nouvelle liste. */
export function changementsDeMoment(
  horaires: readonly Horaire[],
  avant: readonly Moment[],
  apres: readonly Moment[],
): ChangementMoment[] {
  const la = lireMoments(avant)
  const lb = lireMoments(apres)
  if (!apres.length) return []
  return horaires.flatMap((h) => {
    const a = momentPropose(h, la)
    const b = momentPropose(h, lb)
    return a === b ? [] : [{ horaire: h, avant: a, apres: b }]
  })
}

/** Identifiant d'un moment neuf, tiré de son nom (« Midi » → « midi ») et
 * jamais déjà pris. */
export function idPourNom(nom: string, pris: Iterable<string>): string {
  const deja = new Set(pris)
  const base =
    nom
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 30) || 'moment'
  let id = base
  for (let i = 2; deja.has(id); i++) id = `${base}-${i}`
  return id
}

/** Un moment neuf : dernier de la journée et du classement, sans condition
 * (il prend le reste tant qu'on ne lui en donne pas). */
export function nouveauMoment(nom: string, liste: readonly Moment[]): Moment {
  return {
    id: idPourNom(
      nom,
      liste.map((m) => m.id),
    ),
    nom: nom.trim(),
    ordre: Math.max(0, ...liste.map((m) => m.ordre)) + 1,
    priorite: Math.max(0, ...liste.map((m) => m.priorite)) + 1,
    debut_de: null,
    debut_a: null,
    fin_de: null,
    fin_a: null,
    toutes: true,
    libre_avant: null,
    compte_dans_tableau: false,
    est_nuit: false,
    couleur: null,
  }
}

/** La liste après avoir monté (-1) ou descendu (+1) un moment dans la
 * journée : `ordre` réécrit 1..n. */
export function deplacerMoment(
  liste: readonly Moment[],
  id: string,
  sens: -1 | 1,
  cle: 'ordre' | 'priorite' = 'ordre',
): Moment[] {
  const tries = [...liste].sort((a, b) => a[cle] - b[cle])
  const i = tries.findIndex((m) => m.id === id)
  const j = i + sens
  if (i < 0 || j < 0 || j >= tries.length) return [...liste]
  ;[tries[i], tries[j]] = [tries[j], tries[i]]
  const rang = new Map(tries.map((m, k) => [m.id, k + 1]))
  return liste.map((m) => ({ ...m, [cle]: rang.get(m.id) as number }))
}

/** Pourquoi un moment ne peut pas être retiré (null : il peut). Un moment
 * qui a encore un horaire (dans la liste proposée) ou un chiffre au tableau
 * reste. */
export function raisonGarde(
  id: string,
  horaires: readonly Horaire[],
  liste: readonly Moment[],
  consignes: readonly Pick<Consigne, 'periode'>[],
): string | null {
  if (consignes.some((c) => c.periode === id))
    return 'Il a des chiffres au tableau.'
  const sans = liste.filter((m) => m.id !== id)
  if (!sans.length) return 'Il faut au moins un moment.'
  const l = lireMoments(liste)
  if (horaires.some((h) => momentPropose(h, l) === id))
    return 'Des horaires sont rangés dans ce moment.'
  return null
}

const heureOk = (v: number | null, max: number) =>
  v === null || (Number.isInteger(v) && v >= 0 && v <= max)

/** Ce qui empêche d'enregistrer (vide : rien). */
export function erreursMoments(liste: readonly Moment[]): string[] {
  const erreurs: string[] = []
  if (!liste.length) erreurs.push('Il faut au moins un moment.')
  const noms = liste.map((m) => m.nom.trim().toLocaleLowerCase('fr-FR'))
  if (noms.some((n) => !n)) erreurs.push('Chaque moment a un nom.')
  if (new Set(noms).size !== noms.length)
    erreurs.push('Deux moments ne portent pas le même nom.')
  if (
    liste.some(
      (m) =>
        !heureOk(m.debut_de, 1440) ||
        !heureOk(m.debut_a, 1440) ||
        !heureOk(m.fin_de, 1440) ||
        !heureOk(m.fin_a, 1440) ||
        !heureOk(m.libre_avant, 1440),
    )
  )
    erreurs.push('Une heure va de 00:00 à 24:00.')
  return erreurs
}

/** Les lignes à écrire : moments neufs ou changés, et ceux à retirer. */
export function differenceMoments(
  avant: readonly Moment[],
  apres: readonly Moment[],
): { ecrire: Moment[]; retirer: string[] } {
  const parId = new Map(avant.map((m) => [m.id, m]))
  const ecrire = apres.filter((m) => {
    const a = parId.get(m.id)
    return !a || JSON.stringify(a) !== JSON.stringify(m)
  })
  const restent = new Set(apres.map((m) => m.id))
  return {
    ecrire,
    retirer: avant.filter((m) => !restent.has(m.id)).map((m) => m.id),
  }
}
