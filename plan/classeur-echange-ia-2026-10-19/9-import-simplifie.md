# 9. Import simplifié (révision du 2026-10-20)

> **FAIT** le 2026-10-20. Renverse D1, D2 et D10 en partie (voir `D-decisions.md`).

## Retour de l'utilisateur (2026-10-20)

> « le mode d'import des données est disons très complexe pour rien […] fichier
> rendu par une IA ou fichier de Registre… déjà fichier de Registre c'est quoi
> ce terme, ici on utilise les mots classeur, chapitre, document […] et quand
> bien même cela change quoi ? […] supprimer ce qui n'est pas dans le fichier
> c'est très destructeur comme choix. Retire le choix et fais-le de manière
> implicite là où il y a du contexte […] sans friction et sans laisser
> l'utilisateur commettre des erreurs grossières. »

**Décision : aucun choix de provenance, aucune case de suppression, portée
déduite. Ne pas les réintroduire.**

## Ce qui a changé

| Avant (étape 5)                                                                  | Après                                                                                                                         |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Choix « Fichier rendu par une IA » / « Fichier de Registre ou d'un autre poste » | Aucun choix. Un seul comportement : le fichier fait foi pour ce qu'il contient, sans dépendre des dates.                      |
| Interrupteur fusion / remplacement (Registre)                                    | Retiré de l'écran. `appliquerFusion` reste pour les tests ; la restauration d'un point garde son circuit.                     |
| Case « Supprimer ce qui n'est plus dans le fichier » (classeur et chapitre)      | Retirée. Un absent est TOUJOURS gardé. Suppression = élément gardé et marqué `"supprimer": true`, corbeille, refusable.       |
| Fichier de chapitre ou de document refusé à l'accueil du classeur                | Appliqué à ce chapitre ou à ce document, d'où qu'on l'importe, avec « Ce fichier concerne le chapitre X. »                    |
| Fichier d'un autre chapitre refusé dans le dialogue d'un chapitre                | Appliqué au bon chapitre ou document, et dit.                                                                                 |
| « Importer un JSON », « Ou choisir un fichier .json », « suppression(s) »        | « Importer », « Ou choisir un fichier », « mis à la corbeille ». Aucun « Registre », « JSON », « LLM », « fusion », « uuid ». |

## Où

- `lib/classeur/merge/schema.ts` : `ItemJson.supprimer`, `ChapterJson.supprimer`
  (relus si `true`, jamais exportés) ; règle `no_deletion` du schéma réécrite ;
  message d'un texte illisible.
- `lib/classeur/merge/portee.ts` : `planSuppressionsDemandees` (plan brut sur le
  fichier sans les marqués, puis sur le fichier complet ; seules les
  suppressions qui visent un marqué restent), `garderActions`,
  `sansMarquesSupprimer` ; `planChapitre` et `planDocument` sans option ;
  `supprimerChapitre` refusable (`chapitre:id`) ; `sansHorodatage` déplacé ici.
- `lib/classeur/merge/importIa.ts` : `planifierImportIa(local, fichier)`,
  `destinationImport` (portée déduite, note, avertissements), `planifierVers`,
  `resumerImport`.
- `lib/classeur/merge/apply.ts` : `planImport`, `previsualiserImport`,
  `appliquerImport` (un seul circuit, point avant la première écriture).
- `lib/classeur/merge/validationImport.ts` : un marqué n'est pas validé.
- `lib/classeur/merge/consignes.ts` : « Ne retire JAMAIS un élément du
  fichier ; pour en supprimer un, garde-le et ajoute "supprimer": true » ;
  ce qui est créé à partir du contenu reste dans la conversation.
- UI : `MergePreviewDialog`, `EchangeJsonDialog`, `ApercuImport`,
  `useMerge` (`useAppliquerImport`), `ClasseurDashboard` (ligne Importer),
  `ClasseurDashboardActions` (bilan), `ClasseurListHelpPanel`.

## Tests

- `importIa.test.ts` : oracle naïf (1 000 fichiers) « aucun absent n'est
  supprimé ; un marqué part à la corbeille, et rien d'autre » ; sans marque =
  remplacement moins ses suppressions ; routage : un fichier de chapitre donne
  le MÊME plan depuis l'accueil, depuis sa page ou depuis un autre chapitre
  (1 000 fichiers) ; `destinationImport` posé à la main.
- `exclusion.property.test.ts` : l'oracle `porteeAvantRefus` reste la
  référence (un absent marqué = l'ancienne case cochée).
- Simulateur : chapitre marqué = suppression douce après le point ; marqué
  refusé = rien d'écrit ; fichier de chapitre depuis l'accueil.
- Rendu : aucun choix ni jargon ; « mis à la corbeille » refusable ; portée
  déduite dans le dialogue d'un chapitre.
- Mutations posées à la main, toutes attrapées : oubli de `sansHorodatage`,
  suppression d'un absent, `supprimer` ignoré (lecture, plan, document),
  mauvaise portée (chapitre vers classeur, destination ignorée, portée
  document ignorée).

## Non fait

- Aucune vérification navigateur ni écriture en base (consigne de la tâche).
- L'import en NOUVEAU classeur ignore `"supprimer": true` (il crée l'élément).
