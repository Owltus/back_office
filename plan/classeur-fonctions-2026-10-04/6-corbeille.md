# Étape 6 — Corbeille

## Objectif

Retrouver et restaurer un élément ou un chapitre supprimé par erreur, sans
restaurer tout le classeur à un point de restauration. La suppression est
déjà douce (`deleted_at`) : la corbeille ne fait que la MONTRER et l'annuler.

## Fichier(s) impacté(s)

- `src/lib/classeur/service.ts` : `fetchCorbeille(classeurId)` — chapitres et
  éléments du classeur où `deleted_at is not null`, date de suppression,
  chapitre d'origine (les lectures `*AvecSupprimes` existent pour la fusion).
- `src/lib/classeur/corbeille.ts` (nouveau, pur + test) : regroupement,
  tri (plus récent d'abord), cas « chapitre d'origine supprimé lui aussi ».
- `src/components/classeur/dialogs/CorbeilleDialog.tsx` (nouveau)
- `src/components/classeur/ClasseurDashboardActions.tsx` : carte « Corbeille »
  (avec le nombre d'éléments), à côté des points de restauration.

## Travail à réaliser

1. Liste : titre, type, chapitre d'origine, « supprimé le … ». Bouton
   **Restaurer** (`restaurerItem` / `restaurerChapter` existants : le
   document revient en fin de son chapitre, avec son numéro de version).
2. Élément dont le chapitre est aussi supprimé : « Restaurer » restaure les
   deux, ou propose un autre chapitre.
3. Droits : visible et utilisable avec le droit d'écriture sur le classeur
   (même règle que la suppression). Pas de suppression définitive dans l'app.
4. Vérifier en LECTURE que la RLS laisse lire les lignes `deleted_at` aux
   ayants droit (sinon : lecture par une RPC dédiée, script SQL commité avant).

## Critère de validation

- Tests purs du regroupement.
- Navigateur, sans écrire : la corbeille du classeur 24 liste les éléments
  supprimés (s'il y en a) ; aucune restauration réelle pendant le test.

## Contrôle /borg

- La restauration ne contourne pas le point de restauration automatique
  (`avantEcriture`) ni le versionnage.
