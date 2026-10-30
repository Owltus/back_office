# Étape 5 — « Je ne peux pas la remplir »

## Objectif

Une place que le moteur laisse vide le dit franchement, avec la raison, et
renvoie à une solution humaine (D3).

## Dépend de

Étape 4.

## Fichiers

- `src/lib/planning/semaine.ts` (`analyser`, `a_pourvoir`)
- `src/components/planning/raisonsPlaces.ts`, `PanneauAlertes.tsx`, `attention.ts`

## Travail

1. Pour une place vide : `raisonsBlocage` sur le code imposé ET sur chaque
   remplaçant ; la raison montrée est celle qui bloque tout le monde.
2. Texte : « Je ne peux pas remplir ce M3. » puis la raison (« Personne n'a
   11 h de repos avant 7 h », « Tout le monde est à 6 jours »…) puis « Prenez
   un extra ou changez un shift. »
3. Minimum par cycle non tenu : même forme (« Il manque 1 personne le matin
   mardi »).
4. « Placer quelqu'un » reste disponible sur la place (mode manuel, avec
   l'alerte de coupure si besoin).

## Critère de validation

Phrases courtes, sans jargon, ni tiret cadratin ni guillemets français ;
test exhaustif de `REGLES_BLOCAGE` étendu.
