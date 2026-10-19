# Plan — Classeur : échange JSON avec une IA, refait pour des non-initiés

> **TERMINÉ.** Plan écrit le 2026-10-19. Étapes 1 à 4 faites le 2026-10-19, 5 à 8 le 2026-10-20 (réponses par défaut de D-decisions.md, partie B, à revoir avec l'utilisateur). Rien n'est poussé. Bilan de clôture en fin de fichier.

---

## Contexte

L'export JSON « pour un LLM » existe depuis le 2026-09-29 (chapitre, document)
et le 2026-10-04 (classeur complet, demandes toutes prêtes). Retour de
l'utilisateur le 2026-10-19 : les cases « Demandes au LLM » (Corriger, Mettre
en étapes, Raccourcir…) sont pénibles ; il veut **exporter simplement**, et que
le JSON porte **tout ce qu'une IA doit savoir** sur l'app pour guider des
personnes qui ne sont ni développeurs ni rompues aux bonnes pratiques :
répondre à leurs questions sur le contenu (un « RAG simple »), proposer des
idées, mettre à jour le classeur, ajouter des chapitres et des éléments,
générer des choses à partir des données.

Réponses de l'utilisateur (2026-10-19) :

| Sujet                    | Réponse                                                                                                                                                                                                    |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Portée                   | Un classeur entier, un chapitre ou un document. **Jamais plusieurs classeurs** (trop de volume). Penser aux autres modèles (feuilles de suivi, de signature, intercalaires) quand c'est pertinent.         |
| Demandes à cocher        | Les retirer.                                                                                                                                                                                               |
| Retour des modifications | Un JSON à réimporter.                                                                                                                                                                                      |
| Guidage                  | Proposer des idées et rappeler les limites. **Jamais** un avertissement du genre « je peux me tromper » écrit dans le contenu d'un classeur (« briser le quatrième mur ») : il reste dans la conversation. |

**Numérotation** : les numéros d'étape ci-dessous sont les seuls numéros de
référence (l'utilisateur demande par numéro ; ne jamais renuméroter).

---

## Ce que l'exploration a changé

| Fait établi                                                                                                                                                                                                                                    | Conséquence                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `COMMUNES` (`consignes.ts` l.16) impose « ta réponse doit être le JSON complet… ».                                                                                                                                                             | L'IA ne peut ni dialoguer, ni répondre à une question. C'est le cœur à réécrire (étape 2).                                   |
| `consignesClasseur` demande de réimporter en REMPLACEMENT ; en fusion, R7 (« le plus récent gagne », `merge.ts` l.282) classe `unchanged` tout élément dont l'IA a recopié `updated_at`.                                                       | L'import d'un classeur complet venant d'une IA ignore ses modifications en silence si l'on choisit mal. Étape 5.             |
| Le moteur sait DÉJÀ créer les 4 natures (R10). Seul l'ajout de document est décrit à l'IA, et `periodicite_id` / `nombre` lui sont interdits.                                                                                                  | Pas de moteur à écrire pour les feuilles : des consignes (étape 2) et une validation (étape 6).                              |
| `nombre` n'a aucune borne côté app ; la base a `CHECK (nombre BETWEEN 1 AND 60)`. Un uuid mal formé donne 22P02, non réessayé. Aucune transaction.                                                                                             | Un fichier d'IA peut casser un import AU MILIEU. Valider avant l'instantané (étape 6).                                       |
| Aucun marqueur fiable de provenance : les exports, les instantanés et les fichiers d'IA portent tous `instructions`.                                                                                                                           | C'est l'écran d'import qui dit « fichier d'une IA », pas le contenu (D1).                                                    |
| Registre (`files.rs` l.110-117) exige les cinq clés de `_metadata` s'il est présent (`description`, `generated_at`, `note`, `schema`, `periodicites`) ; il ignore les clés inconnues, y compris sur `ItemJson` (pas de `deny_unknown_fields`). | Le mode d'emploi reste dans `instructions` (ou une clé nouvelle) ; on peut ajouter un libellé de périodicité sur un élément. |
| `construireExport` sert aussi aux points de restauration (`restauration.ts:142`, `apply.ts:511`, `history.ts:71`).                                                                                                                             | Un mode d'emploi plus long alourdit chaque instantané en base (étape 4).                                                     |
| `SCHEMA_DESCRIPTIF` dit « le merge n'efface jamais » et « periodicites ignorée à l'import » : les deux sont faux dans le Back Office.                                                                                                          | À corriger avec les consignes (étape 2).                                                                                     |
| `relireLigneImport` ne relit que le `content` des documents.                                                                                                                                                                                   | Une phrase « généré par IA » dans le titre d'une feuille passerait. Étape 7.                                                 |
| L'export d'un document seul ne contient que ce document.                                                                                                                                                                                       | Une question qui dépasse le document doit passer par l'export du chapitre ou du classeur (D5).                               |

---

## Phases

| #   | Fichier                                                            | Phase                                     | Dépend de | Priorité | Effort | Livrable                                                                                                              | Critique |
| --- | ------------------------------------------------------------------ | ----------------------------------------- | --------- | -------- | ------ | --------------------------------------------------------------------------------------------------------------------- | -------- |
| 1   | [1-retrait-demandes.md](./1-retrait-demandes.md)                   | Retirer les demandes au LLM               | —         | P0       | 2 h    | FAIT 483d563 : plus de cases, plus de `_metadata.demande` (ancien fichier lu, clé ignorée)                            |          |
| 2   | [2-mode-emploi-ia.md](./2-mode-emploi-ia.md)                       | Mode d'emploi pour l'IA                   | 1         | P0       | 4 h    | FAIT ed977a7 : mode d'emploi en 6 parties + quatrième mur, 5,7 à 5,9 ko ; schéma corrigé ; libellé `periodicite` (D8) | ⚠        |
| 3   | [3-export-un-clic.md](./3-export-un-clic.md)                       | Export en un clic partout                 | 1, 2      | P0       | 3 h    | FAIT 3ad1ccd : Copier / Télécharger partout, repli téléchargement, Copier pour une IA dans le menu de la liste        |          |
| 4   | [4-instantanes-legers.md](./4-instantanes-legers.md)               | Points de restauration sans mode d'emploi | 2         | P2       | 1 h    | FAIT 1b49a3d : instantanés sans `instructions`, cinq clés de Registre gardées                                         |          |
| 5   | [5-import-fichier-ia.md](./5-import-fichier-ia.md)                 | Import d'un fichier d'IA sans piège       | 2         | P0       | 5 h    | FAIT 1f6de60 : choix IA / Registre, collage, fichier qui fait foi sans horodatage, suppressions sur case, portée D10  | ⚠        |
| 6   | [6-validation-avant-ecriture.md](./6-validation-avant-ecriture.md) | Validation avant toute écriture           | 5         | P0       | 3 h    | FAIT a7f16a0 : V1-V8 avant le plan et le point, fichier valide intact, réglages en clair, nouveau classeur validé     | ⚠        |
| 7   | [7-relecture-quatrieme-mur.md](./7-relecture-quatrieme-mur.md)     | Relecture : quatrième mur et 4 natures    | 5         | P1       | 3 h    | FAIT 65cb569 : liste fermée sans faux positif sur la base locale, toutes natures, éditeur, relecture avant création   |          |
| 8   | [8-cloture.md](./8-cloture.md)                                     | Aide, CLAUDE.md, contrôle global          | 1-7       | P0       | 2 h    | FAIT 5533fc0 : aide, libellés IA, un seul classeur dans les consignes ; puis CLAUDE.md et bilan (commit de doc)       | ⚠        |

---

## Ordre d'exécution

1. **1** : retirer d'abord les demandes, sinon les consignes réécrites
   cohabiteraient avec une clé `demande` morte.
2. **2** : la source unique des consignes ; 3, 4 et 5 en dépendent.
3. **3** : l'export visible par l'utilisateur.
4. **5 → 6 → 7** : même circuit d'import (`EchangeJsonDialog`,
   `MergePreviewDialog`, `ApercuImport`), donc JAMAIS en parallèle.
5. **4** : indépendante, faite quand 2 est figée.
6. **8** : clôture.

Chaque étape : tests purs + phase /martin + vérification navigateur sur
`localhost:3000` SANS compte réel (si aucun compte de test local, le dire),
puis commit par `pnpm commit`, sans push. Une étape ⚠ est suivie d'un audit
`/borg` ; un problème critique arrête le chantier.

---

## Architecture cible

```
Exporter (classeur | chapitre | document)  ── un clic : Copier / Télécharger
  └─ JSON v2 (Registre le lit toujours)
       _metadata.description / generated_at / note / schema / periodicites
       _metadata.instructions  = MODE D'EMPLOI (consignes.ts, une source)
          1. à qui tu parles  2. répondre (citer chapitre + document)
          3. modifier (plan, accord, JSON, comment l'importer)
          4. proposer des idées (dont feuilles de suivi / signature)
          5. l'app : 4 natures, périodicités, mise en page A4
          6. limites : dans la conversation, JAMAIS dans le contenu
       _metadata.portee (chapitre, document ; classeur selon D10)

Importer
  ├─ « Fichier rendu par une IA » (défaut, D1)
  │    sansHorodatage → remplacement filtré → suppressions sur case
  │    validation (étape 6) → aperçu + refus → relecture (étape 7)
  │    → point de restauration → écritures
  └─ « Fichier de Registre ou d'un autre poste » (D2) : fusion / remplacement actuels
```

---

## Implications transverses

### Interopérabilité Registre

- Garder les cinq clés de `_metadata` avec leurs types ; ne jamais toucher
  `slugify`, ni l'ordre des clés d'`itemVersJson`.
- Toute nouvelle clé de `_metadata` posée par `construireExport` est relue par
  `lireMetadata` (test d'aller-retour de `schema.test.ts`).

### Restauration

- `restaurerInstantane` passe par `planifierFusion` en remplacement AVEC les
  `updated_at` (E6). Le mode IA est une COUCHE au-dessus (comme
  `portee.ts` / `sansHorodatage`), jamais une modification de R7, R8 ou R11.
- Les tests de propriétés (`audit.property.test.ts` P1-P10, `e10`, oracles
  `fusionAvantE10`, `porteeAvantRefus`) doivent rester verts SANS changement :
  l'option désactivée donne un plan identique.

### Base

- Aucune migration prévue. Si l'étape 4 change la taille des instantanés,
  rien ne change dans le schéma.

### Cache persisté et poste partagé

- Rien n'est mémorisé du choix d'export ou d'import.

### Interface

- Règles de l'UI : phrases courtes, pas de jargon, ni tiret cadratin ni « » dans
  les messages, un message seulement en cas d'anomalie.

### Écritures réelles

- À faire par l'utilisateur à la fin : un aller-retour réel avec une IA
  (question, puis modification d'un chapitre, puis ajout d'une feuille de suivi).

---

## Phases de test /martin — règles communes

| Règle              | Application                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Oracle indépendant | Pour l'import IA : un simulateur naïf « le fichier fait foi » comparé au plan filtré.                                    |
| Mutation           | Chaque garde nouvelle (borne de `nombre`, format d'uuid, filtre de relecture) est mutée à la main et doit être attrapée. |
| Non-régression     | Les plans des chemins NON-IA restent identiques (oracles existants).                                                     |
| Stryker            | Au moins 80 % sur les fichiers purs nouveaux ou réécrits.                                                                |

---

## Angles à clarifier

Voir [D-decisions.md](./D-decisions.md) : D1 à D10. Deux questions étaient
déjà posées à l'utilisateur et restent sans réponse (D2 et D3).

---

## Fichiers impactés (résumé)

| Couche                       | Fichiers modifiés                                                                                                                                                                                                                                      | Fichiers nouveaux                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| Métier pur (`lib/classeur/`) | `merge/consignes.ts`, `merge/schema.ts`, `merge/portee.ts`, `merge/apply.ts`, `merge/history.ts` (commentaire), `exportJson.ts`, `restauration.ts`, `relecture.ts`                                                                                     | `merge/importIa.ts`, `merge/validationImport.ts`                    |
| Composants                   | `dialogs/ExportJsonClasseurDialog.tsx`, `dialogs/EchangeJsonDialog.tsx`, `dialogs/MergePreviewDialog.tsx`, `dialogs/ApercuImport.tsx`, `ClasseurDashboard.tsx`, `ClasseurDashboardActions.tsx`, `ClasseurListActions.tsx`, `ClasseurListHelpPanel.tsx` | —                                                                   |
| Supprimés                    | `llmDemandes.ts`, `dialogs/DemandesLlm.tsx`, `llmDemandes.test.ts`, `merge/portee.demande.test.ts`, `merge/__oracle__/export-portee-avant-demandes.json`                                                                                               | —                                                                   |
| Tests                        | `portee.test.ts`, `portee.adverse.test.ts`, `schema.test.ts`, `fusionComplete.exclus.property.test.ts`, `ExportJsonClasseurDialog.test.tsx`, `EchangeJsonDialog.test.tsx`, `MergePreviewDialog.test.tsx`, `relecture.test.ts`                          | `importIa.test.ts`, `validationImport.test.ts`, `consignes.test.ts` |
| Doc                          | `CLAUDE.md`, `plan/classeur-fonctions-2026-10-04/3-llm-demandes.md` (marqué remplacé)                                                                                                                                                                  | —                                                                   |
| **Total**                    | **~27 modifiés**                                                                                                                                                                                                                                       | **5 nouveaux**                                                      |

---

## Bilan de clôture (2026-10-20)

Commits : 483d563 (1), ed977a7 (2), 3ad1ccd (3), 1b49a3d (4), 1f6de60 (5),
a7f16a0 (6), 65cb569 (7), 5533fc0 (8, interface) et le commit de
documentation de l'étape 8 ; index : 574151d, b93435e. Rien n'est poussé.
Suite complète au moment de la clôture : 228 fichiers, 2 915 tests verts ;
`tsc` propre ; lint propre sur les fichiers touchés, sauf l'erreur
préexistante `no-unnecessary-type-assertion` de `ClasseurList.test.tsx`
l.17.

### Audit « répond-il à la demande ? »

| Exigence de l'utilisateur                                               | Couvert ?            | Où                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exporter simplement, sans cases de demandes                             | Oui                  | Étape 1 (483d563) : cases et `_metadata.demande` retirées. Étape 3 (3ad1ccd) : Copier / Télécharger partout, Copier pour une IA au clic droit de la liste.                                                                                                                                                                                                                                                                                                                                                             |
| `_metadata` = mode d'emploi complet qui guide un non-développeur        | Oui                  | Étape 2 (ed977a7) : 6 parties, l'IA demande d'abord ce que la personne veut, ne parle jamais de JSON avec elle.                                                                                                                                                                                                                                                                                                                                                                                                        |
| ... répondre aux questions sur le contenu                               | Oui                  | Partie 2 : depuis le contenu seul, en citant chapitre et élément, sans JSON ; document seul : renvoi vers l'export du chapitre ou du classeur (D5).                                                                                                                                                                                                                                                                                                                                                                    |
| ... mettre à jour le classeur                                           | Oui                  | Partie 3 (plan, accord, fichier complet, où l'importer) ; étapes 5 (1f6de60) et 6 (a7f16a0) pour que l'import l'applique.                                                                                                                                                                                                                                                                                                                                                                                              |
| ... ajouter des chapitres et des éléments                               | Oui                  | Partie 5 : forme d'un élément et d'un chapitre à ajouter (export du classeur ; un chapitre seul ne crée pas de chapitre, un document seul n'ajoute rien, c'est dit à l'IA).                                                                                                                                                                                                                                                                                                                                            |
| ... générer des choses à partir des données                             | Oui, mais mince      | Partie 1 propose « créer quelque chose à partir du contenu (résumé, affiche, quiz, liste de contrôle) » ; aucune consigne ne dit si le résultat reste dans la conversation ou devient un document du classeur. L'IA le déduit des parties 2 et 3. À enrichir si l'usage le montre (marge de taille : ~100 octets).                                                                                                                                                                                                     |
| Portée : classeur, chapitre ou document                                 | Oui                  | Étapes 2, 3 ; `_metadata.portee` des trois types ; import du classeur : export de chapitre ou de document refusé (5, `controlerPorteeClasseur`) ; chapitre / document : refus d'un fichier d'une autre portée (existant).                                                                                                                                                                                                                                                                                              |
| Jamais plusieurs classeurs                                              | Oui, avec une limite | Le format ne porte qu'un objet `classeur` ; l'export n'en sort qu'un ; un fichier d'un autre classeur est averti (D10). Consigne explicite « Un seul classeur par fichier : n'en fusionne jamais deux » ajoutée seulement à l'étape 8 (5533fc0) : elle MANQUAIT. **Non couvert** : un fichier où l'IA a MÉLANGÉ deux classeurs (portée de celui-ci, chapitres de l'autre) n'est pas détecté ; ses éléments sont créés comme nouveaux (uuid d'ailleurs retiré ou renouvelé, E11), visibles dans l'aperçu et refusables. |
| Autres modèles : feuilles de suivi, de signature, intercalaires         | Oui                  | Étape 2 (natures, quand les utiliser, idées, `periodicite_id`, `nombre` 1..60, D4) ; D8 libellé `periodicite` ; étape 6 (bornes, périodicité inconnue, réglages en clair) ; étape 7 (relecture des titres et descriptions de toutes les natures).                                                                                                                                                                                                                                                                      |
| Retour par un JSON à réimporter                                         | Oui                  | Étape 5 : réponse collée ou fichier, mode IA par défaut, le fichier fait foi sans horodatage, suppressions seulement sur case ; étape 6 : rien ne casse au milieu ; D7 (65cb569) : relecture avant un nouveau classeur.                                                                                                                                                                                                                                                                                                |
| L'IA propose des idées et rappelle ses limites, jamais dans le classeur | Oui                  | Parties 4 et 6 (ed977a7) ; filet à l'import et dans l'éditeur (65cb569, 27 tournures, non bloquant). Limite connue : liste fermée, une tournure nouvelle passe ; c'est voulu (zéro faux positif sur la base locale).                                                                                                                                                                                                                                                                                                   |

### Contrôle global (lecture du code)

- Interop Registre : `_metadata` garde `description`, `generated_at`, `note`
  (chaîne), `schema`, `periodicites` `{ id, label, nombre }` dans les trois
  exports et dans les instantanés ; `instructions`, `portee` et le libellé
  `periodicite` d'une feuille sont des clés inconnues pour Registre
  (ignorées, pas de `deny_unknown_fields`). Aucun changement de `slugify` ni
  de l'ordre des clés.
- Point de restauration avant toute écriture : fusion Registre, import IA et
  réimport d'un chapitre ou d'un document passent tous par
  `appliquerPlanifie` (instantané `fusion` puis écritures, plan vide = rien) ;
  restauration : point `securite` avant `updateClasseur` et le plan ; import
  en nouveau classeur : pas de point, par conception (rien à restaurer), la
  validation et la relecture D7 précèdent la création.
- Restauration et import Registre : `planifierFusion` inchangé (R7, R8, R11),
  le mode IA est une couche au-dessus ; oracles et propriétés verts.
- Problème trouvé : la consigne « jamais plusieurs classeurs » n'était pas
  écrite (corrigé, 5533fc0) ; le mélange de deux classeurs dans un même
  fichier reste non détecté (voir ci-dessus).

### À faire par l'utilisateur

- Un vrai aller-retour avec une IA, sur une copie locale : coller l'export du
  classeur, poser une question (réponse citée, sans JSON), demander une
  modification d'un chapitre (plan, accord, bloc), l'importer en mode IA,
  puis ajouter une feuille de suivi et une feuille de signature.
- Vérifier que l'IA ne glisse aucune phrase sur elle-même dans le contenu.
- Revoir les décisions par défaut D1 à D10 (`D-decisions.md`, partie B).
