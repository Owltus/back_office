# Étape 10 ⚠ — Ordre de décision du générateur, écrit et tenu

## Objectif

La phrase de l'étape 1 devient vraie et testée : la loi d'abord (dur), puis
les personnes nécessaires, puis les contrats, puis le confort. Les places « en
plus » ne servent qu'à compléter un contrat (et le matin / soir selon D1).

## Dépend de

6.

## Faits établis

- `POIDS_MANQUE` = 100 / min ; un trou de 4 h = 24 000 ; un 6e jour = 15 000 ; 4 h au-dessus du contrat = 12 000 (`generateur.ts:44-55,328,456,610-611`).
- `POIDS_PRESENCE` = 48 000 fixe, contre un coût proportionnel à la durée.
- Code fixé = contrainte dure (`generateur.ts:99`).

## Fichier(s) impacté(s)

- `src/lib/planning/generateur.ts`, `regles.ts` (poids nommés), `generateur.test.ts:111,189,268,518-541`, `auditMoteur.test.ts`.

## Travail à réaliser

1. Poids par paliers (D3 = A) : manque d'une place nécessaire > (6e jour + heures au-delà du contrat sur la durée du shift) ; sous-contrat > confort. Écrire les paliers comme constantes dérivées (pas des chiffres posés à la main), commentées.
2. Matin / soir (D1 = A) : coût proportionnel au manque de personnes-heures, sous le palier « nécessaire ». (D1 = B : retiré du modèle, contrôle seul.)
3. Code fixé : devient une préférence forte quand aucun besoin de ce code n'existe ce jour-là ? NON par défaut : il reste dur, le contrôle de l'étape 5 le signale avant. À rediscuter si l'utilisateur le demande.
4. Ordre des personnes (D13, D14) : un dépannage coûte plus qu'un titulaire libre, sous le palier « nécessaire » (une place tenue par un dépannage vaut mieux qu'une place vide). « Soutien jamais seul » reste dur ; dépannage + soutien est accepté sans alerte.
5. Équité (D15), palier le plus bas, sous les contrats : écart au mois entre personnes d'un même poste pour les week-ends travaillés, les soirs (période soir) et les matins tôt (codes de début le plus tôt). Coût sur l'écart à la moyenne, jamais une contrainte. Résumé « Week-ends : de 1 à 3 par personne » dans le résumé de génération.
6. Un test par palier : un cas où le palier supérieur l'emporte, un où il ne doit pas.
7. Mesurer sur les données de dev : couverture, heures sup, 6es jours avant / après ; rapport dans le bilan.

## Phase de test /martin

Propriété : sur N semaines tirées, jamais d'infraction légale ; une place nécessaire n'est vide que si `raisonsBlocage` donne une raison légale ou d'éligibilité.

## Critère de validation

- Tests moteur verts, attendus mis à jour et justifiés ligne à ligne.

## Contrôle /borg

- Le modèle reste toujours faisable (aucune contrainte dure ajoutée).
- Temps de résolution sur un mois de dev : pas plus de 2 fois l'actuel.
