/*
 * Les postes NON indispensables n'ont plus de grille (décision utilisateur du
 * 2026-11-11, page Besoins : « des postes pas jugés importants d'un point de
 * vue planning… tu remplis au mieux suivant chaque personne, ses jours de
 * repos, son temps de travail »). Le calcul lit, à la place des besoins en
 * base, une place FACULTATIVE (renfort 1, aucune place à pourvoir) pour
 * chaque horaire permis du poste, chaque jour : qui y va, quand et combien,
 * c'est sa fiche qui le dit (semaine type, repos, heures dues, rythme).
 *
 * Les besoins en base de ces postes restent, plus lus. Ceux d'un poste
 * indispensable (le tableau du personnel) étaient déjà ignorés (D13).
 *
 * Seulement quand la base porte la zone fixe (`referentiel.zones`, toujours
 * présente depuis 20261111110000) : les jeux de test sans zone gardent
 * leurs besoins écrits, qui exercent le calcul des places.
 */

import { codesDuPoste } from '#/lib/planning/eligibilite.ts'
import { estIndispensable } from '#/lib/planning/modele.ts'
import type { Besoin, Referentiel } from '#/lib/planning/types.ts'

/** Un poste rempli au mieux : ouvert, ni indispensable ni dans le tableau. */
export function rempliAuMieux(p: {
  ferme?: boolean | null
  indispensable?: boolean | null
  zone_id?: number | null
}): boolean {
  return !p.ferme && !estIndispensable(p) && p.zone_id == null
}

/** Les besoins que lit le calcul (voir l'en-tête). Identifiants négatifs pour
 * les places déduites : jamais ceux d'une ligne en base. */
export function besoinsLus(
  r: Pick<Referentiel, 'besoins' | 'postes' | 'horaires' | 'zones'>,
): Besoin[] {
  if (!r.zones?.length) return [...r.besoins]
  const auMieux = r.postes.filter(rempliAuMieux)
  const ids = new Set(auMieux.map((p) => p.id))
  const deduits: Besoin[] = []
  for (const p of [...auMieux].sort((a, b) => a.id - b.id)) {
    const horaires = codesDuPoste(p, r.horaires).sort((a, b) => a.id - b.id)
    for (let jour = 0; jour < 7; jour++)
      for (const h of horaires)
        deduits.push({
          // Loin des places du tableau (`idPlaceAccueil`, < 100 000 + …).
          id: -(10_000_000 + deduits.length + 1),
          poste_id: p.id,
          jour,
          horaire_id: h.id,
          debut: h.debut,
          fin: h.fin,
          effectif: 0,
          soutien: 0,
          renfort: 1,
        })
  }
  return [...r.besoins.filter((b) => !ids.has(b.poste_id)), ...deduits]
}
