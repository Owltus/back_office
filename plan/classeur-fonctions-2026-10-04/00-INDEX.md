# Plan — Classeur : fonctions retenues le 2026-10-04

> **NON EXÉCUTÉ** — plan écrit pour validation. Aucune ligne de code tant que
> l'utilisateur n'a pas dit « go ».

## Contexte

Le Classeur sert à **fabriquer des documents à imprimer** et à **les faire
modifier facilement par un LLM** (précision de l'utilisateur, 2026-10-04 :
« concentre-toi sur l'interface, les options et les éléments, pas sur le
contenu des classeurs »). Après un inventaire du code (agent) et une
comparaison avec les outils établis, l'utilisateur a répondu oui / non à
dix-sept propositions.

## Décisions de l'utilisateur (questions oui / non)

| # | Fonction | Réponse |
|---|---|---|
| 1 | Voir le texte modifié par le LLM avant d'importer, refuser un document | **Oui** |
| 2 | Demandes toutes prêtes pour le LLM | **Oui** |
| 3 | Relecture automatique de la réponse du LLM avant import | **Oui** |
| 4 | Envoyer une sélection de documents au LLM | Non |
| 5 | Télécharger directement un PDF | **Oui** |
| 6 | Imprimer une sélection | **Oui** |
| 7 | Imprimer ce qui a changé depuis une date | **Oui** |
| 8 | Page paysage par document | Non |
| 9 | Rechercher / remplacer | Non |
| 10 | Plein écran | Non |
| 11 | Zoom de l'aperçu A4 | **Oui — « attention à bien penser l'UI et l'UX »** |
| 12 | Annoter une photo | Non |
| 13 | Photo directe depuis le téléphone | Non |
| 14 | Liens entre documents | Non |
| 15 | Dupliquer | Non |
| 16 | Corbeille | **Oui** |
| 17 | Copier / déplacer vers un autre classeur | **Oui** |

Les « Non » ne sont pas à reproposer (CLAUDE.md, liste des refus).

## Angles à clarifier (avant l'étape concernée)

1. **PDF direct (étape 8)** — aucune solution navigateur ne produit un PDF
   VECTORIEL fidèle à partir du DOM. Deux voies établies :
   - **A. Dans le navigateur** : chaque page A4 rendue en image (html2canvas,
     déjà dans le projet) puis assemblée par jsPDF. Rapide à faire, rien côté
     serveur ; mais le texte n'est plus sélectionnable ni net au zoom, et le
     fichier est lourd (~300 à 800 ko par page).
   - **B. Côté serveur** : une fonction Vercel avec un Chrome sans écran
     (`@sparticuz/chromium` + `puppeteer-core`) imprime la page en PDF
     vectoriel, identique à « Enregistrer en PDF ». Qualité parfaite ; mais il
     faut lui ouvrir l'accès aux images privées (jeton de l'utilisateur), et
     c'est une fonction serveur de plus à maintenir.
   Recommandation : **B** si le PDF doit circuler (e-mail, archive) ;
   **A** si c'est seulement pour éviter la fenêtre d'impression.
2. **« Ce qui a changé depuis… » (étape 5)** — la date de référence : une
   date choisie, ou « depuis ma dernière impression » (mémorisée par poste) ?
   Recommandation : les deux, la date choisie étant pré-remplie avec la
   dernière impression du classeur sur ce poste.
3. **Autre classeur (étape 7)** — un document déplacé emporte-t-il ses
   images ? Elles appartiennent au classeur d'origine (dossier et droits) :
   un lecteur du classeur d'arrivée sans droit sur celui de départ ne les
   verrait pas. Recommandation : **copier** les images utilisées dans le
   classeur d'arrivée (fichiers + fiches), et réécrire les chemins.
4. **Corbeille (étape 6)** — combien de temps garder ? Aujourd'hui la
   suppression est douce et SANS limite. Recommandation : tout garder, la
   corbeille ne fait que les montrer ; le vidage définitif reste hors de
   l'app (règle « destructif = confirmation »).

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---|---|---|---|---|---|---|
| 1 | [1-llm-comparaison.md](./1-llm-comparaison.md) | LLM : voir les changements et refuser un document | — | P0 | 4 h | Aperçu d'import avec diff par document | |
| 2 | [2-llm-relecture.md](./2-llm-relecture.md) | LLM : relecture avant import | 1 | P0 | 2 h | Alertes par document dans l'aperçu | |
| 3 | [3-llm-demandes.md](./3-llm-demandes.md) | LLM : demandes toutes prêtes | — | P1 | 3 h | Menu de demandes, consigne ajoutée au JSON | |
| 4 | [4-imprimer-selection.md](./4-imprimer-selection.md) | Impression d'une sélection | — | P1 | 2 h | « Imprimer » dans la barre de sélection | |
| 5 | [5-imprimer-modifies.md](./5-imprimer-modifies.md) | Imprimer ce qui a changé depuis une date | 4 | P1 | 3 h | Choix d'une date, aperçu des seuls modifiés | |
| 6 | [6-corbeille.md](./6-corbeille.md) | Corbeille | — | P1 | 3 h | Éléments et chapitres supprimés, Restaurer | |
| 7 | [7-autre-classeur.md](./7-autre-classeur.md) | Copier / déplacer vers un autre classeur | — | P2 | 5 h | « Déplacer vers… » multi-classeurs, images copiées | ⚠ |
| 8 | [8-zoom-apercu.md](./8-zoom-apercu.md) | Zoom de l'aperçu A4 (UI/UX pensée) | — | P1 | 3 h | Contrôle de zoom, molette, mémorisé | |
| 9 | [9-pdf-direct.md](./9-pdf-direct.md) | Télécharger le PDF | 4 | P2 | 4 h (A) / 1 j (B) | Bouton « Télécharger le PDF » | ⚠ |

## Ordre d'exécution

1. **Sprint LLM** : 1 → 2 → 3 (même dialogue, `EchangeJsonDialog`).
2. **Sprint impression** : 4 → 5 (même circuit d'aperçu), puis 9 une fois
   l'angle n° 1 tranché.
3. **Sprint organisation** : 6, puis 7 (le plus risqué : droits, images).
4. 8 à tout moment (indépendant).

Chaque étape : tests purs + vérification navigateur SANS écrire en base
(règle CLAUDE.md), commit sans push.

## Fichiers impactés (résumé)

| Couche | Modifiés | Nouveaux |
|---|---|---|
| Logique pure (`lib/classeur`) | `merge/portee.ts`, `merge/consignes.ts`, `relecture.ts`, `service.ts` | `llmDemandes.ts`, `selectionImpression.ts`, `corbeille.ts`, `transfert.ts` (+ tests) |
| Interface | `EchangeJsonDialog.tsx`, `ChapterBoard.tsx`, `PrintPreview.tsx`, `DocumentDetail.tsx`, `ClasseurDashboardActions.tsx` | `dialogs/CorbeilleDialog.tsx`, `dialogs/ImprimerModifiesDialog.tsx`, `detail/ZoomApercu.tsx` |
| Base | — (étapes 6, 7 : lectures et mises à jour déjà permises par la RLS — à vérifier) | éventuellement une RPC de copie d'images (étape 7) |
| Serveur | — | fonction PDF si voie B (étape 9) |
