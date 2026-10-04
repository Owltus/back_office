# Décisions à prendre — Classeur, fonctions du 2026-10-04

Les numéros D1 à D30 sont ceux de la synthèse. Ils servent de référence et ne
seront pas renumérotés.

- **Partie A** : la préférence revient à l'utilisateur. La réponse change ce
  qui sera construit.
- **Partie B** : une réponse par défaut est sûre et réversible. L'utilisateur
  peut la renverser, sinon elle s'applique.

---

## Décisions retenues le 2026-10-04 (déléguées à l'assistant)

L'utilisateur a demandé, en partant : « prends tout en compte et implémente
tout sans me demander ». Pour chaque question, l'assistant a retenu la voie la
plus sûre : sans SQL, sans nouvelle dépendance, sans écriture en production
pour les tests, et la plus fidèle aux choix déjà exprimés. Chacune se renverse
facilement.

| # | Retenu | Raison |
|---|---|---|
| D18 | **oui** : Copier, limité à un AUTRE classeur | « Copier / déplacer » a été accepté ; la limite évite le « Dupliquer » refusé |
| D10 | **A** : déplacement par changement de chapitre | La base vérifie les deux côtés ; historique et numéro gardés |
| D8 | **oui** : l'historique suit le document | C'est déjà le comportement de la base ; rien à purger |
| D6 | **oui** : Copier exige aussi l'écriture sur l'origine | Le plus prudent ; c'était le texte du plan d'origine |
| D16 | **A** : corbeille visible avec le droit d'écriture | Même règle que la suppression |
| D15 | **A** : date choisie, préremplie à « il y a 7 jours » | Aucun SQL ; poste partagé |
| D14 | **A** : noir et blanc comme l'Historique | L'utilisateur a refusé la couleur dans l'éditeur |
| D25 | **A** : demandes à l'export chapitre / document | Dialogue existant ; pas de nouvel écran |
| D26 | **non** : rien n'est mémorisé | Poste partagé |
| D27 | **B** : zoom dans l'éditeur seulement | Périmètre demandé |
| D19 | ~~A~~ → **B, voie navigateur** (RENVERSÉE par l'utilisateur le 2026-10-04 : bouton « Télécharger le PDF » sans fenêtre d'impression) | Pages capturées en image par html2canvas-pro (lit `oklch`, MIT), assemblées par jsPDF, chargées au clic ; « Imprimer » reste la voie vectorielle. D5 tranchée (html2canvas-pro), D20 sans objet |
| D21 | **B** : lecture du catalogue, plus un test réel par l'utilisateur | Docker est éteint ; écrire en production est interdit |

## A. Questions pour l'utilisateur (11)

| # | Question | Choix | Étape | Ce qui en dépend |
|---|---|---|---|---|
| **D18** | « Copier vers un autre classeur » ressemble au « Dupliquer » que vous avez refusé. On garde Copier, limité à un AUTRE classeur, jamais le même ? | oui / non (= Déplacer seul) | 7 | Si non : 7a-7b deviennent plus simples, plus de copie de document |
| **D10** | « Déplacer » = on change le document de chapitre (même document, même historique, même numéro) **(A)**, ou on le copie puis on le met à la corbeille à l'origine **(B)** ? | A / B | 7 | A est plus simple et garde l'historique, B laisse une trace à l'origine |
| **D8** | Un document déplacé emporte son historique. Les lecteurs du classeur d'arrivée verront ses anciennes versions et le nom de leurs auteurs. Acceptable ? | oui / non | 7 | Si non, il faut purger l'historique ou passer par B (D10) |
| **D6** | Pour **Copier**, la base n'exige que la lecture du classeur d'origine. L'app exige-t-elle aussi le droit d'écriture sur l'origine ? | oui / non | 7 | Liste des documents copiables |
| **D16** | Qui voit la corbeille : toute personne qui peut **écrire** dans le classeur **(A)**, ou la **gestion** seulement **(B)** ? | A / B | 6 | Carte d'accueil, droits de restauration |
| **D15** | « Imprimer les modifications depuis » : date choisie à chaque fois **(A)**, ou date de la dernière impression gardée en base par classeur **(B)**, qui demande une écriture SQL ? Le poste et le compte Réception étant partagés, une date mémorisée sur le poste serait fausse pour quelqu'un. | A / B | 5 | B ajoute une colonne et son script SQL ⚠ |
| **D14** | Dans l'aperçu d'import, la comparaison est-elle en noir et blanc comme l'Historique **(A)**, ou en vert/rouge **(B)** ? | A / B | 1 | Composant `DiffTexte` partagé |
| **D25** | Les demandes toutes prêtes pour le LLM : seulement à l'export d'un chapitre ou d'un document **(A)**, ou aussi à l'export du classeur complet **(B)**, qui demande un dialogue de plus ? | A / B | 3 | Un dialogue de plus si B |
| **D26** | Les demandes cochées sont-elles gardées pour la fois suivante ? Sur le poste partagé, une demande cochée par l'un partira chez l'autre. | oui / non | 3 | `localStorage` ou rien |
| **D27** | Le zoom dans l'éditeur seulement **(B)**, ou aussi dans l'aperçu d'impression **(A)** ? | A / B | 8 | `PrintPreview.tsx` touché si A |
| **D19** | Le PDF direct : le besoin est-il d'avoir le **bon nom de fichier** avec « Enregistrer en PDF » du navigateur, qui garde le texte net et cherchable **(A, 1 h)**, ou d'obtenir un **fichier sans passer par la fenêtre d'impression**, par exemple sur tablette **(B, 5 h à 1,5 jour)** ? | A / B | 9 | Si B : D5 et D20 à trancher ensuite |
| **D21** | Tests des droits en écriture du transfert : allumer Docker pour une base locale où tout peut être essayé **(A)**, ou se limiter à lire les règles en place, puis vous faites un transfert réel **(B)** ? /martin interdit toute écriture sur la production, même annulée aussitôt. | A / B | 7b, 10 | A : `supabase start` + schéma relu en lecture. B : moins de garanties automatiques. |

---

## B. Réponses par défaut (réversibles)

| # | Point | Réponse par défaut | Raison |
|---|---|---|---|
| D1 | Numérotation | Les numéros d'étape sont les seuls numéros de référence ; les 17 questions passent en annexe | Vous demandez par numéro |
| D2 | Dépendances | Ajoutées à l'index (9→4, 7→6, 2 et 3→1) | Faits du code |
| D3 | Marquage ⚠ | Étapes 1 et 6 marquées ⚠ | Écritures filtrées / restaurations |
| D4 | Étape 7 | Découpée en 7a, 7b, 7c | Trop grosse |
| D5 | html2canvas | CLAUDE.md corrigé à la clôture. Nouvelle dépendance seulement si D19 = B, choisie compatible `oklch` | La librairie n'est pas installée et ne lit pas `oklch` |
| D7 | RPC de copie d'images | Retirée. `storage.copy` côté client, jamais `upsert` | La RLS suffit |
| D9 | Chemins d'images transférés | Réécriture dédiée qui ne change QUE le chemin (cadre, légende, taille gardés) | `remplacementImage` retire le cadre |
| D11 | Restauration et « modifiés » | Une feuille restaurée compte comme modifiée (signalé dans la liste) ; restaurer remet l'élément en fin de chapitre (vérifié dans le code à l'étape 6) | `classeur_stamp` remet `updated_at` |
| D12 | Lecture des supprimés | Déjà permise par la RLS : rien à changer en base | Vérifié en lecture |
| D13 | Clé de refus d'un document | `kind:id`, avec repli position + titre pour une création | Une création n'a ni id ni uuid |
| D17 | Classeur entier supprimé | Hors de la corbeille (déjà réservé à la gestion) | Périmètre |
| D20 | Fonction serveur qui reçoit votre jeton | Seulement si D19 = B puis voie serveur ; reposée à ce moment-là | Conditionnelle |
| D22 | Version à l'import | Affichée comme « version prévue » | Le numéro réel est calculé à l'écriture |
| D23 | Document refusé | Signalé après l'import (« 1 document ignoré à votre demande ») | Transparence |
| D24 | « Supprimer les absents » pour un document seul | Reste invisible | Sans objet |
| D28 | Ctrl + molette / Ctrl + 0 | Interceptés au-dessus de l'aperçu seulement ; ailleurs, le zoom du navigateur reste | Comme Word et Acrobat |
| D29 | Taille des boutons du zoom | 44 px au doigt, 32 px à la souris | Norme tactile |
| D30 | Index SQL pour l'étape 5 | `explain analyze` à froid d'abord ; index seulement si utile, avec confirmation | Ne pas optimiser sans mesure |
