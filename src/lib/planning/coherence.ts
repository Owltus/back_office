/*
 * Contrôle de cohérence des réglages du planning (plan
 * `planning-coherence-2026-10-28`, étape 5, D4 = A, D12, D13, D14, D17).
 * L'app relit elle-même ses réglages et dit ce qui ne colle pas, en phrases
 * courtes, chaque point avec le réglage où le corriger. Rien n'empêche
 * d'enregistrer : seuls les points « bloquants » empêcheront de générer
 * (étape 7, boîte de génération).
 *
 * Aucune règle n'est réécrite ici : les codes permis viennent de
 * `eligibilite.ts`, les besoins écartés de `besoinsValides` (`semaine.ts`),
 * la période d'un code de `presence.ts`, les heures de `modele.ts`.
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
 * ou semaine type), personne sans poste avec un code fixé.
 */

import { nomComplet } from '#/lib/planning/affichage.ts'
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
import { clePresence, sommeBesoinsPresence } from '#/lib/planning/presence.ts'
import {
  besoinsValides,
  contexte,
  creneauBesoin,
} from '#/lib/planning/semaine.ts'
import { JOURS } from '#/lib/planning/types.ts'
import type {
  Besoin,
  Horaire,
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
 * `presence` (la vue matin et soir). */
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
  horaires: 'Horaires',
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

/** Personnes nécessaires des besoins valides, par moment matin et soir
 * (`clePresence`) : la somme que `verifierReglages` compare aux consignes,
 * reprise par la vue Matin et soir des Besoins. */
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
  )
}

/** Besoins valides qui demandent au moins une personne autonome : ceux que
 * compte « N besoins » de Pour commencer, comme le point bloquant. */
export function besoinsDemandes(r: Referentiel): Besoin[] {
  const ctx = contexte({
    lundi: LUNDI_TYPE,
    referentiel: r,
    absences: [],
    affectations: [],
    avant: [],
    apres: [],
  })
  return besoinsValides(ctx).valides.filter((b) => b.effectif > 0)
}

const autonome = (n: string) => n === 'titulaire' || n === 'occasionnel'

/** Son contrat ne mesure pas ses heures : forfait jours (décompte en
 * jours), extra (placé à la main, au besoin), ou 0 h. */
const contratIndicatif = (s: Salarie) =>
  s.forfait_jours || s.type_contrat === 'extra' || !(Number(s.heures_hebdo) > 0)

/** La personne peut-elle tenir ce besoin (poste, jour, code) d'après sa
 * fiche et sa semaine type ? Le poste est déjà vérifié par `besoinsValides`.
 * Un besoin sans code ne peut pas être tenu par une fiche qui restreint ses
 * codes (même règle que le moteur). */
function peutTenir(s: Salarie, b: Besoin): boolean {
  const jourType = s.semaine_type.at(b.jour)
  if (jourType?.mode === 'repos' || jourType?.mode === 'absence') return false
  const code = b.horaire_id === null ? null : String(b.horaire_id)
  const fiche = {
    shiftsAutorises: codesDeLaFiche(s),
    shiftImpose: codesImposes(s.semaine_type),
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
  const { valides, alertes } = besoinsValides(ctx)
  const parId = new Map(ctx.besoins.map((b) => [b.id, b]))
  const demandes = valides.filter((b) => b.effectif > 0)

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
      "Aucun code horaire. Créez d'abord les horaires de l'hôtel.",
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
  if (r.postes.length && !demandes.length) {
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
        'Aucun besoin. Indiquez combien de personnes il faut sur chaque poste.',
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
        p.presence &&
        (p.horaires_autorises.includes(h.id) ||
          valides.some((b) => b.poste_id === p.id && b.horaire_id === h.id)),
    )
    if (!concernes.length) continue
    ajouter(
      `periode:${h.id}`,
      'a-voir',
      'horaires',
      `L'horaire ${h.code} n'a pas de période (matin, soir ou nuit). Il ne compte pas dans le matin et le soir de ${concernes.map((p) => p.nom).join(', ')}.`,
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
      ? `l'horaire ${g.horaire.code}`
      : `l'horaire ${g.besoin.debut} - ${g.besoin.fin}`
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
        `Sur le poste ${g.poste.nom}, ${libelle} dure plus longtemps qu'un service de sa catégorie HCR ne le permet (${quand}). Ces besoins sont ignorés.`,
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
        `Le poste ${p.nom} a des besoins, mais personne n'y est titulaire ni en dépannage.`,
        `poste-${p.id}`,
        PAGE_ECRAN.postes,
      )
    } else if (p.presence && !tenants(p.id, (n) => n === 'titulaire').length) {
      ajouter(
        `presence-sans-titulaire:${p.id}`,
        'a-voir',
        'equipe',
        `Le poste ${p.nom} compte dans le matin et le soir, mais personne n'y est titulaire.`,
        `poste-${p.id}`,
        PAGE_ECRAN.postes,
      )
    }
  }

  // Besoin que personne ne peut tenir : le poste a des autonomes, mais
  // aucun n'a ce code permis ce jour-là (fiche, semaine type). Regroupé par
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
    if (autonomes.some((s) => peutTenir(s, b))) continue
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
      ? `l'horaire ${h.code}`
      : `l'horaire ${g.besoin.debut} - ${g.besoin.fin}`
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
      // Sans aucun code, le point bloquant des horaires suffit.
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
      const code = h ? h.code : 'supprimé'
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
      const demande = valides.some(
        (b) =>
          b.jour === j &&
          b.horaire_id === e.type_shift_id &&
          postesPermis.includes(b.poste_id) &&
          b.effectif + b.soutien + b.renfort > 0,
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
        tenants(p.id, (n) => n === 'titulaire').some(contratIndicatif),
      )
      .map((p) => p.id),
  )
  for (const p of r.postes) {
    const demandees = demandeesPoste.get(p.id) ?? 0
    const titulaires = tenants(p.id, (n) => n === 'titulaire')
    if (!demandees || !titulaires.length || nonJuges.has(p.id)) continue
    const contrat = titulaires.reduce((t, s) => t + minutesContrat(s), 0)
    if (demandees - contrat > demandees * SEUIL_HEURES) {
      signale = true
      ajouter(
        `heures:${p.id}`,
        'a-voir',
        'besoins',
        `Le poste ${p.nom} demande ${heuresTexte(demandees)} par semaine ; ses titulaires ont ${heuresTexte(contrat)} de contrat. Il manque ${heuresTexte(demandees - contrat)}.`,
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
        !contratIndicatif(s) &&
        s.competences.some((c) => c.niveau === 'titulaire'),
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
      `Les besoins demandent ${heuresTexte(totalDemande)} par semaine ; les titulaires ont ${heuresTexte(totalContrat)} de contrat. Il manque ${heuresTexte(totalDemande - totalContrat)}.`,
    )
  }

  // Apprentis et stagiaires demandés là où personne ne l'est.
  for (const p of r.postes) {
    const jours = valides
      .filter((b) => b.poste_id === p.id && b.soutien > 0)
      .map((b) => b.jour)
    if (!jours.length || tenants(p.id, (n) => n === 'soutien').length) continue
    ajouter(
      `soutien:${p.id}`,
      'a-voir',
      'besoins',
      `Le poste ${p.nom} demande des apprentis ou stagiaires (${listeJours(jours)}), mais personne n'y est inscrit à ce niveau.`,
      `soutien-${p.id}`,
    )
  }

  // Matin et soir : les personnes nécessaires des postes qui comptent,
  // face à la consigne du jour.
  const somme = sommeBesoinsPresence(demandes, postes, horaires)
  for (const c of [...r.consignes].sort(
    (a, b) => a.jour - b.jour || (a.periode === 'matin' ? -1 : 1),
  )) {
    const n = somme.get(clePresence(c.jour, c.periode)) ?? 0
    const moment = `${JOURS[c.jour]} ${c.periode}`
    if (n < c.minimum) {
      ajouter(
        `presence:${c.jour}:${c.periode}`,
        'a-voir',
        'besoins',
        `${moment} : les besoins demandent ${pluriel(n, 'personne')}, la consigne en veut au moins ${c.minimum}.`,
        'presence',
      )
    } else if (c.maximum !== null && n > c.maximum) {
      ajouter(
        `presence:${c.jour}:${c.periode}`,
        'a-voir',
        'besoins',
        `${moment} : les besoins demandent ${pluriel(n, 'personne')}, la consigne en veut au plus ${c.maximum}.`,
        'presence',
      )
    }
  }

  return ordonnerPoints(points)
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
