# Étape 5 — Import d'un fichier d'IA sans piège ⚠

## Objectif

Un fichier rendu par une IA s'applique toujours : **le fichier fait foi pour
ce qu'il contient**, sans dépendre de `updated_at`. On garde l'aperçu des
différences, le refus par changement et le point de restauration avant
écriture. Rien n'est supprimé sans une case cochée exprès.

## Dépend de

2.

## Faits établis

- Chapitre et document le font déjà : `planChapitre` / `planDocument`
  (`portee.ts` l.707, 788) en remplacement filtré, `sansHorodatage` (l.291),
  `supprimerAbsents` en option.
- Classeur complet : `MergePreviewDialog` démarre en fusion (`replace` l.128),
  interrupteur « Remplacer le contenu » l.241-256 ; en remplacement, tout
  absent est supprimé (case à décocher par ligne).
- `restaurerInstantane` et `importerCommeNouveauClasseur` passent aussi par
  `planifierFusion` : ne pas toucher R7, R8, R11.

## Fichier(s) impacté(s)

- `src/lib/classeur/merge/importIa.ts` (nouveau, pur) : `planifierImportIa(local,
fichier, { supprimerAbsents })` = `sansHorodatage` + `planifierFusion(…,
{ replace: true })` puis retrait des suppressions si l'option est décochée.
- `src/lib/classeur/merge/apply.ts` : `previsualiserFusionComplete` /
  `appliquerFusion` acceptent le mode IA (le plan est recalculé à
  l'application, comme aujourd'hui).
- `src/components/classeur/dialogs/MergePreviewDialog.tsx` : choix de la
  provenance (D1) ; en mode IA, plus d'interrupteur fusion / remplacement, une
  case « Supprimer ce qui n'est plus dans le fichier » décochée par défaut ;
  mode Registre inchangé (D2).
- `src/components/classeur/hooks/useMerge.ts` (`useAppliquerFusion`, l.49).
- `src/lib/classeur/merge/portee.ts` : `planChapitre` peut réutiliser
  `planifierImportIa` (une seule règle) ; `_metadata.portee` pour un classeur
  si D10 (avertissement si autre classeur).
- `src/components/classeur/ClasseurDashboardActions.tsx` (`recevoirFichier`
  l.131) : coller une réponse d'IA (`extraireJson`), pas seulement un fichier.

## Travail à réaliser

1. Écrire `planifierImportIa` et ses tests.
2. L'écran d'import du classeur : provenance, case de suppression, aperçu.
3. Accepter le collage du texte rendu par l'IA à l'import du classeur complet
   (même `extraireJson` que le chapitre).
4. Libellés : « Fichier rendu par une IA » / « Fichier de Registre ou d'un
   autre poste ».

## Phase de test /martin

- **Propriété (numRuns 1000)** : pour tout état local et tout fichier, mode IA
  sans suppression = aucun élément local supprimé ; tout champ différent du
  fichier est mis à jour ; oracle : simulateur naïf « le fichier fait foi ».
- **Non-régression** : mode Registre et restauration donnent des plans
  identiques aux oracles existants (`fusionAvantE10`, `porteeAvantRefus`, P1-P10).
- **Mutation** : laisser `updated_at` (oublier `sansHorodatage`) doit être
  attrapé ; supprimer malgré la case décochée doit être attrapé.

## Critère de validation

- Local : export du classeur n° 24, modification à la main d'un titre en
  gardant `updated_at`, import en mode IA : le titre change ; sans case, aucune
  suppression.
- `pnpm test src/lib/classeur`.

## Contrôle /borg

- Aucun chemin d'écriture n'échappe au point de restauration pris AVANT.
- Restauration d'un point et import Registre inchangés.
- Tout refuser = aucune écriture ni point.
