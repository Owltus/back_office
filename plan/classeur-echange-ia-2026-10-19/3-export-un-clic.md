# Étape 3 — Export en un clic partout

## Objectif

Sur un classeur, un chapitre ou un document : deux gestes seulement,
**Copier** (à coller dans la conversation) et **Télécharger**. Aucun choix à
faire. Jamais plusieurs classeurs (déjà le cas, vérifié).

## Dépend de

1, 2.

## Fichier(s) impacté(s)

- `src/components/classeur/dialogs/ExportJsonClasseurDialog.tsx` : réduit à
  une explication d'une ligne et deux boutons (ou remplacé par un menu, voir
  travail 1).
- `src/components/classeur/dialogs/EchangeJsonDialog.tsx` : bloc « 1. Exporter »
  (l.362-406), texte l.364-368.
- `src/components/classeur/ClasseurDashboard.tsx` l.469-477 : description
  « Copie éditable, avec vos demandes pour un LLM » à remplacer.
- `src/components/classeur/ClasseurList.tsx` (menu clic droit l.566-575) et
  `ClasseurListActions.tsx` l.37-53 : ajouter « Copier pour une IA » à côté de
  « Exporter en JSON ».
- `src/lib/classeur/exportJson.ts` : une fonction de copie (`navigator.clipboard`,
  repli Télécharger si elle échoue).
- Tests : `ExportJsonClasseurDialog.test.tsx`, `EchangeJsonDialog.test.tsx`,
  `ClasseurList.test.tsx`, `ClasseurDashboard.test.tsx`.

## Travail à réaliser

1. Accueil du classeur : la ligne « Exporter en JSON » ouvre un dialogue
   minimal : une phrase (« Collez-le dans une IA : elle vous guide »), Copier,
   Télécharger. Selon D3, Copier met tout le JSON.
2. Chapitre et document : même bloc d'export dans `EchangeJsonDialog`, avec la
   même phrase.
3. Liste des classeurs : entrées du menu « Copier pour une IA » et
   « Exporter en JSON », mêmes droits qu'aujourd'hui.
4. Retour de la copie : le bouton affiche « Copié » deux secondes ; un échec
   affiche une seule phrase et propose Télécharger.

## Phase de test /martin

- Le texte copié est exactement `serialiserExport(construireExport(…))`.
- Copie refusée par le navigateur : message et repli, aucune exception.
- Double clic sur Copier : une seule lecture du contenu.

## Critère de validation

- Sur `localhost:3000` : copier depuis l'accueil, un chapitre, un document, la
  liste ; coller dans un éditeur de texte, JSON valide.
- Si aucun compte de test local n'existe, le dire et s'en tenir aux tests jsdom.
