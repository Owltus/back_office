/*
 * Un planning EN MÉMOIRE pour porter les tests d'API du prototype sans base :
 * mêmes gestes que les routes (`/generer`, `/fixes`, pose d'un shift), avec
 * les règles d'écriture des RPC (`planning_appliquer_generation` :
 * propositions des jours à venir effacées, jours absents sautés). Les
 * contrôles d'accès, verrous et refus 409/423 vivent en base : pas ici.
 */

import { generer, type Highs } from '#/lib/planning/generateur.ts'
import {
  analyser,
  aPoserFixes,
  preparerGeneration,
  type DonneesSemaine,
  type OptionsGeneration,
  type SemaineOut,
} from '#/lib/planning/semaine.ts'
import {
  ajouterJours,
  ecartJours,
  horaireDe,
  lundiDe,
} from '#/lib/planning/temps.ts'
import type { Absence, Affectation, Referentiel } from '#/lib/planning/types.ts'

export interface Pose {
  code?: string
  debut?: string
  fin?: string
  court?: boolean
  pause?: number
  epinglee?: boolean
}

export class PlanningMemoire {
  semaines = new Map<string, Affectation[]>()
  private suivant = 1

  constructor(
    public referentiel: Referentiel,
    public absences: Absence[],
    public aujourdhui: string,
    private highs: Highs,
  ) {}

  shifts(lundi: string): Affectation[] {
    return this.semaines.get(lundiDe(lundi)) ?? []
  }

  donnees(lundi: string): DonneesSemaine {
    const l = lundiDe(lundi)
    return {
      lundi: l,
      referentiel: this.referentiel,
      absences: this.absences,
      affectations: this.shifts(l),
      avant: this.shifts(ajouterJours(l, -7)),
      apres: this.shifts(ajouterJours(l, 7)),
    }
  }

  analyser(lundi: string): SemaineOut {
    return analyser(this.donnees(lundi))
  }

  salarie(prenom: string) {
    const x = this.referentiel.salaries.find((s) => s.prenom === prenom)
    if (!x) throw new Error(`fiche inconnue : ${prenom}`)
    return x
  }

  poste(nom: string): number {
    const p = this.referentiel.postes.find((q) => q.nom === nom)
    if (!p) throw new Error(`poste inconnu : ${nom}`)
    return p.id
  }

  horaire(code: string) {
    const h = this.referentiel.horaires.find((x) => x.code === code)
    if (!h) throw new Error(`code inconnu : ${code}`)
    return h
  }

  motif(code: string): number {
    const m = this.referentiel.motifs.find((x) => x.code === code)
    if (!m) throw new Error(`motif inconnu : ${code}`)
    return m.id
  }

  /** Un jour d'absence par jour de la période (une ligne par jour). */
  absent(salarieId: number, debut: string, fin: string, motif: string) {
    const id = this.motif(motif)
    let n = Math.max(0, ...this.absences.map((a) => a.id))
    for (let j = debut; j <= fin; j = ajouterJours(j, 1)) {
      this.absences = this.absences.filter(
        (a) => !(a.salarie_id === salarieId && a.jour === j),
      )
      this.absences.push({
        id: ++n,
        salarie_id: salarieId,
        jour: j,
        motif_id: id,
      })
      // Un jour devenu absent n'a plus de shift (trigger planning_absences_retire_shift).
      const l = lundiDe(j)
      const jour = ecartJours(l, j)
      this.semaines.set(
        l,
        this.shifts(l).filter(
          (a) => !(a.salarie_id === salarieId && a.jour === jour),
        ),
      )
    }
  }

  /** Pose d'un shift à la main (route POST affectations) : un shift codé
   * prend les heures et la pause de son code ; épinglé par défaut. */
  poser(
    lundi: string,
    salarieId: number,
    posteId: number,
    jour: number,
    p: Pose = {},
  ): SemaineOut {
    const l = lundiDe(lundi)
    let a: Affectation
    if (p.code) {
      const h = this.horaire(p.code)
      const court = !!p.court && h.raccourci > 0
      const { debut, fin } = horaireDe(h, court)
      a = this.shift(
        l,
        salarieId,
        posteId,
        jour,
        h.id,
        debut,
        fin,
        court,
        h.pause,
        p.epinglee ?? true,
      )
    } else {
      a = this.shift(
        l,
        salarieId,
        posteId,
        jour,
        null,
        p.debut ?? '09:00',
        p.fin ?? '17:00',
        false,
        p.pause ?? 0,
        p.epinglee ?? true,
      )
    }
    if (
      this.shifts(l).some((b) => b.salarie_id === salarieId && b.jour === jour)
    ) {
      throw new Error('un seul shift par jour')
    }
    this.semaines.set(l, [...this.shifts(l), a])
    return this.analyser(l)
  }

  private shift(
    lundi: string,
    salarieId: number,
    posteId: number,
    jour: number,
    horaireId: number | null,
    debut: string,
    fin: string,
    court: boolean,
    pause: number,
    epinglee: boolean,
  ): Affectation {
    return {
      id: this.suivant++,
      lundi,
      salarie_id: salarieId,
      poste_id: posteId,
      jour,
      horaire_id: horaireId,
      debut,
      fin,
      epinglee,
      court,
      pause,
    }
  }

  vider(lundi: string) {
    this.semaines.set(lundiDe(lundi), [])
  }

  retirer(id: number) {
    for (const [l, as] of this.semaines)
      this.semaines.set(
        l,
        as.filter((a) => a.id !== id),
      )
  }

  /** Route `/generer` (prototype `generer_semaine`) + RPC d'application. */
  generer(
    lundi: string,
    o: Omit<OptionsGeneration, 'aujourdhui'> = {},
  ): SemaineOut {
    const l = lundiDe(lundi)
    const g = preparerGeneration(this.donnees(l), {
      aujourdhui: this.aujourdhui,
      ...o,
    })
    const nouveaux = g.traduire(generer(g.probleme, this.highs))
    const exclus = o.exclus ?? new Set<number>()
    let restants = this.shifts(l)
    if (!o.sansEffacer) {
      restants = restants.filter(
        (a) =>
          a.jour < g.depuis ||
          (!o.tout && a.epinglee && !exclus.has(a.salarie_id)),
      )
    }
    const absents = new Set(
      this.absences.map((a) => `${a.salarie_id}|${a.jour}`),
    )
    const poses = nouveaux
      .filter(
        (n) =>
          n.jour >= g.depuis &&
          !absents.has(`${n.salarie_id}|${ajouterJours(l, n.jour)}`),
      )
      .map((n) =>
        this.shift(
          l,
          n.salarie_id,
          n.poste_id,
          n.jour,
          n.horaire_id,
          n.debut,
          n.fin,
          n.court,
          n.pause,
          false,
        ),
      )
    this.semaines.set(l, [...restants, ...poses])
    return this.analyser(l)
  }

  /** Route `/fixes` (prototype `poser_fixes`). */
  fixes(lundi: string): SemaineOut {
    const seulement = aPoserFixes(this.donnees(lundi), this.aujourdhui)
    if (!seulement.size) return this.analyser(lundi)
    return this.generer(lundi, {
      seulement,
      sansEffacer: true,
      titulairesSeulement: true,
    })
  }

  /** Route `/valider`. */
  valider(
    lundi: string,
    o: { salarie?: number; jour?: number; epinglee?: boolean },
  ) {
    const l = lundiDe(lundi)
    this.semaines.set(
      l,
      this.shifts(l).map((a) =>
        (o.salarie === undefined || a.salarie_id === o.salarie) &&
        (o.jour === undefined || a.jour === o.jour)
          ? { ...a, epinglee: o.epinglee ?? true }
          : a,
      ),
    )
    return this.analyser(l)
  }
}
