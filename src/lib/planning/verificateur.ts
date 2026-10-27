/*
 * Contrôle indépendant d'un planning : recompte chaque règle SANS le solveur
 * (prototype `solveur/verificateur.py`). Oracle des tests, explication des
 * trous, contrôle en direct d'un planning retouché à la main. Chaque
 * violation porte l'identifiant de sa règle et les créneaux en cause.
 */

import {
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
    if (s.shiftsAutorises.size && !s.shiftsAutorises.has(c.typeShift ?? '')) {
      ajoute(
        'HORAIRE-PERSO',
        'cet horaire ne fait pas partie des siens',
        [c],
        'organisation',
      )
    }
    const imposes = new Set(
      s.shiftImpose.filter(([jour]) => jour === j).map(([, code]) => code),
    )
    if (imposes.size && !imposes.has(c.typeShift ?? '')) {
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
    const total = semaine.reduce((t, c) => t + travail(c), 0)
    if (total > s.minutesHebdoMax) {
      ajoute(
        'R-SEMAINE-MAX',
        `${h(total)} dans la semaine, maximum ${h(s.minutesHebdoMax)}`,
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
  const parCreneau = new Map<string, number>()
  const parSalarie = new Map<string, Creneau[]>()
  for (const a of affectations) {
    const c = creneaux.get(a.creneauId)
    const s = salaries.get(a.salarieId)
    if (!c || !s) continue
    if (role(s, c.poste) !== 'soutien') {
      parCreneau.set(c.id, (parCreneau.get(c.id) ?? 0) + 1)
    }
    parSalarie.set(s.id, [
      ...(parSalarie.get(s.id) ?? []),
      a.court ? enVersionCourte(c) : c,
    ])
  }
  for (const c of p.creneaux) {
    const n = parCreneau.get(c.id) ?? 0
    if (n > c.effectif + c.facultatif) {
      erreurs.push({
        salarieId: null,
        regle: 'SUREFFECTIF',
        message: `${n}/${c.effectif + c.facultatif}`,
        creneaux: [c.id],
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

/** Places restées vides, par créneau (les profils « soutien » ne comptent pas). */
export function manquants(
  p: Probleme,
  affectations: AffectationSolveur[],
): Map<string, number> {
  const salaries = new Map(p.salaries.map((s) => [s.id, s]))
  const postes = new Map(p.creneaux.map((c) => [c.id, c.poste]))
  const compte = new Map<string, number>()
  for (const a of affectations) {
    const s = salaries.get(a.salarieId)
    const poste = postes.get(a.creneauId)
    if (s && poste !== undefined && role(s, poste) !== 'soutien') {
      compte.set(a.creneauId, (compte.get(a.creneauId) ?? 0) + 1)
    }
  }
  const r = new Map<string, number>()
  for (const c of p.creneaux) {
    const n = compte.get(c.id) ?? 0
    if (n < c.effectif) r.set(c.id, c.effectif - n)
  }
  return r
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
