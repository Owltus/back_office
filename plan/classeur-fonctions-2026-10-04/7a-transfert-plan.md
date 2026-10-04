# Étape 7a — Copier / déplacer vers un autre classeur : plan pur

## Objectif

Calculer, sans rien écrire, ce que demande un transfert :
- les images utilisées à copier ;
- la réécriture des chemins ;
- la liste des classeurs cibles autorisés ;
- la suite ordonnée des opérations que 7b exécutera.

## Dépend de

- L'étape 6, qui sert de filet si un déplacement passe par la corbeille
  (D10 = B).
- Les décisions D6, D8, D9, D10 et D18. **Si D18 = non** (Déplacer seul),
  la partie « copie de document » disparaît, mais la copie des IMAGES reste
  nécessaire.

## Pourquoi copier les images

Une image appartient à son classeur : dossier `<classeurId>/…`, contrainte
chemin ↔ `classeur_id`, droits par classeur. Un document qui garde ses
anciens chemins afficherait « image indisponible » à un lecteur du classeur
d'arrivée qui n'a pas accès à celui de départ.

## Fichier(s) impacté(s)

- `src/lib/classeur/transfert.ts` : nouveau, pur.
- `src/lib/classeur/transfert.test.ts` : nouveau.

## Travail à réaliser

1. **`imagesATransferer(documents, origine)`** : les chemins `<origine>/…`
   utilisés, sans doublon. Sont exclus `a-inserer`, les images externes et
   les chemins d'un autre classeur.
2. **`reecrireChemins(markdown, correspondances)`** (D9) : ne change QUE le
   chemin. Titre, légende, taille, `cadre=`, `entiere` et disposition restent
   intacts. On n'utilise PAS `remplacementImage`, qui retire le cadre.
3. **`classeursCibles(classeurs, droits)`** : les classeurs où le niveau
   effectif (`niveauEffectif`) est au moins écriture, l'origine exclue pour
   une copie (D18).
4. **`planTransfert(...)`** : la suite ordonnée
   « copier les fichiers → créer les fiches → écrire le document → (déplacer :
   chapitre changé ; ou B : suppression douce à l'origine) », avec les deux
   points de restauration en tête.

## Phase de test /martin

- **Propriétés (numRuns 1000)** sur des Markdown générés : images, `a-inserer`,
  URL externes, chemins répétés, cadres, légendes avec `]` et `"`. Les oracles
  sont une regex de référence écrite à la main avant le code.
  - Une image utilisée deux fois n'est copiée qu'une fois.
  - Une image non utilisée n'est jamais copiée.
  - Après réécriture, aucun chemin `<origine>/` ne subsiste.
  - Hors chemin, chaque ligne est identique, caractère pour caractère.
  - `a-inserer` et les URL externes ne sont jamais touchés.
  - Réécrire deux fois ne change rien de plus (idempotence).
- **Propriété (numRuns 500)** : `classeursCibles` ne contient jamais un
  classeur de niveau inférieur à écriture. Oracle : `niveauEffectif`, déjà
  prouvé par fast-check dans `droits.test.ts`.
- **Mutation** : réutiliser `remplacementImage` (cadre perdu) doit être
  attrapé.
- **Stryker** : au moins 80 % sur `transfert.ts`.
- **Lecture en prod** : policies de `storage.objects` du bucket
  `classeur-images`, et contrainte `classeur_images_chemin_du_classeur`.

## Critère de validation

- Tests verts et Stryker au seuil.
- Aucune écriture.
