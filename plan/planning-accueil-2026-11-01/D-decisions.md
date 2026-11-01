# Décisions — Planning : un seul tableau pour l'accueil

Numéros jamais réattribués.

---

## A. Questions encore ouvertes

Aucune (D8-D10 tranchées le 2026-11-01, partie B).

## B. Réponses de l'utilisateur (questionnaire du 2026-11-01)

- **D1 (utilisateur)** : un seul tableau pour l'accueil, matin / soir / nuit × 7 jours, un chiffre par case. La page Besoins ne garde que les postes à part (Direction, Adjoint, Supervision, Technique).
- **D2 (utilisateur)** : l'app répartit seule entre Club et Réception selon les compétences ; modifiable à la main. Pas de plancher par poste (« au moins 1 à chaque » non retenu).
- **D3 (utilisateur)** : le chiffre est EXACT, ni moins ni plus.
- **D4 (utilisateur)** : l'app choisit l'horaire parmi ceux permis à la personne et évite les trous.
- **D5 (utilisateur)** : les apprentis et stagiaires COMPTENT dans le chiffre, jamais seuls.
- **D6 (utilisateur)** : la nuit est dans le même tableau.
- **D7 (utilisateur)** : pas assez de monde → titulaires, puis dépannage, puis extras (placés par l'app : changement de règle, ils étaient « à poser à la main »), puis case vide signalée.
- **D11 (utilisateur, RÉVISE D11 du 2026-10-30)** : un middle (ex. 11:00 – 19:45) compte dans le matin ET dans le soir. Exemple validé : « Marc fait 11:00 – 19:45 » → « Matin et soir ».

- **D8 (utilisateur)** : « sois souple et logique… j'ai une appli de RH, donc il faut faire au mieux ». Retenu : le chiffre d'abord ; une personne à qui il manque des heures du contrat peut venir EN PLUS en dernier recours (après tout autre jour possible), et c'est signalé. Surplus au-dessus des heures dues seulement quand aucune autre place ne les comble.
- **D9 (utilisateur)** : le plus petit chiffre (samedi matin 3, dimanche matin 3) ; une case sans plafond garde son minimum.
- **D10 (utilisateur)** : la nuit = les veilleurs, puis les personnes en dépannage sur la Veille de nuit. Personne d'autre.

## B bis. Par défaut (réversibles, à confirmer)

- **D12** : postes de l'accueil = postes cochés « présence » (Réception, Club) pour matin et soir, plus le poste Veille de nuit pour la nuit (selon D10). Les autres postes restent sur la page Besoins.
- **D13** : les besoins Réception et Club déjà en base sont IGNORÉS par le moteur, pas supprimés (rien d'irréversible). Leur retrait se décidera plus tard.
- **D14** : stockage dans `planning_consignes` avec `minimum = maximum` ; aucune colonne retirée.
- **D15** : les trous se cherchent sur l'accueil entier (Réception et Club ensemble), du premier au dernier moment demandé du jour.

## C. Révisions

- 2026-11-01 : création, après réglage des postes à part en prod le même jour.
