# Étape 5 — Imprimer ce qui a changé depuis une date ⚠

## Objectif

But : remplacer seulement les feuilles modifiées dans les pochettes.

Sur l'accueil d'un classeur, une carte « Imprimer les modifications » ouvre un
dialogue qui :
- propose un choix de date (D15) ;
- liste les éléments modifiés depuis cette date, avec leur version et la
  raison du changement ;
- ouvre l'aperçu d'impression de ces seuls éléments.

## Dépend de

- L'étape 4 (`selectionImpression.ts`).
- Décisions D11, D15 et D30.

## Ce qui compte comme « modifié »

- **Document** : une version enregistrée après la date (`classeur_document_versions`,
  origine différente de `etat_initial`). On ne regarde PAS `updated_at`, qui
  bouge aussi quand on réordonne ou qu'on déplace.
- **Feuille de suivi, de signature, intercalaire** : `updated_at` après la
  date. Ces éléments n'ont pas d'historique. Un réordonnancement ou une
  restauration les fera donc apparaître (D11) ; la liste l'indique (« ordre ou
  restauration »).
- **Document supprimé** : exclu.

## Fichier(s) impacté(s)

- `src/lib/classeur/service.ts` : `fetchVersionsDepuis(classeurId, date)`. Une
  seule requête, colonnes explicites, `classeur_id = X and created_at > d and
  origine <> 'etat_initial'`. PostgREST n'a pas de `distinct on` : on
  dédoublonne côté application.
- `src/lib/classeur/keys.ts` : nouvelle clé.
- `src/lib/queryPersist.ts` : clé ajoutée à `PREFIXES_SENSIBLES` (noms
  d'auteurs).
- `src/lib/classeur/selectionImpression.ts` : filtre et tri purs.
- `src/components/classeur/dialogs/ImprimerModifiesDialog.tsx` (nouveau).
- `src/components/classeur/ClasseurDashboard.tsx` et `ClasseurDashboardActions.tsx` :
  la carte.
- `src/components/shared/skeleton/PageShapes.tsx` et `PageShapes.test.tsx` :
  silhouette de l'accueil.
- Si D15 = B : `supabase/classeur_derniere_impression_<date>.sql` (colonne et
  policy), commité AVANT d'être joué, avec confirmation.
- Si D30 le justifie : `supabase/classeur_versions_index_<date>.sql`
  (`(classeur_id, created_at desc)`).

## Implications propres

- La lecture part à l'ouverture du dialogue seulement (`enabled: open`).
- Les versions portent le nom de leur auteur : elles ne vont jamais sur le
  disque.
- La carte s'ajoute à la colonne d'accueil. Les silhouettes doivent suivre.
- Pendant le chargement, la liste ne dit jamais « aucune modification »
  (`isPending`).

## Phase de test /martin

- **Propriétés (numRuns 500)** sur des historiques générés. L'oracle est un
  filtrage naïf ligne à ligne.
  - Un document réordonné sans version n'apparaît pas.
  - Un document à N versions après la date apparaît une fois, avec la plus
    récente.
  - Un document qui n'a qu'un `etat_initial` n'apparaît pas.
  - Un document supprimé n'apparaît pas.
- **Bornes de date, écrites à la main** : une version à `date − 1 ms` est
  exclue, une version à `date + 1 ms` est incluse.
- `queryPersist.test.ts` échoue si la clé est retirée des préfixes sensibles.
- `PageShapes.test.tsx` compte la nouvelle carte (mutation à la main
  attrapée).
- **Lecture en prod** (autorisée) : `explain analyze` à froid de la requête
  réelle, après 2 à 3 min de repos de l'instance. On ne crée l'index que si
  le plan l'exige.
- **Stryker** : au moins 80 % sur la partie filtre.

## Critère de validation

- Dans le navigateur, sans écrire : avec la date d'hier, la liste montre les
  documents d'essai modifiés aujourd'hui ; l'aperçu s'ouvre puis se ferme.

## Contrôle /borg

- La requête respecte la RLS de lecture (`classeur_lecture_ok`). Un classeur
  privé ne renvoie rien.
- Si du SQL a été joué : `verif_classeur_acces.sql` (selon D21) et
  `verif_perf.sql` passent.
