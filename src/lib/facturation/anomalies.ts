import {
  issuerOutliers,
  type IssuerCodes,
  type IssuerOutlier,
} from '#/lib/facturation/issuerCodes.ts'
import {
  confusableCodes,
  type CodePair,
  type WordPool,
} from '#/lib/facturation/wordpool.ts'

/*
 * File de revue des ANOMALIES — logique PURE, calculée À LA VOLÉE depuis les modèles déjà
 * en cache (aucune table, aucun état serveur). Le système DÉTECTE et PROPOSE ; l'utilisateur
 * VALIDE (human-in-the-loop). Résoudre une anomalie = les RPC existantes (unlearnIssuerCodes,
 * denylist, pruneClouds) — rien à persister ici.
 *   - `issuer-outlier` : chez un émetteur mûr, une imputation marginale (probable erreur).
 *   - `confusable-codes` : deux codes dont les nuages se ressemblent trop.
 */

export type Anomaly =
  | { kind: 'issuer-outlier'; data: IssuerOutlier }
  | { kind: 'confusable-codes'; data: CodePair }

/** Agrège toutes les anomalies détectables depuis les modèles appris. */
export function reviewQueue(
  pool: WordPool,
  issuerCodes: IssuerCodes,
): Anomaly[] {
  return [
    ...issuerOutliers(issuerCodes).map(
      (data): Anomaly => ({ kind: 'issuer-outlier', data }),
    ),
    ...confusableCodes(pool).map(
      (data): Anomaly => ({ kind: 'confusable-codes', data }),
    ),
  ]
}
