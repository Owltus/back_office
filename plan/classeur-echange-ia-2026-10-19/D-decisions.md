# Décisions — échange JSON avec une IA

Numérotées D1 à D10, elles ne seront pas renumérotées.

---

## A. Questions pour l'utilisateur

| #       | Question                                                                                                                                                                                                                                                              | Choix | Étape | Ce qui en dépend                 |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ----- | -------------------------------- |
| **D1**  | Comment l'import sait qu'un fichier vient d'une IA : un choix à l'écran d'import, « Fichier rendu par une IA » coché par défaut **(A)**, ou une détection automatique sur `_metadata.instructions` **(B)**, fragile car les exports et instantanés le portent aussi ? | A / B | 5     | Mode d'import, textes de l'écran |
| **D2**  | Faut-il garder le choix fusion / remplacement pour les fichiers de l'application Registre (bureau) **(A)**, ou Registre ne sert plus et on le retire **(B)** ? _Question déjà posée, sans réponse._                                                                   | A / B | 5     | `MergePreviewDialog`, aide       |
| **D3**  | « Copier » met tout dans le presse-papiers, mode d'emploi compris, et l'IA guide dès le collage **(A)**, ou on joint seulement le fichier téléchargé **(B)** ? _Question déjà posée, sans réponse._                                                                   | A / B | 3     | Boutons d'export                 |
| **D4**  | L'IA peut-elle changer la périodicité d'une feuille de suivi existante et le nombre de lignes d'une feuille de signature **(A)**, ou seulement en créer de nouvelles **(B)** ?                                                                                        | A / B | 2, 6  | Consignes, validation            |
| **D5**  | L'export d'un document emporte-t-il le reste de son chapitre en lecture, pour que l'IA réponde avec plus de contexte **(A)**, ou reste-t-il limité au document **(B)** ?                                                                                              | A / B | 3     | Taille du JSON, portée           |
| **D7**  | « Importer » depuis la liste des classeurs (nouveau classeur) reçoit-il la relecture et un aperçu **(A)**, ou reste-t-il direct comme aujourd'hui **(B)** ?                                                                                                           | A / B | 7     | `ClasseurListActions`            |
| **D10** | Un fichier d'un AUTRE classeur importé dans celui-ci : refusé **(A)**, ou accepté avec un avertissement **(B)** ?                                                                                                                                                     | A / B | 5     | `_metadata.portee` du classeur   |

## B. Réponses par défaut (réversibles)

| #      | Point                                      | Réponse par défaut                                                                                                                                                                                                     | Raison                                                                                                             |
| ------ | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| D1     | Provenance                                 | ~~A, IA par défaut~~ **renversée par l'utilisateur le 2026-10-20** : aucun choix, un seul comportement (étape 9)                                                                                                       | Le contenu ne permet pas de la reconnaître ; c'est le cas le plus fréquent.                                        |
| D2     | Registre                                   | ~~A, garder~~ **renversée par l'utilisateur le 2026-10-20** : plus de fusion / remplacement à l'écran ; Registre reste lisible (même format), importé comme tout fichier (étape 9)                                     | Rien ne prouve qu'il ne sert plus ; retirer est irréversible pour l'utilisateur.                                   |
| D3     | Copier                                     | A, tout copier                                                                                                                                                                                                         | « Exporter simplement » : coller suffit, l'IA lit son mode d'emploi.                                               |
| D4     | Réglages des feuilles                      | A, avec validation                                                                                                                                                                                                     | Une mise à jour du classeur peut demander de passer un contrôle de mensuel à trimestriel.                          |
| D5     | Document seul                              | B                                                                                                                                                                                                                      | Le document reste petit ; pour une question large, l'IA dit d'exporter le chapitre ou le classeur.                 |
| **D6** | Instantanés                                | Sans `instructions`, avec les cinq clés de Registre                                                                                                                                                                    | Le mode d'emploi n'a aucune utilité dans une sauvegarde et pèse sur chaque point.                                  |
| D7     | Import depuis la liste                     | A, relecture seule (pas d'aperçu : rien n'existe encore)                                                                                                                                                               | Les avertissements d'un fichier d'IA valent aussi pour un nouveau classeur.                                        |
| **D8** | Libellé de périodicité                     | Ajouté sur chaque feuille de suivi exportée (`periodicite`), ignoré à l'import                                                                                                                                         | L'IA n'a plus à faire la jointure ; Registre ignore la clé (pas de `deny_unknown_fields` sur `ItemJson`, vérifié). |
| **D9** | Phrase « IA / à vérifier » dans le contenu | Alerte non bloquante dans l'aperçu, ligne refusable                                                                                                                                                                    | Jamais bloquer : la personne décide ; la consigne l'interdit déjà en amont.                                        |
| D10    | Autre classeur                             | B, avertissement. **Renversée en partie par l'utilisateur le 2026-10-20** : l'export d'un chapitre ou d'un document n'est plus refusé, il s'applique à sa portée (étape 9) ; l'avertissement d'un autre classeur reste | Un modèle de classeur peut légitimement servir à un autre.                                                         |

## C. Révision du 2026-10-20 (étape 9)

Retour de l'utilisateur : « très complexe pour rien », « fichier de Registre
c'est quoi ce terme », « supprimer ce qui n'est pas dans le fichier, très
destructeur », « fais-le de manière implicite là où il y a du contexte ».
Décision : **aucun choix de provenance, aucune case de suppression, portée
déduite ; ne pas les réintroduire.** Un absent est toujours gardé ; une
suppression passe par `"supprimer": true` sur l'élément gardé (corbeille,
refusable). D1 et D2 renversées, D10 renversée en partie (voir le tableau B).
