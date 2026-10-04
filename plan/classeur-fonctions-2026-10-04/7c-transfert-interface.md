# Étape 7c — Transfert : interface

## Objectif

Le menu « Déplacer vers… » (menu d'un élément et barre de sélection) propose
aussi les chapitres des AUTRES classeurs où l'on peut écrire, groupés par
classeur. Il offre **Déplacer**, et **Copier** si D18 = oui.

## Dépend de

L'étape 7b.

## Fichier(s) impacté(s)

- `src/components/classeur/ChapterBoard.tsx` : menu Déplacer, l.456-492.
- La carte d'un élément (menu « ⋯ »).
- `src/components/classeur/dialogs/TransfertDialog.tsx` (nouveau), seulement
  si le menu devient trop long. Dans ce cas : classeur, puis chapitre, puis
  Déplacer ou Copier, et un résumé « 3 images seront copiées ».

## Implications propres

- La liste des classeurs cibles se charge à l'ouverture du menu
  (`enabled: open`).
- C'est la seule voie au doigt sous 1024 px, où la colonne est un tiroir : le
  menu doit y rester accessible.
- Messages d'erreur via `messageErreur`, alerte inline. Pas de toast.
- Après un déplacement, l'élément disparaît du chapitre courant. Un lien
  « Voir dans <classeur> » est proposé.

## Phase de test /martin

- **Rendu jsdom** :
  - aucun classeur sans droit d'écriture dans le menu ;
  - pas de « Copier » si D18 = non ;
  - les boutons ne démarrent pas de glisser (`useCapteursClasseur.test.tsx`
    vert).
- **Mutation posée à la main** : le filtre des droits retiré du menu doit
  faire échouer le test.

## Critère de validation

- Navigateur, sans écrire : menu ouvert, classeurs groupés, puis refermé.
