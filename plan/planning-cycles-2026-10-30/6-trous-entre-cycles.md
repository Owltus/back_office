# Étape 6 — Pas de trou entre deux équipes

## Objectif

Voir, et éviter quand c'est possible, un moment sans personne sur un poste
entre le début du premier cycle et la fin du dernier de la journée.

## Dépend de

Étape 3.

## Fichiers

- `src/lib/planning/cycles.ts` (`trousDuJour`)
- `src/lib/planning/generateur.ts` (coût), `verificateur.ts`
- `src/components/planning/attention.ts`

## Travail

1. Calcul au quart d'heure, en minutes réelles (`temps.ts`), des personnes
   autonomes présentes par poste, middle compris (D11 : il ne compte pas
   dans les minimums mais il est là) ; un trou = un quart d'heure à zéro entre la
   première arrivée et le dernier départ du jour (nuit comprise). Rien n'est
   à saisir.
2. Moteur : coût par quart d'heure de trou (P2), pour qu'il préfère des codes
   qui se touchent ; jamais une règle qui bloque (D10).
3. Point d'attention : « Réception mardi : personne de 15 h à 16 h ».

## Phase de test /martin

Nuit du dimanche vers le lundi, changement d'heure, soutien seul (ne compte
pas), shift court.

## Critère de validation

Aucun faux trou sur les semaines réelles injectées (juillet à novembre).
