# Étape 2 ⚠ — Une seule règle des codes permis

## Objectif

Ce qu'un menu propose, le moteur l'accepte, et inversement. Une seule fonction
répond à « quels codes cette personne peut-elle tenir sur ce poste ce jour-là,
et sinon pourquoi ».

## Dépend de

—

## Faits établis

- Moteur : poste ∩ fiche, sans repli (`generateur.ts:81-102`, `semaine.ts:353,362-367`, `verificateur.ts:87-105`).
- UI : trois copies avec repli sur le poste (`MenuJour.tsx:55-70`, `edition.ts:152-171`, `edition.ts:175-194`), `posteDeReference` en double (`edition.ts:138-148`, `MenuJour.tsx:43-51`).

## Fichier(s) impacté(s)

- Nouveau `src/lib/planning/eligibilite.ts` (+ `eligibilite.test.ts`).
- `src/lib/planning/affichage.ts:91-99`, `semaine.ts:353-367`, `generateur.ts:81-102`, `verificateur.ts:87-105`.
- `src/components/planning/mois/MenuJour.tsx`, `semaine/edition.ts`, `semaine/EditeurShift.tsx`, `semaine/VueSemaine.tsx:592`.

## Travail à réaliser

1. `codesDuPoste(poste, horaires)` et `codesPermis({ personne, poste, jour, referentiel })` qui rend `{ codes, raison }` : `raison` vaut `null`, `'aucun-commun'` (fiche et poste sans code commun), `'code-fixe-hors-poste'`, `'ecole'`, `'repos-fixe'`, `'coupure-11h'` (avec la veille ou le lendemain déjà posés, D16 : le menu n'offre pas l'horaire et dit « Coupure de 11 h non respectée avec la veille »).
2. Le code fixé de la semaine type réduit la liste à lui seul, s'il est permis.
3. Le moteur, le vérificateur et `besoinsValides` appellent ces fonctions (aucune logique recopiée).
4. Les menus n'ont plus de repli : liste vide = ligne grisée qui dit la raison en clair (« Aucun horaire commun entre sa fiche et ce poste »).
5. Supprimer les copies et le `posteDeReference` doublon.

## Phase de test /martin

Propriété fast-check : pour tout référentiel tiré, tout code proposé par le menu est accepté par `verifier` (aucun `HORAIRE-PERSO` ni `HORAIRE-POSTE`), et tout code refusé ne figure pas au menu.

## Critère de validation

- Les 134 tests du moteur passent sans changer d'attendu (comportement moteur identique).
- `tsc` propre.

## Contrôle /borg

- Aucune autre fonction ne relit `horaires_autorises` ou `shifts_autorises` (grep).
- Comportement moteur inchangé sur les semaines générées en dev (même couverture avant / après).
