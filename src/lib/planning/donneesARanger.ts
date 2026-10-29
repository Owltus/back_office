/*
 * Données à ranger (plan `planning-coherence-2026-10-28`, étape 11, D8 = A) :
 * les shifts déjà posés qui contredisent les réglages, signalés par le
 * contrôle « À vérifier » avec, quand une seule réponse existe, une
 * correction en un clic. Rien ne s'écrit ici : ce module est PUR, il rend
 * des groupes ; l'écriture est `rangerShifts` (`service.ts`), lancée par le
 * bouton.
 *
 * Deux sortes de shifts :
 *   1. SANS code, dont début, fin et pause sont exactement ceux d'un code
 *      permis sur le poste du shift ET par la fiche de la personne
 *      (`codesDuPoste` ∩ `codeDeLaFiche`, sans la semaine type : un shift
 *      déjà posé n'a pas à suivre la semaine type d'aujourd'hui). Un seul
 *      code : « Rattacher au code X ». Plusieurs codes aux mêmes heures :
 *      signalé, sans proposition (on ne choisit pas à la place de
 *      l'utilisateur). Aucun : rien à dire, un shift sans code est permis.
 *   2. Sur un code que son POSTE ne permet pas (`codePrevuAuPoste`). Si la
 *      personne tient un autre poste qui le permet : « Passer sur le poste
 *      Y ». Plusieurs postes possibles : celui où elle est titulaire s'il
 *      est seul, sinon signalé sans proposition.
 *
 * Regroupement : une ligne par (sorte, poste, code, correction proposée),
 * avec le nombre de shifts et leurs dates. Le poste proposé dépend de la
 * personne : deux personnes sur le même code peuvent donc donner deux
 * lignes (l'une avec proposition, l'autre sans).
 *
 * Semaine verrouillée : jamais modifiée (le trigger refuse, PL423). Ses
 * shifts sont mis à part (`verrouilles`) et le texte le dit ; un groupe qui
 * n'a QUE des shifts verrouillés reste signalé, sans correction (« déverrouillez
 * la semaine pour les corriger ») : sur la base de dev, tous les shifts
 * incohérents sont dans des semaines verrouillées, les cacher les aurait tus.
 */

import type { LienReglage } from '#/lib/planning/coherence.ts'
import {
  codeDeLaFiche,
  codePrevuAuPoste,
  codesDeLaFiche,
  codesDuPoste,
} from '#/lib/planning/eligibilite.ts'
import { ajouterJours, lundiDe } from '#/lib/planning/temps.ts'
import type {
  Affectation,
  Horaire,
  Poste,
  Referentiel,
  Salarie,
} from '#/lib/planning/types.ts'

/** Ce que le contrôle lit d'un shift. */
export type ShiftLu = Pick<
  Affectation,
  | 'id'
  | 'lundi'
  | 'salarie_id'
  | 'poste_id'
  | 'jour'
  | 'horaire_id'
  | 'debut'
  | 'fin'
  | 'pause'
>

/** Profondeur de la relecture : six mois en arrière (environ 26 semaines),
 * puis tout ce qui est déjà posé ensuite. */
export const SEMAINES_RELUES = 26

/** Premier lundi relu : `SEMAINES_RELUES` semaines avant celle du jour. Il
 * ne bouge qu'une fois par semaine (clé de cache stable). */
export function debutRelecture(aujourdhui: string): string {
  return ajouterJours(lundiDe(aujourdhui), -7 * SEMAINES_RELUES)
}

export type SorteRangement = 'rattacher' | 'heures-communes' | 'hors-poste'

/** La correction d'un groupe : une seule colonne change, et la garde dit ce
 * que le shift doit encore être pour être modifié (sinon il est laissé). */
export type Correction =
  | {
      type: 'code'
      horaireId: number
      /** Garde : encore sans code, aux mêmes heures. */
      debut: string
      fin: string
      pause: number
    }
  | {
      type: 'poste'
      posteId: number
      /** Garde : encore sur l'ancien poste, avec ce code. */
      ancienPosteId: number
      horaireId: number
    }

export interface GroupeARanger {
  /** Stable d'un calcul à l'autre. */
  id: string
  sorte: SorteRangement
  poste: Poste
  /** Code du shift (hors poste) ou code proposé (rattacher). */
  horaire?: Horaire
  /** Codes aux mêmes heures (heures communes). */
  candidats?: Horaire[]
  /** Poste proposé (hors poste avec correction). */
  posteCible?: Poste
  /** Shifts à modifier (hors semaine verrouillée), par date. */
  shifts: ShiftLu[]
  /** Shifts du groupe dans une semaine verrouillée : jamais modifiés. */
  verrouilles: ShiftLu[]
  texte: string
  /** Libellé du bouton, ou null : seulement signalé. */
  action: string | null
  correction: Correction | null
  /** Le réglage qui peut aussi régler la question. */
  lien: LienReglage
}

/** Date d'un shift (AAAA-MM-JJ). */
export const dateShift = (s: Pick<ShiftLu, 'lundi' | 'jour'>) =>
  ajouterJours(s.lundi, s.jour)

const pluriel = (n: number, un: string, plusieurs: string) =>
  `${n} ${n > 1 ? plusieurs : un}`

const heures = (h: Pick<Horaire, 'debut' | 'fin'>) => `${h.debut} - ${h.fin}`

/** Les postes tenus par la personne, autres que `sauf`, qui permettent ce
 * code ; un seul retenu (titulaire d'abord), sinon aucun. Un poste tenu en
 * soutien n'est jamais proposé : on n'y compte pas comme une personne du
 * poste, le shift y serait aussi faux qu'avant. */
function posteAlternatif(
  s: Salarie | undefined,
  sauf: number,
  horaireId: number,
  postes: ReadonlyMap<number, Poste>,
): Poste | null {
  if (!s) return null
  const possibles = s.competences
    .filter(
      (c) =>
        c.poste_id !== sauf &&
        (c.niveau === 'titulaire' || c.niveau === 'occasionnel'),
    )
    .map((c) => ({ c, poste: postes.get(c.poste_id) }))
    .filter(
      (x): x is { c: (typeof s.competences)[number]; poste: Poste } =>
        x.poste !== undefined && codePrevuAuPoste(x.poste, horaireId),
    )
  if (possibles.length === 1) return possibles[0].poste
  const titulaires = possibles.filter((x) => x.c.niveau === 'titulaire')
  return titulaires.length === 1 ? titulaires[0].poste : null
}

/** Codes permis sur ce poste par cette fiche, aux heures exactes du shift. */
function codesAuxMemesHeures(
  shift: ShiftLu,
  poste: Poste,
  s: Salarie | undefined,
  horaires: readonly Horaire[],
): Horaire[] {
  const fiche = { shiftsAutorises: s ? codesDeLaFiche(s) : new Set<string>() }
  return codesDuPoste(poste, horaires).filter(
    (h) =>
      h.debut === shift.debut &&
      h.fin === shift.fin &&
      h.pause === shift.pause &&
      codeDeLaFiche(fiche, String(h.id)),
  )
}

const parDate = (a: ShiftLu, b: ShiftLu) =>
  a.lundi.localeCompare(b.lundi) || a.jour - b.jour || a.id - b.id

/**
 * Les shifts qui contredisent les réglages, regroupés. Pur : mêmes shifts,
 * même référentiel, mêmes groupes. Ordre : à corriger d'abord, puis par
 * nombre de shifts décroissant.
 */
export function donneesARanger(
  r: Referentiel,
  shifts: readonly ShiftLu[],
): GroupeARanger[] {
  const postes = new Map(r.postes.map((p) => [p.id, p]))
  const horaires = new Map(r.horaires.map((h) => [h.id, h]))
  const salaries = new Map(r.salaries.map((s) => [s.id, s]))
  const verrous = new Set(r.verrous)

  interface Brouillon {
    sorte: SorteRangement
    poste: Poste
    horaire?: Horaire
    candidats?: Horaire[]
    posteCible?: Poste
    shifts: ShiftLu[]
  }
  const brouillons = new Map<string, Brouillon>()
  const ajouter = (cle: string, b: Omit<Brouillon, 'shifts'>, s: ShiftLu) => {
    const g = brouillons.get(cle) ?? { ...b, shifts: [] }
    g.shifts.push(s)
    brouillons.set(cle, g)
  }

  for (const s of shifts) {
    const poste = postes.get(s.poste_id)
    if (!poste) continue
    const personne = salaries.get(s.salarie_id)
    if (s.horaire_id === null) {
      const memes = codesAuxMemesHeures(s, poste, personne, r.horaires)
      if (memes.length === 1) {
        ajouter(
          `rattacher:${poste.id}:${memes[0].id}`,
          { sorte: 'rattacher', poste, horaire: memes[0] },
          s,
        )
      } else if (memes.length > 1) {
        ajouter(
          `heures-communes:${poste.id}:${memes.map((h) => h.id).join('-')}`,
          { sorte: 'heures-communes', poste, candidats: memes },
          s,
        )
      }
      continue
    }
    if (codePrevuAuPoste(poste, s.horaire_id)) continue
    const horaire = horaires.get(s.horaire_id)
    if (!horaire) continue
    const cible = posteAlternatif(personne, poste.id, horaire.id, postes)
    ajouter(
      `hors-poste:${poste.id}:${horaire.id}:${cible?.id ?? 'aucun'}`,
      { sorte: 'hors-poste', poste, horaire, posteCible: cible ?? undefined },
      s,
    )
  }

  const groupes: GroupeARanger[] = []
  for (const [id, b] of brouillons) {
    const tries = [...b.shifts].sort(parDate)
    const libres = tries.filter((s) => !verrous.has(s.lundi))
    const verrouilles = tries.filter((s) => verrous.has(s.lundi))
    const texte = rediger(b, libres, verrouilles)
    groupes.push({
      id,
      ...b,
      shifts: libres,
      verrouilles,
      ...texte,
      // Tout est verrouillé : rien à écrire, seulement signalé.
      ...(libres.length ? {} : { action: null, correction: null }),
    })
  }
  return groupes.sort(
    (a, b) =>
      (a.correction ? 0 : 1) - (b.correction ? 0 : 1) ||
      b.shifts.length +
        b.verrouilles.length -
        (a.shifts.length + a.verrouilles.length) ||
      a.id.localeCompare(b.id),
  )
}

function rediger(
  b: {
    sorte: SorteRangement
    poste: Poste
    horaire?: Horaire
    candidats?: Horaire[]
    posteCible?: Poste
  },
  libres: ShiftLu[],
  verrouilles: ShiftLu[],
): Pick<GroupeARanger, 'texte' | 'action' | 'correction' | 'lien'> {
  const n = libres.length + verrouilles.length
  const nShifts = pluriel(n, 'shift', 'shifts')
  const ont = n > 1 ? 'ont' : 'a'
  const sont = n > 1 ? 'sont' : 'est'
  const fige = !verrouilles.length
    ? ''
    : libres.length
      ? ` ${pluriel(verrouilles.length, 'shift est', 'shifts sont')} dans une semaine verrouillée, ${verrouilles.length > 1 ? 'ils ne seront pas modifiés' : 'il ne sera pas modifié'}.`
      : ` ${n > 1 ? 'Ils sont tous' : 'Il est'} dans une semaine verrouillée : rien ne sera modifié. Déverrouillez la semaine pour ${n > 1 ? 'les' : 'le'} corriger.`
  const lienPoste: LienReglage = {
    page: '/planning/postes',
    cible: `poste-${b.poste.id}`,
  }

  if (b.sorte === 'rattacher' && b.horaire) {
    const h = b.horaire
    return {
      texte: `Poste ${b.poste.nom} : ${nShifts} sans code ${ont} exactement les heures de l'horaire ${h.code} (${heures(h)}).${fige}`,
      action: `Rattacher au code ${h.code}`,
      correction: {
        type: 'code',
        horaireId: h.id,
        debut: h.debut,
        fin: h.fin,
        pause: h.pause,
      },
      lien: { page: '/planning/horaires', cible: `horaire-${h.id}` },
    }
  }
  if (b.sorte === 'heures-communes' && b.candidats) {
    const codes = b.candidats.map((h) => h.code)
    return {
      texte: `Poste ${b.poste.nom} : ${nShifts} sans code ${ont} les heures de plusieurs horaires à la fois (${codes.join(', ')}). Choisissez le code dans le planning.${fige}`,
      action: null,
      correction: null,
      lien: { page: '/planning/horaires' },
    }
  }
  const h = b.horaire as Horaire
  if (b.posteCible) {
    const qui = n > 1 ? 'Ces personnes tiennent' : 'Cette personne tient'
    return {
      texte: `Poste ${b.poste.nom} : ${nShifts} ${sont} sur l'horaire ${h.code}, que ce poste ne permet pas. ${qui} aussi le poste ${b.posteCible.nom}, qui le permet.${fige}`,
      action: `Passer sur le poste ${b.posteCible.nom}`,
      correction: {
        type: 'poste',
        posteId: b.posteCible.id,
        ancienPosteId: b.poste.id,
        horaireId: h.id,
      },
      lien: lienPoste,
    }
  }
  return {
    texte: `Poste ${b.poste.nom} : ${nShifts} ${sont} sur l'horaire ${h.code}, que ce poste ne permet pas, et aucun autre poste de ${n > 1 ? 'ces personnes' : 'cette personne'} ne le permet. Autorisez ce code sur le poste, ou changez ces shifts dans le planning.${fige}`,
    action: null,
    correction: null,
    lien: lienPoste,
  }
}
