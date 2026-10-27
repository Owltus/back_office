# Plan — Portage du prototype de planning dans le back office

Date : 2026-10-27 (nuit). Demande utilisateur : « implémenter toutes les logiques
correctement, en pensant à tout » du prototype `C:\Users\Pierre-Louis\Desktop\planning`
(Python FastAPI + OR-Tools CP-SAT + SQLite, front Vite/React) vers la page `/planning`
du back office (TanStack Start + Supabase). Travail en binôme avec la session du
prototype (`planning-0c`), qui a confirmé l'état stable du prototype (v20, 190 tests).

## Contexte

Le prototype génère les plannings du staff de l'hôtel sous la convention HCR. Son
cœur (`solveur/`, `regles.py`, `semaine.py`) est pur ; la base et l'API ne font que
l'alimenter. Le back office n'a ni Python ni serveur dédié : tout doit vivre dans
le navigateur et dans Supabase.

## Décisions (prises par l'assistant, réversibles, à revoir avec l'utilisateur)

| #   | Décision                                                                                                                                                                                                                                                                                                               | Pourquoi                                                                                                                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Solveur réécrit en TypeScript, même modèle, résolu par **HiGHS** (MIP, `highs@1.15.3`, WebAssembly) dans un **Web Worker**                                                                                                                                                                                             | Toutes les contraintes CP-SAT du prototype sont linéaires sur des booléens (confirmé par le binôme) ; 17 salariés × 94 créneaux, 0,2 s en CP-SAT. CSP déjà prête (`wasm-unsafe-eval`, `worker-src blob:`). |
| D2  | Vérificateur, règles HCR et analyse de semaine portés en TS **pur** (`lib/planning/`), tests portés depuis pytest                                                                                                                                                                                                      | Le vérificateur reste l'oracle indépendant du solveur.                                                                                                                                                     |
| D3  | Données dans des tables `planning_*`, RLS sur `private.get_page_level('planning')`                                                                                                                                                                                                                                     | Même modèle que les autres pages.                                                                                                                                                                          |
| D4  | Droits : **lecture** = tout voir ; **écriture** = faire le planning (shifts, absences posées au planning, valider, compléter, vider, horaires fixes) ; **gestion** = en plus, paramétrer (équipe, postes, horaires, motifs, besoins, catégories), verrouiller / déverrouiller une semaine, importer ; **aucun** = rien | Le planning est l'outil quotidien ; l'équipe et les règles de l'hôtel sont du paramétrage.                                                                                                                 |
| D5  | Absences stockées **jour par jour** (`planning_absences`, unique salarié + jour)                                                                                                                                                                                                                                       | Figer une semaine verrouillée devient une règle simple en base (trigger), et « retirer un jour » ne coupe plus de période. La fiche regroupe les jours consécutifs en périodes à l'affichage.              |
| D6  | Semaine verrouillée figée **en base** (triggers) pour tout le monde, gestion comprise : aucun shift ni jour d'absence d'une semaine verrouillée ne change. On déverrouille d'abord.                                                                                                                                    | Prototype : HTTP 423 ; un planning réalisé ne se détruit pas.                                                                                                                                              |
| D7  | Opérations à plusieurs lignes en **RPC `security invoker`** dans `public` (RLS appliquées) : appliquer une génération, déplacer / échanger, poser une absence, déplacer un statut, cascades de suppression                                                                                                             | Atomicité (l'index « un shift par jour » refuserait un échange en deux temps) ; verrou consultatif par semaine contre deux « Compléter » simultanés.                                                       |
| D8  | **Vrais noms jamais dans le dépôt.** Import dans l'app (gestion) d'un fichier JSON, produit par `scripts/planning-exporter-prototype.mjs` depuis `planning.db`. Seed local = l'hôtel FICTIF de `demo.py`.                                                                                                              | Données personnelles du staff (le binôme l'a rappelé).                                                                                                                                                     |
| D9  | Le cache disque n'écrit **jamais** les clés `planning` (noms, absences dont maladie)                                                                                                                                                                                                                                   | Poste de la réception partagé (`PREFIXES_SENSIBLES`).                                                                                                                                                      |
| D10 | « Réinitialiser l'hôtel » et le mode prototype **non portés**                                                                                                                                                                                                                                                          | En production, rien ne détruit le réalisé (décision du prototype).                                                                                                                                         |
| D11 | Jours fériés non modélisés                                                                                                                                                                                                                                                                                             | Décision de l'utilisateur relayée par le binôme.                                                                                                                                                           |

## Bilan au matin du 2026-10-27

Toutes les étapes sont faites, dans ces commits locaux, rien n'est poussé :

| Commit  | Contenu                                                                        |
| ------- | ------------------------------------------------------------------------------ |
| 0cff5d8 | Page Planning vide (droits de page)                                            |
| b52b387 | Schéma, RLS, verrous, RPC, pgTAP, seed fictif                                  |
| c358488 | Moteur TS + HiGHS, 134 tests portés, import du prototype                       |
| 04ca691 | Verrou sans passe-droit, ordre des verrous, date du jour (relecture du binôme) |
| d669468 | Écrans semaine, mois, équipe, postes, horaires, besoins                        |
| a8d199f | La base recale un shift codé sur son code horaire                              |
| 45dd5bc | 8 défauts de la relecture adverse corrigés                                     |
| e2667b2 | Fonctions du prototype qui manquaient (audit de couverture)                    |
| 899ed94 | Délai des tests de rendu du mois                                               |

Preuves :

- 3 288 tests du projet au vert, dont 249 pour le planning ;
- 39 contrôles pgTAP ;
- build OK ; aucune dérive entre la base locale et les migrations ;
- oracle différentiel, hors dépôt : l'analyse est identique au Python sur 7 vraies semaines ;
- essais dans Chrome sur localhost : import réel, « Compléter le mois », verrou, échange
  de shifts, droits en lecture, création et suppression d'un poste et d'une fiche, refus de
  supprimer un poste d'un planning réalisé, éditeur de shift.

État de la base LOCALE : l'export réel du prototype y est importé. Novembre a été complété
par le moteur (propositions) ; en S45, deux shifts ont été échangés pendant l'essai, et sont
donc validés. Les comptes de test sont supprimés.

### Questions pour l'utilisateur

1. **Congés le week-end** (relevé par le binôme) : un congé du vendredi au dimanche compte
   3 jours dans les heures dues (39 h → 16 h dues), comme dans le prototype. Est-ce voulu ?
   Si non, on change les deux applications ensemble.
2. **École après fin avril 2027** : le calendrier d'alternance importé s'arrête là. Il se
   reprolonge depuis la fiche (bloc École, remplissage par rythme).
3. **Postes à part** : l'écran Équipe les propose dans un groupe séparé (comme le
   prototype) ; la règle « seulement s'il le tient déjà » n'existe pas dans le prototype.
4. **Décisions D1-D11** ci-dessus, prises par l'assistant : notamment écriture = faire le
   planning, gestion = paramétrer et verrouiller ; la fiche d'un salarié (et ses absences)
   n'est modifiable qu'en gestion.
5. **Livraison** : deux migrations (`…110000_planning_schema`, `…120000_planning_import`) en
   plus de `…100000_page_planning`. Après « push », importer les données en prod depuis
   l'engrenage (gestion), avec le fichier produit par
   `node scripts/planning-exporter-prototype.mjs`.

## Étapes (un commit ou plus chacune)

1. Schéma, RLS, triggers, RPC + tests pgTAP (`05_planning.test.sql`) + seed fictif.
2. `lib/planning` : types, temps (Europe/Paris, changement d'heure), règles HCR, vérificateur, construction de la semaine, analyse — tests portés.
3. Solveur HiGHS + worker — tests portés, vérificateur comme oracle.
4. Service Supabase, clés, hooks TanStack Query, mutations.
5. Écran Planning (semaine) : grille pleine largeur, cartes, glisser-déposer, menu de case, éditeur, alertes, bilan, à pourvoir, Compléter / Vider / Valider / verrou / horaires fixes.
6. Vue mois.
7. Paramètres : Équipe (fiche, semaine type, absences, école), Postes, Horaires et motifs, Besoins, Catégories.
8. Import depuis le prototype + script d'export.
9. Vérification navigateur en local, relecture adverse, CLAUDE.md, mémoire.
