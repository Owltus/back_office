/*
 * Contrôle indépendant d'un planning : recompte chaque règle SANS le solveur
 * (prototype `solveur/verificateur.py`). Oracle des tests, explication des
 * trous, contrôle en direct d'un planning retouché à la main. Chaque
 * violation porte l'identifiant de sa règle et les créneaux en cause.
 */

import { postesAPresence, trousDuJour } from '#/lib/planning/cycles.ts'
import type { PresencePoste } from '#/lib/planning/cycles.ts'
import {
  codeDeLaFiche,
  codeImposeRespecte,
} from '#/lib/planning/eligibilite.ts'
import {
  cle,
  dansLeContrat,
  duree,
  jourDe,
  presenceMax,
  role,
  toucheLaNuit,
  travail,
} from '#/lib/planning/modele.ts'
import type {
  AffectationSolveur,
  Creneau,
  Probleme,
  SalarieSolveur,
} from '#/lib/planning/modele.ts'
import { heuresLisibles as h } from '#/lib/planning/temps.ts'
import type { PeriodePresence } from '#/lib/planning/types.ts'

export type Nature = 'loi' | 'organisation'

export interface Violation {
  salarieId: string | null
  regle: string
  message: string
  creneaux: string[]
  nature: Nature
}

function intervalle(debut: number, fin: number): number[] {
  const r: number[] = []
  for (let i = debut; i < fin; i++) r.push(i)
  return r
}

export function violationsSalarie(
  s: SalarieSolveur,
  liste: Creneau[],
  nbJours: number,
): Violation[] {
  const erreurs: Violation[] = []
  const ajoute = (
    regle: string,
    message: string,
    creneaux: Creneau[],
    nature: Nature = 'loi',
  ) => {
    erreurs.push({
      salarieId: s.id,
      regle,
      message,
      creneaux: creneaux.map((c) => c.id),
      nature,
    })
  }

  // Tri stable par début (Python `sorted`).
  liste = [...liste].sort((a, b) => a.debut - b.debut)
  for (const c of liste) {
    const j = jourDe(c)
    if (role(s, c.poste) === null) {
      ajoute('POSTE', 'ne tient pas ce poste', [c], 'organisation')
    }
    if (s.horsContrat.has(j) || !dansLeContrat(s, c)) {
      ajoute(
        'HORS-CONTRAT',
        'en dehors de son contrat (arrivée ou fin de contrat)',
        [c],
        'organisation',
      )
    } else if (s.indisponibilites.has(j)) {
      ajoute('ABSENCE', 'est absent(e) ce jour-là', [c], 'organisation')
    }
    if (s.reposFixes.has(j)) {
      ajoute(
        'REPOS-FIXE',
        "c'est un de ses jours de repos fixes",
        [c],
        'organisation',
      )
    }
    if (!codeDeLaFiche(s, c.typeShift)) {
      ajoute(
        'HORAIRE-PERSO',
        'cet horaire ne fait pas partie des siens',
        [c],
        'organisation',
      )
    }
    if (!codeImposeRespecte(s, j, c.typeShift)) {
      ajoute(
        'HORAIRE-PERSO',
        'un autre horaire est prévu ce jour-là',
        [c],
        'organisation',
      )
    }
    const maximum = presenceMax(s, c)
    if (duree(c) > maximum) {
      ajoute('R-JOUR-MAX', `journée de ${h(duree(c))}, maximum ${h(maximum)}`, [
        c,
      ])
    }
    if (s.nuitInterdite && toucheLaNuit(c)) {
      ajoute('R-NUIT-MINEUR', 'mineur : travail interdit entre 22 h et 6 h', [
        c,
      ])
    }
  }
  if (
    liste.length &&
    s.debutAuPlusTot !== null &&
    liste[0].debut < s.debutAuPlusTot
  ) {
    ajoute(
      'R-REPOS-HEBDO-35H',
      'reprend trop tôt : la semaine précédente perdrait son repos de 35 h consécutives',
      [liste[0]],
    )
  }
  if (liste.length && s.finServicePrecedent !== null) {
    const ecart = liste[0].debut - s.finServicePrecedent
    if (ecart < s.reposQuotidienMin) {
      ajoute(
        'R-REPOS-QUOTIDIEN',
        `seulement ${h(Math.max(ecart, 0))} de repos depuis son dernier service de la semaine précédente (minimum ${h(s.reposQuotidienMin)})`,
        [liste[0]],
      )
    }
  }
  if (liste.length && s.debutServiceSuivant !== null) {
    const dernier = liste[liste.length - 1]
    const ecart = s.debutServiceSuivant - dernier.fin
    if (ecart < s.reposQuotidienMin) {
      ajoute(
        'R-REPOS-QUOTIDIEN',
        `seulement ${h(Math.max(ecart, 0))} de repos avant son premier service de la semaine suivante (minimum ${h(s.reposQuotidienMin)})`,
        [dernier],
      )
    }
  }
  for (let i = 0; i + 1 < liste.length; i++) {
    const a = liste[i]
    const b = liste[i + 1]
    if (b.debut < a.fin) {
      ajoute('CHEVAUCHEMENT', 'deux services se chevauchent', [a, b])
    } else if (b.debut - a.fin < s.reposQuotidienMin) {
      ajoute(
        'R-REPOS-QUOTIDIEN',
        `seulement ${h(b.debut - a.fin)} de repos entre deux services (minimum ${h(s.reposQuotidienMin)})`,
        [a, b],
      )
    }
  }

  const parJour = new Map<number, Creneau[]>()
  for (const c of liste) {
    const j = jourDe(c)
    parJour.set(j, [...(parJour.get(j) ?? []), c])
  }
  for (const duJour of parJour.values()) {
    if (duJour.length > 1) {
      ajoute(
        'UN-SERVICE-PAR-JOUR',
        'a déjà un service ce jour-là',
        duJour,
        'organisation',
      )
    }
  }

  const nbSemaines = Math.ceil(nbJours / 7)
  for (let k = 0; k < nbSemaines; k++) {
    const jours = intervalle(7 * k, Math.min(7 * k + 7, nbJours))
    const dansSemaine = (j: number) =>
      j >= 7 * k && j < Math.min(7 * k + 7, nbJours)
    const semaine = liste.filter((c) => dansSemaine(jourDe(c)))
    // R-ECOLE-JOURS : les jours d'école comptent comme travaillés.
    const travailles = new Set<number>([
      ...semaine.map(jourDe),
      ...jours.filter((j) => s.joursHorsSite.has(j)),
    ])
    if (semaine.length && travailles.size > s.joursTravaillesMaxSemaine) {
      const regle =
        s.joursTravaillesMaxSemaine >= 6
          ? 'R-SIX-JOURS-MAX'
          : 'R-REPOS-HEBDO-HCR'
      ajoute(
        regle,
        `${travailles.size} jours travaillés, maximum ${s.joursTravaillesMaxSemaine}`,
        semaine,
      )
    }
    if (s.reposDeuxSemaines) {
      const voisines: Array<[string, number]> = []
      if (k === 0 && s.joursSemainePrecedente !== null) {
        voisines.push(['précédente', s.joursSemainePrecedente])
      }
      if (k === nbSemaines - 1 && s.joursSemaineSuivante !== null) {
        voisines.push(['suivante', s.joursSemaineSuivante])
      }
      for (const [nom, autre] of voisines) {
        const repos = 14 - travailles.size - autre
        if (repos < s.reposDeuxSemaines) {
          ajoute(
            'R-REPOS-HEBDO-HCR',
            `${travailles.size + autre} jours travaillés sur deux semaines (avec la semaine ${nom}) : au moins ${s.reposDeuxSemaines} jours de repos`,
            semaine,
          )
        }
      }
    }
    if (
      s.joursPreferesSemaine < travailles.size &&
      travailles.size <= s.joursTravaillesMaxSemaine
    ) {
      ajoute(
        'SIXIEME-JOUR',
        `${travailles.size} jours travaillés : un seul jour de repos cette semaine, la semaine voisine doit en compter au moins 2`,
        semaine,
        'organisation',
      )
    }
    // R-ECOLE-HEURES (L6222-24) : chaque jour d'école compte une journée de
    // contrat (`journeeContrat`) dans la semaine.
    const ecole =
      jours.filter((j) => s.joursHorsSite.has(j)).length * s.minutesEcoleJour
    const total = semaine.reduce((t, c) => t + travail(c), 0) + ecole
    if (semaine.length && total > s.minutesHebdoMax) {
      ajoute(
        'R-SEMAINE-MAX',
        ecole
          ? `${h(total)} dans la semaine, école comprise (${h(ecole)}), maximum ${h(s.minutesHebdoMax)}`
          : `${h(total)} dans la semaine, maximum ${h(s.minutesHebdoMax)}`,
        semaine,
      )
    }
    const courtes = semaine.filter((c) => travail(c) < s.journeePleine)
    for (const c of semaine) {
      if (s.etoileFixe.has(jourDe(c)) && travail(c) >= s.journeePleine) {
        ajoute(
          'R-JOURNEE-ETOILE',
          'sa journée étoile (courte) est fixée ce jour-là',
          [c],
          'organisation',
        )
      }
    }
    if (
      s.journeesCourtesMax !== null &&
      courtes.length > s.journeesCourtesMax
    ) {
      ajoute(
        'R-JOURNEE-ETOILE',
        `${courtes.length} journées courtes dans la semaine, une seule prévue au contrat`,
        courtes,
        'organisation',
      )
    }
    if (
      s.reposHebdoMin &&
      semaine.length &&
      !reposHebdoTrouve(s, liste, jours, travailles)
    ) {
      ajoute(
        'R-REPOS-HEBDO-35H',
        `pas de repos de ${h(s.reposHebdoMin)} consécutives dans la semaine`,
        semaine,
      )
    }
    if (
      s.reposConsecutifs &&
      !jours
        .slice(0, -1)
        .some((j) => !travailles.has(j) && !travailles.has(j + 1))
    ) {
      ajoute(
        'R-REPOS-HEBDO-MINEUR',
        'mineur : pas deux jours de repos consécutifs',
        semaine,
      )
    }
  }
  return erreurs
}

/** R-REPOS-HEBDO-35H : un jour libre autour duquel le repos (fin du dernier
 * service d'avant → début du premier d'après) atteint `reposHebdoMin`. */
export function reposHebdoTrouve(
  s: SalarieSolveur,
  liste: Creneau[],
  jours: number[],
  travailles: ReadonlySet<number>,
): boolean {
  for (const d of jours) {
    if (travailles.has(d)) continue
    const avant = liste.filter((c) => jourDe(c) < d).map((c) => c.fin)
    const apres = liste.filter((c) => jourDe(c) > d).map((c) => c.debut)
    const fin = avant.length ? Math.max(...avant) : s.finServicePrecedent
    const debut = apres.length ? Math.min(...apres) : s.debutServiceSuivant
    if (fin === null || debut === null || debut - fin >= s.reposHebdoMin)
      return true
  }
  return false
}

/** Une même personne sur deux fiches (contrats successifs). */
export function entreFiches(
  fiches: SalarieSolveur[],
  parSalarie: Map<string, Creneau[]>,
): Violation[] {
  const erreurs: Violation[] = []
  for (let i = 0; i < fiches.length; i++) {
    for (let k = i + 1; k < fiches.length; k++) {
      const s1 = fiches[i]
      const s2 = fiches[k]
      const repos = Math.max(s1.reposQuotidienMin, s2.reposQuotidienMin)
      for (const a of parSalarie.get(s1.id) ?? []) {
        for (const b of parSalarie.get(s2.id) ?? []) {
          const [premier, second] = a.debut <= b.debut ? [a, b] : [b, a]
          const qui = second === b ? s2.id : s1.id
          if (second.debut < premier.fin) {
            erreurs.push({
              salarieId: qui,
              regle: 'CHEVAUCHEMENT',
              message: 'chevauche un service de son autre contrat',
              creneaux: [a.id, b.id],
              nature: 'loi',
            })
          } else if (second.debut - premier.fin < repos) {
            erreurs.push({
              salarieId: qui,
              regle: 'R-REPOS-QUOTIDIEN',
              message: `seulement ${h(second.debut - premier.fin)} de repos après un service de son autre contrat (minimum ${h(repos)})`,
              creneaux: [a.id, b.id],
              nature: 'loi',
            })
          }
        }
      }
    }
  }
  return erreurs
}

/** Le créneau tel qu'il est fait en journée courte : fin avancée. */
export function enVersionCourte(c: Creneau): Creneau {
  return { ...c, fin: c.fin - c.raccourci, raccourci: 0 }
}

export function violations(
  p: Probleme,
  affectations: AffectationSolveur[],
): Violation[] {
  const creneaux = new Map(p.creneaux.map((c) => [c.id, c]))
  const salaries = new Map(p.salaries.map((s) => [s.id, s]))
  const erreurs: Violation[] = []
  const parSalarie = new Map<string, Creneau[]>()
  for (const a of affectations) {
    const c = creneaux.get(a.creneauId)
    const s = salaries.get(a.salarieId)
    if (!c || !s) continue
    parSalarie.set(s.id, [
      ...(parSalarie.get(s.id) ?? []),
      a.court ? enVersionCourte(c) : c,
    ])
  }
  // Une place se compte avec ses remplaçants (`c.place ?? c.id`) : un
  // titulaire en M6 sur la place d'un M3 la tient, et l'effectif plus les
  // renforts de la place bornent le tout.
  const parPlace = autonomesParPlace(p, affectations)
  for (const [place, n] of parPlace) {
    const c = creneaux.get(place)
    // Un remplaçant dont la place est inconnue n'a droit à personne.
    const limite = c ? c.effectif + c.facultatif : 0
    if (n > limite) {
      erreurs.push({
        salarieId: null,
        regle: 'SUREFFECTIF',
        message: `${n}/${limite}`,
        creneaux: [place],
        nature: 'loi',
      })
    }
  }
  const parPersonne = new Map<string, SalarieSolveur[]>()
  for (const s of p.salaries) {
    erreurs.push(...violationsSalarie(s, parSalarie.get(s.id) ?? [], p.nbJours))
    if (s.personne !== null) {
      parPersonne.set(s.personne, [...(parPersonne.get(s.personne) ?? []), s])
    }
  }
  for (const fiches of parPersonne.values()) {
    erreurs.push(...entreFiches(fiches, parSalarie))
  }
  erreurs.push(...soutiensSeuls(p, affectations))
  return erreurs
}

/** Un profil « soutien » a toujours un collègue autonome sur le même poste. */
export function soutiensSeuls(
  p: Probleme,
  affectations: AffectationSolveur[],
): Violation[] {
  const creneaux = new Map(p.creneaux.map((c) => [c.id, c]))
  const salaries = new Map(p.salaries.map((s) => [s.id, s]))
  const presents: Array<[SalarieSolveur, Creneau]> = []
  for (const a of affectations) {
    const s = salaries.get(a.salarieId)
    const c = creneaux.get(a.creneauId)
    if (s && c) presents.push([s, c])
  }
  const erreurs: Violation[] = []
  for (const [s, c] of presents) {
    if (role(s, c.poste) !== 'soutien') continue
    const accompagne = presents.some(
      ([autre, d]) =>
        autre.id !== s.id &&
        (role(autre, d.poste) === 'titulaire' ||
          role(autre, d.poste) === 'occasionnel') &&
        d.poste === c.poste &&
        d.debut < c.fin &&
        c.debut < d.fin,
    )
    if (!accompagne) {
      erreurs.push({
        salarieId: s.id,
        regle: 'SOUTIEN-SEUL',
        message: 'en soutien sur ce poste : ne peut pas être seul',
        creneaux: [c.id],
        nature: 'organisation',
      })
    }
  }
  return erreurs
}

/** Personnes autonomes (pas les profils « soutien ») par PLACE : une
 * affectation sur un remplaçant `r…` compte pour le besoin `b…` qu'il sert
 * (`c.place ?? c.id`, contrat de la vague 1 §4). */
export function autonomesParPlace(
  p: Probleme,
  affectations: AffectationSolveur[],
): Map<string, number> {
  const salaries = new Map(p.salaries.map((s) => [s.id, s]))
  const creneaux = new Map(p.creneaux.map((c) => [c.id, c]))
  const compte = new Map<string, number>()
  for (const a of affectations) {
    const s = salaries.get(a.salarieId)
    const c = creneaux.get(a.creneauId)
    if (s && c && role(s, c.poste) !== 'soutien') {
      const place = c.place ?? c.id
      compte.set(place, (compte.get(place) ?? 0) + 1)
    }
  }
  return compte
}

/** Places restées vides, par place (les profils « soutien » ne comptent pas,
 * un remplaçant compte pour la place qu'il sert et n'a jamais d'entrée à
 * lui). */
export function manquants(
  p: Probleme,
  affectations: AffectationSolveur[],
): Map<string, number> {
  const compte = autonomesParPlace(p, affectations)
  const r = new Map<string, number>()
  for (const c of p.creneaux) {
    if (c.place !== null) continue
    const n = compte.get(c.id) ?? 0
    if (n < c.effectif) r.set(c.id, c.effectif - n)
  }
  return r
}

// ------------------------------------------ présences : trous et consignes

/** Affectations faites, épinglées comprises (`p.imposees`, version courte
 * selon `p.courtes`), une seule fois par (salarié, créneau) : les shifts
 * posés comptent même si l'appelant ne passe que les propositions. */
function affectationsCompletes(
  p: Probleme,
  affectations: AffectationSolveur[],
): AffectationSolveur[] {
  const vues = new Map<string, AffectationSolveur>()
  for (const a of affectations) {
    const k = cle(a.salarieId, a.creneauId)
    if (!vues.has(k)) vues.set(k, a)
  }
  for (const k of p.imposees) {
    if (vues.has(k)) continue
    const i = k.indexOf('|')
    vues.set(k, {
      salarieId: k.slice(0, i),
      creneauId: k.slice(i + 1),
      court: p.courtes.has(k),
    })
  }
  return [...vues.values()]
}

/** Moment d'un poste sans personne autonome (étape 6). */
export interface Trou {
  poste: string
  /** Jour du planning des besoins qui fixent la plage (`jourDe`). */
  jour: number
  /** Minutes réelles depuis le lundi, fin exclue. */
  debut: number
  fin: number
}

/** Trous entre deux équipes (contrat de la vague 1 §3, `trousDuJour`) : pour
 * chaque poste qui compte dans la présence et chaque jour, les quarts d'heure
 * sans personne autonome entre le début du premier besoin et la fin du
 * dernier. Besoins : les créneaux `b…` (ni posés hors besoins, ni
 * remplaçants) d'au moins une personne nécessaire, rangés au jour où ils
 * sont écrits. Présences : toutes les affectations du poste, quel que soit
 * leur jour (remplaçants, shifts posés et épinglés compris), version courte
 * appliquée. `postes` : par défaut `postesAPresence`. */
export function trous(
  p: Probleme,
  affectations: AffectationSolveur[],
  postes: ReadonlySet<string> = postesAPresence(p.creneaux),
): Trou[] {
  const creneaux = new Map(p.creneaux.map((c) => [c.id, c]))
  const salaries = new Map(p.salaries.map((s) => [s.id, s]))
  const presences = new Map<string, PresencePoste[]>()
  for (const a of affectationsCompletes(p, affectations)) {
    const c = creneaux.get(a.creneauId)
    const s = salaries.get(a.salarieId)
    if (!c || !s || !postes.has(c.poste)) continue
    const fait = a.court ? enVersionCourte(c) : c
    presences.set(c.poste, [
      ...(presences.get(c.poste) ?? []),
      {
        debut: fait.debut,
        fin: fait.fin,
        autonome: role(s, c.poste) !== 'soutien',
      },
    ])
  }
  const besoins = new Map<
    string,
    { poste: string; jour: number; liste: Creneau[] }
  >()
  for (const c of p.creneaux) {
    if (c.ferme || c.place !== null || c.effectif <= 0) continue
    if (!postes.has(c.poste)) continue
    const k = `${c.poste}|${jourDe(c)}`
    const g = besoins.get(k) ?? { poste: c.poste, jour: jourDe(c), liste: [] }
    g.liste.push(c)
    besoins.set(k, g)
  }
  const r: Trou[] = []
  for (const { poste, jour, liste } of besoins.values()) {
    for (const t of trousDuJour(liste, presences.get(poste) ?? [])) {
      r.push({ poste, jour, debut: t.debut, fin: t.fin })
    }
  }
  return r.sort(
    (a, b) =>
      a.debut - b.debut ||
      a.jour - b.jour ||
      (a.poste < b.poste ? -1 : a.poste > b.poste ? 1 : 0),
  )
}

/** Une consigne de présence et ce que le planning en fait. */
export interface EcartPresence {
  jour: number
  periode: PeriodePresence
  compte: number
  minimum: number
  maximum: number | null
  /** < 0 : il manque du monde ; > 0 : du monde en plus ; 0 : conforme. */
  ecart: number
}

/** Recompte des consignes de présence (matin, soir, nuit), sans le
 * générateur : personnes autonomes DISTINCTES posées ce jour (`jourDe`) sur
 * un créneau qui compte dans cette période (`Creneau.presence`, posé par
 * l'assemblage : le middle n'y compte jamais, D11 ; la nuit sur un poste qui
 * a des codes de nuit, D15). Remplaçants, shifts posés et épinglés compris.
 * Une ligne par consigne, dans l'ordre de `p.consignes`. */
export function presenceParCycle(
  p: Probleme,
  affectations: AffectationSolveur[],
): EcartPresence[] {
  const creneaux = new Map(p.creneaux.map((c) => [c.id, c]))
  const salaries = new Map(p.salaries.map((s) => [s.id, s]))
  const presents = new Map<string, Set<string>>()
  for (const a of affectationsCompletes(p, affectations)) {
    const c = creneaux.get(a.creneauId)
    const s = salaries.get(a.salarieId)
    if (!c || !s || c.presence === null) continue
    if (role(s, c.poste) === 'soutien') continue
    const k = `${jourDe(c)}|${c.presence}`
    presents.set(k, (presents.get(k) ?? new Set<string>()).add(s.id))
  }
  return p.consignes.map((k) => {
    const compte = presents.get(`${k.jour}|${k.periode}`)?.size ?? 0
    let ecart = 0
    if (compte < k.minimum) ecart = compte - k.minimum
    else if (k.maximum !== null && compte > k.maximum)
      ecart = compte - k.maximum
    return {
      jour: k.jour,
      periode: k.periode,
      compte,
      minimum: k.minimum,
      maximum: k.maximum,
      ecart,
    }
  })
}

/** Pour un créneau vide : pourquoi chaque salarié qui tient ce poste ne peut
 * pas le prendre. Sans raison listée : il le pourrait, au prix d'heures hors
 * contrat. */
export function raisonsBlocage(
  p: Probleme,
  affectations: AffectationSolveur[],
  creneauId: string,
): Map<string, Violation[]> {
  const creneaux = new Map(p.creneaux.map((c) => [c.id, c]))
  const cible = creneaux.get(creneauId)
  const raisons = new Map<string, Violation[]>()
  if (!cible) return raisons
  for (const s of p.salaries) {
    const r = role(s, cible.poste)
    if (r !== 'titulaire' && r !== 'occasionnel') continue
    const siens = affectations
      .filter((a) => a.salarieId === s.id)
      .map((a) => creneaux.get(a.creneauId))
      .filter((c): c is Creneau => c !== undefined)
    if (siens.includes(cible)) continue
    const avant = new Set(
      violationsSalarie(s, siens, p.nbJours).map(
        (v) => `${v.regle}|${v.message}`,
      ),
    )
    const apres = violationsSalarie(s, [...siens, cible], p.nbJours)
    let liste = apres.filter((v) => !avant.has(`${v.regle}|${v.message}`))
    if (s.placementManuel && liste.length === 0) {
      liste = [
        {
          salarieId: s.id,
          regle: 'EXTRA',
          message: 'extra disponible : à appeler et poser à la main',
          creneaux: [cible.id],
          nature: 'organisation',
        },
      ]
    }
    raisons.set(s.id, liste)
  }
  return raisons
}
