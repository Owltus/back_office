# Étape 9 — Validation bout-en-bout + garde-fous

## Objectif

Vérifier tout le chantier en conditions réelles, sans risque, avant l'exploitation.

## Qui

TOI (déclenchement) + MOI (analyse).

## Travail à réaliser

1. **Sommeil import** : compte utilisateur → plus d'import visible (RepJour + PDJ) ;
   saisie « servi » PDJ et reste des pages OK. (Filet admin visible si retenu.)
2. **RepJour auto (dry-run d'abord)** : avec `IMPORT_DRY_RUN=true`, envoyer un
   Comparison + un Forecast → logs : détection « les deux présents », aucun envoi
   (dry-run). Puis `REPORT_TEST_TO` sur ton adresse + désactiver dry-run → vérifier
   qu'UN e-mail RepJour arrive (à toi), projeté correct, pas de doublon au ré-import.
3. **PDJ** : ajouter des destinataires PDJ (modale) ; déclencher l'envoi (bouton ou
   auto) → e-mail PDJ reçu depuis `noreply@pdj.naostack.com` (via `REPORT_TEST_TO`).
4. **Sécurité / idempotence** : double import → pas de double envoi ; `REPORT_TEST_TO`
   respecté ; expéditeurs corrects (repjour vs pdj) ; listes non mélangées.
5. Quand tout est vert → retirer `REPORT_TEST_TO` (envois réels).

## Critère de validation

- Import manuel en sommeil, import auto intact.
- 1 e-mail RepJour auto quand les deux rapports sont là, jamais de doublon.
- 1 e-mail PDJ vers la liste PDJ depuis le bon expéditeur.
- Aucun impact sur les flux existants (envoi manuel RepJour, saisie PDJ).

## Contrôle /borg

Étape finale : revue globale — pas de fuite de secret, pas de double envoi, RLS
respectée, dry-run respecté, isolation RepJour/PDJ, import manuel réactivable (flag).
