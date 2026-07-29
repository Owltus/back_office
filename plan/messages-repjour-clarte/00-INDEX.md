# Plan — Messages repjour clairs et complets

## Contexte

Un hôtelier a poussé un rapport sans TVA en forçant un avertissement, faussant les
chiffres prévus de ~10 000 €. En creusant, on a constaté que beaucoup de messages de
la page repjour sont soit énigmatiques (jargon comptable : « revenu », « occupation »,
« TTC/HT », « forecast », « Comparison », « MTD »), soit carrément techniques (messages
d'exception Supabase bruts, noms de colonnes CSV, index de colonne), soit absents
(échecs silencieux : date illisible rangée à une fausse date, échec de chargement
confondu avec « aucune donnée », copie d'image / envoi qui échoue sans un mot).

Le but : reprendre TOUS les messages destinés à l'utilisateur (erreurs, avertissements,
succès, informations, états vides, confirmations) pour qu'ils soient compris par
quelqu'un SANS contexte — ni hôtelier expert, ni développeur. Couvrir un MAXIMUM de cas,
en ajoutant un message clair là où un souci peut aujourd'hui passer en silence. Garder
et clarifier le garde-fou TVA : un hôtelier voit un message clair mais ne peut pas
forcer un fichier à TVA suspecte ; un administrateur, lui, peut toujours forcer.

Contrainte de ton (mémoire [[ux-messages-hotelier]]) : tutoiement partout, phrases
courtes, pas de jargon, ponctuation simple (ni tiret cadratin ni guillemets typographiques
autour des mots). On dit ce qui cloche et quoi faire.

Cette session a déjà fait une première passe sur `validate.ts` (objet MSG et
`validateCoherence` réécrits, garde-fou TVA `forceRequiresAdmin` posé, modale
`ImportSection` adaptée). Ce plan finalise et étend à toute la feature.

## Vocabulaire : jargon à bannir dans les messages

| Jargon | À dire à la place |
|--------|-------------------|
| revenu, revenus | montant(s), chiffre d'affaires |
| occupation | chambres occupées / vendues |
| un import (nom) | un rapport, un fichier |
| TTC / HT | avec / sans la TVA (ou juste « TVA ») |
| forecast | prévision(s) |
| Comparison | chiffres du jour, rapport réel |
| MTD, Cumul brut | cumul depuis le début du mois |
| projeté | prévu (fin de mois) |
| CSV, PMS, TODAY, OCC, REV, ADR | (à supprimer des messages) |

Les noms exacts des fichiers exportés (« Comparison By Date », « Forecast By Date
Range ») restent cités entre guillemets EN INDICE, car l'utilisateur doit les
retrouver dans son logiciel — mais toujours précédés d'un libellé clair.

## Angles à clarifier

Décisions à trancher avant / pendant l'exécution :

- **Périmètre du vocabulaire KPI.** Les libellés RevPAR / ADR / PM / TTC des cartes
  (`SummaryCards`), du tableau (`KPITable`) et surtout du panneau « Détail des calculs »
  (`KPIDetailPanel`, qui EXPLIQUE volontairement ces termes) sont du vocabulaire métier
  assumé, pas des « messages ». Recommandation : les LAISSER hors périmètre. À confirmer
  si tu veux aussi les simplifier.
- **Nouveaux messages : jusqu'où couvrir les échecs silencieux ?** Recommandation :
  couvrir les 5 cas à vrai impact (date illisible rangée à une fausse date ; échec de
  chargement distinct de « aucune donnée » ; échec de copie d'image / d'envoi ; lecture
  des destinataires en échec ; fuite d'erreur Supabase brute). Laisser les cas
  quasi impossibles (`kpi.ts` / `ecart.ts` division par zéro sur des constantes).
- **Date illisible = comportement modifié.** Aujourd'hui, un fichier sans date dans son
  nom est rangé SILENCIEUSEMENT à hier. Recommandation : le refuser avec un message
  clair. C'est un changement de comportement (un blocage nouveau) — à valider.
- **`confirm()` / `window.alert()` natifs.** Plusieurs subsistent (suppression jour,
  suppression destinataire). Recommandation minimale : humaniser leur texte. Bonus
  possible : les remplacer par des modales shadcn cohérentes. À confirmer.
- **Fuite des erreurs Supabase.** Recommandation : afficher un message humain et
  journaliser le détail technique en console (`console.error`), au lieu de montrer le
  message brut de la base. À valider comme règle générale.

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-metier-validation.md](./1-metier-validation.md) | Messages de validation (métier) | — | P0 | 30 min | `validate.ts` centralisé et clair | |
| 2 | [2-metier-orchestrateur-parsing.md](./2-metier-orchestrateur-parsing.md) | Orchestrateur, parsing, services | 1 | P0 | 1 h 30 | Throws humanisés, plus de fuite Supabase, date illisible couverte | ⚠ |
| 3 | [3-ui-flux-import.md](./3-ui-flux-import.md) | UI du flux d'import | 2 | P0 | 1 h | `ImportSection` / `ForecastImportButton` clairs | |
| 4 | [4-ui-page-modales.md](./4-ui-page-modales.md) | UI page, états vides, modales | 2 | P1 | 1 h | États clairs, alertes natives humanisées, tutoiement | |
| 5 | [5-validation-inventaire.md](./5-validation-inventaire.md) | Validation globale + inventaire avant/après | 1,2,3,4 | P0 | 40 min | tsc/build OK + tableau complet des messages | ⚠ |

## Ordre d'exécution

Séquentiel : 1 → 2 → 3 → 4 → 5. Les étapes 3 et 4 pourraient se paralléliser (UI
distincte), mais elles dépendent toutes deux des messages métier humanisés en 2
(erreurs propagées). On garde l'ordre pour une revue cohérente. L'étape 5 produit le
livrable que tu as demandé : l'inventaire avant/après de tous les messages.

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|-------------------|-------------------|
| Métier — validation | `src/lib/repjour/calc/validate.ts`, `src/lib/repjour/types.ts` | — |
| Métier — flux | `src/lib/repjour/import/orchestrator.ts`, `src/lib/repjour/parse/{comparison,forecast,metrics,date}.ts`, `src/lib/repjour/services/{recipients,data}.ts`, `src/lib/repjour/sendServer.ts` | — |
| UI — import | `src/components/repjour/ImportSection.tsx`, `src/components/repjour/ForecastImportButton.tsx` | — |
| UI — page | `src/components/repjour/boards/DashboardBoard.tsx`, `src/components/repjour/RecipientsModal.tsx`, `src/components/repjour/ProtectedRoute.tsx` | — |
| **Total** | **15 modifiés** | **0 nouveau** |
