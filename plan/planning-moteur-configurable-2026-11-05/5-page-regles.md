# Étape 5 — Les règles réparties dans les pages existantes

## Objectif

Pas de page en plus (D7). Chaque règle se règle là où on la cherche naturellement.

## Dépend de

Étapes 3 et 4.

## Répartition

| Page                                                   | Ce qui s'ajoute                                                                                                                                                                           | Remplace en dur                                                     |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **Équipe** (tiroir ou section « Règles des contrats ») | Par type de contrat : durée des journées (35 h : 7 h ; 39 h : 8 h et une de 7 h), journée courte ; deux repos de suite (obligatoire, souhaité, sans règle) ; jours d'affilée ; jour isolé | `journeesDuCalcul`, `regleHotel`, `rythmeHumain`, `JOURS_AFFILES_*` |
| **Horaires** (section « Moments »)                     | Les limites matin / middle / soir / nuit, avec l'aperçu des horaires qui changeraient de moment AVANT d'enregistrer                                                                       | `momentPropose`, `periodeLibre`                                     |
| **Postes**                                             | Importance (D11), personnes la nuit, ouverture et fermeture si pas dans Besoins                                                                                                           | `POSTE_ID_ACCUEIL`, un seul veilleur                                |
| **Besoins**                                            | Voir étape 7                                                                                                                                                                              |                                                                     |
| **La loi**                                             | Encadré en lecture seule dans l'aide (« ? »)                                                                                                                                              | —                                                                   |

## Travail à réaliser

1. Composants existants : `EnTeteSection`, `Compteur`, `Segmente`, `useBrouillon` (enregistrer par un bouton), volets.
2. Gestion seule ; les autres en lecture.
3. Vocabulaire existant gardé : Accueil, Veilleur, Relève, journée étoile, moment.

## Critère de validation

- Navigateur sur `localhost:3000`, compte d'essai : changer une règle puis la remettre, la base retrouve sa valeur.
- Tests de rendu de chaque section (lecture seule, enregistrement).
