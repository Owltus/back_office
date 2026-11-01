# Audit des pages Planning, vues comme une appli RH (2026-11-01)

Demande : « tout clair, factuel et fonctionnel comme une application RH, pas
de paramètre étrange ; remplir au mieux les plannings avec les horaires déjà
là, pour qu'il y ait toujours des hôteliers dans l'hôtel, 7/7 24/24 ».

Méthode : 8 lecteurs du code en parallèle (mois, semaine, équipe, postes et
horaires, besoins, messages, modèle de données, nuit et 24/24), 141 constats.
Les vérifications indépendantes ont été coupées par la limite d'usage ; les
constats graves ci-dessous ont été relus à la main dans le code. Visite de
toutes les pages dans Chrome sur localhost (copie de la prod), sans écrire.
Constats bruts : journal du workflow `wf_6b04ce74-19e`.

---

## A. Le 24/24 n'est pas garanti (à faire en premier)

1. **Une case vide du tableau Accueil ne déclenche rien.** `coherence.ts:317`
   ne contrôle que les cases > 0 ; la case vide s'affiche en tiret gris. Une
   nuit oubliée = un planning sans personne, avec « Prêt à générer ».
   Proposition : un point « à voir » par moment vide (« La nuit de dimanche :
   personne de demandé à l'accueil. »), repère orange dans la case.
2. **Les trous ne sont cherchés qu'entre le matin et le soir.**
   `cycles.ts:175` `plageAccueil` ignore la nuit (test qui le fige :
   `accueil.test.ts:489`). Rien ne voit un vide entre 22:45 et 23:00, ni
   entre 07:00 et le premier matin. Proposition : quand la nuit est demandée,
   la plage du jour va de la fin de la nuit précédente au début de la nuit.
3. **Un middle compte matin ET soir, et un surplus coûte plus qu'un trou.**
   `generateur.ts:84`. Une personne en 11:00-19:45 satisfait « matin 1 » sans
   que personne ne soit là à 07:00. Proposition : sur l'accueil, un trou pèse
   plus lourd qu'une personne en plus.
4. **Aucun contrôle des heures de l'accueil.** `coherence.ts:655` compare
   heures demandées et heures de contrat pour les postes à part seulement.
   Proposition : « L'accueil demande environ N h par semaine ; les contrats de
   l'accueil en font M. Il manque X h. »
5. **La nuit tient à la catégorie HCR du poste**, réglage sans aide
   (`presence.ts:224`, `PostesPage.tsx:337`). Sans poste « Veille de nuit »,
   le message accuse les horaires. Proposition : un seul réglage par poste,
   « Accueil : non / matin et soir / nuit ».

## B. Réglages étranges ou trompeurs

| Où                  | Constat                                                                                                                    | Proposition                                                                   |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Fiche, semaine type | « Travaille : elle travaille toujours ce jour-là » ; en réalité simple préférence (`POIDS_JOUR_FIXE`, `generateur.ts:213`) | « Son jour habituel : le planning essaie de la faire travailler ce jour-là. » |
| Fiche               | Mineur coché avec 39 h : plafond 35 h mais 39 h dues                                                                       | Refuser plus de 35 h pour un mineur                                           |
| Fiche               | 0 h accepté pour un CDI (`brouillon.ts:418`)                                                                               | Exiger plus de 0 h hors extra                                                 |
| Fiche               | Heures modifiables pour un extra et un forfait jours, sans effet                                                           | Champ grisé « Sans objet »                                                    |
| Fiche               | « Actif » ET « Fin de contrat » font la même chose                                                                         | Garder la date de fin seule                                                   |
| Fiche               | Mode « Absence » de la semaine type, doublon de Repos et des absences                                                      | Libre / Travaille / Repos seulement                                           |
| Fiche               | Apprenti mis en Titulaire : placé seul sans alerte                                                                         | Point bloquant                                                                |
| Postes              | « Compte dans la présence matin et soir (consignes des besoins) »                                                          | « Poste de l'accueil »                                                        |
| Postes              | « Ranger à part dans la liste de l'équipe » : n'agit pas sur la liste                                                      | Retirer, ranger automatiquement                                               |
| Postes              | Supprimer un poste efface ses shifts passés                                                                                | « Poste fermé », historique gardé                                             |
| Groupes             | « Postes autorisés » retire en silence des compétences des fiches                                                          | Retirer ou prévenir avant                                                     |
| Horaires            | Moment « À part » (5e choix) et aides fausses : middle « selon son heure de début », nuit « hors des consignes »           | 4 moments, aides justes                                                       |
| Horaires            | « Compté dans les heures » proposé pour École et Repos, sans effet                                                         | Seulement pour une absence                                                    |
| Horaires            | « dont N min au début »                                                                                                    | « La journée étoile finit plus tôt / commence plus tard »                     |
| Besoins             | « Places pour apprentis » sur Direction, Technique…                                                                        | Seulement si un apprenti tient ce poste                                       |
| Besoins             | Tableau Accueil réglable même sans poste de l'accueil (chiffres ignorés)                                                   | Cases grisées, lien vers Postes                                               |
| Pour commencer      | « N besoins » compte les besoins Réception et Club ignorés (`coherence.ts:250`)                                            | « Accueil réglé, N besoins sur les autres postes »                            |
| Paramètres          | « Importer le prototype » toujours affiché                                                                                 | Seulement sur un planning vide                                                |
| Mois                | « Avant le dernier planning réalisé » ferme des semaines ouvertes                                                          | Ouverte = ni passée ni verrouillée                                            |

## C. Vocabulaire (un mot par chose)

- « Personnes par cycle », « 2 cycles à compléter » : dire « Accueil »,
  « 2 moments de l'accueil à compléter ».
- Un même manque apparaît deux fois (Shifts à pourvoir ET Personnes par cycle).
- « Journée étoile » / « journée courte » : un seul nom, expliqué une fois.
- « Non attribué » efface : « Retirer le shift » ou « Retirer l'absence ».
- « Full auto », « Générer », « Compléter » : un seul verbe.
- « 3/2 » en rouge comme une infraction (SUREFFECTIF, `verificateur.ts:416`) :
  « 3 personnes pour 2 places », en orange.
- « Night » dans la colonne : « Veilleur ».
- « Je ne peux pas remplir » : « Impossible de remplir ».
- « le moteur » : « le planning automatique ».
- Identifiants techniques en infobulle (R-REPOS-HEBDO-HCR) : à retirer.
- « Horaires » / « Horaires et absences » : un seul nom.
- Une ligne de règle de 190 caractères (repos hebdomadaire) : trois lignes.
- « Données à ranger » : « Shifts à corriger ».

## D. Bugs visibles

- « Placer quelqu'un » sur une place de l'accueil ouvre le volet sans
  horaire ni moment (`PlacesAPourvoir.tsx:105`).
- Les phrases prévues pour les places de l'accueil
  (`placeAccueilClaire`, `raisonsPlaces.ts:343`) ne sont appelées nulle part.
- Créer un horaire en double affiche « cette personne a déjà un shift ce
  jour-là » (`erreurs.ts:33`).
- Vue semaine : pas de pastille pour un moment sans chiffre (le mois en a).
- Bouton « ? » sans clic : aide au survol seulement.
- Cadenas de semaine sans confirmation.
- Repos en proposition non comptés dans « jours à valider ».

## E. Ordre de chantier proposé

1. Garantie 24/24 : case vide signalée, trous sur 24 h, trou plus lourd
   qu'un surplus, contrôle des heures de l'accueil. Moteur et contrôle, pas de
   migration.
2. Un seul réglage « Accueil : non / matin et soir / nuit » sur le poste.
   Migration.
3. Fiche : retirer Actif et le mode Absence, griser les heures sans objet,
   refuser mineur à 39 h et 0 h. Écran, petite migration pour Actif.
4. Postes et Horaires : retirer « Ranger à part », « À part », la case
   « Compté dans les heures » hors absence ; poste fermé au lieu de supprimé.
   Migration.
5. Vocabulaire et messages (partie C). Écran seulement.
6. Bugs de la partie D. Écran seulement.
7. Menus : un verbe, Importer masqué, aide au clic. Écran seulement.
8. Restes de l'ancien modèle : besoins Réception et Club ignorés, défaut
   soutien = 1 en base, code obligatoire des motifs. Migration.

Non couverts : le parcours d'un nouvel utilisateur (lecteur coupé par la
limite), jours fériés automatiques, export ou impression du planning.
