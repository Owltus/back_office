# Étape 11 — Ranger les données qui contredisent les réglages

## Objectif

Les shifts passés et les fiches qui contredisent les réglages sont signalés par
le contrôle, avec une correction proposée en un clic (D8). Rien ne s'écrit sans
ce clic.

## Dépend de

5.

## Fichier(s) impacté(s)

- `src/lib/planning/coherence.ts` (points « données »).
- `ControleReglages.tsx` (bouton de correction).
- RPC d'écriture existantes du planning (aucune nouvelle si possible).

## Travail à réaliser

1. Shifts sans code dont les heures sont exactement celles d'un code : « 37 shifts ont les heures d'un code. Les rattacher. » (aperçu de la liste avant).
2. Shifts sur un code que le poste n'autorise pas : proposer « changer le poste du shift » quand la personne tient un autre poste qui autorise ce code, sinon seulement signaler.
3. Fiches avec des codes morts : déjà traité à l'étape 4.
4. Semaines verrouillées : jamais touchées (le trigger refuse déjà, le message le dit).

## Phase de test /martin

Correction appliquée deux fois = même état (idempotente) ; base locale seulement, compte d'essai supprimé.

## Critère de validation

- En dev : les points « données » tombent à 0 après correction, aucun autre shift modifié (comptage avant / après).
