# Étape 3 — LLM : demandes toutes prêtes

## Objectif

Au moment de copier le JSON pour le LLM, un menu propose des demandes types à
cocher. Les demandes cochées sont ajoutées au JSON (`_metadata.demande`) ET en
tête du texte copié, en phrases claires pour le LLM : l'utilisateur colle,
sans rien rédiger.

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

- `src/lib/classeur/llmDemandes.ts` (nouveau, pur + test) : la liste et la
  fonction qui compose le texte des consignes.
- `src/lib/classeur/merge/consignes.ts` : `_metadata.demande` documentée dans
  les consignes communes (le LLM sait qu'elle prime).
- `src/components/classeur/dialogs/EchangeJsonDialog.tsx` : cases à cocher
  au-dessus de « Copier » ; choix mémorisé par poste (`localStorage`, avec
  try/catch).

## Critère de validation

- Test : composer deux demandes → texte attendu ; aucune demande → JSON
  identique à aujourd'hui (rétrocompatible, test des trois exports intact).
- Navigateur : copier avec « Corriger » coché → le presse-papiers commence par
  la demande.
