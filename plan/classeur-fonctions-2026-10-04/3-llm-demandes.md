# Étape 3 — LLM : demandes toutes prêtes

## Objectif

Quand on copie le JSON pour le LLM, une liste de demandes types est proposée,
à cocher. Les demandes cochées sont ajoutées au JSON (`_metadata.demande`) ET
au début du texte copié, en phrases claires pour le LLM. L'utilisateur colle,
sans rien rédiger.

## Dépend de

L'étape 1 : même fichier `EchangeJsonDialog.tsx`. Ne jamais mener 1, 2 et 3
en parallèle. Décisions D25 (où proposer les demandes) et D26 (mémoriser ou
non).

## Demandes proposées (une ligne chacune, à valider)

| Demande | Consigne envoyée au LLM (résumé) |
|---|---|
| Corriger l'orthographe et la grammaire | Sans changer le sens ni la structure |
| Mettre en étapes numérotées | Une action par étape, verbe à l'infinitif en tête |
| Raccourcir | Phrases courtes, supprimer les redites, garder toutes les consignes |
| Prévoir les photos | Ajouter des emplacements `![ce que la photo doit montrer](a-inserer)` là où une photo aide |
| Ajouter les avertissements | Encadrés `> [!WARNING]` avant les gestes à risque |
| Traduire en anglais | Garder les chemins d'images, les blocs et les uuid intacts |
| Mettre en forme seulement | Titres, listes, encadrés ; ne pas toucher au texte |
| Champ libre « Autre demande… » | Le texte saisi, tel quel |

## Fichier(s) impacté(s)

- `src/lib/classeur/llmDemandes.ts` (nouveau, pur, avec ses tests) : la liste
  des demandes et la fonction qui compose le texte des consignes.
- `src/lib/classeur/merge/consignes.ts` : `_metadata.demande` documentée dans
  `COMMUNES`, donc identique dans les trois exports.
- `src/lib/classeur/merge/portee.ts` : typer `ExportPortee._metadata.demande?`.
- `src/lib/classeur/merge/schema.ts` : `lireMetadata` relit `demande` (aller-retour).
- `src/components/classeur/dialogs/EchangeJsonDialog.tsx` : cases au-dessus de
  « Copier », dans `copier()` / `construire()` (l.203-233).
- `src/lib/classeur/merge/portee.test.ts` : test des trois exports
  (l.323-379), qui réclame la mention de `demande`.

## Implications propres

- `_metadata.demande` n'est posée **que si une demande est cochée**. Sinon,
  l'export reste identique à celui d'aujourd'hui (interopérable avec
  Registre, qui ignore les clés inconnues).
- « Traduire en anglais » ou « Raccourcir » produiront des versions MAJEURES
  à l'import : c'est normal, à dire dans la ligne de la demande.
- Si D26 = oui : `localStorage` en try/catch, clé par compte.

## Phase de test /martin

- **Propriété (numRuns 500)** : sans aucune demande, le JSON est identique
  octet pour octet à l'actuel. Oracle : export figé AVANT l'étape, sur
  `merge/fixtures.ts`.
- **Propriété (numRuns 500)** : pour toute combinaison de demandes,
  - chaque demande cochée apparaît exactement une fois, dans l'ordre de la
    liste ;
  - le champ libre (`"`, `\`, retours, émojis) est recopié tel quel ;
  - `JSON.parse` réussit.
- **Aller-retour** : `lireMetadata(construire(x)).demande === x.demande`.
- **Mutation** : poser `demande` toujours, même vide. Elle doit être attrapée
  par la première propriété.

## Critère de validation

- Dans le navigateur : copier avec « Corriger » coché. Le presse-papiers
  commence par la demande.
- Test des trois exports vert.
