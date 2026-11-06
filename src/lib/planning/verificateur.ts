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
import { posteDeZone } from '#/lib/planning/cycles.ts'
import type { PresencePoste } from '#/lib/planning/cycles.ts'
import { ecartConsigne } from '#/lib/planning/presence.ts'
import { vuesZones, zoneDuCreneau } from '#/lib/planning/zones.ts'

import {
  dernierMoment,
  estNuit,
  momentsDeJour,
  momentsDe,
  motMoment,
  pairesDeJour,
  premierMoment,
  rangMoment,
} from '#/lib/planning/moment.ts'
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
  autonomeSur,
  jamaisSeulSur,
  niveauAccepte,
  niveauSur,
  referentSur,
  role,
  soutienSur,
  toucheLaNuit,
  journeeDe,
  travail,
} from '#/lib/planning/modele.ts'
import type {
  AffectationSolveur,
  Creneau,
  Probleme,
  SalarieSolveur,
} from '#/lib/planning/modele.ts'
import {
  jourIsoleDe,
  rythmeHumain,
  apresContrat,
} from '#/lib/planning/regles.ts'
import {
  jourVeilleWeekend,
  REGLES_PAR_DEFAUT,
} from '#/lib/planning/reglesEtablissement.ts'
import type { RegleEtablissement } from '#/lib/planning/reglesEtablissement.ts'
import { heuresLisibles as h } from '#/lib/planning/temps.ts'
import type { Periode, PeriodePresence } from '#/lib/planning/types.ts'

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
  /** Pour juger une place (`raisonsBlocage`) : le jour isolé d'un contrat
   * de 35 h et plus est dit même dans une semaine de moins de 3 jours, que
   * le calcul refuse aussi. À l'écran d'une semaine, non : un planning en
   * cours de saisie en serait plein. */
  pourUnePlace = false,
  /** Règles de l'établissement (`Probleme.regles`) ; défaut : l'hôtel. */
  R: RegleEtablissement = REGLES_PAR_DEFAUT,
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

  // JOURS-AFFILES (2026-11-02) : plus de 6 jours de travail d'affilée,
  // semaines voisines comprises. Permis par la loi : une alerte.
  {
    const travaille = (d: number) =>
      d < 0
        ? d >= -s.serieAvant
        : d >= nbJours
          ? d < nbJours + s.serieApres
          : parJour.has(d) || s.joursHorsSite.has(d)
    let d = -s.serieAvant
    while (d < nbJours + s.serieApres) {
      if (!travaille(d)) {
        d++
        continue
      }
      let f = d
      while (f + 1 < nbJours + s.serieApres && travaille(f + 1)) f++
      const n = f - d + 1
      const ici = liste.filter((c) => jourDe(c) >= d && jourDe(c) <= f)
      const uneSemaine = d >= 0 && Math.floor(d / 7) === Math.floor(f / 7)
      // Depuis le 2026-11-04, 5 au plus pour un contrat de 35 h et plus (le
      // calcul ne va plus au-delà, `rythmeHumain`), 6 sinon.
      const humain = rythmeHumain(s, R)
      const plafond = humain
        ? R.repos.joursAffilesConseilles
        : R.repos.joursAffilesMax
      // Dans une semaine, 6 jours se disent aussi pour un 35 h (le calcul ne
      // les fait plus) ; les autres ont le 6e jour et R-SIX-JOURS-MAX.
      const dansSemaineCompte = humain
      if (n > plafond && ici.length && (dansSemaineCompte || !uneSemaine))
        ajoute(
          'JOURS-AFFILES',
          `${n} jours de travail d'affilée sans repos (au plus ${plafond} conseillés)`,
          ici,
          'organisation',
        )
      d = f + 1
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
    const courtes = semaine.filter((c) => journeeDe(c) < s.journeePleine)
    for (const c of semaine) {
      // Un JFR à placer peut faire sauter la journée étoile (le générateur
      // permet alors un 8 h ce jour-là, `compatible`) : rien à signaler.
      if (
        s.etoileFixe.has(jourDe(c)) &&
        journeeDe(c) >= s.journeePleine &&
        !s.jfr
      ) {
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
    // Les journées du calcul (2026-11-04) : ce que le calcul refuse de
    // poser, dit pour juger une place. À l'écran, un shift posé à la main
    // hors de ces journées est permis : rien n'est signalé.
    if (pourUnePlace && s.journeesCalcul !== null) {
      const permises = s.journeesCalcul
      for (const c of semaine) {
        if (permises.has(journeeDe(c))) continue
        ajoute(
          'JOURNEE-TYPE',
          `horaire de ${h(journeeDe(c))} : le calcul ne pose que des journées de ${[
            ...permises,
          ]
            .sort((a, b) => b - a)
            .map(h)
            .join(' et de ')}`,
          [c],
          'organisation',
        )
      }
      // Comme le plafond du générateur : le surplus d'un shift plus long que
      // la plus longue journée permise s'ajoute aux heures dues.
      const longue = Math.max(...permises)
      const faites = semaine.reduce((t, c) => t + journeeDe(c), 0)
      const surplus = semaine.reduce(
        (t, c) => t + Math.max(0, journeeDe(c) - longue),
        0,
      )
      if (faites > s.minutesHebdoContrat + surplus) {
        ajoute(
          'HEURES-FAITES',
          `dépasserait ses ${h(s.minutesHebdoContrat)} de la semaine`,
          semaine,
          'organisation',
        )
      }
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
  // MINEUR-FERIE : permis en hôtellerie par dérogation, à éviter.
  for (const c of liste)
    if (s.feriesEvites.has(jourDe(c)))
      ajoute(
        'MINEUR-FERIE',
        'mineur : travaille un jour férié (permis en hôtellerie, à éviter)',
        [c],
        'organisation',
      )
  // R-FERIE-RATTRAPE : un jour férié travaillé reste à rattraper tant
  // qu'aucun JFR n'est posé pour lui (`feriesARattraper`, solde calculé par
  // la semaine). Organisation, jamais bloquant.
  for (const f of s.feriesARattraper) {
    ajoute(
      'JOUR-FERIE',
      `jour férié du ${f.slice(8, 10)}/${f.slice(5, 7)} travaillé : à rattraper`,
      [],
      'organisation',
    )
  }
  alertesMorales(
    s,
    liste,
    parJour,
    nbJours,
    (regle, message, creneaux) =>
      ajoute(regle, message, creneaux, 'organisation'),
    pourUnePlace,
    R,
  )
  return erreurs
}

/** JOUR-ISOLE : le message dit si le calcul l'interdit (contrat de 35 h et
 * plus, `rythmeHumain`, 2026-11-04 : une place reste vide pour lui) ou si
 * ce n'est qu'un conseil (petit contrat). */
export const JOUR_ISOLE_INTERDIT =
  'un jour de travail seul entre deux jours sans travail'
export const JOUR_ISOLE_A_EVITER =
  'un jour de travail seul entre deux jours sans travail (à éviter)'
/** REPOS-SEPARES quand la règle de l'établissement n'est que souhaitée
 * (`repos.deuxReposDeSuite`) : un conseil, jamais une raison qui bloque. */
export const REPOS_SEPARES_SOUHAITE = ' (souhaité)'

/** Ce qui distingue deux violations pour savoir ce qu'une place ajoute :
 * la règle et le message, et pour un jour isolé le jour lui-même (un jour
 * isolé déjà posé ne doit pas cacher celui que la place créerait :
 * relecture du 2026-11-04). */
/** Règles dites par créneau : deux occurrences ne se confondent pas (un
 * shift posé à la main ne cache pas la raison de la place). */
const PAR_CRENEAUX = new Set(['JOUR-ISOLE', 'JOURNEE-TYPE', 'HEURES-FAITES'])

function cleViolation(v: Violation): string {
  return PAR_CRENEAUX.has(v.regle)
    ? `${v.regle}|${v.message}|${[...v.creneaux].sort().join(',')}`
    : `${v.regle}|${v.message}`
}

/** Une violation qui bloque une place malgré sa nature morale : deux repos
 * de suite, et le jour isolé d'un contrat de 35 h et plus (2026-11-04). */
export function moraleQuiBloque(v: {
  regle: string
  message: string
}): boolean {
  return (
    (v.regle === 'REPOS-SEPARES' &&
      !v.message.endsWith(REPOS_SEPARES_SOUHAITE)) ||
    (v.regle === 'JOUR-ISOLE' && v.message === JOUR_ISOLE_INTERDIT)
  )
}

/** Les alertes des règles morales du PRD (`alertesMorales`) : toujours
 * d'organisation, jamais une infraction. */
export const REGLES_MORALES: ReadonlySet<string> = new Set([
  'REPOS-SEPARES',
  'JOUR-ISOLE',
  'REPOS-COURT',
  'WEEKEND-LIBRE',
  'MOMENTS',
  'NUITS',
  'MEMES-REPOS',
  'HEURES-PLUS',
  'RETOUR-CONGE',
  'ECOLE-ABORDS',
])

/**
 * Règles morales du PRD (`plan/planning-bonnes-pratiques/PRD.md`, partie 4)
 * : des alertes d'ORGANISATION, jamais bloquantes. Le calcul les évite
 * (`generateur.ts`, règles morales) ; quand il ne peut pas faire autrement,
 * ou quand un shift est posé à la main, l'alerte le dit. Recompté ici sans
 * rien du générateur. `liste` est triée par début.
 */
function alertesMorales(
  s: SalarieSolveur,
  liste: Creneau[],
  parJour: Map<number, Creneau[]>,
  nbJours: number,
  ajoute: (regle: string, message: string, creneaux: Creneau[]) => void,
  pourUnePlace: boolean,
  R: RegleEtablissement,
): void {
  if (!liste.length) return
  const REPOS_CONFORT = R.repos.reposConfort
  const NUITS_AFFILEES_MAX = R.repos.nuitsAffileesMax
  const REPOS_APRES_NUITS = R.repos.reposApresNuits
  const travaille = (d: number) => parJour.has(d) || s.joursHorsSite.has(d)
  const nbSemaines = Math.ceil(nbJours / 7)

  // Règle 3 : moins de 12 h entre deux services (sous 11 h : la loi, plus
  // haut).
  const court = (ecart: number) =>
    ecart >= s.reposQuotidienMin && ecart < REPOS_CONFORT
  const conseil = `${h(REPOS_CONFORT)} conseillées`
  const courts: Creneau[] = []
  if (s.finServicePrecedent !== null) {
    const ecart = liste[0].debut - s.finServicePrecedent
    if (court(ecart)) {
      courts.push(liste[0])
      ajoute(
        'REPOS-COURT',
        `seulement ${h(ecart)} de repos depuis son dernier service de la semaine précédente (${conseil})`,
        [liste[0]],
      )
    }
  }
  for (let i = 0; i + 1 < liste.length; i++) {
    const ecart = liste[i + 1].debut - liste[i].fin
    if (court(ecart)) {
      courts.push(liste[i + 1])
      ajoute(
        'REPOS-COURT',
        `seulement ${h(ecart)} de repos entre deux services (${conseil})`,
        [liste[i], liste[i + 1]],
      )
    }
  }
  if (s.debutServiceSuivant !== null) {
    const dernier = liste[liste.length - 1]
    const ecart = s.debutServiceSuivant - dernier.fin
    if (court(ecart))
      ajoute(
        'REPOS-COURT',
        `seulement ${h(ecart)} de repos avant son premier service de la semaine suivante (${conseil})`,
        [dernier],
      )
  }

  // Règle 14 : les abords d'un jour d'école.
  for (const c of liste) {
    const j = jourDe(c)
    const fin = s.finAvantEcole.get(j)
    if (fin !== undefined && c.fin > fin)
      ajoute(
        'ECOLE-ABORDS',
        `finit après ${h(R.ecole.veilleFin)} la veille d'un jour d'école`,
        [c],
      )
    const debut = s.debutApresEcole.get(j)
    if (debut !== undefined && c.debut < debut)
      ajoute(
        'ECOLE-ABORDS',
        `commence avant ${h(R.ecole.lendemainDebut)} le lendemain d'un jour d'école`,
        [c],
      )
  }

  // Règle 7 : les nuits, semaine d'avant comprise.
  const nuit = (d: number) =>
    d < 0
      ? s.nuitsAvant.has(d)
      : (parJour.get(d) ?? []).some((c) => estNuit(R.moments, c.moment))
  {
    let d = -7
    while (d < nbJours) {
      if (!nuit(d)) {
        d++
        continue
      }
      let f = d
      while (f + 1 < nbJours && nuit(f + 1)) f++
      const ici = liste.filter((c) => jourDe(c) >= d && jourDe(c) <= f)
      if (f - d + 1 > NUITS_AFFILEES_MAX && ici.length)
        ajoute(
          'NUITS',
          `${f - d + 1} nuits d'affilée (au plus ${NUITS_AFFILEES_MAX} conseillées)`,
          ici,
        )
      d = f + 1
    }
  }
  for (const c of liste) {
    const k = jourDe(c)
    if (estNuit(R.moments, c.moment)) continue
    let apres = false
    for (let d = k - REPOS_APRES_NUITS; d < k; d++) if (nuit(d)) apres = true
    if (apres)
      ajoute(
        'NUITS',
        `reprend de jour moins de ${REPOS_APRES_NUITS} jours après une nuit (${REPOS_APRES_NUITS} jours de repos conseillés)`,
        [c],
      )
  }

  // Règle 9 : un jour de travail seul entre deux jours sans travail, de la
  // même personne, semaines voisines comprises (relecture du 2026-11-03 :
  // le calcul ne l'évite que contre un jour où le travail est impossible,
  // l'alerte le dit partout). L'école, un jour hors contrat et une semaine
  // voisine inconnue comptent comme du travail. Une semaine de moins de 3
  // jours (petit contrat, extra) a forcément des jours seuls : rien n'est
  // dit, SAUF pour un contrat de 35 h et plus (`rythmeHumain`), à qui le
  // calcul l'interdit toujours depuis le 2026-11-04 : la place qui reste
  // vide doit le dire (`pourUnePlace`). Pour les autres, l'alerte reste un
  // conseil (message `JOUR_ISOLE_A_EVITER`), jamais une raison qui bloque
  // une place.
  const isole = jourIsoleDe(s, R)
  if (!s.placementManuel && !s.contratIndicatif && isole !== 'aucune') {
    const dur = isole === 'interdit'
    const toujours = dur && pourUnePlace
    const parSemaine = (d: number) =>
      intervalle(7 * Math.floor(d / 7), 7 * Math.floor(d / 7) + 7).filter(
        (j) => j < nbJours && travaille(j),
      ).length
    // Pour un contrat de 35 h et plus, le jour isolé se lit comme le calcul
    // le lit : après le contrat, du travail ; avant l'arrivée, du repos.
    // Pour les autres, un jour hors contrat compte comme du travail (comme
    // avant le 2026-11-04).
    const libre = (d: number): boolean => {
      if (dur ? apresContrat(s, d) : false) return false
      if (d < 0) return s.joursSemainePrecedente !== null && d < -s.serieAvant
      if (d >= nbJours)
        return s.joursSemaineSuivante !== null && d >= nbJours + s.serieApres
      return !travaille(d) && (dur || !s.horsContrat.has(d))
    }
    for (const [d, duJour] of [...parJour].sort(([a], [b]) => a - b))
      if ((toujours || parSemaine(d) >= 3) && libre(d - 1) && libre(d + 1))
        ajoute(
          'JOUR-ISOLE',
          dur ? JOUR_ISOLE_INTERDIT : JOUR_ISOLE_A_EVITER,
          duJour,
        )
  }

  for (let k = 0; k < nbSemaines; k++) {
    const jours = intervalle(7 * k, Math.min(7 * k + 7, nbJours))
    const semaine = liste.filter((c) => jours.includes(jourDe(c)))
    if (!semaine.length) continue
    const premiere = k === 0
    const complete = jours.length === 7

    // Règle 1 : deux repos qui se suivent. Depuis le 2026-11-04 (règle de
    // l'hôtel, que le calcul ne sacrifie plus, `POIDS_REPOS_SEPARES`) : une
    // semaine d'un seul repos (6 jours) n'a pas sa paire non plus, et le
    // dimanche et le lundi d'à côté font la paire quand ce jour voisin est
    // connu libre (un rythme du mardi au samedi). Avant (relecture du
    // 2026-11-03), seule la semaine comptait. Même définition que le
    // générateur. Une semaine type qui fixe deux repos ou plus a décidé
    // elle-même : rien n'est dit.
    if (
      R.repos.deuxReposDeSuite !== 'aucune' &&
      !s.placementManuel &&
      !s.reposConsecutifs &&
      s.reposFixes.size < 2 &&
      complete
    ) {
      const libres = jours.filter((j) => !travaille(j))
      const voisinLibre = (d: number) =>
        d < 0
          ? s.joursSemainePrecedente !== null && s.serieAvant === 0
          : d >= nbJours
            ? s.joursSemaineSuivante !== null && s.serieApres === 0
            : !travaille(d)
      const colles =
        jours.slice(0, -1).some((j) => !travaille(j) && !travaille(j + 1)) ||
        (!travaille(jours[0]) && voisinLibre(jours[0] - 1)) ||
        (!travaille(jours[6]) && voisinLibre(jours[6] + 1))
      // Sept jours : la loi le dit déjà (R-SIX-JOURS-MAX).
      if (libres.length && !colles)
        ajoute(
          'REPOS-SEPARES',
          (libres.length >= 2
            ? 'ses jours de repos de la semaine ne se suivent pas'
            : 'pas deux jours de repos de suite dans la semaine') +
            (R.repos.deuxReposDeSuite === 'souhaite'
              ? REPOS_SEPARES_SOUHAITE
              : ''),
          semaine,
        )
    }

    // Règle 4 : un week-end complet libre sur 4 semaines. Les jours du
    // week-end et sa veille sont ceux de l'établissement (2026-11-06).
    const WE = R.equite.weekendJours
    const veille = jourVeilleWeekend(R)
    const duWeekend = (c: Creneau) =>
      WE.includes(jourDe(c)) ||
      (jourDe(c) === veille && estNuit(R.moments, c.moment))
    if (
      premiere &&
      complete &&
      s.weekendLibreAvant === false &&
      // La nuit du vendredi au samedi rend le week-end travaillé
      // (2026-11-03), comme celle du dimanche (Q15).
      (WE.some((j) => travaille(j)) || semaine.some(duWeekend))
    )
      ajoute(
        'WEEKEND-LIBRE',
        'aucun week-end complet libre depuis 4 semaines',
        semaine.filter(duWeekend),
      )

    // Règle 6 : une semaine stable.
    const avecMoment = semaine.filter((c) => c.moment !== null)
    let changements = 0
    let arriere: [Creneau, Creneau] | null = null
    for (let i = 1; i < avecMoment.length; i++) {
      const a = avecMoment[i - 1]
      const b = avecMoment[i]
      // D'un jour au suivant (après un repos, l'horloge repart).
      if (jourDe(b) - jourDe(a) === 1 && a.moment !== b.moment) changements++
    }
    for (let i = 1; i < avecMoment.length && !arriere; i++)
      for (let j = 0; j < i; j++) {
        const a = avecMoment[j]
        const b = avecMoment[i]
        if (
          jourDe(b) - jourDe(a) <= R.repos.momentArriereJours &&
          rangMoment(R.moments, a.moment as Periode) >
            rangMoment(R.moments, b.moment as Periode)
        ) {
          arriere = [a, b]
          break
        }
      }
    if (changements > R.repos.changementsMomentMax)
      ajoute(
        'MOMENTS',
        `${changements} changements de moment dans la semaine (${R.repos.changementsMomentMax} au plus conseillé)`,
        avecMoment,
      )
    if (arriere)
      ajoute(
        'MOMENTS',
        `revient du ${motMoment(R.moments, arriere[0].moment as Periode)} au ${motMoment(R.moments, arriere[1].moment as Periode)} ${jourDe(arriere[1]) - jourDe(arriere[0]) === 1 ? 'le lendemain' : `${jourDe(arriere[1]) - jourDe(arriere[0])} jours après`} (plutôt du ${motMoment(R.moments, premierMoment(R.moments) ?? '')} vers le ${motMoment(R.moments, dernierMoment(R.moments) ?? '')})`,
        arriere,
      )

    // Règle 8 : les mêmes repos que la semaine d'avant. Après un week-end
    // travaillé, des repos passés au samedi et dimanche ne se reprochent
    // pas : c'est la rotation des week-ends (règle 10).
    if (
      premiere &&
      s.reposAvant.size &&
      !(
        s.weekendTravailleAvant &&
        complete &&
        WE.every((j) => !travaille(jours[j]))
      )
    ) {
      const repris = [...s.reposAvant].filter((j) => parJour.has(j))
      if (repris.length === s.reposAvant.size)
        ajoute(
          'MEMES-REPOS',
          'ne garde aucun de ses jours de repos de la semaine précédente',
          semaine.filter((c) => repris.includes(jourDe(c))),
        )
    }

    // Règle 12 : les heures en plus partagées.
    if (premiere && !s.contratIndicatif) {
      // Les heures dues ont déjà l'école en moins (`heuresDues`).
      const total = semaine.reduce((t, c) => t + travail(c), 0)
      const avant = s.equiteAvant.semainesEnPlus ?? 0
      if (
        total > s.minutesHebdoContrat &&
        avant + 1 >= R.heures.semainesEnPlusAlerte
      )
        ajoute(
          'HEURES-PLUS',
          `au-delà de son contrat ${avant + 1} semaines sur ${R.equite.semaines} : les heures en plus se partagent`,
          semaine,
        )
    }

    // Règle 13 : un retour de congé en douceur.
    if (premiere && s.retourConge !== null) {
      const r = s.retourConge
      const nb = jours.filter(travaille).length
      if (nb > s.joursPreferesSemaine)
        ajoute(
          'RETOUR-CONGE',
          `${nb} jours travaillés la semaine du retour de congé`,
          semaine,
        )
      const courtIci = courts.filter((c) => jourDe(c) >= r)
      if (courtIci.length)
        ajoute(
          'RETOUR-CONGE',
          `repos de moins de ${h(REPOS_CONFORT)} la semaine du retour de congé`,
          courtIci,
        )
      const reprise = semaine.find((c) => jourDe(c) >= r)
      if (reprise && WE.includes(jourDe(reprise)))
        ajoute('RETOUR-CONGE', 'reprend un week-end après son congé', [reprise])
    }
  }
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
    erreurs.push(
      ...violationsSalarie(
        s,
        parSalarie.get(s.id) ?? [],
        p.nbJours,
        false,
        p.regles,
      ),
    )
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
    // Un niveau « jamais seul » (D9 : le soutien), accompagné d'une personne
    // autonome qui ne l'est pas.
    if (!jamaisSeulSur(s, c.poste)) continue
    const accompagne = presents.some(
      ([autre, d]) =>
        autre.id !== s.id &&
        referentSur(autre, d.poste) &&
        d.poste === c.poste &&
        d.debut < c.fin &&
        c.debut < d.fin,
    )
    if (!accompagne) {
      const n = niveauSur(s, c.poste)
      erreurs.push({
        salarieId: s.id,
        regle: 'SOUTIEN-SEUL',
        message: n?.autonome
          ? `${n.nom} sur ce poste : ne peut pas être seul`
          : 'en soutien sur ce poste : ne peut pas être seul',
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
    if (s && c && !soutienSur(s, c.poste)) {
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
  // Nombre par niveau (2026-11-06) : jusqu'à chaque rang demandé, le
  // nombre cumulé contre les personnes de ce rang ou mieux ; le plus grand
  // écart est le nombre de places vides.
  const rangs = new Map<string, number[]>()
  if (p.creneaux.some((c) => c.paliers)) {
    const salaries = new Map(p.salaries.map((s) => [s.id, s]))
    const creneaux = new Map(p.creneaux.map((c) => [c.id, c]))
    for (const a of affectations) {
      const s = salaries.get(a.salarieId)
      const c = creneaux.get(a.creneauId)
      const n = s && c ? niveauSur(s, c.poste) : null
      if (!c || !n?.autonome) continue
      const place = c.place ?? c.id
      rangs.set(place, [...(rangs.get(place) ?? []), n.rang])
    }
  }
  for (const c of p.creneaux) {
    if (c.place !== null) continue
    const n = compte.get(c.id) ?? 0
    let vide = c.effectif - n
    for (const palier of c.paliers ?? []) {
      const tenus = (rangs.get(c.id) ?? []).filter((x) => x <= palier.rang)
      vide = Math.max(vide, palier.cumul - tenus.length)
    }
    if (vide > 0) r.set(c.id, vide)
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
    ...postesAPresence(p.creneaux, momentsDe(p)),
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
        autonome: !soutienSur(s, c.poste),
      },
    ])
  }
  const besoins = new Map<
    string,
    { poste: string; jour: number; liste: Creneau[] }
  >()
  for (const c of p.creneaux) {
    // Un besoin souhaité (2026-11-05) ne fait pas la plage du poste.
    if (c.ferme || c.place !== null || c.effectif <= 0 || c.souhaite) continue
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
  // Chaque zone tenue en continu (2026-11-06) : « accueil » pour la
  // première, « accueil:<zone> » pour une autre ; une liste qui contient
  // `POSTE_ACCUEIL` les voit toutes.
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
  const premiere = (p.regles ?? REGLES_PAR_DEFAUT).zones[0].id
  return vuesZones(p).flatMap((v) =>
    v.zone.continue
      ? trousUneZone(v.p, affectations, posteDeZone(v.zone.id, premiere))
      : [],
  )
}

function trousUneZone(
  p: Probleme,
  affectations: AffectationSolveur[],
  posteTrou: string,
): Trou[] {
  const candidats = p.creneaux.filter((c) => c.accueil)
  if (!candidats.length) return []
  const postes = new Set(candidats.map((c) => c.poste))
  const L = momentsDe(p)
  const nuitDemandee = (j: number) =>
    p.consignes.some(
      (k) => k.jour === j && estNuit(L, k.periode) && k.minimum > 0,
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
      autonome: !soutienSur(s, c.poste),
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
      nuitDeLaVeille(candidats, jourDe, jour, nuitDemandee, L),
      L,
    ))
      r.push({ poste: posteTrou, jour, debut: t.debut, fin: t.fin })
  }
  return r
}

/** Une consigne de présence et ce que le planning en fait. */
export interface EcartPresence {
  /** Zone du chiffre. */
  zone: string
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
  // Zone par zone (relecture du 2026-11-06 : le matin d'une zone comptait
  // celui d'une autre) ; un créneau sans zone est de la première.
  const premiere = (p.regles ?? REGLES_PAR_DEFAUT).zones[0].id
  for (const a of affectationsCompletes(p, affectations)) {
    const c = creneaux.get(a.creneauId)
    const s = salaries.get(a.salarieId)
    if (!c || !s) continue
    const zone = zoneDuCreneau(p, c) ?? premiere
    for (const moment of c.presence) {
      const k = `${zone}|${jourDe(c)}|${moment}`
      presents.set(k, (presents.get(k) ?? 0) + 1)
    }
  }
  return p.consignes.map((k) => {
    const compte =
      presents.get(`${k.zone ?? premiere}|${k.jour}|${k.periode}`) ?? 0
    // « Au moins … au plus … » comme le calcul : sans maximum (ou plus bas),
    // le chiffre est exact.
    const n = Math.max(0, k.minimum)
    const ecart = ecartConsigne(compte, n, Math.max(n, k.maximum ?? n))
    return {
      zone: k.zone ?? premiere,
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
  const premiere = (p.regles ?? REGLES_PAR_DEFAUT).zones[0].id
  for (const x of presenceParCycle(p, affectations)) {
    if (x.ecart === 0) continue
    // Le chiffre manqué : le minimum, ou le maximum dépassé.
    const n =
      x.ecart > 0
        ? Math.max(0, x.minimum, x.maximum ?? 0)
        : Math.max(0, x.minimum)
    const ids = tenus
      .filter(
        (c) =>
          jourDe(c) === x.jour &&
          c.presence.includes(x.periode) &&
          (zoneDuCreneau(p, c) ?? premiere) === x.zone,
      )
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
      violationsSalarie(s, siens, p.nbJours, true, p.regles).map((v) =>
        cleViolation(v),
      ),
    )
    // Déjà compté dans ce moment : ce n'est pas lui qui manque.
    if (cibles.some((c) => siens.includes(c))) continue
    let meilleure: Violation[] | null = null
    for (const cible of cibles) {
      if (!autonomeSur(s, cible.poste)) continue
      const liste = violationsSalarie(
        s,
        [...siens, cible],
        p.nbJours,
        true,
        p.regles,
      ).filter((v) => !avant.has(cleViolation(v)))
      if (meilleure === null || liste.length < meilleure.length)
        meilleure = liste
      if (!liste.length) break
    }
    // Un extra libre n'est jamais placé par le calcul (2026-11-03) : il
    // reste à appeler, comme sur une place (`raisonsBlocage`).
    if (meilleure !== null && s.placementManuel && meilleure.length === 0)
      meilleure = [
        {
          salarieId: s.id,
          regle: 'EXTRA',
          message: 'extra disponible : à appeler et poser à la main',
          creneaux: cibles.map((c) => c.id),
          nature: 'organisation',
        },
      ]
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
    const n = niveauSur(s, cible.poste)
    if (!n?.autonome) continue
    const siens = affectations
      .filter((a) => a.salarieId === s.id)
      .map((a) => creneaux.get(a.creneauId))
      .filter((c): c is Creneau => c !== undefined)
    if (siens.includes(cible)) continue
    // Niveau demandé (2026-11-05) : un niveau moins préféré ne tient
    // jamais la place, comme dans le calcul (`compatible`).
    if (!niveauAccepte(n, cible) && cible.niveauMax) {
      raisons.set(s.id, [
        {
          salarieId: s.id,
          regle: 'TITULAIRE-DEMANDE',
          message: `en ${n.nom.toLowerCase()} sur ce poste : la place demande un ${cible.niveauMax.nom.toLowerCase()}`,
          creneaux: [cible.id],
          nature: 'organisation',
        },
      ])
      continue
    }
    const avant = new Set(
      violationsSalarie(s, siens, p.nbJours, true, p.regles).map((v) =>
        cleViolation(v),
      ),
    )
    const apres = violationsSalarie(
      s,
      [...siens, cible],
      p.nbJours,
      true,
      p.regles,
    )
    let liste = apres.filter((v) => !avant.has(cleViolation(v)))
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

/** Ouvertures et fermetures sans personne : pour chaque `p.ouvertures` (la
 * première heure d'un poste de l'accueil) et chaque `p.fermetures` (sa
 * dernière heure, 2026-11-05), les morceaux où personne d'autonome n'est sur
 * CE poste. Recompté ici, sans rien du générateur. */
export function ouverturesManquees(
  p: Probleme,
  affectations: AffectationSolveur[],
): Trou[] {
  const bornes = [...(p.ouvertures ?? []), ...(p.fermetures ?? [])]
  if (!bornes.length) return []
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
        autonome: !soutienSur(s, c.poste),
      },
    ])
  }
  const r: Trou[] = []
  for (const o of bornes)
    for (const t of trousDuJour(
      [{ debut: o.debut, fin: o.fin }],
      parPoste.get(o.poste) ?? [],
    ))
      r.push({ poste: o.poste, jour: o.jour, debut: t.debut, fin: t.fin })
  return r
}

/** Une transmission d'une équipe de l'accueil à la suivante : `ok` quand
 * quelqu'un de l'équipe suivante est là avant que la précédente parte,
 * `manque` sinon, null quand une des deux équipes n'a personne ce jour-là. */
export type EtatTransmission = 'ok' | 'manque' | null

export interface Transmissions {
  jour: number
  /** Le veilleur de la nuit d'avant et le matin. */
  nuitMatin: EtatTransmission
  /** Le matin et le soir : la relève réglée (page Besoins). */
  matinSoir: EtatTransmission
  /** Le soir et le veilleur. */
  soirNuit: EtatTransmission
}

/**
 * Les transmissions de l'accueil, jour par jour (demande utilisateur du
 * 2026-11-02 : « un lien entre les points s'il y a quelqu'un pour faire les
 * transmissions »). Sur les vraies heures des shifts posés de l'accueil, sans
 * les soutiens. Matin et soir : la relève de `relevesManquantes` quand elle
 * est réglée (le jour sans relève = `manque`), sinon le simple contact. Nuit :
 * le veilleur arrive avant que le dernier du soir parte, et le premier du
 * matin arrive avant que le veilleur parte. Le lundi, la nuit d'avant vient
 * de `veilleDuLundi` (les shifts de nuit du dimanche d'avant, en minutes de
 * cette semaine : la vue mois relie les jours d'une semaine à l'autre) ;
 * absente, null.
 */
export function transmissions(
  p: Probleme,
  affectations: AffectationSolveur[],
  sansReleve: readonly number[],
  veilleDuLundi: ReadonlyArray<
    Pick<Creneau, 'debut' | 'fin'> & { zone?: string }
  > = [],
): Transmissions[] {
  // Les liens du mois : toutes les zones tenues en continu (relecture du
  // 2026-11-06 : seule la première était lue). Un lien manque dès qu'il
  // manque dans une zone ; il tient s'il tient dans toutes celles qui en ont.
  const premiere = (p.regles ?? REGLES_PAR_DEFAUT).zones[0].id
  const parZone = vuesZones(p)
    .filter((v) => v.zone.continue)
    .map((v) =>
      transmissionsUneZone(
        v.p,
        affectations,
        sansReleve,
        veilleDuLundi.filter((x) => (x.zone ?? premiere) === v.zone.id),
      ),
    )
  if (!parZone.length) return []
  const pire = (a: EtatTransmission, b: EtatTransmission): EtatTransmission =>
    a === 'manque' || b === 'manque' ? 'manque' : (a ?? b)
  return parZone[0].map((t, i) =>
    parZone.slice(1).reduce(
      (acc, z) => ({
        jour: acc.jour,
        nuitMatin: pire(acc.nuitMatin, z[i].nuitMatin),
        matinSoir: pire(acc.matinSoir, z[i].matinSoir),
        soirNuit: pire(acc.soirNuit, z[i].soirNuit),
      }),
      t,
    ),
  )
}

function transmissionsUneZone(
  p: Probleme,
  affectations: AffectationSolveur[],
  sansReleve: readonly number[],
  veilleDuLundi: ReadonlyArray<Pick<Creneau, 'debut' | 'fin'>> = [],
): Transmissions[] {
  const creneaux = new Map(p.creneaux.map((c) => [c.id, c]))
  const salaries = new Map(p.salaries.map((s) => [s.id, s]))
  // Les postes de l'accueil se lisent sur ses candidats (comme
  // `relevesManquantes`) : un shift posé n'en porte pas la marque.
  const postesAccueil = new Set(
    p.creneaux.filter((c) => c.accueil).map((c) => c.poste),
  )
  const faits = affectationsCompletes(p, affectations).flatMap((a) => {
    const c = creneaux.get(a.creneauId)
    const s = salaries.get(a.salarieId)
    if (!c || !s || !postesAccueil.has(c.poste)) return []
    if (soutienSur(s, c.poste)) return []
    return [c]
  })
  // Le premier moment de jour reprend la nuit, le dernier la lui passe (à
  // l'hôtel : le matin et le soir).
  const L = momentsDe(p)
  const premier = premierMoment(L)
  const dernier = dernierMoment(L)
  const deNuit = (c: Creneau) => c.presence.some((q) => estNuit(L, q))
  const de = (jour: number, moment: string | null) =>
    moment === null
      ? []
      : faits.filter((c) => jourDe(c) === jour && c.presence.includes(moment))
  const nuitsDe = (jour: number) =>
    faits.filter((c) => jourDe(c) === jour && deNuit(c))
  const contact = (
    avant: ReadonlyArray<Pick<Creneau, 'debut' | 'fin'>>,
    apres: Creneau[],
  ): EtatTransmission =>
    !avant.length || !apres.length
      ? null
      : Math.max(...avant.map((c) => c.fin)) >=
          Math.min(...apres.map((c) => c.debut))
        ? 'ok'
        : 'manque'
  const r: Transmissions[] = []
  for (let jour = 0; jour < p.nbJours; jour++) {
    const matins = de(jour, premier).filter((c) => !deNuit(c))
    const soirs = de(jour, dernier).filter((c) => !deNuit(c))
    const nuits = nuitsDe(jour)
    const veille = jour > 0 ? nuitsDe(jour - 1) : veilleDuLundi
    let matinSoir = contact(matins, soirs)
    if (matinSoir && sansReleve.includes(jour)) matinSoir = 'manque'
    // Sans passation avec le veilleur (règle de l'établissement) : rien à
    // dire de la nuit.
    const veilleur = (p.regles ?? REGLES_PAR_DEFAUT).passations
      .passationVeilleur
    r.push({
      jour,
      nuitMatin: veilleur ? contact(veille, matins) : null,
      matinSoir,
      soirNuit: veilleur ? contact(soirs, nuits) : null,
    })
  }
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
  // Zone par zone (2026-11-06) ; un jour n'est dit qu'une fois.
  const r: number[] = []
  for (const v of vuesZones(p))
    for (const j of relevesUneZone(v.p, affectations))
      if (!r.includes(j)) r.push(j)
  return r.sort((a, b) => a - b)
}

function relevesUneZone(
  p: Probleme,
  affectations: AffectationSolveur[],
): number[] {
  const duree = p.releveMinutes ?? 0
  if (duree <= 0) return []
  const Q = 15
  const k = Math.ceil(duree / Q)
  const creneaux = new Map(p.creneaux.map((c) => [c.id, c]))
  const salaries = new Map(p.salaries.map((s) => [s.id, s]))
  const L = momentsDe(p)
  const postesJour = new Set(
    p.creneaux
      .filter((c) => c.accueil && !c.presence.some((q) => estNuit(L, q)))
      .map((c) => c.poste),
  )
  const pur = (c: Creneau, moment: string) =>
    c.presence.length === 1 && c.presence[0] === moment
  const demande = (j: number, periode: string) =>
    p.consignes.some(
      (c) => c.jour === j && c.periode === periode && c.minimum > 0,
    )
  const faits = affectationsCompletes(p, affectations).flatMap((a) => {
    const c = creneaux.get(a.creneauId)
    const s = salaries.get(a.salarieId)
    if (!c || !s || !postesJour.has(c.poste)) return []
    if (soutienSur(s, c.poste)) return []
    return [{ c, fait: c }]
  })
  const r: number[] = []
  for (let jour = 0; jour < p.nbJours; jour++)
    for (const [avant, apres] of pairesDeJour(L)) {
      if (!demande(jour, avant) || !demande(jour, apres)) continue
      const duJour = p.creneaux.filter(
        (c) => postesJour.has(c.poste) && jourDe(c) === jour,
      )
      const matins = duJour.filter((c) => pur(c, avant))
      const soirs = duJour.filter((c) => pur(c, apres))
      if (!matins.length || !soirs.length) continue
      const debut = Math.ceil(Math.min(...soirs.map((c) => c.debut)) / Q) * Q
      const fin = Math.max(...matins.map((c) => c.fin))
      const quarts: number[] = []
      for (let a = debut; a + Q <= fin; a += Q) quarts.push(a)
      if (quarts.length * Q < duree) continue
      const ensemble = quarts.map((a) => {
        const la = (moment: string) =>
          faits.some(
            ({ c, fait }) =>
              jourDe(c) === jour &&
              pur(c, moment) &&
              fait.debut <= a &&
              fait.fin >= a + Q,
          )
        return la(avant) && la(apres)
      })
      let suite = 0
      let ok = false
      for (const e of ensemble) {
        suite = e ? suite + 1 : 0
        if (suite >= k) ok = true
      }
      if (!ok && !r.includes(jour)) r.push(jour)
    }
  return r
}

/** Une équipe de l'accueil désynchronisée un jour (règle 17 du PRD,
 * 2026-11-03) : heures réelles depuis le lundi. */
export interface EquipeDesynchro {
  jour: number
  /** Un moment de jour du tableau. */
  moment: string
  /** Arrivées étalées au-delà de `EQUIPE_TOLERANCE` : la première et la
   * dernière. */
  arrivees: { debut: number; fin: number } | null
  /** Soir seulement : départs étalés (l'une reste seule à la fin). */
  departs: { debut: number; fin: number } | null
  /** Soir seulement : personnes qui arrivent sans croiser une personne du
   * matin le temps de la relève, alors qu'un horaire du matin le permettait. */
  sansReleve: number
}

/**
 * Règle 17 du PRD (demande utilisateur du 2026-11-03 : « qu'ils restent
 * ensemble le maximum possible, à trente minutes près »). À l'accueil
 * (postes de l'accueil du jour, matin pur et soir pur, personnes
 * autonomes), une alerte par jour et par moment : des arrivées à plus de
 * `EQUIPE_TOLERANCE` les unes des autres (matin et soir), des départs du
 * soir à plus de `EQUIPE_TOLERANCE` les uns des autres, ou une personne du
 * soir qui ne croise personne du matin le temps de la relève (matin et
 * soir demandés, un horaire du matin qui le permettait). Recompté ici sans
 * rien du générateur.
 */
export function equipesDesynchro(
  p: Probleme,
  affectations: AffectationSolveur[],
): EquipeDesynchro[] {
  return vuesZones(p).flatMap((v) => equipesUneZone(v.p, affectations))
}

function equipesUneZone(
  p: Probleme,
  affectations: AffectationSolveur[],
): EquipeDesynchro[] {
  const R = p.releveMinutes ?? 0
  const EQUIPE_TOLERANCE = (p.regles ?? REGLES_PAR_DEFAUT).passations
    .equipeTolerance
  const creneaux = new Map(p.creneaux.map((c) => [c.id, c]))
  const salaries = new Map(p.salaries.map((s) => [s.id, s]))
  const L = momentsDe(p)
  const postesJour = new Set(
    p.creneaux
      .filter((c) => c.accueil && !c.presence.some((q) => estNuit(L, q)))
      .map((c) => c.poste),
  )
  const pur = (c: Creneau, moment: string) =>
    c.presence.length === 1 && c.presence[0] === moment
  const demande = (j: number, periode: string) =>
    p.consignes.some(
      (c) => c.jour === j && c.periode === periode && c.minimum > 0,
    )
  const faits = affectationsCompletes(p, affectations).flatMap((a) => {
    const c = creneaux.get(a.creneauId)
    const s = salaries.get(a.salarieId)
    if (!c || !s || !postesJour.has(c.poste)) return []
    if (soutienSur(s, c.poste)) return []
    return [c]
  })
  const jourDuTableau = momentsDeJour(L)
  const etendue = (heures: number[]) => {
    if (!heures.length) return null
    const debut = Math.min(...heures)
    const fin = Math.max(...heures)
    return fin - debut > EQUIPE_TOLERANCE ? { debut, fin } : null
  }
  const r: EquipeDesynchro[] = []
  // Le premier moment de jour (le matin) : ses arrivées seulement ; chaque
  // moment suivant (le soir) : arrivées, départs et relève avec celui
  // d'avant.
  for (let jour = 0; jour < p.nbJours; jour++) {
    const premier = jourDuTableau[0]
    if (premier === undefined) continue
    const matins0 = faits.filter((c) => jourDe(c) === jour && pur(c, premier))
    const arriveesMatin = etendue(matins0.map((c) => c.debut))
    if (arriveesMatin)
      r.push({
        jour,
        moment: premier,
        arrivees: arriveesMatin,
        departs: null,
        sansReleve: 0,
      })
    for (const [avant, apres] of pairesDeJour(L)) {
      const matins = faits.filter((c) => jourDe(c) === jour && pur(c, avant))
      const soirs = faits.filter((c) => jourDe(c) === jour && pur(c, apres))
      if (!soirs.length) continue
      let sansReleve = 0
      if (R > 0 && demande(jour, avant) && demande(jour, apres)) {
        const croise = (d: Creneau, c: Creneau) =>
          Math.min(d.fin, c.fin) - Math.max(d.debut, c.debut) >= R
        const possibles = p.creneaux.filter(
          (d) => postesJour.has(d.poste) && jourDe(d) === jour && pur(d, avant),
        )
        for (const c of soirs)
          if (
            possibles.some((d) => croise(d, c)) &&
            !matins.some((d) => croise(d, c))
          )
            sansReleve++
      }
      const arrivees = etendue(soirs.map((c) => c.debut))
      const departs = etendue(soirs.map((c) => c.fin))
      if (arrivees || departs || sansReleve)
        r.push({ jour, moment: apres, arrivees, departs, sansReleve })
    }
  }
  return r
}
