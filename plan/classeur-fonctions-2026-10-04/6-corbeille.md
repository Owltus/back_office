# Étape 6 — Corbeille ⚠

## Objectif

Retrouver et restaurer un élément ou un chapitre supprimé par erreur, sans
restaurer tout le classeur à un point de restauration. La suppression est
déjà douce (`deleted_at`) : la corbeille se contente de la MONTRER et de
l'annuler.

## Dépend de

- Étape 0 (simulateur).
- Décisions D11, D16 et D17.

## Faits établis

- La RLS ne filtre pas `deleted_at` : un ayant droit en lecture voit déjà les
  lignes supprimées (`fetchChaptersAvecSupprimes`, `fetchContentAvecSupprimes`).
  Un classeur privé ne renvoie rien. Rien à changer en base.
- Restaurer = `update deleted_at = null`, sous `classeur_write_ok` /
  `classeur_chapter_write_ok`.
- `classeur_stamp` remet `updated_at` à jour (voir l'effet sur l'étape 5,
  D11).
- `restaurerItem` sans autre modification ne crée ni version ni nouveau
  numéro.

## Fichier(s) impacté(s)

- `src/lib/classeur/service.ts` : `fetchCorbeille(classeurId)`.
- `src/lib/classeur/keys.ts`.
- `src/lib/classeur/corbeille.ts` : nouveau, pur, avec ses tests (regroupement,
  tri, orphelins).
- `src/components/classeur/dialogs/CorbeilleDialog.tsx` : nouveau.
- `src/components/classeur/ClasseurDashboard.tsx` et `ClasseurDashboardActions.tsx` :
  carte « Corbeille », à côté des points de restauration.
- `src/components/shared/skeleton/PageShapes.tsx` et son test.

## Travail à réaliser

1. **Liste** : titre, type, chapitre d'origine, « supprimé le … », du plus
   récent au plus ancien. Bouton **Restaurer**. Vérifier dans le code que
   l'élément revient bien EN FIN de son chapitre, et le corriger sinon.
2. **Élément dont le chapitre est aussi supprimé** : « Restaurer » remet le
   chapitre PUIS l'élément, ou propose un autre chapitre.
3. **Droits** : carte et restauration selon D16. Aucune suppression définitive
   dans l'app ; le classeur entier reste hors corbeille (D17).
4. **Compteur de la carte** : aucun, ou une lecture `count` en `head: true`
   lancée APRÈS le premier rendu. Sinon, simplement « Corbeille » sans nombre.

## Implications propres

- La restauration passe par `avantEcriture` (point automatique), comme toute
  écriture du service.
- Jamais « corbeille vide » pendant `isPending`.
- Silhouette de l'accueil modifiée.

## Phase de test /martin

- **Propriétés (numRuns 500) sur `corbeille.ts`**, avec un `sort` naïf comme
  oracle :
  - tri du plus récent au plus ancien ;
  - chaque élément supprimé apparaît une fois ;
  - un élément sous un chapitre supprimé est marqué « orphelin » ;
  - aucun élément non supprimé.
- **Simulateur (étape 0)** :
  - `avantEcriture` est appelé une fois par restauration ;
  - un refus RLS (0 ligne) devient une erreur affichée, et l'élément reste
    dans la liste ;
  - « Restaurer les deux » écrit le chapitre AVANT l'élément.
- **Mutations** : inverser l'ordre chapitre / élément ; retirer `.select('id')`.
- **Lecture en prod** : `pg_policies` des quatre familles d'éléments, pour
  confirmer qu'aucune policy select ne filtre `deleted_at`.
- **Utilisateur** : une restauration réelle. L'assistant relit ensuite la
  ligne (`deleted_at` nul, version inchangée).

## Critère de validation

- Dans le navigateur, sans écrire : la corbeille du classeur 24 liste ses
  éléments supprimés. Aucune restauration n'est faite pendant le test.

## Contrôle /borg

- La restauration ne contourne ni `avantEcriture` ni le versionnage.
- Un compte sans le droit choisi en D16 ne voit pas la carte, et la base
  refuse son `update` (lecture de la policy).
