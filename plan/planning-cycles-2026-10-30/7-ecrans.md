# Étape 7 — Ce qui se voit

## Objectif

Que l'utilisateur comprenne ce que le moteur a fait, sans nouveau réglage
compliqué.

## Dépend de

Étapes 2 à 6.

## Fichiers

- `src/components/planning/parametres/BesoinsPage.tsx`, `reglages/ConsignesPresence.tsx`
- cases du mois et de la semaine, `PanneauAlertes.tsx`
- `src/lib/planning/coherence.ts`

## Travail

1. Besoins, carte « Présence du matin et du soir » → « Personnes par cycle »,
   avec la nuit. Une phrase : « Le planning tient ces minimums avant les
   heures des contrats. Si un code est impossible, il prend un autre code du
   même cycle. »
2. Case d'un remplaçant : au survol, « M6 au lieu de M3 » ; aucun signe en
   plus sur la case (le code suffit).
3. Contrôles « À vérifier » : minimum par cycle sans aucun code de ce cycle
   sur les postes comptés ; besoin d'un code qu'aucune fiche ne permet et
   sans remplaçant possible.

## Phase de test /martin

Rendu jsdom compté ; navigateur sur localhost (compte de test supprimé
ensuite).

## Critère de validation

Aucun nouvel écran ; aucune case de plus à remplir hors la nuit.
