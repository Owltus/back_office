# Étape 3 — Refonte de la détection TVA du forecast

## Objectif

Remplacer la détection actuelle (comparaison au forecast **précédent** →
faux positifs en boucle) par une comparaison à une **référence TTC fiable**, et ne
déclencher que sur la **signature exacte de la TVA** (~1/1,10). Rigide sur le vrai
cas HT, souple partout ailleurs.

## Contexte

`validate.ts:109-142` a trois branches selon `existingDays` :
- branche B (`existingDays` non vide) : compare au forecast précédent → **c'est le
  nag** ;
- branche C (`existingDays` vide) : repli budget (bruité) ;
- branche A (`existingDays` absent) : rien.

On supprime la branche B (le forecast précédent n'est pas une vérité). La référence
devient : **réalisé du mois** (fiable, TTC) → à défaut **budget** → sinon rien.

## Fichier(s) impacté(s)

- `src/lib/repjour/calc/validate.ts`

## Travail à réaliser

### 1. Nouvelle signature de `validateForecast`

Ajouter une référence TTC explicite (`TvaRef`, cf. étape 2), fournie par
l'orchestrateur (étape 4). La référence est le **réalisé UNIQUEMENT** (le budget
est écarté : trop bruité, source de faux positifs sur un mois faible).

```ts
export function validateForecast(
  rows: ForecastRow[],
  daysInMonth: number,
  ref: TvaRef | null, // réalisé du mois ; null = pas de référence fiable
): Alert[]
```

`ref` remplace `existingDays`. Le paramètre `budget` disparaît de cette fonction
(il n'y servait qu'au repli TVA, désormais abandonné). `ref === null` (mois futur,
début de mois) → **aucune détection TVA** : on ne devine pas sans référence sûre.

### 2. Logique de détection unique — bande TOLÉRANTE

Observation sur données réelles (`doc/Forecast By Date Range_*.csv`) : l'écart
HT→TTC n'est PAS un 10 % propre — il vaut ~1,1155 au total et varie de 1,10 à
1,16 selon le jour. Donc un forecast en HT apparaît ~10 à 16 % SOUS une référence
TTC (ratio ~0,86 à 0,91), pas pile à 0,909. La bande doit couvrir cette réalité,
sans être si large qu'elle attrape une prévision légitimement basse.

```ts
// avgADR = totalRevTTC / totalOcc (déjà calculé pour adrWeird)
if (ref && ref.adrTTC > 0 && avgADR > 0) {
  const ratio = avgADR / ref.adrTTC
  // Forecast nettement sous le réalisé = exporté en HT (zone ~10 à 16 % en
  // dessous). C'est une DONNÉE FAUSSE, pas un simple avertissement → ERROR
  // BLOQUANTE : le fichier est refusé, l'hôtelier doit le ré-exporter. Pas de
  // forçage (une erreur n'est pas forçable).
  if (ratio > 0.83 && ratio < 0.93) {
    alerts.push({ type: 'error', message: MSG.tvaMissing })
  }
}
```

Au-dessus de ~0,95 : forecast cohérent, **rien**. Entre 0,93 et 0,95 : zone grise,
**rien** (souple). En dessous de ~0,83 : trop bas pour une simple TVA manquante
(autre problème) → ne pas crier « TVA » (laisser adrWeird parler). Les seuils
exacts seront confirmés à l'exécution ; NE PAS exiger un écart-type ultra-serré
(l'écart réel varie de 10 à 16 % par jour). **Arrêt net car on ne détecte que
contre le réalisé** (fiable) : un forecast correct du mois en cours suit son
réalisé, il ne tombe donc jamais 10 % en dessous par accident. Voir aussi
[[repjour-import-forecast-validation]].

### 3. Supprimer la branche « forecast précédent »

Retirer tout le bloc `existingDays.length > 0` (comparaison au précédent, médiane
sur ratios, `median`/`stddev` deviennent inutilisés → les supprimer aussi s'ils ne
servent plus ailleurs).

### 4. Messages

Reformuler `MSG.tvaMissing` en refus clair (c'est une erreur, pas un avertissement) :

```ts
tvaMissing:
  "Ce forecast est en HT (montants ~10 % trop bas) : la TVA n'a pas été incluse à l'export. Ré-exporte-le en cochant « Include Tax ».",
```

**Supprimer `MSG.tvaHigh` définitivement** (« TVA comptée deux fois ») ainsi que
tout le code qui l'émettait : c'est le message qui misfire, et le double-TVA n'a
plus lieu d'être (le forecast n'a pas de repli budget, et le Comparison est
robuste). Un seul message TVA subsiste, côté forecast, et il est bloquant.

## Ordre d'exécution

1. Changer la signature (`ref` au lieu de `existingDays`).
2. Réécrire le bloc de détection TVA.
3. Supprimer la branche précédent + helpers orphelins.
4. `npx tsc --noEmit` (l'orchestrateur cassera tant que l'étape 4 n'est pas faite —
   attendu, les deux étapes vont ensemble).

## Critère de validation

- Plus aucune comparaison au forecast précédent dans `validate.ts` ; `MSG.tvaHigh`
  supprimé ; `median`/`stddev` supprimés s'ils deviennent orphelins.
- Un forecast ~10 à 16 % sous le réalisé lève une **error** (fichier refusé) ; un
  forecast proche du réalisé ne lève rien ; un forecast franchement différent
  (hors zone) ne lève rien côté TVA. `ref === null` → aucune détection.
- `npx tsc --noEmit` vert une fois l'étape 4 alignée.

## Contrôle /borg

Étape critique (cœur de la détection). Auditer :
- pas de faux négatif : un vrai import HT est bien refusé quand le réalisé existe ;
- pas de faux positif : un forecast correct du mois en cours (qui suit son réalisé)
  n'est jamais refusé ;
- comportement défini et sûr quand `ref === null` (aucune détection, pas de crash) ;
- l'erreur bloque bien l'écriture (pas de mauvaise donnée persistée), et le message
  dit clairement quoi faire (ré-exporter).
