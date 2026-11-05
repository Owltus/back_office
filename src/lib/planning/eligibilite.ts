/*
 * La SEULE règle des horaires horaires permis (plan
 * `planning-coherence-2026-10-28`, étape 2) : « quels codes cette personne
 * peut-elle tenir sur ce poste ce jour-là, et sinon pourquoi ».
 *
 * Trois filtres, toujours dans le même sens, SANS REPLI :
 *   1. le poste : ses horaires, ou tous s'il n'en restreint aucun ;
 *   2. la fiche : ses horaires, ou tous si elle n'en restreint aucun ;
 *   3. la semaine type : un horaire fixé ce jour-là réduit la liste à lui seul.
 * Une intersection vide reste vide : le moteur ne tiendrait pas un horaire que
 * le menu aurait proposé par repli.
 *
 * Le moteur (`semaine.ts`, `generateur.ts`, `verificateur.ts`) appelle les
 * prédicats élémentaires ; les menus appellent `codesPermis`, qui les compose
 * et ajoute ce qu'un menu doit dire : jour fermé (repos fixe, école, absence
 * fixe, hors contrat) et coupure de 11 h (12 h pour un mineur) avec les
 * shifts déjà posés la veille ou le lendemain (D16). Les chiffres de repos
 * viennent de `regles.ts`. D16 révisée le 2026-10-30 (décision utilisateur) :
 * en mode manuel, un horaire `ecartes` pour la coupure reste CHOISISSABLE avec
 * son alerte (`rubriquesDeLaCase`, `components/planning/codesCase.ts`) ; le
 * générateur ne la passe jamais, le vérificateur signale le shift posé.
 */

import {
  contratEtoile,
  horairesNormaux,
  versionsEtoile,
} from '#/lib/planning/etoile.ts'
import type { HoraireEtoile } from '#/lib/planning/etoile.ts'
import { reposQuotidienMin } from '#/lib/planning/regles.ts'
import type { RegleEtablissement } from '#/lib/planning/reglesEtablissement.ts'
import { bornes, horaireDe } from '#/lib/planning/temps.ts'
import type { JourType, Poste, Salarie } from '#/lib/planning/types.ts'

// ------------------------------------------------- prédicats du moteur

/** Le poste prévoit-il cet horaire ? Liste vide = tous ; un shift sans horaire
 * n'est jamais refusé par le poste. */
export function codePrevuAuPoste(
  poste: Pick<Poste, 'horaires_autorises'>,
  horaireId: number | null,
): boolean {
  const autorises = poste.horaires_autorises
  return (
    !autorises.length || horaireId === null || autorises.includes(horaireId)
  )
}

/** Codes de la fiche, au format du moteur (vide = tous). */
export function codesDeLaFiche(
  x: Pick<Salarie, 'shifts_autorises'>,
): Set<string> {
  return new Set(x.shifts_autorises.map(String))
}

/** Codes fixés par la semaine type, (jour, code) au format du moteur :
 * l'horaire fixé ET ses versions étoile prises dans `horaires` (`etoile.ts`,
 * décisions utilisateur du 2026-11-02). Comme l'ancienne journée courte, qui
 * se posait sur l'horaire fixé de n'importe quel jour : un 39 h à horaire
 * fixé tous les jours fait sa journée de 7 h sur la version étoile. Un jour de
 * journée étoile fixée (`etoile`), l'horaire de 8 h reste permis à la main
 * (le vérificateur le signale, R-JOURNEE-ETOILE) ; le moteur n'y pose que la
 * version étoile (`compatible`). */
export function codesImposes(
  semaine: readonly JourType[],
  horaires: readonly HoraireEtoile[] = [],
  regles?: RegleEtablissement,
): Array<readonly [number, string]> {
  const r: Array<readonly [number, string]> = []
  semaine.forEach((e, j) => {
    if ((e.mode === 'auto' || e.mode === 'travail') && e.type_shift_id) {
      r.push([j, String(e.type_shift_id)])
      const h = horaires.find((x) => x.id === e.type_shift_id)
      if (h)
        for (const v of versionsEtoile(h, horaires, regles))
          r.push([j, String(v.id)])
    }
  })
  return r
}

/** La fiche permet-elle cet horaire ? Liste vide = tous ; si elle en restreint,
 * un shift sans horaire n'en fait pas partie. */
export function codeDeLaFiche(
  s: { readonly shiftsAutorises: ReadonlySet<string> },
  code: string | null,
): boolean {
  return s.shiftsAutorises.size === 0 || s.shiftsAutorises.has(code ?? '')
}

/** Codes imposés ce jour-là (vide : aucun). */
export function imposesDuJour(
  s: { readonly shiftImpose: ReadonlyArray<readonly [number, string]> },
  jour: number,
): Set<string> {
  return new Set(
    s.shiftImpose.filter(([j]) => j === jour).map(([, code]) => code),
  )
}

/** Le code respecte-t-il celui que la semaine type fixe ce jour-là ? */
export function codeImposeRespecte(
  s: { readonly shiftImpose: ReadonlyArray<readonly [number, string]> },
  jour: number,
  code: string | null,
): boolean {
  const imposes = imposesDuJour(s, jour)
  return imposes.size === 0 || imposes.has(code ?? '')
}

/** Repos quotidien tenu entre ce service [debut, fin] et les services voisins
 * (fin du précédent, début du suivant ; null : aucun). Minutes réelles. */
export function coupureRespectee(
  finAvant: number | null,
  debutApres: number | null,
  debut: number,
  fin: number,
  minimum: number,
): boolean {
  return (
    (finAvant === null || debut - finAvant >= minimum) &&
    (debutApres === null || debutApres - fin >= minimum)
  )
}

// -------------------------------------------------------------- menus

/** Codes d'un poste (tous s'il n'en restreint aucun). */
export function codesDuPoste<T extends { id: number }>(
  poste: Pick<Poste, 'horaires_autorises' | 'ferme'> | undefined,
  horaires: readonly T[],
): T[] {
  return poste
    ? horaires.filter((h) => codePrevuAuPoste(poste, h.id))
    : [...horaires]
}

/** Poste proposé par défaut pour une case : celui du shift, sinon le premier
 * poste tenu en titulaire, sinon la première compétence, sinon le premier
 * poste. */
export function posteDeReference(
  personne: Pick<Salarie, 'competences'>,
  postes: ReadonlyArray<{ id: number }>,
  shift?: { poste_id: number },
): number | undefined {
  return (
    shift?.poste_id ??
    personne.competences.find((c) => c.niveau === 'titulaire')?.poste_id ??
    personne.competences.at(0)?.poste_id ??
    postes.at(0)?.id
  )
}

export type RaisonCodes =
  | 'aucun-commun'
  | 'code-fixe-hors-poste'
  | 'ecole'
  | 'absence-fixe'
  | 'repos-fixe'
  | 'hors-contrat'
  | 'coupure-11h'
  | 'poste-ferme'

/** La raison en clair, pour une ligne grisée du menu. */
export const TEXTE_RAISON: Record<RaisonCodes, string> = {
  'aucun-commun': 'Aucun horaire commun entre sa fiche et ce poste',
  'code-fixe-hors-poste':
    "L'horaire fixé par sa semaine type n'est pas permis sur ce poste",
  ecole: "Jour d'école : retirez d'abord l'école de ce jour",
  'absence-fixe': 'Absence fixée par sa semaine type : à changer dans sa fiche',
  'repos-fixe': 'Repos fixé par sa semaine type',
  'hors-contrat': 'En dehors de son contrat',
  'coupure-11h': 'Coupure de repos non respectée',
  'poste-ferme': 'Poste fermé',
}

/** Texte court de la coupure (lu dans un menu), selon le repos dû (11 h,
 * 12 h mineur) ; le côté reste dans `Ecarte.cote`. */
export function texteCoupure(minimum: number): string {
  return `-${Math.round(minimum / 60)} h de repos`
}

/** Un shift déjà posé un autre jour, dans le repère du lundi (jour -1 :
 * dimanche d'avant, 7 : lundi d'après). Tous comptent, comme pour le
 * vérificateur ; en pratique, la veille et le lendemain. */
export interface Voisin {
  jour: number
  debut: string
  fin: string
}

/** Ce que l'on sait du jour visé (bilan de la semaine). */
export interface Journee {
  /** Jour d'école (calendrier du CFA ou semaine type). */
  ecole?: boolean
  horsContrat?: boolean
}

export interface Ecarte<T> {
  horaire: T
  raison: 'coupure-11h'
  cote: 'veille' | 'lendemain'
  /** Phrase prête à afficher. */
  texte: string
}

export interface CodesPermis<T> {
  codes: T[]
  /** Pourquoi la liste est vide (null : elle ne l'est pas). */
  raison: RaisonCodes | null
  /** Phrase prête à afficher quand la liste est vide. */
  texte: string | null
  /** Codes qui cassent la coupure de repos, avec la raison : hors de
   * `codes` (le moteur ne les pose pas), proposés avec alerte à la main. */
  ecartes: Ecarte<T>[]
}

export interface EntreeCodesPermis<T> {
  personne: Pick<Salarie, 'shifts_autorises' | 'semaine_type' | 'mineur'>
  poste: Pick<Poste, 'horaires_autorises' | 'ferme'> | undefined
  jour: number
  horaires: readonly T[]
  journee?: Journee
  /** Pour la coupure de repos : le lundi de la semaine et les shifts déjà
   * posés les autres jours (seuls la veille et le lendemain comptent). */
  lundi?: string
  voisins?: readonly Voisin[]
}

/**
 * Codes que cette personne peut tenir sur ce poste ce jour-là. Liste vide :
 * `raison` dit pourquoi. Aucun repli : ce que rend cette fonction, le moteur
 * l'accepte.
 */
export function codesPermis<T extends HoraireEtoile>(
  e: EntreeCodesPermis<T>,
): CodesPermis<T> {
  const ferme = (raison: RaisonCodes): CodesPermis<T> => ({
    codes: [],
    raison,
    texte: TEXTE_RAISON[raison],
    ecartes: [],
  })
  const jourType = e.personne.semaine_type.at(e.jour)
  // Un poste fermé (U3 du 2026-11-01) n'est plus proposé, ni planifié.
  if (e.poste?.ferme) return ferme('poste-ferme')
  if (e.journee?.horsContrat) return ferme('hors-contrat')
  if (jourType?.mode === 'repos') return ferme('repos-fixe')
  // Absence fixe AVANT l'école : une école posée par la semaine type ne se
  // retire pas depuis la grille, seulement dans la fiche.
  if (jourType?.mode === 'absence') return ferme('absence-fixe')
  if (e.journee?.ecole) return ferme('ecole')

  const fiche = {
    shiftsAutorises: codesDeLaFiche(e.personne),
    shiftImpose: codesImposes(e.personne.semaine_type, e.horaires),
  }
  const communs = codesDuPoste(e.poste, e.horaires).filter((h) =>
    codeDeLaFiche(fiche, String(h.id)),
  )
  if (!communs.length) return ferme('aucun-commun')
  const permis = communs.filter((h) =>
    codeImposeRespecte(fiche, e.jour, String(h.id)),
  )
  if (!permis.length) return ferme('code-fixe-hors-poste')

  const minimum = reposQuotidienMin(e.personne.mineur)
  const lundi = e.lundi
  const voisins = lundi
    ? (e.voisins ?? [])
        .filter((v) => v.jour !== e.jour)
        .map((v) => ({ v, b: bornes(lundi, v.jour, v.debut, v.fin) }))
    : []
  const codes: T[] = []
  const ecartes: Ecarte<T>[] = []
  for (const h of permis) {
    const ecrit = horaireDe(h)
    const [d, f] = lundi
      ? bornes(lundi, e.jour, ecrit.debut, ecrit.fin)
      : [0, 0]
    const casse = voisins.find(({ v, b: [vd, vf] }) =>
      v.jour < e.jour
        ? !coupureRespectee(vf, null, d, f, minimum)
        : !coupureRespectee(null, vd, d, f, minimum),
    )?.v
    if (!casse) {
      codes.push(h)
      continue
    }
    const cote = casse.jour < e.jour ? 'veille' : 'lendemain'
    ecartes.push({
      horaire: h,
      raison: 'coupure-11h',
      cote,
      texte: texteCoupure(minimum),
    })
  }
  if (!codes.length) {
    return {
      codes,
      raison: 'coupure-11h',
      texte: texteCoupure(minimum),
      ecartes,
    }
  }
  return { codes, raison: null, texte: null, ecartes }
}

// ------------------------------------------------------- journée étoile

/** Un horaire proposé dans la rubrique « Journée étoile », avec l'alerte de
 * coupure de repos s'il la casse (choisissable à la main, comme `ecartes`). */
export interface ChoixEtoile<T> {
  horaire: T
  /** Phrase de la coupure de repos non respectée ; null : rien à dire. */
  alerte: string | null
}

export interface RubriqueEtoile<T> {
  /** Versions étoile de l'horaire du shift, permises pour la personne sur ce
   * poste ce jour-là (`codesPermis`), triées par id. */
  versions: Array<ChoixEtoile<T>>
  /** Le shift est déjà une version étoile : le ou les horaires de 8 h dont
   * il est la version (« Journée normale »), permis de même. Vide sinon. */
  normales: Array<ChoixEtoile<T>>
}

/**
 * Rubrique « Journée étoile » d'un shift (D6 du 2026-11-02) : remplace le
 * bouton qui retirait une heure. Null quand elle n'a pas à être montrée :
 * contrat sans journée étoile (`contratEtoile`), shift sans horaire connu, ou
 * rien à proposer. Les horaires viennent de `codesPermis` (poste, fiche,
 * semaine type, jour fermé) ; un horaire qui casse la coupure de repos est
 * gardé avec son alerte, comme dans le reste du menu.
 */
export function rubriqueEtoile<T extends HoraireEtoile>(
  e: EntreeCodesPermis<T> & {
    personne: Pick<Salarie, 'heures_hebdo' | 'forfait_jours' | 'type_contrat'>
    /** Horaire du shift (null : horaire spécifique). */
    horaireId: number | null
  },
): RubriqueEtoile<T> | null {
  if (!contratEtoile(e.personne) || e.horaireId === null) return null
  const h = e.horaires.find((x) => x.id === e.horaireId)
  if (!h) return null
  const permis = codesPermis(e)
  const choix = (liste: readonly T[]): Array<ChoixEtoile<T>> =>
    liste.flatMap((x): Array<ChoixEtoile<T>> => {
      if (permis.codes.some((c) => c.id === x.id))
        return [{ horaire: x, alerte: null }]
      const ecarte = permis.ecartes.find((c) => c.horaire.id === x.id)
      return ecarte ? [{ horaire: x, alerte: ecarte.texte }] : []
    })
  const versions = choix(versionsEtoile(h, e.horaires))
  const normales = choix(horairesNormaux(h, e.horaires))
  return versions.length || normales.length ? { versions, normales } : null
}
