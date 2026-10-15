// Gestionnaire HTTP de `montre-resume` : quelques chiffres du matin pour la
// montre Garmin de l'utilisateur, et RIEN d'autre.
//
// SÉCURITÉ
//   - verify_jwt = false (config.toml + SANS_VERIF_JWT de la livraison) : la
//     montre n'a pas de session. La barrière unique est l'en-tête X-Montre-Cle,
//     comparé EN TEMPS CONSTANT au secret MONTRE_CLE (distinct d'IMPORT_SECRET,
//     révocable seul : changer le secret, puis recompiler l'app de la montre).
//   - Lecture seule, colonnes explicites (source.ts), réponse construite champ
//     par champ (liste blanche, figée par les tests) : aucun montant en euros,
//     aucune donnée nominative.
//   - Pas d'en-tête CORS (la montre n'est pas un navigateur), `no-store`, et la
//     clé n'est jamais journalisée.
//
// RÉPONSES : 200 résumé · 401 clé absente ou fausse (toujours le même corps) ·
// 405 autre méthode que GET · 500 MONTRE_CLE ou configuration absente ·
// 503 lecture en échec (la montre garde alors ses derniers chiffres).

import { cleServeur } from '../_shared/environnement.ts'
import type { LireVariable } from '../_shared/environnement.ts'
import { businessDateStr, shiftDateStr } from '../_shared/businessDay.ts'
import { comptesPdj, resumeRep } from './regles.ts'
import type { Source } from './source.ts'

export type Dependances = {
  lire: LireVariable
  creerSource: (url: string, cle: string) => Source
  maintenant: () => Date
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  })

/** Copie de secretMatches (import-report/index.ts), laissé intact : SHA-256 des
 * deux valeurs puis comparaison sans court-circuit. */
async function secretMatches(
  provided: string | null,
  expected: string,
): Promise<boolean> {
  if (provided == null) return false
  const enc = new TextEncoder()
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(provided)),
    crypto.subtle.digest('SHA-256', enc.encode(expected)),
  ])
  const va = new Uint8Array(a)
  const vb = new Uint8Array(b)
  let diff = 0
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i]
  return diff === 0
}

export async function traiter(
  req: Request,
  deps: Dependances,
): Promise<Response> {
  if (req.method !== 'GET') return json({ error: 'Méthode non autorisée' }, 405)

  const cle = deps.lire('MONTRE_CLE')
  if (!cle) return json({ error: 'Configuration serveur manquante' }, 500)
  if (!(await secretMatches(req.headers.get('X-Montre-Cle'), cle)))
    return json({ error: 'Non autorisé' }, 401)

  const url = deps.lire('SUPABASE_URL')
  const serviceKey = cleServeur(deps.lire)
  if (!url || !serviceKey)
    return json({ error: 'Configuration serveur manquante' }, 500)

  // REP jour en J-1 du jour hôtelier (getImportDayStr de DashboardBoard), PDJ
  // sur le jour hôtelier lui-même (BreakfastBoard). Bascule à 02h, Paris.
  const jourPdj = businessDateStr(deps.maintenant())
  const jourRep = shiftDateStr(jourPdj, -1)
  const annee = Number(jourRep.slice(0, 4))
  const mois = Number(jourRep.slice(5, 7))

  try {
    const source = deps.creerSource(url, serviceKey)
    const [rapport, budgetMois, lignesPdj] = await Promise.all([
      source.rapport(jourRep),
      source.budgetMois(annee, mois),
      source.pdj(jourPdj),
    ])
    // Mode partiel seulement : deux lectures de plus, sinon inutiles.
    const [dernierCumulDuMois, forecastMois] = rapport
      ? [null, null]
      : await Promise.all([
          source.dernierCumulDuMois(annee, mois),
          source.forecastMois(annee, mois),
        ])

    const rep = resumeRep({ rapport, dernierCumulDuMois, forecastMois, budgetMois })
    const pdj = comptesPdj(lignesPdj)
    // Liste blanche : chaque champ est recopié un par un.
    return json({
      rep: {
        date: jourRep,
        partiel: rep.partiel,
        pct_precedent: rep.pct_precedent,
        pct_veille: rep.pct_veille,
        pct_projete: rep.pct_projete,
        to: rep.to,
      },
      pdj: {
        date: jourPdj,
        disponible: pdj.disponible,
        restent: pdj.restent,
        departs: pdj.departs,
        inclus: pdj.inclus,
      },
    })
  } catch (e) {
    // Détail côté serveur seulement ; jamais la clé ni les en-têtes.
    console.error('montre-resume : lecture en échec', e instanceof Error ? e.message : e)
    return json({ error: 'Service indisponible' }, 503)
  }
}
