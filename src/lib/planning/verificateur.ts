/*
 * Contrôle indépendant d'un planning : recompte chaque règle SANS le solveur
 * (prototype `solveur/verificateur.py`). Oracle des tests, explication des
 * trous, contrôle en direct d'un planning retouché à la main. Chaque
 * violation porte l'identifiant de sa règle et les créneaux en cause.
 */

import {
  nuitDeLaVeille,
  POSTE_ACCUEIL,
  postesAPresence,
  trousAccueilDuJour,
  trousDuJour,
} from '#/lib/planning/cycles.ts'
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
          // Sous le minimum de la CONVENTION HCR, mais permis par la loi
          // tant que chaque semaine garde ses 35 h et 6 jours au plus
          // (jusqu'à 12 jours d'affilée sur deux semaines) : une alerte, pas
          // une infraction (décision utilisateur du 2026-10-31 : « possible
          // à la main avec une alerte »). Le générateur ne le choisit jamais.
          ajoute(
            'R-REPOS-HEBDO-HCR',
            `${travailles.size + autre} jours travaillés sur deux semaines (avec la semaine ${nom}) : sous le minimum de la convention HCR (${s.reposDeuxSemaines} jours de repos), permis par la loi`,
            semaine,
            'organisation',
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
    // R-JOURNEE-ETOILE (décisions utilisateur du 2026-11-02) : la journée
    // étoile est un horaire de moins de 8 h ; fixée un jour, ce jour-là n'a
    // pas d'horaire de 8 h ; au plus `journeesCourtesMax` dans la semaine.
    const courtes = semaine.filter((c) => travail(c) < s.journeePleine)
    for (const c of semaine) {
      if (s.etoileFixe.has(jourDe(c)) && travail(c) >= s.journeePleine) {
        ajoute(
          'R-JOURNEE-ETOILE',
          `sa journée étoile est fixée ce jour-là : un horaire de moins de ${h(s.journeePleine)}`,
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
        `${courtes.length} journées de moins de ${h(s.journeePleine)} dans la semaine, une seule journée étoile prévue au contrat`,
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
    parSalarie.set(s.id, [...(parSalarie.get(s.id) ?? []), c])
  }
  // Une place se compte avec ses remplaçants (`c.place ?? c.id`) : un
  // titulaire en 08:00–16:45 sur la place d'un 07:00–15:45 la tient, et l'effectif plus les
  // renforts de la place bornent le tout.
  const parPlace = autonomesParPlace(p, affectations)
  for (const [place, n] of parPlace) {
    const c = creneaux.get(place)
    // Un candidat de l'accueil n'a pas de place : son nombre se lit contre
    // le chiffre du moment (`presenceParCycle`), pas ici (2026-11-01).
    if (c?.accueil) continue
    // Un remplaçant dont la place est inconnue n'a droit à personne.
    const limite = c ? c.effectif + c.facultatif : 0
    if (n > limite) {
      erreurs.push({
        salarieId: null,
        regle: 'SUREFFECTIF',
        message: `${n} personne${n > 1 ? 's' : ''} pour ${limite ? `${limite} place${limite > 1 ? 's' : ''}` : 'aucune place'} : ${n - limite} de trop`,
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

/** Affectations faites, épinglées comprises (`p.imposees`), une seule fois
 * par (salarié, créneau) : les shifts posés comptent même si l'appelant ne
 * passe que les propositions. */
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
    vues.set(k, { salarieId: k.slice(0, i), creneauId: k.slice(i + 1) })
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
 * leur jour (remplaçants, versions étoile, shifts posés et épinglés compris),
 * sur leurs vraies heures. `postes` : par défaut `postesAPresence` et l'accueil entier
 * (`POSTE_ACCUEIL`, `trousAccueil`) ; une liste donnée ne voit l'accueil que
 * si elle contient `POSTE_ACCUEIL`. */
export function trous(
  p: Probleme,
  affectations: AffectationSolveur[],
  postes: ReadonlySet<string> = new Set([
    ...postesAPresence(p.creneaux),
    POSTE_ACCUEIL,
  ]),
): Trou[] {
  const creneaux = new Map(p.creneaux.map((c) => [c.id, c]))
  const salaries = new Map(p.salaries.map((s) => [s.id, s]))
  const presences = new Map<string, PresencePoste[]>()
  for (const a of affectationsCompletes(p, affectations)) {
    const c = creneaux.get(a.creneauId)
    const s = salaries.get(a.salarieId)
    if (!c || !s || !postes.has(c.poste) || c.accueil) continue
    presences.set(c.poste, [
      ...(presences.get(c.poste) ?? []),
      {
        debut: c.debut,
        fin: c.fin,
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
  if (postes.has(POSTE_ACCUEIL)) r.push(...trousAccueil(p, affectations))
  return r.sort(
    (a, b) =>
      a.debut - b.debut ||
      a.jour - b.jour ||
      (a.poste < b.poste ? -1 : a.poste > b.poste ? 1 : 0),
  )
}

/** Trous de l'ACCUEIL ENTIER (D15 du 2026-11-01, plan
 * planning-accueil-2026-11-01) : Réception et Club ensemble, un jour, du
 * premier au dernier moment demandé (chiffre > 0, matin et soir), plage lue
 * sur les candidats de l'accueil écrits ce jour (`trousAccueilDuJour`, la
 * définition de `cycles.ts`). Présences : TOUTES les affectations des postes
 * de ces candidats (shifts posés, épinglés et candidats, quel que soit leur
 * jour), un soutien jamais autonome. Recompté ici
 * sans rien du générateur ; le poste du trou est `POSTE_ACCUEIL`. */
export function trousAccueil(
  p: Probleme,
  affectations: AffectationSolveur[],
): Trou[] {
  const candidats = p.creneaux.filter((c) => c.accueil)
  if (!candidats.length) return []
  const postes = new Set(candidats.map((c) => c.poste))
  const nuitDemandee = (j: number) =>
    p.consignes.some(
      (k) => k.jour === j && k.periode === 'nuit' && k.minimum > 0,
    )
  const creneaux = new Map(p.creneaux.map((c) => [c.id, c]))
  const salaries = new Map(p.salaries.map((s) => [s.id, s]))
  const presences: PresencePoste[] = []
  for (const a of affectationsCompletes(p, affectations)) {
    const c = creneaux.get(a.creneauId)
    const s = salaries.get(a.salarieId)
    if (!c || !s || !postes.has(c.poste)) continue
    presences.push({
      debut: c.debut,
      fin: c.fin,
      autonome: role(s, c.poste) !== 'soutien',
    })
  }
  const r: Trou[] = []
  const jours = [...new Set(candidats.map(jourDe))].sort((a, b) => a - b)
  for (const jour of jours) {
    const demandes = new Set(
      p.consignes
        .filter((k) => k.jour === jour && k.minimum > 0)
        .map((k) => k.periode),
    )
    for (const t of trousAccueilDuJour(
      candidats.filter((c) => jourDe(c) === jour),
      demandes,
      presences,
      nuitDeLaVeille(candidats, jourDe, jour, nuitDemandee),
    ))
      r.push({ poste: POSTE_ACCUEIL, jour, debut: t.debut, fin: t.fin })
  }
  return r
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
 * générateur : AFFECTATIONS posées ce jour (`jourDe`) sur un créneau qui
 * compte dans cette période (`Creneau.presence`, une LISTE posée par
 * l'assemblage, `momentsAccueil`). Révisé le 2026-11-01 (plan
 * planning-accueil-2026-11-01, étape 4) : un middle de l'accueil compte dans
 * ses deux moments (D11), les soutiens comptent (D5), les extras aussi (D7),
 * et l'écart se lit contre le chiffre EXACT `minimum` (D3, D9 : un maximum
 * différent est ignoré), dans les DEUX sens (manque < 0, surplus > 0).
 * Remplaçants, shifts posés et épinglés compris.
 * Une affectation = une présence, comme le moteur (une variable par
 * affectation) et `analyser` (`bilanPresence`, un shift = un) : une même
 * personne sur deux shifts du même cycle compte deux fois partout (cas
 * qu'une autre règle signale déjà : un service par jour). Une ligne par
 * consigne, dans l'ordre de `p.consignes`. */
export function presenceParCycle(
  p: Probleme,
  affectations: AffectationSolveur[],
): EcartPresence[] {
  const creneaux = new Map(p.creneaux.map((c) => [c.id, c]))
  const salaries = new Map(p.salaries.map((s) => [s.id, s]))
  const presents = new Map<string, number>()
  for (const a of affectationsCompletes(p, affectations)) {
    const c = creneaux.get(a.creneauId)
    const s = salaries.get(a.salarieId)
    if (!c || !s) continue
    for (const moment of c.presence) {
      const k = `${jourDe(c)}|${moment}`
      presents.set(k, (presents.get(k) ?? 0) + 1)
    }
  }
  return p.consignes.map((k) => {
    const compte = presents.get(`${k.jour}|${k.periode}`) ?? 0
    const ecart = compte - Math.max(0, k.minimum)
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

/** Un moment de l'accueil qui n'a pas son chiffre exact (D3) : il manque du
 * monde (`ACCUEIL-MANQUE`) ou il y en a trop (`ACCUEIL-SURPLUS`, D8 : permis
 * en dernier recours pour des heures dues, toujours signalé). Organisation,
 * jamais la loi ; hors de `violations` (un manque reste possible quand
 * personne ne peut venir). `creneaux` : les créneaux tenus qui comptent dans
 * ce moment. */
export function violationsAccueil(
  p: Probleme,
  affectations: AffectationSolveur[],
): Violation[] {
  const creneaux = new Map(p.creneaux.map((c) => [c.id, c]))
  const tenus = affectationsCompletes(p, affectations)
    .map((a) => creneaux.get(a.creneauId))
    .filter((c): c is Creneau => c !== undefined)
  const r: Violation[] = []
  for (const x of presenceParCycle(p, affectations)) {
    if (x.ecart === 0) continue
    const n = Math.max(0, x.minimum)
    const ids = tenus
      .filter((c) => jourDe(c) === x.jour && c.presence.includes(x.periode))
      .map((c) => c.id)
    r.push({
      salarieId: null,
      regle: x.ecart < 0 ? 'ACCUEIL-MANQUE' : 'ACCUEIL-SURPLUS',
      message:
        x.ecart < 0
          ? `${x.compte} pour ${n} : il manque ${-x.ecart}`
          : `${x.compte} pour ${n} : ${x.ecart} de plus`,
      creneaux: [...new Set(ids)],
      nature: 'organisation',
    })
  }
  return r
}

/** Pour un moment de l'accueil incomplet (plan planning-accueil-2026-11-01,
 * D7) : pourquoi chaque personne AUTONOME qui tient un poste de ces
 * candidats (titulaire, dépannage, extra compris : l'app les place sur
 * l'accueil) ne peut prendre AUCUN d'eux. Pour chacun, la liste la plus
 * courte de règles nouvelles parmi les candidats de ses postes (vide : elle
 * pourrait venir) ; à égalité, le premier candidat. Un soutien n'est pas
 * listé (il ne vient jamais seul, D5), ni celui qui tient déjà l'un de ces
 * candidats. Aucun « à appeler » : sur l'accueil, un extra libre est
 * simplement libre. */
export function raisonsBlocageAccueil(
  p: Probleme,
  affectations: AffectationSolveur[],
  candidatIds: readonly string[],
): Map<string, Violation[]> {
  const creneaux = new Map(p.creneaux.map((c) => [c.id, c]))
  const cibles = candidatIds
    .map((id) => creneaux.get(id))
    .filter((c): c is Creneau => c !== undefined)
  const raisons = new Map<string, Violation[]>()
  for (const s of p.salaries) {
    const siens = affectations
      .filter((a) => a.salarieId === s.id)
      .map((a) => creneaux.get(a.creneauId))
      .filter((c): c is Creneau => c !== undefined)
    const avant = new Set(
      violationsSalarie(s, siens, p.nbJours).map(
        (v) => `${v.regle}|${v.message}`,
      ),
    )
    // Déjà compté dans ce moment : ce n'est pas lui qui manque.
    if (cibles.some((c) => siens.includes(c))) continue
    let meilleure: Violation[] | null = null
    for (const cible of cibles) {
      const r = role(s, cible.poste)
      if (r !== 'titulaire' && r !== 'occasionnel') continue
      const liste = violationsSalarie(s, [...siens, cible], p.nbJours).filter(
        (v) => !avant.has(`${v.regle}|${v.message}`),
      )
      if (meilleure === null || liste.length < meilleure.length)
        meilleure = liste
      if (!liste.length) break
    }
    if (meilleure !== null) raisons.set(s.id, meilleure)
  }
  return raisons
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

// ------------------------------------------- ouverture et relève (2026-11-01)

/** Ouvertures sans personne : pour chaque `p.ouvertures` (la première heure
 * d'un poste de l'accueil), les morceaux où personne d'autonome n'est sur CE
 * poste. Recompté ici, sans rien du générateur. */
export function ouverturesManquees(
  p: Probleme,
  affectations: AffectationSolveur[],
): Trou[] {
  if (!p.ouvertures?.length) return []
  const creneaux = new Map(p.creneaux.map((c) => [c.id, c]))
  const salaries = new Map(p.salaries.map((s) => [s.id, s]))
  const parPoste = new Map<string, PresencePoste[]>()
  for (const a of affectationsCompletes(p, affectations)) {
    const c = creneaux.get(a.creneauId)
    const s = salaries.get(a.salarieId)
    if (!c || !s) continue
    parPoste.set(c.poste, [
      ...(parPoste.get(c.poste) ?? []),
      {
        debut: c.debut,
        fin: c.fin,
        autonome: role(s, c.poste) !== 'soutien',
      },
    ])
  }
  const r: Trou[] = []
  for (const o of p.ouvertures)
    for (const t of trousDuJour(
      [{ debut: o.debut, fin: o.fin }],
      parPoste.get(o.poste) ?? [],
    ))
      r.push({ poste: o.poste, jour: o.jour, debut: t.debut, fin: t.fin })
  return r
}

/** Jours sans relève : le matin et le soir demandés, des horaires du matin et
 * du soir de l'accueil du jour qui PEUVENT se chevaucher `p.releveMinutes`,
 * et pourtant jamais une personne autonome d'un horaire du matin et une d'un
 * horaire du soir ensemble aussi longtemps, d'affilée, au quart d'heure. */
export function relevesManquantes(
  p: Probleme,
  affectations: AffectationSolveur[],
): number[] {
  const duree = p.releveMinutes ?? 0
  if (duree <= 0) return []
  const Q = 15
  const k = Math.ceil(duree / Q)
  const creneaux = new Map(p.creneaux.map((c) => [c.id, c]))
  const salaries = new Map(p.salaries.map((s) => [s.id, s]))
  const postesJour = new Set(
    p.creneaux
      .filter((c) => c.accueil && !c.presence.includes('nuit'))
      .map((c) => c.poste),
  )
  const pur = (c: Creneau, moment: 'matin' | 'soir') =>
    c.presence.length === 1 && c.presence[0] === moment
  const demande = (j: number, periode: 'matin' | 'soir') =>
    p.consignes.some(
      (c) => c.jour === j && c.periode === periode && c.minimum > 0,
    )
  const faits = affectationsCompletes(p, affectations).flatMap((a) => {
    const c = creneaux.get(a.creneauId)
    const s = salaries.get(a.salarieId)
    if (!c || !s || !postesJour.has(c.poste)) return []
    if (role(s, c.poste) === 'soutien') return []
    return [{ c, fait: c }]
  })
  const r: number[] = []
  for (let jour = 0; jour < p.nbJours; jour++) {
    if (!demande(jour, 'matin') || !demande(jour, 'soir')) continue
    const duJour = p.creneaux.filter(
      (c) => postesJour.has(c.poste) && jourDe(c) === jour,
    )
    const matins = duJour.filter((c) => pur(c, 'matin'))
    const soirs = duJour.filter((c) => pur(c, 'soir'))
    if (!matins.length || !soirs.length) continue
    const debut = Math.ceil(Math.min(...soirs.map((c) => c.debut)) / Q) * Q
    const fin = Math.max(...matins.map((c) => c.fin))
    const quarts: number[] = []
    for (let a = debut; a + Q <= fin; a += Q) quarts.push(a)
    if (quarts.length * Q < duree) continue
    const ensemble = quarts.map((a) => {
      const la = (moment: 'matin' | 'soir') =>
        faits.some(
          ({ c, fait }) =>
            jourDe(c) === jour &&
            pur(c, moment) &&
            fait.debut <= a &&
            fait.fin >= a + Q,
        )
      return la('matin') && la('soir')
    })
    let suite = 0
    let ok = false
    for (const e of ensemble) {
      suite = e ? suite + 1 : 0
      if (suite >= k) ok = true
    }
    if (!ok) r.push(jour)
  }
  return r
}
