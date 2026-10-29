# Décisions — planning cohérent

Numérotées D1 à D11, elles ne seront pas renumérotées.

## A. Questions pour l'utilisateur

| #   | Question                                                                                                                                                                                                                                                                                   | Choix (A / B) | Étape | Ce qui en dépend                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- | ----- | ------------------------------------------------------ |
| D1  | Les consignes matin / soir : **(A)** restent une règle du moteur, mais l'écran montre l'écart avec les besoins et propose d'ajuster ; **(B)** deviennent un simple contrôle des besoins (le moteur ne place que sur les besoins, et « au moins 3 » exige que la somme des besoins fasse 3) | A / B         | 6, 10 | Le rôle des « places en plus », la clarté des Besoins  |
| D2  | Combien d'heures compte une journée d'école : **(A)** une durée par apprenti dans sa fiche (7 h par défaut) ; **(B)** une durée unique pour tout l'hôtel                                                                                                                                   | A / B         | 9     | Une migration (colonne sur la fiche ou réglage global) |
| D3  | Pour couvrir une place « nécessaire », le planning peut-il donner un 6e jour ou dépasser le contrat (dans la loi) : **(A)** oui, la place passe avant ; **(B)** non, il laisse la place vide et la signale                                                                                 | A / B         | 10    | Les poids du générateur                                |
| D4  | Une personne qui n'a aucun code utilisable sur un poste : **(A)** signalée par le contrôle, le poste reste dans sa fiche ; **(B)** l'enregistrement de la fiche est refusé                                                                                                                 | A / B         | 4, 5  | Friction à la saisie                                   |
| D5  | Les codes de la fiche : **(A)** choisis PARMI ceux de ses postes seulement (exception) ; **(B)** liste libre comme aujourd'hui                                                                                                                                                             | A / B         | 4     | La règle unique                                        |
| D6  | Générer sans aucun besoin réglé : **(A)** bouton grisé avec la raison et le lien vers Besoins ; **(B)** possible, avec un avertissement                                                                                                                                                    | A / B         | 7     | Le guide de démarrage                                  |
| D7  | L'interrupteur « Poste à part » : **(A)** renommé « Ranger à part dans la liste de l'équipe » ; **(B)** retiré                                                                                                                                                                             | A / B         | 1     | PostesPage, Équipe                                     |
| D8  | Les shifts passés incohérents (adjoints sur des codes de comptoir, shifts sans code) : **(A)** corrigés par l'app en un clic, proposés par le contrôle ; **(B)** laissés tels quels, seulement signalés                                                                                    | A / B         | 11    | Données dev, puis prod par l'utilisateur               |

## B. Réponses par défaut (réversibles)

| #   | Point                           | Réponse par défaut                                                                           | Raison                                                                                        |
| --- | ------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| D1  | Consignes matin / soir          | **A**                                                                                        | Moins de rupture ; l'écart devient visible et corrigeable d'un clic. B reste possible ensuite |
| D2  | Durée d'une journée d'école     | **A**, 7 h                                                                                   | Les CFA n'ont pas tous la même journée ; 7 h = journée type d'apprentissage                   |
| D3  | Place nécessaire contre confort | **A**                                                                                        | « Personnes nécessaires » doit vouloir dire nécessaire ; la loi reste une limite dure         |
| D4  | Aucun code utilisable           | **A**                                                                                        | Pas de friction à la saisie ; le contrôle le dit avec un lien                                 |
| D5  | Codes de la fiche               | **A**                                                                                        | Pratique des logiciels du marché : l'éligibilité vit au poste                                 |
| D6  | Générer sans besoin             | **A**                                                                                        | Évite le faux « Planning complet généré »                                                     |
| D7  | « Poste à part »                | **A**                                                                                        | Garde la fonction, dit ce qu'elle fait                                                        |
| D8  | Shifts passés incohérents       | **A**, en dev                                                                                | Rien ne s'écrit sans un clic ; la prod se corrige par l'utilisateur                           |
| D9  | Mot « Catégorie »               | « Catégorie HCR » sur un poste, « Groupe » pour l'équipe                                     | Un mot par idée                                                                               |
| D10 | Mot pour le soutien             | « Apprentis et stagiaires (ne comptent pas seuls) » ; « renfort » réservé aux places en plus | Fin du double sens                                                                            |
| D11 | Liste vide en base              | `{}` reste « tous » ; le mode « Seulement ceux-ci » exige au moins un code                   | Aucune migration, aucune donnée réécrite                                                      |

| D12 | Code fixé sans besoin de ce code | Règle stricte, signalée avant de générer | Réponse utilisateur |
| D13 | Ordre des personnes | Titulaire, puis dépannage ; un soutien jamais seul | Réponse utilisateur |
| D14 | Dépannage + soutien sans titulaire | Accepté si aucun titulaire n'est libre, sans alerte | Réponse utilisateur |
| D15 | Équité | Week-ends, soirs, matins tôt, au mieux, jamais obligatoire | Réponse utilisateur |
| D16 | Coupure de 11 h à la main | Refusée, avec la raison dans le menu. Révisé le 2026-10-30 : permise en manuel avec son alerte sur la ligne, jamais en automatique | Réponse utilisateur |
| D17 | Points « À vérifier » | Tous, groupés par écran, 5 visibles puis « N de plus », bloquants en tête | Réponse utilisateur |
| D18 | Relecture après génération | Propositions à valider, comme aujourd'hui, résumé en tête | Réponse utilisateur |
| D19 | Production | Rien ne part sans « push » | Réponse utilisateur |

## C. Révision datée

**2026-10-29, questionnaire.** D1 à D8 : réponses par défaut confirmées
(D1 = A, D2 = A 7 h, D3 = A, D4 = A, D5 = A, D6 = A, D7 = A, D8 = A).
D12 à D19 ajoutées.

Sur l'ordre des personnes, l'utilisateur : « Il faut toujours avoir un
titulaire. Un titulaire peut travailler tout seul en gros. Quelqu'un qui peut
intervenir en dépannage peut remplacer éventuellement, mais si un titulaire
serait disponible à la place, c'est mieux, et évidemment un soutien a
absolument besoin d'avoir quelqu'un. Si on a un dépannage et un soutien en
même temps, ça peut le faire. 2 personnes sont plus fortes qu'une. »
→ D13, D14 : coût du dépannage au-dessus du titulaire, sous le palier
« nécessaire » ; la règle « soutien jamais seul » reste dure.

Sur l'équité : « l'équité doit être réalisée au mieux, mais pas obligatoire.
Et surtout, c'est très important de bien respecter les 11 h de coupure. »
→ D15 (coût léger, sous les contrats), D16 ; les 11 h restent une contrainte
dure du moteur, et deviennent un refus dans les menus.

**2026-10-30, mode manuel.** D16 révisée par l'utilisateur : « La coupure de
11 h : en manuel on doit pouvoir passer outre, avec le message d'alerte comme
aujourd'hui ; en automatique, jamais. » Les menus et le volet d'un shift
montrent tous les horaires de la personne, rangés par casquette (un poste de
sa fiche, métier habituel d'abord), sans choisir de poste avant.
