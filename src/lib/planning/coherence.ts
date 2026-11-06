/*
 * Contrôle de cohérence des réglages du planning (plan
 * `planning-coherence-2026-10-28`, étape 5, D4 = A, D12, D13, D14, D17).
 * L'app relit elle-même ses réglages et dit ce qui ne colle pas, en phrases
 * courtes, chaque point avec le réglage où le corriger. Rien n'empêche
 * d'enregistrer : seuls les points « bloquants » empêcheront de générer
 * (étape 7, boîte de génération).
 *
 * Aucune règle n'est réécrite ici : les horaires permis viennent de
 * `eligibilite.ts`, les besoins écartés de `besoinsValides` (`semaine.ts`),
 * la période d'un horaire de `presence.ts`, les heures de `modele.ts`.
 *
 * Écart d'heures : un poste est signalé quand les heures de contrat de ses
 * titulaires, comptées EN ENTIER même s'ils tiennent d'autres postes (borne
 * haute, donc jamais de fausse alerte), restent sous les heures que ses
 * besoins demandent de plus de `SEUIL_HEURES` (10 %). Le même calcul sur
 * tout l'hôtel donne un point global, montré seulement si aucun poste ne
 * l'est déjà. Un poste dont un titulaire a un contrat qui ne mesure pas ses
 * heures (forfait jours, extra, 0 h) n'est pas jugé.
 *
 * Correctifs de la relecture adverse (2026-10-29) : besoins tous écartés
 * distingués de « aucun besoin », besoin que personne ne peut tenir (fiche
 * ou semaine type), personne sans poste avec un horaire fixé.
 *
 * Cycles (plan `planning-cycles-2026-10-30`, étape 7) : la nuit compte sur
 * les postes qui ont un horaire de nuit (D15, `postesAvecNuit`) ; un minimum par
 * cycle sans aucun horaire de ce cycle sur les postes comptés est signalé ; un
 * besoin n'est « sans personne » que si personne ne peut tenir ni son horaire ni
 * un autre horaire du même cycle (`remplacantsDe`, D12).
 *
 * Tableau de l'accueil (plan planning-accueil-2026-11-01, étape 4) : les
 * besoins de l'accueil sont IGNORÉS par le moteur (D13, `besoinsDuMoteur`),
 * donc par ce contrôle aussi (heures, soutiens, besoins intenables…). Les
 * points « les besoins demandent N, il en faut au moins / au plus M » n'ont
 * plus d'objet et sont retirés. À leur place, pour chaque moment demandé :
 * « Mardi matin : il faut 3 personnes, mais seulement 2 peuvent venir à
 * l'accueil. » (personnes de l'équipe qui tiennent un poste de l'accueil, à
 * tout niveau, extras compris, dont la fiche et la semaine type permettent un
 * horaire de ce moment ; aucune si personne d'autonome ne le peut, un
 * apprenti ne venant jamais seul, D5) et « … aucun horaire du matin n'est
 * possible à l'accueil. » (aucun candidat, `candidatsAccueil`). La nuit ne
 * compte que la Veille de nuit (D10).
 */

import {
  demandeDe,
  estAutonome,
  estPrefere,
  estSoutien,
} from '#/lib/planning/niveaux.ts'
import {
  libelleHoraire,
  listeEt,
  listeOu,
  nomComplet,
} from '#/lib/planning/affichage.ts'
import {
  codeDeLaFiche,
  codeImposeRespecte,
  codePrevuAuPoste,
  codesDeLaFiche,
  codesDuPoste,
  codesImposes,
  codesPermis,
} from '#/lib/planning/eligibilite.ts'
import { travail } from '#/lib/planning/modele.ts'
import {
  contratEtoile,
  horairesEtoileDuJour,
  travailHoraire,
} from '#/lib/planning/etoile.ts'
import {
  estNuit,
  MOMENTS_HOTEL,
  momentPropose,
  momentsDuTableau,
  motMoment,
  pairesDeJour,
  rangAuTableau,
} from '#/lib/planning/moment.ts'
import type { Moments } from '#/lib/planning/moment.ts'
import { RELEVE_MINUTES } from '#/lib/planning/regles.ts'
import { seulementLaNuit, zoneDuPoste } from '#/lib/planning/zones.ts'
import {
  dureesImposees,
  journeesDuContrat,
  lireRegles,
  modeleDe,
} from '#/lib/planning/reglesEtablissement.ts'
import type { RegleEtablissement } from '#/lib/planning/reglesEtablissement.ts'
import { heuresLisibles, hhmm, minutes } from '#/lib/planning/temps.ts'
import {
  accueilActif,
  chiffreAccueil,
  estPosteAccueil,
  posteADesCodesDeNuit,
  sommeBesoinsPresence,
} from '#/lib/planning/presence.ts'
import {
  besoinsDuMoteur,
  besoinsValides,
  candidatsAccueil,
  contexte,
  creneauBesoin,
  remplacantsDe,
  versionsEtoileDe,
} from '#/lib/planning/semaine.ts'
import { JOURS } from '#/lib/planning/types.ts'
import type {
  Besoin,
  Horaire,
  PeriodePresence,
  Poste,
  Referentiel,
  Salarie,
} from '#/lib/planning/types.ts'

export type Gravite = 'bloquant' | 'a-voir'
export type EcranReglage = 'horaires' | 'postes' | 'equipe' | 'besoins'
export type PageReglage =
  | '/planning/horaires'
  | '/planning/postes'
  | '/planning/equipe'
  | '/planning/besoins'

/** Partie de la fiche d'une personne visée par un lien (son sommaire). */
export type PartieFiche =
  | 'identite'
  | 'ecole'
  | 'postes'
  | 'horaires'
  | 'semaine'
  | 'absences'
  | 'regles'

/** `salarie-<id>`, ou `salarie-<id>.<partie>` : la fiche s'ouvre sur cette
 * partie. */
export function cibleFiche(salarieId: number, partie?: PartieFiche): string {
  return partie ? `salarie-${salarieId}.${partie}` : `salarie-${salarieId}`
}

/** Où corriger : l'écran, et ce qu'il doit ouvrir (`?ouvrir=`). Cibles :
 * `horaire-<id>`, `poste-<id>`, `salarie-<id>` (`.partie` en plus pour
 * ouvrir la fiche sur une partie, `cibleFiche`), et sur Besoins
 * `poste-<id>`, `soutien-<id>` (le poste, réglage des apprentis) ou
 * `presence` (la vue par cycle) ; `regles` (Équipe : Règles des
 * contrats) et `moments` (Besoins : limites des moments). */
export interface LienReglage {
  page: PageReglage
  cible?: string
}

export interface PointReglage {
  /** Stable d'un calcul à l'autre (clé React, suivi d'un point). */
  id: string
  gravite: Gravite
  ecran: EcranReglage
  texte: string
  lien: LienReglage
}

export interface OptionsControle {
  /** Jour de référence (AAAA-MM-JJ) : une personne partie avant ne compte
   * plus. Sans lui, seules les fiches désactivées sont écartées. */
  aujourdhui?: string
}

/** Écart d'heures signalé au-delà de 10 % des heures demandées. */
export const SEUIL_HEURES = 0.1

/** Lundi sans changement d'heure : la semaine type n'a pas de date. */
const LUNDI_TYPE = '2026-01-05'

export const PAGE_ECRAN: Record<EcranReglage, PageReglage> = {
  horaires: '/planning/horaires',
  postes: '/planning/postes',
  equipe: '/planning/equipe',
  besoins: '/planning/besoins',
}

export const LIBELLE_ECRAN: Record<EcranReglage, string> = {
  horaires: 'Horaires et absences',
  postes: 'Postes',
  equipe: 'Équipe',
  besoins: 'Besoins',
}

/** Ordre de réglage : codes, postes, équipe, besoins. */
export const ORDRE_ECRANS: readonly EcranReglage[] = [
  'horaires',
  'postes',
  'equipe',
  'besoins',
]

const jour = (j: number) => JOURS[j].toLowerCase()
const majuscule = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

/** « lundi et mardi matin », « lundi soir », « la nuit de mardi ». */
export function momentDesJours(
  jours: Iterable<number>,
  periode: PeriodePresence,
  l: Moments = MOMENTS_HOTEL,
): string {
  const quand = listeJours(jours)
  const mot = motMoment(l, periode)
  return estNuit(l, periode) ? `la ${mot} de ${quand}` : `${quand} ${mot}`
}

/** « du matin », « de nuit » : le complément d'un horaire. */
export function duMoment(periode: PeriodePresence, l: Moments = MOMENTS_HOTEL) {
  return `${estNuit(l, periode) ? 'de' : 'du'} ${motMoment(l, periode)}`
}

/** « lundi », « lundi et mardi », « lundi, mardi et jeudi ». */
export function listeJours(jours: Iterable<number>): string {
  const l = [...new Set(jours)].sort((a, b) => a - b).map(jour)
  return l.length <= 1
    ? (l[0] ?? '')
    : `${l.slice(0, -1).join(', ')} et ${l.at(-1)}`
}

function heuresTexte(minutes: number): string {
  const h = Math.round(minutes / 6) / 10
  return `${String(h).replace('.', ',')} h`
}

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`

/** Une personne encore dans l'équipe. */
function presentDans(s: Salarie, aujourdhui?: string): boolean {
  if (!s.actif) return false
  return !aujourdhui || !s.date_sortie || s.date_sortie >= aujourdhui
}

/** Postes qui listent au moins un horaire de la famille nuit
 * (`posteADesCodesDeNuit`, un poste « Tous » n'en a pas) : la nuit n'est
 * comptée que là (D15). Même règle que le moteur (`semaine.ts`). */
export function postesAvecNuit(
  r: Pick<Referentiel, 'postes' | 'horaires'> &
    Partial<Pick<Referentiel, 'moments'>>,
): Set<number> {
  const l = lireRegles(r).moments
  return new Set(
    r.postes
      .filter((p) => posteADesCodesDeNuit(p, r.horaires, l))
      .map((p) => p.id),
  )
}

/** Postes comptés dans un cycle : cochés « présence » le matin et le soir,
 * ceux qui ont un horaire de nuit la nuit (D15). */
export function postesComptes(
  r: Pick<Referentiel, 'postes' | 'horaires'> &
    Partial<Pick<Referentiel, 'moments'>>,
  periode: PeriodePresence,
): Poste[] {
  if (!estNuit(lireRegles(r).moments, periode))
    return r.postes.filter((p) => zoneDuPoste(p) !== null)
  const nuit = postesAvecNuit(r)
  return r.postes.filter((p) => nuit.has(p.id))
}

/** Personnes nécessaires des besoins valides, par moment matin, soir et nuit
 * (`clePresence`) : la somme que `verifierReglages` compare aux consignes,
 * reprise par la vue Par cycle des Besoins. */
export function besoinsPresence(r: Referentiel): Map<string, number> {
  const ctx = contexte({
    lundi: LUNDI_TYPE,
    referentiel: r,
    absences: [],
    affectations: [],
    avant: [],
    apres: [],
  })
  return sommeBesoinsPresence(
    besoinsValides(ctx).valides,
    new Map(r.postes.map((p) => [p.id, p])),
    new Map(r.horaires.map((h) => [h.id, h])),
    postesAvecNuit(r),
    lireRegles(r).moments,
  )
}

/** Besoins que le moteur lit (ceux de l'accueil sont ignorés, D13) et qui
 * demandent au moins une personne autonome : ceux que compte « N besoins »
 * de Pour commencer, comme le point bloquant. */
export function besoinsDemandes(r: Referentiel): Besoin[] {
  const ctx = contexte({
    lundi: LUNDI_TYPE,
    referentiel: r,
    absences: [],
    affectations: [],
    avant: [],
    apres: [],
  })
  return besoinsDuMoteur(ctx).valides.filter((b) => b.effectif > 0)
}

/** Moments du tableau de l'accueil où quelqu'un est demandé (0 si le
 * tableau n'est pas en service). */
export function momentsAccueilDemandes(r: Referentiel): number {
  if (!accueilActif(r.postes)) return 0
  return r.consignes.filter((c) => chiffreAccueil(c) > 0).length
}

/** Son contrat ne mesure pas ses heures : forfait jours (décompte en
 * jours), heures indicatives d'après le modèle de son type de contrat
 * (l'extra, aux défauts), ou 0 h. Même règle que le moteur. */
const contratIndicatif = (s: Salarie, regles: RegleEtablissement) =>
  s.forfait_jours ||
  modeleDe(regles, s.type_contrat).contratIndicatif ||
  !(Number(s.heures_hebdo) > 0)

/** La personne peut-elle tenir ce besoin (poste, jour, code) d'après sa
 * fiche et sa semaine type ? Le poste est déjà vérifié par `besoinsValides`.
 * Un besoin sans horaire ne peut pas être tenu par une fiche qui restreint ses
 * codes (même règle que le moteur). */
function peutTenir(
  s: Salarie,
  b: Besoin,
  horaires: readonly Horaire[] = [],
  /** Règles de l'établissement : les versions étoile d'un horaire fixé. */
  regles?: RegleEtablissement,
): boolean {
  const jourType = s.semaine_type.at(b.jour)
  if (jourType?.mode === 'repos' || jourType?.mode === 'absence') return false
  const code = b.horaire_id === null ? null : String(b.horaire_id)
  const fiche = {
    shiftsAutorises: codesDeLaFiche(s),
    shiftImpose: codesImposes(s.semaine_type, horaires, regles),
  }
  return codeDeLaFiche(fiche, code) && codeImposeRespecte(fiche, b.jour, code)
}

/**
 * Relit les réglages et rend les points à vérifier, dans l'ordre des écrans
 * puis bloquants d'abord. Pur : même référentiel, mêmes points.
 */
export function verifierReglages(
  r: Referentiel,
  options: OptionsControle = {},
): PointReglage[] {
  const points: PointReglage[] = []
  // Les règles de l'établissement (journées, modèles de contrat).
  const regles = lireRegles(r)

  const ajouter = (
    id: string,
    gravite: Gravite,
    ecran: EcranReglage,
    texte: string,
    cible?: string,
    /** Écran où corriger, quand ce n'est pas celui du groupe. */
    page: PageReglage = PAGE_ECRAN[ecran],
  ) =>
    points.push({
      id,
      gravite,
      ecran,
      texte,
      lien: { page, ...(cible ? { cible } : {}) },
    })

  const horaires = new Map(r.horaires.map((h) => [h.id, h]))
  const postes = new Map(r.postes.map((p) => [p.id, p]))
  const equipe = r.salaries.filter((s) => presentDans(s, options.aujourdhui))
  const ctx = contexte({
    lundi: LUNDI_TYPE,
    referentiel: r,
    absences: [],
    affectations: [],
    avant: [],
    apres: [],
  })
  // Les trois niveaux fixes (`niveaux.ts`, 2026-11-06).
  const niv = regles.niveaux
  const autonome = (n: string) => estAutonome(niv, n)
  const prefere = (n: string) => estPrefere(niv, n)
  const soutienNiv = (n: string) => estSoutien(niv, n)
  const nomPrefere = niv.autonomes[0]?.nom ?? ''
  const nomsAutonomes = listeOu(niv.autonomes.map((n) => n.nom))
  const nomsSoutien = listeOu(
    niv.liste.filter((n) => !n.autonome).map((n) => n.nom),
  )
  // Les besoins que le moteur lit : ceux de l'accueil sont ignorés (D13).
  const { valides, alertes } = besoinsDuMoteur(ctx)
  const parId = new Map(ctx.besoins.map((b) => [b.id, b]))
  const demandes = valides.filter((b) => b.effectif > 0)
  const accueil = accueilActif(r.postes)
  const chiffres = accueil
    ? r.consignes.filter((c) => chiffreAccueil(c) > 0)
    : []
  const candidats = candidatsAccueil(ctx)

  // Qui tient quoi, parmi l'équipe actuelle.
  const tenants = (posteId: number, niveaux: (n: string) => boolean) =>
    equipe.filter((s) =>
      s.competences.some((c) => c.poste_id === posteId && niveaux(c.niveau)),
    )

  // ------------------------------------------------------------ bloquants
  if (!r.horaires.length) {
    ajouter(
      'bloquant:horaires',
      'bloquant',
      'horaires',
      "Aucun horaire. Créez d'abord les horaires de l'hôtel.",
    )
  }
  if (!r.postes.length) {
    ajouter(
      'bloquant:postes',
      'bloquant',
      'postes',
      "Aucun poste. Créez les postes de l'hôtel.",
    )
  }
  if (r.postes.length && !equipe.some((s) => s.competences.length)) {
    ajouter(
      'bloquant:equipe',
      'bloquant',
      'equipe',
      "Personne n'est placé sur un poste. Indiquez dans chaque fiche les postes tenus.",
    )
  }
  if (r.postes.length && !demandes.length && !chiffres.length) {
    // Des besoins existent peut-être, mais tous écartés par le moteur : le
    // dire, sinon « Aucun besoin » contredit ce que montre l'écran Besoins.
    const ecartes = alertes
      .map((a) => parId.get(a.besoin_id))
      .filter(
        (b): b is Besoin => !!b && b.effectif > 0 && postes.has(b.poste_id),
      )
    if (ecartes.length) {
      const parCode = ecartes.every(
        (b) => !codePrevuAuPoste(postes.get(b.poste_id)!, b.horaire_id),
      )
      const n = ecartes.length
      const raison = parCode
        ? n > 1
          ? 'leurs horaires ne sont plus prévus pour leur poste'
          : "son horaire n'est plus prévu pour son poste"
        : n > 1
          ? 'leurs horaires ne conviennent plus à leur poste'
          : 'son horaire ne convient plus à son poste'
      ajouter(
        'bloquant:besoins-ignores',
        'bloquant',
        'besoins',
        n > 1
          ? `Les ${n} besoins sont ignorés : ${raison}. Corrigez les besoins ou les horaires du poste.`
          : `Le seul besoin est ignoré : ${raison}. Corrigez-le ou changez les horaires du poste.`,
      )
    } else {
      ajouter(
        'bloquant:besoins',
        'bloquant',
        'besoins',
        accueil
          ? "Rien n'est demandé. Remplissez le tableau Accueil, puis les besoins des autres postes."
          : 'Aucun besoin. Indiquez combien de personnes il faut sur chaque poste.',
      )
    }
  }

  // ------------------------------------------------------------- horaires
  // Code sans période sur un poste qui compte dans la présence : il n'y est
  // jamais compté. « Utilisé » : demandé par un besoin du poste, ou coché
  // dans une liste « Seulement ceux-ci » du poste.
  for (const h of r.horaires) {
    if (h.periode !== null) continue
    const concernes = r.postes.filter(
      (p) =>
        zoneDuPoste(p) !== null &&
        (p.horaires_autorises.includes(h.id) ||
          valides.some((b) => b.poste_id === p.id && b.horaire_id === h.id)),
    )
    if (!concernes.length) continue
    ajouter(
      `periode:${h.id}`,
      'a-voir',
      'horaires',
      `L'horaire ${libelleHoraire(h)} n'a pas de moment (matin, soir ou nuit). Il ne compte pas dans le matin et le soir de ${listeEt(concernes.map((p) => p.nom))}.`,
      `horaire-${h.id}`,
    )
  }

  // --------------------------------------------------------------- postes
  // Besoins écartés en silence par le moteur, rassemblés par poste et code.
  const groupes = new Map<
    string,
    { poste?: Poste; horaire?: Horaire; besoin: Besoin; jours: number[] }
  >()
  for (const a of alertes) {
    const b = parId.get(a.besoin_id)
    if (!b) continue
    const poste = postes.get(b.poste_id)
    const sorte = !poste
      ? 'poste'
      : !codePrevuAuPoste(poste, b.horaire_id)
        ? 'code'
        : 'duree'
    const cle = `${sorte}:${b.poste_id}:${b.horaire_id ?? `${b.debut}-${b.fin}`}`
    const g = groupes.get(cle) ?? {
      poste,
      horaire: b.horaire_id !== null ? horaires.get(b.horaire_id) : undefined,
      besoin: b,
      jours: [],
    }
    g.jours.push(b.jour)
    groupes.set(cle, g)
  }
  for (const [cle, g] of groupes) {
    const libelle = g.horaire
      ? `l'horaire ${libelleHoraire(g.horaire)}`
      : `l'horaire ${libelleHoraire(g.besoin)}`
    const quand = listeJours(g.jours)
    if (!g.poste) continue // poste supprimé : ses besoins partent avec lui
    if (cle.startsWith('code:')) {
      ajouter(
        `besoin-code:${cle.slice(5)}`,
        'a-voir',
        'postes',
        `Le poste ${g.poste.nom} ne permet plus ${libelle}, mais des besoins le demandent (${quand}). Ces besoins sont ignorés.`,
        `poste-${g.poste.id}`,
      )
    } else {
      ajouter(
        `besoin-duree:${cle.slice(6)}`,
        'a-voir',
        'besoins',
        `Sur le poste ${g.poste.nom}, ${libelle} dure plus longtemps que la durée max d'un service sur ce poste (${quand}). Ces besoins sont ignorés.`,
        `poste-${g.poste.id}`,
      )
    }
  }

  // --------------------------------------------------------------- équipe
  for (const p of r.postes) {
    const besoinsPoste = demandes.filter((b) => b.poste_id === p.id)
    const autonomes = tenants(p.id, autonome)
    if (besoinsPoste.length && !autonomes.length) {
      ajouter(
        `sans-autonome:${p.id}`,
        'a-voir',
        'equipe',
        `Le poste ${p.nom} a des besoins, mais personne n'y a le niveau ${nomsAutonomes}.`,
        `poste-${p.id}`,
        PAGE_ECRAN.postes,
      )
    } else if (zoneDuPoste(p) !== null && !tenants(p.id, prefere).length) {
      ajouter(
        `presence-sans-titulaire:${p.id}`,
        'a-voir',
        'equipe',
        `Le poste ${p.nom} fait partie de l'accueil, mais personne n'y a le niveau ${nomPrefere}.`,
        `poste-${p.id}`,
        PAGE_ECRAN.postes,
      )
    }
  }

  // Besoin que personne ne peut tenir : le poste a des autonomes, mais
  // aucun n'a cet horaire permis ce jour-là (fiche, semaine type), ni une
  // version étoile (`versionsEtoileDe`), ni un autre code du même cycle que
  // le planning prendrait à sa place (`remplacantsDe`, D12). Regroupé par
  // poste et horaire, avec les jours.
  const intenables = new Map<
    string,
    { poste: Poste; besoin: Besoin; jours: number[]; tenants: Salarie[] }
  >()
  for (const b of demandes) {
    const poste = postes.get(b.poste_id)
    if (!poste) continue
    const autonomes = tenants(b.poste_id, autonome)
    if (!autonomes.length) continue // déjà dit par « sans-autonome »
    if (autonomes.some((s) => peutTenir(s, b, r.horaires, regles))) continue
    const remplacants = [...versionsEtoileDe(ctx, b), ...remplacantsDe(ctx, b)]
    if (
      remplacants.some((h) =>
        autonomes.some((s) =>
          peutTenir(s, { ...b, horaire_id: h.id }, r.horaires, regles),
        ),
      )
    )
      continue
    const cle = `${b.poste_id}:${b.horaire_id ?? `${b.debut}-${b.fin}`}`
    const g = intenables.get(cle) ?? {
      poste,
      besoin: b,
      jours: [],
      tenants: autonomes,
    }
    g.jours.push(b.jour)
    intenables.set(cle, g)
  }
  for (const [cle, g] of intenables) {
    const h =
      g.besoin.horaire_id !== null
        ? horaires.get(g.besoin.horaire_id)
        : undefined
    const libelle = h
      ? `l'horaire ${libelleHoraire(h)}`
      : `l'horaire ${libelleHoraire(g.besoin)}`
    const seule = g.tenants.length === 1 ? g.tenants[0] : undefined
    ajouter(
      `besoin-sans-personne:${cle}`,
      'a-voir',
      'equipe',
      `Sur le poste ${g.poste.nom}, personne ne peut tenir ${libelle} demandé par les besoins (${listeJours(g.jours)}) : ${seule ? `la fiche de ${nomComplet(seule)} ne le permet pas (horaires autorisés ou semaine type)` : 'aucune fiche de ce poste ne le permet (horaires autorisés ou semaine type)'}.`,
      seule ? cibleFiche(seule.id, 'horaires') : undefined,
    )
  }

  const codesVivants = (s: Salarie) =>
    new Set(
      r.postes
        .filter((p) => s.competences.some((c) => c.poste_id === p.id))
        .flatMap((p) => codesDuPoste(p, r.horaires).map((h) => h.id)),
    )
  for (const s of equipe) {
    const nom = nomComplet(s)
    const tenus = s.competences
      .map((c) => ({ c, poste: postes.get(c.poste_id) }))
      .filter((x): x is { c: (typeof s.competences)[number]; poste: Poste } =>
        Boolean(x.poste),
      )
    const vivants = codesVivants(s)
    const tousMorts =
      r.horaires.length > 0 &&
      s.shifts_autorises.length > 0 &&
      tenus.length > 0 &&
      !s.shifts_autorises.some((id) => vivants.has(id))
    if (tousMorts) {
      ajouter(
        `codes-morts:${s.id}`,
        'a-voir',
        'equipe',
        `${nom} : aucun des horaires cochés dans sa fiche n'est permis sur ses postes. Le planning automatique ne peut pas placer cette personne.`,
        cibleFiche(s.id, 'horaires'),
      )
    } else if (r.horaires.length) {
      // Sans aucun horaire, le point bloquant des horaires suffit.
      const fiche = { shiftsAutorises: codesDeLaFiche(s) }
      for (const { poste } of tenus) {
        const utilisables = codesDuPoste(poste, r.horaires).filter((h) =>
          codeDeLaFiche(fiche, String(h.id)),
        )
        if (utilisables.length) continue
        ajouter(
          `sans-code:${s.id}:${poste.id}`,
          'a-voir',
          'equipe',
          `${nom} : aucun horaire utilisable sur le poste ${poste.nom}, entre sa fiche et ce poste.`,
          cibleFiche(s.id, 'horaires'),
        )
      }
    }

    // Code fixé par la semaine type (D12 : règle stricte). Sans aucun poste,
    // un seul point : c'est le poste qui manque, pas le code.
    const fixes = codesImposes(s.semaine_type)
    if (!tenus.length && fixes.length) {
      ajouter(
        `sans-poste-code-fixe:${s.id}`,
        'a-voir',
        'equipe',
        `${nom} n'a aucun poste : sa semaine type fixe un horaire le ${listeJours(fixes.map(([j]) => j))}, que le planning automatique ne pourra pas poser. Indiquez ses postes dans sa fiche.`,
        cibleFiche(s.id, 'postes'),
      )
    }
    if (!tenus.length) continue

    s.semaine_type.forEach((e, j) => {
      if ((e.mode !== 'auto' && e.mode !== 'travail') || !e.type_shift_id)
        return
      const h = horaires.get(e.type_shift_id)
      const code = h ? libelleHoraire(h) : 'supprimé'
      const id = `code-fixe:${s.id}:${j}`
      const postesPermis = tenus
        .filter(
          ({ poste }) =>
            h &&
            codesPermis({
              personne: s,
              poste,
              jour: j,
              horaires: r.horaires,
              regles,
            }).codes.some((x) => x.id === h.id),
        )
        .map(({ poste }) => poste.id)
      if (!postesPermis.length) {
        ajouter(
          id,
          'a-voir',
          'equipe',
          `${nom} : l'horaire ${code} fixé le ${jour(j)} par sa semaine type n'est permis sur aucun de ses postes.`,
          cibleFiche(s.id, 'semaine'),
        )
        return
      }
      const demande =
        valides.some(
          (b) =>
            b.jour === j &&
            b.horaire_id === e.type_shift_id &&
            postesPermis.includes(b.poste_id) &&
            b.effectif + b.soutien + b.renfort > 0,
        ) ||
        // L'accueil : un candidat de ce jour avec cet horaire (D1).
        candidats.some(
          (c) =>
            c.jourPlanning === j &&
            c.typeShift === String(e.type_shift_id) &&
            postesPermis.includes(Number(c.poste)),
        )
      if (!demande) {
        ajouter(
          id,
          'a-voir',
          'equipe',
          `${nom} : l'horaire ${code} est fixé le ${jour(j)} par sa semaine type, mais aucun besoin ne le demande ce jour-là sur ses postes. Le planning automatique ne pourra pas placer cette personne ce jour-là.`,
          cibleFiche(s.id, 'semaine'),
        )
      }
    })

    // Journée étoile fixée (décisions utilisateur du 2026-11-02) : ce
    // jour-là, un horaire de moins de 8 h qui existe (une version étoile de
    // l'horaire fixé, s'il y en a un). Aucun n'est permis sur ses postes :
    // le planning automatique ne pourra pas la placer ce jour-là.
    if (contratEtoile(s, regles)) {
      s.semaine_type.forEach((e, j) => {
        if (!e.etoile || e.mode === 'repos' || e.mode === 'absence') return
        const fixe = e.type_shift_id ? horaires.get(e.type_shift_id) : undefined
        // Même source que la fiche (`horairesEtoileDuJour`).
        const possible = tenus.some(
          ({ poste }) =>
            horairesEtoileDuJour(
              codesPermis({
                personne: s,
                poste,
                jour: j,
                horaires: r.horaires,
                regles,
              }).codes,
              fixe,
              Math.round(Number(s.heures_hebdo) * 60),
              regles,
            ).length > 0,
        )
        if (possible) return
        ajouter(
          `etoile-sans-horaire:${s.id}:${j}`,
          'a-voir',
          'equipe',
          fixe
            ? `${nom} : sa journée étoile est fixée le ${jour(j)}, mais aucun horaire plus court contenu dans ${libelleHoraire(fixe)} n'est permis sur ses postes. Le planning automatique ne pourra pas placer cette personne ce jour-là.`
            : `${nom} : sa journée étoile est fixée le ${jour(j)}, mais aucun horaire de moins de ${heuresLisibles(regles.contrats.journeePleine)} n'est permis sur ses postes. Le planning automatique ne pourra pas placer cette personne ce jour-là.`,
          cibleFiche(s.id, 'horaires'),
        )
      })
    }
  }

  // -------------------------------------------------------------- besoins
  // Heures demandées contre heures de contrat des titulaires.
  const minutesContrat = (s: Salarie) => Math.round(Number(s.heures_hebdo) * 60)
  const demandeesPoste = new Map<number, number>()
  for (const b of demandes) {
    const m = b.effectif * travail(creneauBesoin(ctx, b))
    demandeesPoste.set(b.poste_id, (demandeesPoste.get(b.poste_id) ?? 0) + m)
  }
  let signale = false
  // Un poste dont un titulaire a un contrat qui ne mesure pas ses heures
  // (forfait jours, extra, 0 h) n'est pas jugé : on ne saurait pas dire ce
  // qui manque. Il sort aussi du total.
  const nonJuges = new Set(
    r.postes
      .filter((p) =>
        tenants(p.id, prefere).some((s) => contratIndicatif(s, regles)),
      )
      .map((p) => p.id),
  )
  for (const p of r.postes) {
    const demandees = demandeesPoste.get(p.id) ?? 0
    const titulaires = tenants(p.id, prefere)
    if (!demandees || !titulaires.length || nonJuges.has(p.id)) continue
    const contrat = titulaires.reduce((t, s) => t + minutesContrat(s), 0)
    if (demandees - contrat > demandees * SEUIL_HEURES) {
      signale = true
      ajouter(
        `heures:${p.id}`,
        'a-voir',
        'besoins',
        `Le poste ${p.nom} demande ${heuresTexte(demandees)} par semaine ; les personnes au niveau ${nomPrefere} ont ${heuresTexte(contrat)} de contrat. Il manque ${heuresTexte(demandees - contrat)}.`,
        `poste-${p.id}`,
      )
    }
  }
  const totalDemande = [...demandeesPoste]
    .filter(([id]) => !nonJuges.has(id))
    .reduce((a, [, m]) => a + m, 0)
  const totalContrat = equipe
    .filter(
      (s) =>
        !contratIndicatif(s, regles) &&
        s.competences.some((c) => prefere(c.niveau)),
    )
    .reduce((t, s) => t + minutesContrat(s), 0)
  if (
    !signale &&
    totalDemande &&
    totalDemande - totalContrat > totalDemande * SEUIL_HEURES
  ) {
    ajouter(
      'heures:total',
      'a-voir',
      'besoins',
      `Les besoins demandent ${heuresTexte(totalDemande)} par semaine ; les personnes au niveau ${nomPrefere} ont ${heuresTexte(totalContrat)} de contrat. Il manque ${heuresTexte(totalDemande - totalContrat)}.`,
    )
  }

  // Soutien demandé là où personne n'a ce niveau. Seuls
  // comptent ceux qui ont une personne autonome possible à côté (nécessaire
  // ou en plus) : les autres ne sont jamais placés, ce que dit le point
  // suivant.
  const avecBase = (b: Besoin) => b.effectif + b.renfort > 0
  for (const p of r.postes) {
    const jours = valides
      .filter((b) => b.poste_id === p.id && b.soutien > 0 && avecBase(b))
      .map((b) => b.jour)
    if (!jours.length || tenants(p.id, soutienNiv).length) continue
    ajouter(
      `soutien:${p.id}`,
      'a-voir',
      'besoins',
      `Le poste ${p.nom} demande des personnes en soutien (${listeJours(jours)}), mais personne de l'équipe n'a le niveau ${nomsSoutien} sur ce poste.`,
      `soutien-${p.id}`,
    )
  }

  // Soutien demandé sans personne nécessaire ni en plus :
  // jamais placés (un apprenti n'est jamais seul).
  for (const p of r.postes) {
    const seuls = valides.filter(
      (b) => b.poste_id === p.id && b.soutien > 0 && !avecBase(b),
    )
    const jours = seuls.map((b) => b.jour)
    if (!jours.length) continue
    // Un nombre par niveau qui ne demande que du soutien : la cause est dite.
    const niveauxSeuls = [
      ...new Set(
        seuls.flatMap((b) =>
          (b.niveaux ?? [])
            .map((l) => niv.parId.get(l.niveau))
            .filter((n) => !!n && !n.autonome)
            .map((n) => n?.nom ?? ''),
        ),
      ),
    ]
    ajouter(
      `soutien-seul:${p.id}`,
      'a-voir',
      'besoins',
      niveauxSeuls.length
        ? `Le poste ${p.nom} demande le niveau ${listeOu(niveauxSeuls)}, qui n’est jamais seul (${listeJours(jours)}). Ces places ne seront jamais pourvues : demandez aussi un titulaire ou un dépannage.`
        : `Le poste ${p.nom} demande des personnes en soutien sans personne à côté (${listeJours(jours)}). Ces places ne seront jamais pourvues : retirez-les ou ajoutez une personne nécessaire.`,
      `soutien-${p.id}`,
    )
  }

  // ------------------------------------------------ tableau de l'accueil
  // Un chiffre demandé sans aucun poste de l'accueil : rien ne le tiendra.
  if (!accueil && r.consignes.some((c) => chiffreAccueil(c) > 0)) {
    ajouter(
      'accueil-sans-poste',
      'a-voir',
      'besoins',
      'Le tableau demande du monde, mais aucun poste n’a de zone. Dans Postes, choisissez la zone des postes qui le tiennent.',
      undefined,
      PAGE_ECRAN.postes,
    )
  }
  // 24 h sur 24 (audit du 2026-11-01) : un moment sans personne demandée
  // laisse l'hôtel vide. Un point par moment, avec ses jours.
  if (accueil) {
    for (const periode of momentsDuTableau(regles.moments)) {
      const vides = [0, 1, 2, 3, 4, 5, 6].filter(
        (j) => !chiffres.some((c) => c.jour === j && c.periode === periode),
      )
      if (!vides.length) continue
      ajouter(
        `accueil-vide:${periode}`,
        'a-voir',
        'besoins',
        `${majuscule(momentDesJours(vides, periode, regles.moments))} : personne de demandé à l'accueil. L'hôtel peut rester sans personne à ce moment.`,
        'presence',
      )
    }
  }
  // Heures de l'accueil contre les contrats de ceux qui le tiennent : un
  // moment compte pour l'horaire le plus courant parmi les siens.
  if (chiffres.length) {
    let demandees = 0
    for (const c of chiffres) {
      const du = candidats.filter(
        (x) => x.jourPlanning === c.jour && x.presence.includes(c.periode),
      )
      const purs = du.filter((x) => x.presence.length === 1)
      const durees = (purs.length ? purs : du)
        .map((x) => travail(x))
        .sort((a, b) => a - b)
      if (!durees.length) continue
      demandees += chiffreAccueil(c) * durees[Math.floor(durees.length / 2)]
    }
    const deLAccueil = (k: { poste_id: number }) =>
      estPosteAccueil(postes.get(k.poste_id), accueil)
    const contrats = equipe
      .filter(
        (s) =>
          !contratIndicatif(s, regles) &&
          s.competences.some(
            (k) => deLAccueil(k) && (prefere(k.niveau) || soutienNiv(k.niveau)),
          ) &&
          !s.competences.some((k) => !deLAccueil(k) && prefere(k.niveau)),
      )
      .reduce((t, s) => t + minutesContrat(s), 0)
    if (demandees - contrats > demandees * SEUIL_HEURES) {
      ajouter(
        'heures:accueil',
        'a-voir',
        'besoins',
        `L'accueil demande environ ${heuresTexte(demandees)} par semaine ; les contrats des personnes de l'accueil en font ${heuresTexte(contrats)}. Il manque ${heuresTexte(demandees - contrats)} : le planning prendra des extras ou laissera des places vides.`,
        'presence',
      )
    }
  }
  const sansHoraire = new Map<PeriodePresence, number[]>()
  const capacites: Array<{
    jour: number
    periode: PeriodePresence
    n: number
    k: number
  }> = []
  const rang = (p: PeriodePresence) => rangAuTableau(regles.moments, p)
  for (const c of [...chiffres].sort(
    (a, b) => a.jour - b.jour || rang(a.periode) - rang(b.periode),
  )) {
    const n = chiffreAccueil(c)
    const duMoment = candidats.filter(
      (x) => x.jourPlanning === c.jour && x.presence.includes(c.periode),
    )
    if (!duMoment.length) {
      sansHoraire.set(c.periode, [
        ...(sansHoraire.get(c.periode) ?? []),
        c.jour,
      ])
      continue
    }
    // Qui peut venir : un poste de l'accueil tenu (tout niveau) et un
    // horaire de ce moment que sa fiche et sa semaine type permettent.
    let capables = 0
    let autonomes = 0
    for (const s of equipe) {
      let peut = false
      let seul = false
      for (const x of duMoment) {
        const poste = postes.get(Number(x.poste))
        const niveau = s.competences.find(
          (k) => k.poste_id === Number(x.poste),
        )?.niveau
        if (!poste || !niveau) continue
        const permis = codesPermis({
          personne: s,
          poste,
          jour: c.jour,
          horaires: r.horaires,
          regles,
        }).codes.some((h) => String(h.id) === x.typeShift)
        if (!permis) continue
        peut = true
        if (autonome(niveau)) {
          seul = true
          break
        }
      }
      if (peut) capables++
      if (seul) autonomes++
    }
    const k = autonomes ? capables : 0
    if (k < n) capacites.push({ jour: c.jour, periode: c.periode, n, k })
  }
  for (const periode of [...sansHoraire.keys()].sort(
    (a, b) => rang(a) - rang(b),
  )) {
    const jours = sansHoraire.get(periode) ?? []
    ajouter(
      `cycle-sans-code:${periode}`,
      'a-voir',
      'besoins',
      `${majuscule(momentDesJours(jours, periode, regles.moments))} : aucun horaire ${duMoment(periode, regles.moments)} n'est possible à l'accueil.`,
      'presence',
    )
  }
  for (const { jour: j, periode, n, k } of capacites) {
    const qui =
      k === 0
        ? 'personne ne peut'
        : `seulement ${k} ${k > 1 ? 'peuvent' : 'peut'}`
    ajouter(
      `accueil-capacite:${j}:${periode}`,
      'a-voir',
      'besoins',
      `${majuscule(momentDesJours([j], periode, regles.moments))} : il faut ${pluriel(n, 'personne')}, mais ${qui} venir à l'accueil.`,
      'presence',
    )
  }

  // ------------------------------- ouverture, fermeture, niveau demandé
  // (étape 7 du plan planning-moteur-configurable, 2026-11-05) : une règle
  // que les réglages rendent impossible est dite ici, jamais devinée ; le
  // calcul ne la rend jamais dure (D3), la case reste vide.
  const duree = regles.passations.dureeOuverture
  for (const p of r.postes) {
    // Tout poste (2026-11-06), sauf la nuit de l'accueil (ses passations).
    if (p.ferme || (accueil && seulementLaNuit(p, r.horaires, regles.moments)))
      continue
    const permis = codesDuPoste(p, r.horaires)
    const bornesH = (h: Horaire) => {
      const d = minutesDe(h.debut)
      const f = minutesDe(h.fin)
      return [d, f <= d ? f + 1440 : f] as const
    }
    if (p.ouverture) {
      const o = minutesDe(p.ouverture)
      const tient = permis.some((h) => {
        const [d, f] = bornesH(h)
        return d <= o && f >= o + duree
      })
      if (!tient)
        ajouter(
          `ouverture-impossible:${p.id}`,
          'a-voir',
          'postes',
          `${p.nom} ouvre à ${p.ouverture}, mais aucun de ses horaires ne commence à cette heure.`,
          `poste-${p.id}`,
        )
    }
    if (p.fermeture) {
      // Une fermeture après minuit appartient au soir de la veille.
      const brut = minutesDe(p.fermeture)
      const tient = permis.some((h) => {
        const [d, f] = bornesH(h)
        return [brut, brut + 1440].some((x) => d <= x - duree && f >= x)
      })
      if (!tient)
        ajouter(
          `fermeture-impossible:${p.id}`,
          'a-voir',
          'postes',
          `${p.nom} ferme à ${p.fermeture}, mais aucun de ses horaires ne va jusqu'à cette heure.`,
          `poste-${p.id}`,
        )
    }
  }
  // Niveau demandé (un seul, ou un nombre par niveau) que personne de
  // l'équipe n'a sur ce poste, ni mieux.
  const niveauDemande = new Map<number, { rang: number; nom: string }>()
  for (const b of valides) {
    if (b.effectif <= 0) continue
    const d = demandeDe(niv, b)
    for (const q of d.paliers ?? (d.niveauMax ? [d.niveauMax] : [])) {
      const deja = niveauDemande.get(b.poste_id)
      if (!deja || q.rang < deja.rang) niveauDemande.set(b.poste_id, q)
    }
  }
  for (const id of [...niveauDemande.keys()].sort((a, b) => a - b)) {
    const p = postes.get(id)
    const q = niveauDemande.get(id) as { rang: number; nom: string }
    const assez = (n: string) => {
      const l = niv.parId.get(n)
      return !!l && l.autonome && l.rang <= q.rang
    }
    if (!p || tenants(id, assez).length) continue
    ajouter(
      `titulaire-demande:${id}`,
      'a-voir',
      'besoins',
      `${p.nom} : des besoins demandent le niveau ${q.nom}, mais personne n'a ce niveau sur ce poste.`,
      `poste-${id}`,
    )
  }

  // Une zone en service sans aucun chiffre quand une autre en a (relecture
  // du 2026-11-06) : les besoins de ses postes ne sont plus lus, rien n'y
  // sera planifié. Sans aucun chiffre nulle part, les moments vides le
  // disent déjà.
  if (accueil && chiffres.length) {
    const premiere = regles.zones[0].id
    for (const z of regles.zones) {
      const sesPostes = r.postes.filter(
        (p) => !p.ferme && p.zone_id != null && String(p.zone_id) === z.id,
      )
      if (!sesPostes.length) continue
      if (
        chiffres.some(
          (c) => (c.zone_id == null ? premiere : String(c.zone_id)) === z.id,
        )
      )
        continue
      ajouter(
        `zone-sans-chiffres:${z.id}`,
        'a-voir',
        'besoins',
        `La zone ${z.nom} n'a aucun chiffre au tableau : ${listeEt(sesPostes.map((p) => p.nom))} n'${sesPostes.length > 1 ? 'ont' : 'a'} aucune place à tenir. Donnez ses chiffres dans Besoins.`,
      )
    }
  }

  pointsDesRegles(r, regles, equipe, chiffres, accueil, ajouter)

  return ordonnerPoints(points)
}

type Ajouter = (
  id: string,
  gravite: Gravite,
  ecran: EcranReglage,
  texte: string,
  cible?: string,
  page?: PageReglage,
) => void

/** « 7 h », « 8 h ou 7 h » : les durées d'un contrat, en mots. */
function dureesTexte(durees: readonly number[]): string {
  const l = [...new Set(durees)].sort((a, b) => b - a).map(heuresLisibles)
  return l.length < 2
    ? (l[0] ?? '')
    : `${l.slice(0, -1).join(', ')} ou ${l.at(-1)}`
}

/** « 30 minutes », « 1 h 30 ». */
function dureeCourte(minutes: number): string {
  return minutes < 60 ? `${minutes} minutes` : heuresLisibles(minutes)
}

/**
 * Les règles de l'établissement que les réglages rendent impossibles ou
 * contradictoires (étape 8 du plan `planning-moteur-configurable-
 * 2026-11-05`). Chaque point mène à l'endroit où on le corrige : le tiroir
 * Règles des contrats (`?ouvrir=regles`, Équipe), la section Moments
 * (`moments`, Besoins), la relève (`releve`, Besoins) ou la fiche. La
 * journée étoile fixée un jour sans horaire court a déjà son point
 * (`etoile-sans-horaire`). Les règles mêmes ne sont pas réécrites : elles
 * viennent de `lireRegles`, comme pour le moteur.
 */
function pointsDesRegles(
  r: Referentiel,
  regles: RegleEtablissement,
  equipe: readonly Salarie[],
  chiffres: readonly { jour: number; periode: PeriodePresence }[],
  accueil: boolean,
  ajouter: Ajouter,
) {
  // ------------------------------------------- journées imposées au calcul
  const imposees = dureesImposees(regles)
  const postesOuverts = r.postes.filter((p) => !p.ferme)
  const sansSolution = new Set<number>()
  for (const j of regles.contrats.journees) {
    if (!j.durees.length) continue
    const concernes = equipe.filter(
      (s) =>
        !s.forfait_jours &&
        modeleDe(regles, s.type_contrat).journeesImposees &&
        Math.round(Number(s.heures_hebdo) * 60) === j.minutesHebdo &&
        s.competences.length > 0,
    )
    // Sans aucun horaire, le point bloquant des horaires suffit.
    if (!concernes.length || !r.horaires.length) continue
    const existe = r.horaires.some((h) => j.durees.includes(travailHoraire(h)))
    if (existe) continue
    sansSolution.add(j.minutesHebdo)
    ajouter(
      `journees-sans-horaire:contrat-${j.minutesHebdo}`,
      'a-voir',
      'equipe',
      `Les contrats de ${heuresLisibles(j.minutesHebdo)} se font en journées de ${dureesTexte(j.durees)}, mais aucun horaire ne dure ${dureesTexte(j.durees)}. Le planning automatique ne peut pas placer ${concernes.length > 1 ? `ces ${concernes.length} personnes` : 'cette personne'}. Ajoutez un horaire de cette durée ou changez les journées du contrat.`,
      'regles',
    )
  }
  for (const s of equipe) {
    if (s.forfait_jours || !modeleDe(regles, s.type_contrat).journeesImposees)
      continue
    const minutesHebdo = Math.round(Number(s.heures_hebdo) * 60)
    const j = journeesDuContrat(regles, minutesHebdo)
    if (!j || !j.durees.length || sansSolution.has(minutesHebdo)) continue
    // Une semaine type qui fixe un horaire d'une autre durée décide seule
    // (`journeesDuCalcul`, regles.ts) : la règle ne s'applique pas.
    const fixes = codesImposes(s.semaine_type, r.horaires, regles)
    const decideSeule = fixes.some(([, id]) => {
      const h = r.horaires.find((x) => String(x.id) === id)
      return !h || !imposees.has(travailHoraire(h))
    })
    if (decideSeule) continue
    const tenus = postesOuverts.filter((p) =>
      s.competences.some((c) => c.poste_id === p.id),
    )
    const possibles = new Map<number, Horaire>()
    for (const poste of tenus)
      for (let jour = 0; jour < 7; jour++)
        for (const h of codesPermis({
          personne: s,
          poste,
          jour,
          horaires: r.horaires,
          regles,
        }).codes)
          possibles.set(h.id, h)
    // Aucun horaire du tout : un autre point le dit déjà (`codes-morts`,
    // `sans-code`).
    if (!possibles.size) continue
    if (
      [...possibles.values()].some((h) => j.durees.includes(travailHoraire(h)))
    )
      continue
    ajouter(
      `journees-sans-horaire:${s.id}`,
      'a-voir',
      'equipe',
      `${nomComplet(s)} : son contrat de ${heuresLisibles(minutesHebdo)} se fait en journées de ${dureesTexte(j.durees)}, mais aucun horaire de cette durée n'est permis sur ses postes. Le planning automatique ne peut pas placer cette personne.`,
      cibleFiche(s.id, 'horaires'),
    )
  }

  // ------------------------------- jour seul interdit, un jour d'affilée
  // Un seul jour d'affilée et aucun jour seul : aucun jour n'est plaçable
  // pour un contrat au rythme humain (relecture du 2026-11-05). L'écran et
  // la base le refusent désormais ; une base plus ancienne peut l'avoir.
  if (
    regles.repos.jourIsole === 'interdit' &&
    regles.repos.joursAffilesConseilles < 2
  ) {
    ajouter(
      'jours-affiles-un-seul',
      'bloquant',
      'equipe',
      `Un seul jour de travail d'affilée est conseillé, et un jour de travail seul est interdit : le planning automatique ne peut placer aucun contrat de ${heuresLisibles(regles.repos.rythmeContratMin)} et plus. Conseillez au moins 2 jours d'affilée, ou passez le jour de travail seul à À éviter.`,
      'regles',
    )
  }

  // ----------------------------------------------- deux repos de suite
  for (const s of equipe) {
    const parLaLoi = s.mineur
    if (!parLaLoi && regles.repos.deuxReposDeSuite !== 'obligatoire') continue
    if (modeleDe(regles, s.type_contrat).placementManuel) continue
    const semaine = s.semaine_type
    // Une semaine type qui fixe deux repos ou plus a décidé elle-même.
    if (semaine.filter((e) => e.mode === 'repos').length >= 2) continue
    const travaille = (j: number) => semaine.at(j % 7)?.mode === 'travail'
    // La règle de l'établissement accepte le dimanche et le lundi d'à côté ;
    // la loi d'un mineur veut la paire DANS la semaine.
    const fin = parLaLoi ? 6 : 7
    let paire = false
    for (let j = 0; j < fin; j++)
      if (!travaille(j) && !travaille(j + 1)) paire = true
    if (paire) continue
    const jours = [0, 1, 2, 3, 4, 5, 6].filter(travaille)
    ajouter(
      `deux-repos-impossibles:${s.id}`,
      'a-voir',
      'equipe',
      `${nomComplet(s)} : sa semaine type le fait travailler le ${listeJours(jours)}. Deux jours de repos de suite sont impossibles, alors que ${parLaLoi ? 'la loi les demande pour un mineur' : "les règles de l'établissement les demandent"}.`,
      cibleFiche(s.id, 'semaine'),
    )
  }

  // ---------------------------------------------------------------- relève
  // Fixe (décision utilisateur du 2026-11-06) : le planning PRÉFÈRE que deux
  // équipes se croisent `RELEVE_MINUTES` dans une zone tenue en continu.
  // Des horaires qui ne le permettent jamais : dit ici, à corriger dans
  // Horaires (plus rien à régler dans Besoins).
  const releve = RELEVE_MINUTES
  const L = regles.moments
  const continues = new Set(
    regles.zones.filter((z) => z.continue).map((z) => z.id),
  )
  for (const [avant, apres] of pairesDeJour(L)) {
    const releveDemandee =
      accueil &&
      [0, 1, 2, 3, 4, 5, 6].some(
        (j) =>
          chiffres.some((c) => c.jour === j && c.periode === avant) &&
          chiffres.some((c) => c.jour === j && c.periode === apres),
      )
    if (!releveDemandee) continue
    const duJour = r.postes
      .filter((p) => {
        const z = zoneDuPoste(p)
        return (
          z !== null && continues.has(z) && !seulementLaNuit(p, r.horaires, L)
        )
      })
      .flatMap((p) => codesDuPoste(p, r.horaires))
    const moment = (h: Horaire) => h.periode ?? momentPropose(h, L)
    const matins = duJour.filter((h) => moment(h) === avant)
    const soirs = duJour.filter((h) => moment(h) === apres)
    // Sans horaire d'un des deux moments, `cycle-sans-code` le dit déjà.
    if (matins.length && soirs.length) {
      const finMatin = Math.max(...matins.map((h) => minutes(h.fin)))
      const debutSoir = Math.min(...soirs.map((h) => minutes(h.debut)))
      const a = motMoment(L, avant)
      const b = motMoment(L, apres)
      if (finMatin - debutSoir < releve)
        ajouter(
          pairesDeJour(L).length > 1
            ? `releve-impossible:${avant}`
            : 'releve-impossible',
          'a-voir',
          'horaires',
          `Le planning préfère que le ${a} et le ${b} se croisent ${dureeCourte(releve)} pour la relève, mais à l'accueil le ${a} finit au plus tard à ${hhmm(finMatin)} et le ${b} commence au plus tôt à ${hhmm(debutSoir)}. Ajoutez des horaires qui se croisent.`,
        )
    }
  }

  // --------------------------------------------------------------- moments
  // Un moment qu'aucun horaire ne peut atteindre (ses conditions sont
  // couvertes par un moment essayé avant lui) : ses réglages ne servent à
  // rien. Essayé sur tous les horaires possibles au quart d'heure.
  for (const id of momentsInatteignables(L))
    ajouter(
      `moments:${id}`,
      'a-voir',
      'besoins',
      `Avec ces réglages, aucun horaire ne peut être ${duMoment(id, L)}. Revoyez ses heures, ou l'ordre de classement des moments.`,
      'moments',
    )
}

/** Les moments qu'aucun horaire (début et fin au quart d'heure) ne peut
 * recevoir (`momentPropose`). */
export function momentsInatteignables(l: Moments): string[] {
  const atteints = new Set<string>()
  for (let d = 0; d < 1440; d += 15)
    for (let f = 0; f < 1440; f += 15) {
      if (f === d) continue
      atteints.add(momentPropose({ debut: hhmm(d), fin: hhmm(f), pause: 0 }, l))
    }
  return l.liste.map((m) => m.id).filter((id) => !atteints.has(id))
}

/** « 07:30 » → minutes depuis minuit. */
function minutesDe(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + (m || 0)
}

const rangEcran = (e: EcranReglage) => ORDRE_ECRANS.indexOf(e)

/** Écrans dans l'ordre de réglage, bloquants d'abord dans chacun ; ordre
 * d'apparition gardé sinon. */
export function ordonnerPoints(points: PointReglage[]): PointReglage[] {
  return points
    .map((p, i) => ({ p, i }))
    .sort(
      (a, b) =>
        rangEcran(a.p.ecran) - rangEcran(b.p.ecran) ||
        (a.p.gravite === 'bloquant' ? 0 : 1) -
          (b.p.gravite === 'bloquant' ? 0 : 1) ||
        a.i - b.i,
    )
    .map(({ p }) => p)
}

export interface GroupePoints {
  ecran: EcranReglage
  libelle: string
  points: PointReglage[]
  bloquants: number
}

/** Les points groupés par écran (D17) : les groupes qui ont un bloquant en
 * tête, puis l'ordre de réglage. */
export function grouperPoints(points: PointReglage[]): GroupePoints[] {
  return ORDRE_ECRANS.map((ecran) => {
    const liste = ordonnerPoints(points.filter((p) => p.ecran === ecran))
    return {
      ecran,
      libelle: LIBELLE_ECRAN[ecran],
      points: liste,
      bloquants: liste.filter((p) => p.gravite === 'bloquant').length,
    }
  })
    .filter((g) => g.points.length)
    .sort((a, b) => (b.bloquants ? 1 : 0) - (a.bloquants ? 1 : 0))
}

/** Au moins un point empêche de générer. */
export function aDesBloquants(points: readonly PointReglage[]): boolean {
  return points.some((p) => p.gravite === 'bloquant')
}
