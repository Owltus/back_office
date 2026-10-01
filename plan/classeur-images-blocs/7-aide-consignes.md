# Étape 7 — Aide « Mettre en forme » et consignes LLM

## Objectif

Que l'aide et les exports JSON pour un LLM décrivent EXACTEMENT les nouvelles
règles, et rien des anciennes.

## Fichier(s) impacté(s)

- `src/components/classeur/dialogs/AideMiseEnFormeDialog.tsx` (+ test)
- `src/lib/classeur/merge/consignes.ts`, `merge/schema.ts`
- `src/lib/classeur/merge/portee.test.ts` (test « les TROIS exports »)

## Travail à réaliser

- Aide : rendue par le pipeline PARTAGÉ (étape 1) ; sections « Image » (légende
  entre crochets, 3 tailles), « Planche de photos », « Étape illustrée » ;
  retrait de Position et de `+++`.
- Consignes LLM : remplacer `largeur=… position=…` et `+++` par : légende =
  texte entre crochets ; titre facultatif `"petite"|"moyenne"|"pleine"` ;
  blocs `:::photos` / `:::etape` (sans espace après `:::`, fermés par `:::`) ;
  ne jamais écrire `:mot` collé (heure : `10 h 30`).
- Test des trois exports : réclame les nouvelles conventions et REFUSE
  `position=` et `+++`.

## Critère de validation

- Les trois exports (classeur, chapitre, document) portent les mêmes
  consignes ; test vert, mutation attrapée.
- Chaque exemple de l'aide rendu par le vrai moteur (test de rendu).
