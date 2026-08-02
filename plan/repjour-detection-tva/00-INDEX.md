# Plan — Détection fiable de la TVA à l'import (repjour)

## Contexte

À l'import des rapports du PMS, l'utilisateur exporte les données depuis une
application tierce. S'il ne coche pas la case « intégrer la TVA », l'export sort
en HT — des montants ~10 % trop bas — qui, une fois importés, faussent tout le
reporting. C'est une erreur **mécanique et fréquente**, pas un cas rare. Le
principe directeur de ce chantier : **ne jamais faire confiance au fichier, et
comprendre réellement la donnée reçue avant de l'écrire.**

Le système actuel de détection est fragile et contre-productif :

- Il compare le forecast importé au **forecast précédent** (`validate.ts:114-136`).
  Ce n'est pas une vérité, juste une version d'avant : si l'ancienne était plus
  basse, la nouvelle correcte paraît « +10 % » → alerte « TVA comptée deux fois »
  en **boucle**, sans fin, même en admin. C'est la principale source d'agacement.
- Le repli **budget** (`validate.ts:137-141`) est bruité : un mois réellement sous
  l'objectif de ~10 % lève un faux positif.
- Le **Comparison** (le réalisé) n'a **aucun** contrôle de TVA (`validateCoherence`
  ne vérifie que négatifs / inventaire), alors que — élément clé découvert lors de
  l'exploration — le fichier Comparison **contient une ligne `VAT`** déjà parsée
  (`comparison.ts:47`, `ComparisonData.today.vat`) mais **jamais exploitée**.

L'idée neuve : privilégier la **vérité contenue dans la donnée elle-même**. Quand
le fichier porte sa TVA (cas du Comparison), on vérifie qu'elle vaut bien ~10 % du
montant HT — contrôle **auto-suffisant, sans référence externe, infaillible**.
Quand le fichier ne porte pas sa TVA (cas probable du Forecast, à confirmer), on
retombe sur une **référence TTC fiable** (le réalisé, à défaut le budget), et on
ne déclenche que sur la **signature exacte de la TVA** (~±10 %) — rigide sur le
vrai cas HT, souple partout ailleurs (fini le nag).

Objectif final, dans les mots de l'utilisateur : « un truc simple qui fait le
job », centré sur le fait de bien **remonter les fichiers livrés sans TVA**. Voir
[[repjour-import-forecast-validation]] et [[ux-messages-hotelier]].

## Vocabulaire

| Terme | Sens ici |
|-------|----------|
| HT | Montant hors taxe (sans TVA). Un export « sans TVA » est en HT. |
| TTC | Montant avec TVA. Convention interne de l'app : tout est stocké en TTC. |
| TVA | Taxe, ici **10 %** (constante `VAT_RATE`). TTC = HT × 1,10. |
| Référence TTC | L'ADR réalisé du mois (`daily_reports`, TTC), étalon sûr pour juger si le forecast porte bien sa TVA. Réalisé seul (pas de budget). |

## Angles à clarifier

Décisions à trancher avant / pendant l'exécution (remontées telles quelles, sans
choix silencieux) :

- **Le fichier Forecast expose-t-il une colonne TVA / taxe ? → TRANCHÉ : NON.**
  Vérifié sur deux exports réels (`doc/Forecast By Date Range_*.csv`). Colonnes :
  DATE, ARR, DEP, OCC, OCC%, ADULT, CHILD, REV, ADR, ADR(an dernier), OCC%(an
  dernier), VARIANCE. Aucune ligne/colonne de taxe. Conséquence : **pas de
  self-check possible pour le forecast** — sa détection passe obligatoirement par
  une référence TTC externe (réalisé, puis budget). Seul le Comparison porte une
  ligne VAT auto-vérifiable.
- **L'écart HT→TTC réel n'est pas un 10 % propre.** Sur les deux exports (même
  mois, même OCC), « avec TVA » / « sans TVA » ≈ **1,1155 au total**, et varie de
  **1,10 à 1,16 selon le jour**. Les bandes de détection doivent donc être
  TOLÉRANTES (viser « ~10 à 16 % sous la référence »), jamais calées pile sur
  ×1,10 avec un écart-type serré (l'ancien détecteur l'était — trop rigide).
- **Détecter la TVA sur le Comparison ? → TRANCHÉ : NON, inutile.** Vérifié sur
  exports réels : le `ROOM REVENUE` du Comparison est TOUJOURS en HT (« Include
  Tax » n'ajoute/retire que les lignes VAT, sans toucher au revenu chambre), et
  l'app le convertit en TTC (× 1,10). Le Comparison est donc robuste au réglage —
  aucun contrôle TVA nécessaire. Le réalisé qu'on en tire (`daily_reports`) est de
  fait une référence TTC fiable. **Le seul fichier piégé par « Include Tax » est le
  Forecast** (son `REV` doit être TTC ; sans la case → HT → sous-comptage). Le
  chantier se resserre donc sur la détection du **forecast en HT**.
- **Budget comme référence ? → TRANCHÉ : NON.** Sa nature TTC n'est pas garantie
  et un mois faible produirait de faux positifs. On détecte **contre le réalisé
  seul** ; sans réalisé (mois futur) on ne détecte pas.
- **Détection « TVA doublée » (montants trop hauts) ? → TRANCHÉ : RETIRÉE.**
  Message `MSG.tvaHigh` supprimé (c'est lui qui misfire), avec la comparaison au
  forecast précédent. Un seul contrôle subsiste : « forecast en HT ».
- **Forçage de la TVA ? → TRANCHÉ : PAS DE FORÇAGE.** Un forecast en HT est une
  donnée fausse → **erreur bloquante** (fichier refusé, ré-exporter), pas un
  avertissement forçable. La question « vrai admin vs droit gestion » devient sans
  objet pour la TVA (une erreur n'est pas forçable). Le « forcer » reste pour les
  avertissements bénins (jours manquants, etc.).
- **Données historiques déjà en base potentiellement en HT** (un incident passé
  l'évoque, cf. commentaires `types.ts:60-66`). Hors périmètre code, mais à
  signaler : un audit lecture seule pourrait être proposé à part.

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-metier-centraliser-taux.md](./1-metier-centraliser-taux.md) | Centraliser le taux TVA | — | P0 | 30 min | Un seul `VAT_RATE`, plus de `10` magique | |
| 2 | [2-metier-reference-ttc.md](./2-metier-reference-ttc.md) | Référence TTC (réalisé, repli budget) | 1 | P0 | 45 min | Un ADR de référence fiable pour juger le forecast | |
| 3 | [3-metier-forecast-reference.md](./3-metier-forecast-reference.md) | Refonte détection TVA forecast | 1 | P0 | 1 h | Détection par référence TTC, fin du nag « forecast précédent » | ⚠ |
| 4 | [4-orchestrateur-cablage-realise.md](./4-orchestrateur-cablage-realise.md) | Brancher le réalisé comme référence | 2, 3 | P0 | 1 h | `validateForecast` reçoit le réalisé (puis budget en repli) | |
| 5 | [5-ui-messages-forcage.md](./5-ui-messages-forcage.md) | Messages + forçage + cohérence des surfaces | 2, 3, 4 | P1 | 1 h | Un message clair, comportement identique sur les 2 imports | |
| 6 | [6-tests-validation.md](./6-tests-validation.md) | Tests + validation globale | 1-5 | P0 | 45 min | Cas HT/TTC couverts par des tests, tsc/build/vitest verts | ⚠ |

## Ordre d'exécution

Séquentiel. L'étape 1 (fondation : un taux unique) débloque 2 et 3, qui sont le
cœur métier et peuvent être écrites l'une après l'autre. L'étape 4 (câblage) exige
la nouvelle signature de `validateForecast` (étape 3) et la logique de self-check
(étape 2). L'étape 5 (UI) vient une fois les messages métier stabilisés. L'étape 6
verrouille l'ensemble par des tests et un audit.

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|-------------------|-------------------|
| Constantes | `src/lib/repjour/constants.ts` | — |
| Parsing | `src/lib/repjour/parse/forecast.ts` (retrait du `10` magique) | — |
| Validation | `src/lib/repjour/calc/validate.ts` | `src/lib/repjour/calc/validate.test.ts` |
| Services (référence réalisé) | `src/lib/repjour/services/daily.ts` (helper `buildTvaRef`) | — |
| Orchestrateur | `src/lib/repjour/import/orchestrator.ts` | — |
| UI | `src/components/repjour/ImportSection.tsx`, `src/components/repjour/ForecastImportButton.tsx` | — |

| **Total** | **~6 modifiés** | **1 nouveau** |
