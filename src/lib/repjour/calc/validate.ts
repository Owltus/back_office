import { TOTAL_ROOMS } from '#/lib/repjour/constants.ts';
import type { Alert, ForecastDay, ForecastRow, KPIBlock, MonthBudget } from '#/lib/repjour/types.ts';

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function stddev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/*
 * Messages de validation forecast — VOLONTAIREMENT sans chiffres et CONSTANTS
 * (identiques d'un mois à l'autre) : `preValidateForecast` les dédoublonne, si
 * bien qu'un même souci sur plusieurs mois ne donne QU'UN message. Phrases
 * simples, tutoiement, on dit juste ce qui cloche et quoi faire.
 */
const MSG = {
  empty: 'Ce mois est vide. Vérifie la période exportée.',
  incomplete:
    "Il manque des jours. Réexporte le mois complet (sauf si le mois n'est pas fini).",
  impossible:
    'Valeurs impossibles dans le fichier : il est mal exporté, reprends-le.',
  occNoRev:
    "Des jours ont de l'occupation mais aucun revenu. Vérifie le fichier.",
  adrWeird: "Prix par chambre anormal. Vérifie que c'est le bon fichier.",
  tvaMissing:
    'Revenus trop bas : la TVA manque sûrement. Vérifie que ton export inclut la TVA.',
  tvaHigh:
    'Revenus trop hauts : TVA en double, ou tu corriges un ancien import. Vérifie avant de forcer.',
} as const

/**
 * Valide les données forecast d'UN mois avant import. Retourne des alertes
 * (error = bloquant, warning = informatif), au plus UNE par souci et sans chiffre.
 */
export function validateForecast(
  rows: ForecastRow[],
  budget: MonthBudget | null,
  daysInMonth: number,
  existingDays?: ForecastDay[] | null
): Alert[] {
  const alerts: Alert[] = [];

  if (rows.length === 0) {
    alerts.push({ type: 'error', message: MSG.empty });
    return alerts;
  }

  // Jours manquants
  if (rows.length < daysInMonth) {
    alerts.push({ type: 'warning', message: MSG.incomplete });
  }

  // UNE seule alerte si au moins une ligne est impossible (valeur négative, ou
  // revenu sans occupation) — pas une par jour. Occ > TOTAL_ROOMS = overbooking,
  // valide, pas d'alerte.
  const hasImpossible = rows.some(
    (r) => r.occ < 0 || r.revTTC < 0 || (r.occ === 0 && r.revTTC > 0),
  );
  if (hasImpossible) {
    alerts.push({ type: 'error', message: MSG.impossible });
  }

  // Occupation SANS revenu : souvent une colonne REV vide (parseFloat -> 0), qui
  // fausse le projeté ; parfois du comp légitime. Avertissement forçable, pas une
  // erreur bloquante — pour ne pas refuser un vrai cas comp.
  const hasOccNoRev = rows.some((r) => r.occ > 0 && r.revTTC === 0);
  if (hasOccNoRev) {
    alerts.push({ type: 'warning', message: MSG.occNoRev });
  }

  // ADR moyen sur le mois
  const totalOcc = rows.reduce((s, r) => s + r.occ, 0);
  const totalRev = rows.reduce((s, r) => s + r.revTTC, 0);
  const avgADR = totalOcc > 0 ? totalRev / totalOcc : 0;

  if (avgADR > 0 && (avgADR < 30 || avgADR > 300)) {
    alerts.push({ type: 'warning', message: MSG.adrWeird });
  }

  // Signaux TVA : « manque la TVA » (revenus trop bas) vs « TVA trop haute » (deux
  // fois, ou correction d'un ancien import HT). Deux détecteurs, MÊME message. Le 4e
  // argument porte l'ÉTAT de l'historique du mois, en TROIS cas :
  //   • absent (null/undefined) = historique INCONNU (lecture échouée) → on ne tente
  //     RIEN, surtout pas le secours budget qui rejouerait un faux positif ;
  //   • tableau VIDE = 1er import CONFIRMÉ du mois → secours budget (un objectif,
  //     pas une vérité, mais faute de mieux au tout premier import) ;
  //   • tableau NON vide = déjà importé → comparaison à l'import précédent, précise
  //     et SILENCIEUSE au réimport du même fichier (ratio ~1) → jamais de nag.
  let tvaMissing = false;
  let tvaHigh = false;

  if (!existingDays) {
    // Historique inconnu (lecture en échec, ou non fournie) → aucune détection TVA.
  } else if (existingDays.length > 0) {
    // Comparaison à l'import précédent (mêmes jours, même occupation). Il faut au
    // moins 5 jours comparables pour que la médiane soit fiable ; en dessous, on ne
    // signale rien (et on ne retombe PAS sur le budget — pas de nag).
    const existingMap = new Map<string, ForecastDay>();
    for (const day of existingDays) {
      existingMap.set(day.date, day);
    }

    const ratios: number[] = [];
    for (const row of rows) {
      if (row.occ <= 0) continue;
      const existing = existingMap.get(row.date);
      if (!existing || existing.occ !== row.occ || existing.rev_ttc <= 0) continue;
      ratios.push(row.revTTC / existing.rev_ttc);
    }

    if (ratios.length >= 5) {
      const med = median(ratios);
      const sd = stddev(ratios);
      if (med > 1.08 && med < 1.12 && sd < 0.02) tvaHigh = true;
      if (med > 0.89 && med < 0.93 && sd < 0.02) tvaMissing = true;
    }
  } else if (budget && budget.prix_moyen > 0 && avgADR > 0) {
    // Tableau vide = 1er import confirmé du mois → secours budget.
    const ratio = avgADR / budget.prix_moyen;
    if (ratio > 0.88 && ratio < 0.93) tvaMissing = true;
    if (ratio > 1.07 && ratio < 1.13) tvaHigh = true;
  }

  if (tvaMissing) alerts.push({ type: 'warning', message: MSG.tvaMissing });
  if (tvaHigh) alerts.push({ type: 'warning', message: MSG.tvaHigh });

  return alerts;
}

export function validateCoherence(realiseJour: KPIBlock): Alert[] {
  const alerts: Alert[] = [];

  // Impossibilités PHYSIQUES (certaines) → bloquantes. Le snapshot de nuit ne peut
  // ni dépasser l'inventaire (80 chambres) ni être négatif. Le taux d'occupation se
  // déduit des nuitées : pas de contrôle séparé (ce serait le même fait).
  if (realiseJour.nuitees < 0 || realiseJour.roomRevenue < 0) {
    alerts.push({ type: 'error', message: 'Valeurs négatives dans le fichier. Il est mal exporté, reprends-le.' });
  }
  if (realiseJour.nuitees > TOTAL_ROOMS) {
    alerts.push({ type: 'error', message: 'Plus de nuitées que de chambres. Fichier à vérifier.' });
  }

  // Incohérences PROBABLES, avec de rares cas limites room-only légitimes (day-use,
  // no-show, comp) → à vérifier, non bloquantes.
  if (realiseJour.nuitees > 0 && realiseJour.roomRevenue === 0) {
    alerts.push({ type: 'warning', message: 'Des chambres vendues mais aucun revenu. À vérifier.' });
  }
  if (realiseJour.nuitees === 0 && realiseJour.roomRevenue > 0) {
    alerts.push({ type: 'warning', message: 'Du revenu sans chambre vendue. À vérifier.' });
  }

  return alerts;
}
