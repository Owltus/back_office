# Étape 3 — Planning : la règle des jours passés

## Objectif

Faire tenir par la base la règle « on ne touche pas au passé » (PL409) que l'aide annonce. Aujourd'hui, seules les fonctions Générer et Vider l'appliquent. Le périmètre dépend de la décision Q1.

## Contexte

Faits relevés :

- l'écran permet de modifier les jours passés d'une semaine non verrouillée (`VueSemaine.tsx:217`) ;
- la fiche permet de poser une absence passée (onglet « Passées ») ;
- l'aide (`AidePlanningContenu.tsx:1361`) dit l'inverse.

Le correctif strict proposé par l'audit casserait ces usages.

## Fichier(s) impacté(s)

- `supabase/migrations/20261118160000_planning_passe_fige.sql` (nouveau)
- `supabase/tests/05_planning.test.sql` (nouveaux cas, `plan(N)`)
- selon Q1 : `src/components/planning/semaine/VueSemaine.tsx`, `src/components/planning/AidePlanningContenu.tsx`, `src/lib/planning/erreurs.ts`

## Travail à réaliser

### Option (a), recommandée : figé en écriture, libre pour la gestion

- Créer `private.planning_garde_passe()`, `BEFORE INSERT OR UPDATE OR DELETE` sur `planning_affectations` et `planning_absences`. Elle lève PL409 quand l'ancienne ou la nouvelle date est avant `private.planning_aujourdhui()`. Exceptions :
  - `planning_niveau() >= 3` (la gestion corrige après coup, cascades comprises) ;
  - `planning.admin = 'on'` ;
  - un UPDATE qui ne change que `created_by` ou `updated_at` ;
  - un UPDATE qui ne fait que passer `epinglee` de false à true (validation).
- Nom des triggers : `planning_affectations_zpasse` et `planning_absences_zpasse`, pour qu'ils passent après `_verrou` et que PL423 garde la priorité sur une semaine verrouillée.
- `planning_valider_avec_repos` (ferie_jour_meme:78) :
  - borner à aujourd'hui et après le retour en proposition (`epinglee=false`) et l'insertion des repos ;
  - corriger le seuil des congés convertis en repos : convertir au plus `nombre - 5` jours, avec un rang calculé dans une CTE.
- `private.planning_horaires_suivent` (journee_etoile:79) : ne déplacer que les shifts à venir.
- Écran : en écriture, griser les gestes sur un jour passé et afficher le message PL409 en clair.

### Option (b) : figé pour tous

Même trigger, sans l'exception gestion. Il faut alors aussi retirer les gestes sur les jours passés pour la gestion, et l'onglet « Passées » de la fiche devient en lecture seule. Les suppressions de poste, motif ou horaire gardent leur exception en cascade (`pg_trigger_depth() > 1`, à vérifier en local).

### Option (c) : convention seulement

Corriger le texte de l'aide : « Les jours passés se corrigent avec prudence ; seule une semaine verrouillée est figée. » Le seuil de `planning_valider_avec_repos` est corrigé quand même.

## Ordre d'exécution

1. Attendre la réponse à Q1.
2. Migration, puis `migration up --local`.
3. Cas pgTAP à couvrir en écriture :
   - un update, un insert ou un delete sur un jour passé donne PL409 ;
   - `modifier_shift`, `poser_absences` et `deplacer_statut` sur un jour passé donnent PL409 ;
   - aujourd'hui et les jours suivants passent ;
   - valider une proposition passée passe.

   Cas à couvrir en gestion :
   - la gestion peut corriger un jour passé (option a) ;
   - la suppression d'un poste, d'un motif ou d'un horaire avec historique passe ;
   - modifier les heures d'un horaire ne déplace que les shifts futurs ;
   - sur une semaine verrouillée, le message reste PL423.

4. Essai à l'écran sur localhost avec un compte fictif en écriture et un compte en gestion.

## Critère de validation

- `05_planning` et le test 93 sont verts.
- Générer, Vider, Valider la semaine et Tout remettre en proposition marchent toujours sur la semaine en cours.

## Contrôle /borg

- Aucun chemin en écriture ne réécrit un jour passé.
- Aucun flux de la gestion n'est cassé : suppressions, horaires, verrouillage.
