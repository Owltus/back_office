# Étape 4 — Tooltips détaillés + hints des cartes

## Objectif

Le cœur de la demande utilisateur : que TOUT soit détaillé et bien construit, en particulier
les tooltips. Exploiter le `labelFormatter` ajouté à `KpiLineChart` (étape 1) pour des
en-têtes d'infobulle riches partout, et ajouter les `hint` explicatifs manquants sur les
cartes.

## Fichier(s) impacté(s)

- `src/components/repjour/boards/AnalytiqueBoard.tsx`, `AnalytiqueMoisBoard.tsx`
- `src/components/parking/ParkingAnalytiqueBoard.tsx`, `ParkingAnalytiqueMoisBoard.tsx`
- `src/components/caisse/CaisseAnalytiqueBoard.tsx`, `CaisseAnalytiqueMoisBoard.tsx`
- `src/components/rapro/RaproAnalytiqueBoard.tsx`, `RaproMonthlyBoard.tsx`

## Travail à réaliser

### 1. En-têtes d'infobulle riches sur les graphes en lignes

Passer un `labelFormatter` aux `KpiLineChart` de repjour, parking, caisse (aujourd'hui
l'en-tête affiche « Fév » ou « 15 » bruts) :
- Vues PARENT (annuelles) : « Fév » → « Février 2026 » (mois complet + année), comme le fait
  déjà pdj/rapro pour leur bar chart (`PdjAnalytiqueBoard.tsx:287-291`).
- Vues ENFANT (mensuelles) : numéro de jour → « Mardi 15 février » (jour de semaine +
  date), comme `PdjAnalytiqueMoisBoard.tsx:268-276`.

Réutiliser les constantes `MONTHS_LABELS`/`DAY_NAMES` partagées (étape 2) et/ou date-fns
`format(..., 'EEEE d MMMM', { locale: fr })` + `capitalize`, selon ce qui est déjà en place.

### 2. Cohérence du contenu d'infobulle

- rapro : envisager d'ajouter le TOTAL « Vendues » dans l'infobulle (aujourd'hui l'utilisateur
  doit additionner nettoyée+bloquée+refus alors que Vendues est la carte-phare) — à voir avec
  l'utilisateur, sinon garder tel quel. Aligner le traitement du zéro (le tableau grise un 0,
  l'infobulle l'affiche en toutes lettres).
- Vérifier que les valeurs d'infobulle utilisent les formats partagés (étape 2).

### 3. Ajouter les `hint` manquants sur les cartes

`StatTile`/`StatCard` supporte `hint` (tooltip d'explication). L'ajouter là où il manque,
avec un texte court et clair (style [[ux-messages-hotelier]], tutoiement, sans jargon) :
- **parking** : aucune carte n'a de hint (`ParkingAnalytiqueBoard.tsx:117-138`,
  `ParkingAnalytiqueMoisBoard.tsx:97-116`) — expliquer « Taux d'occupation moyen »,
  « Réservations », « Payées/Réservées/Impayées ».
- **rapro** : les cartes analytique n'ont pas de hint alors que le board opérationnel
  (`RaproBoard.tsx:743…`) en a — reprendre les mêmes explications (Vendues, Moyenne
  nettoyées/jour, etc.).
- Vérifier repjour : ses cartes utilisent `reference` (objectif) mais aucun `hint` — ajouter
  une explication courte par carte pour l'homogénéité (à confirmer, non bloquant).

### 4. Légende écran des line charts mono-série (selon décision)

Si l'arbitrage retenu est « masquer la légende quand une seule série » : le faire pour
parking et caisse (une seule série `occ`/`encaisse`, la légende est redondante avec le
titre). Nécessite une petite prop `showLegend` sur `KpiLineChart` (défaut `true`) ou une
détection auto (une seule clé de série → pas de légende). Repjour (3 séries) garde la légende.

## Ordre d'exécution

1. `labelFormatter` sur les line charts repjour/parking/caisse (parent puis enfant).
2. Hints des cartes parking, rapro (+ repjour si retenu).
3. Cohérence contenu infobulle (zéro, total rapro si retenu).
4. Légende mono-série (si décision « masquer »).

## Critère de validation

- `npx tsc --noEmit` sans erreur.
- Au survol des graphes repjour/parking/caisse, l'en-tête d'infobulle affiche le mois complet
  (annuel) ou le jour daté (mensuel), plus « Fév »/« 15 » bruts.
- Les cartes parking et rapro affichent une explication au survol.
- Revue navigateur sur les 10 pages (voir étape 6).
