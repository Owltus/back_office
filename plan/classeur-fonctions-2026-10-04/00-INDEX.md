# Plan — Classeur : fonctions retenues le 2026-10-04

> **NON EXÉCUTÉ** — plan réorganisé le 2026-10-04 (5 agents d'exploration,
> critique socratique, synthèse « sans lisser »). Aucune ligne de code tant
> que l'utilisateur n'a pas tranché les questions de
> [D-decisions.md](./D-decisions.md) et dit « go ».

---

## Contexte

Le Classeur sert à **fabriquer des documents à imprimer** et à **les faire
modifier facilement par un LLM** (précision de l'utilisateur : « concentre-toi
sur l'interface, les options et les éléments »). L'utilisateur a répondu
oui / non à dix-sept propositions ; neuf sont retenues. Seconde demande
(même jour) : « organise mieux tout cela et les implications que cela va
avoir ; respecte les bonnes pratiques ; pense aux phases de test avec
/martin ».

**Numérotation** : les NUMÉROS D'ÉTAPE ci-dessous sont les seuls numéros de
référence (l'utilisateur demande par numéro ; ne jamais renuméroter). Le
tableau des 17 questions d'origine est en [annexe](#annexe--les-17-questions-dorigine).

---

## Ce que l'exploration a changé par rapport à la première version

| Fait établi | Conséquence |
|---|---|
| **Aucune RPC n'est nécessaire** : la RLS couvre lecture des supprimés, restauration, déplacement (vérifié des DEUX côtés : `USING` origine + `WITH CHECK` arrivée), copie Storage (`storage.copy` sous RLS) | La « RPC de copie d'images » disparaît du plan, sauf preuve contraire en local |
| `moveItems` **ne détecte pas un refus RLS** (0 ligne sans erreur) et ne prend le point de restauration **que du classeur d'arrivée** | Défaut EXISTANT, corrigé dans 7b (même si 7 était abandonnée, il faudrait le corriger) |
| **html2canvas n'est pas installé** (CLAUDE.md est périmé), et la 1.4.1 ne lit pas les couleurs `oklch` de Tailwind v4 | La voie « navigateur » du PDF n'est plus « rapide » ; l'étape 9 passe en dernier, après une question de besoin |
| `remplacementImage` **retire le cadre** d'une image | Le transfert (7a) écrit sa propre réécriture qui ne touche QUE le chemin |
| L'aperçu d'import n'a pas d'identifiant et le plan est **recalculé** à l'import | Refus par clé stable `kind:id` (repli pour une création), filtre AVANT le point de restauration |
| `classeur_versions_suivent` fait déjà suivre l'historique au classeur d'arrivée | Les lecteurs de l'arrivée verront les anciennes versions (noms d'auteurs) : décision |
| Copier n'exige en base que la **lecture** de l'origine | Décision : l'interface exige-t-elle l'écriture ? |
| Stryker ne mute **aucun** fichier de `lib/classeur` ; Docker est **éteint** (pas de base locale, pas de pgTAP) | Étape 0 de préparation des tests ; la matrice RLS en écriture se heurte au verrou /martin (décision) |
| Effort réel ≈ **40 à 50 h**, pas 29 | Ordre revu, priorités tenues |

---

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---|---|---|---|---|---|---|
| 0 | [0-preparation-tests.md](./0-preparation-tests.md) | Outillage de test (Stryker, simulateur) | — | P0 | 2 h | Score de mutation de départ, simulateur partagé | |
| 8 | [8-zoom-apercu.md](./8-zoom-apercu.md) | Zoom de l'aperçu A4 (UI/UX pensée) | 0 | P1 | 4 h | Contrôle de zoom, molette, Ctrl + 0 | |
| 1 | [1-llm-comparaison.md](./1-llm-comparaison.md) | LLM : voir les changements, refuser un document | 0 | P0 | 6 h | Diff par document, cases, « Importer N » — **FAIT c1381e0** (Stryker portee 83,3 %, apply 90,7 %) | ⚠ |
| 2 | [2-llm-relecture.md](./2-llm-relecture.md) | LLM : relecture avant import | 1 | P0 | 2 h | Alertes par document dans l'aperçu | |
| 3 | [3-llm-demandes.md](./3-llm-demandes.md) | LLM : demandes toutes prêtes | 1 (même fichier) | P1 | 3 h | Demandes cochables, `_metadata.demande` | |
| 4 | [4-imprimer-selection.md](./4-imprimer-selection.md) | Imprimer une sélection | 0 | P1 | 2 h | « Imprimer (N) » dans la barre de sélection — FAIT a91170b | |
| 5 | [5-imprimer-modifies.md](./5-imprimer-modifies.md) | Imprimer ce qui a changé depuis une date | 4 | P1 | 4 h (+ SQL éventuel) | Carte d'accueil, liste, aperçu — FAIT 8753e48 (aucun SQL : explain 0,19 ms, D30 sans index) | ⚠ |
| 6 | [6-corbeille.md](./6-corbeille.md) | Corbeille | 0 | P1 | 4 h | Carte d'accueil, Restaurer | ⚠ |
| 7a | [7a-transfert-plan.md](./7a-transfert-plan.md) | Transfert : plan pur | 6 | P2 | 3 h | `transfert.ts` prouvé | |
| 7b | [7b-transfert-service.md](./7b-transfert-service.md) | Transfert : service, `moveItems` corrigé | 7a | P2 | 5 h | Écriture multi-classeur sûre | ⚠ |
| 7c | [7c-transfert-interface.md](./7c-transfert-interface.md) | Transfert : interface | 7b | P2 | 3 h | « Déplacer vers… » groupé par classeur | |
| 9 | [9-pdf-direct.md](./9-pdf-direct.md) | PDF direct (selon le besoin) | 4, 8 | P2 | 1 h à 1,5 j | Selon décision D19 | ⚠ |
| 10 | [10-cloture.md](./10-cloture.md) | Clôture : vérifications, CLAUDE.md, revue adverse | toutes | P0 | 2 h | Tout vert, documentation à jour | ⚠ |

---

## Ordre d'exécution

1. **0** — sans outillage, aucune phase /martin n'est mesurable.
2. **8** — petit, autonome, gain visible tout de suite.
3. **Sprint LLM : 1 → 2 → 3** — la raison d'être du Classeur ; même
   dialogue (`EchangeJsonDialog.tsx`), donc JAMAIS en parallèle.
4. **Sprint impression : 4 → 5** — même circuit d'aperçu
   (`selectionImpression.ts`).
5. **Sprint organisation : 6 → 7a → 7b → 7c** — la corbeille sert de filet
   au transfert.
6. **9** — seulement après la décision D19 (besoin réel).
7. **10** — clôture.

Chaque étape : tests purs + phase /martin + vérification navigateur SANS
écrire en base, puis commit sans push. Une étape ⚠ est suivie d'un audit
`/borg` ; un problème critique arrête le chantier.

---

## Implications transverses

Valables pour TOUTES les étapes ; chaque fichier d'étape ne répète que ce qui
lui est propre.

### Sécurité
- Aucune RPC nouvelle. Toute écriture du service : `.select('id')` et erreur
  si 0 ligne (un refus RLS ne lève PAS d'erreur).
- `messageErreur` seul pour afficher une erreur (jamais le message brut).
- Une liste de classeurs cibles est filtrée par `niveauEffectif` ≥ écriture ;
  un classeur « Privé » non accessible n'y apparaît jamais.

### Base Nano (sature sous charge)
- Toute lecture nouvelle part **à l'ouverture de son dialogue**
  (`enabled: open`), jamais dans la vague du premier rendu.
- Calculs lourds (diff, relecture) côté client, au dépliage seulement.
- Index ou SQL seulement après `explain analyze` à FROID (instance au repos
  2 à 3 min), fichier commité AVANT d'être joué, confirmation à chaque fois.

### Cache persisté (`lib/queryPersist.ts`)
- `queryFn` rendent des objets nus (`survitAuJson`).
- Toute lecture portant des noms d'auteurs → `PREFIXES_SENSIBLES` (le test
  le réclame).
- `localStorage` (zoom, demandes, date) en try/catch ; poste et compte
  Réception PARTAGÉS : mémoriser seulement si la décision le dit.

### Points de restauration et versionnage
- Import (1) : point `fusion` pris seulement s'il reste des actions, après
  filtrage, avant toute écriture ; puis `sansPointsAuto`, puis élagage.
- Restauration (6) et transfert (7b) : `avantEcriture` sur CHAQUE classeur
  touché.
- Copie : version 1.0 envoyée explicitement, sans `uuid`. Déplacement :
  numéro gardé (`classeur_version_monotone`). Restauration à patch vide : pas
  de nouvelle version.

### Interface
- Grammaire existante : `ActionCard`, `IconAction`/`Tip`/`ButtonGroup`,
  dialogues bornés `max-h-[90dvh]`, `Alert` inline, pas de toast.
- Tactile : `neDemarrePasDeGlisser` sur tout bouton dans une carte
  glissable, `pointer-coarse:opacity-100`, cibles 44 px au doigt,
  `useCapteursClasseur.test.tsx` vert.
- Gardes de chargement sur `isPending` (jamais `isSuccess`) ; jamais « 0 » ni
  « vide » affiché pendant un chargement.
- Une carte ajoutée à l'accueil change la silhouette : `FormeClasseurDashboard`
  (`PageShapes.tsx`) et son test.
- Aide « ? » et consignes LLM : à jour si une convention change ; vitrine du
  chapitre 34 seulement si une fonction de DOCUMENT change (a priori aucune).

### Écritures réelles
- Rien n'est mis en file ni rejoué. Les écritures réelles (1, 6, 7b) sont
  testées PAR L'UTILISATEUR ; l'assistant compare en lecture avant / après.

---

## Phases de test /martin — règles communes

| Règle | Application |
|---|---|
| **Verrou anti-prod** | Aucune écriture, même en transaction annulée, sur `ozpavwghrmmkrnmkxodg`. La LECTURE de la prod reste permise (catalogue, `select`, `explain analyze`). Voir D21. |
| **Oracles indépendants** | Lois et invariants, modèle de référence naïf, exemples écrits à la main AVANT d'exécuter le code ; jamais une valeur recopiée de la sortie. |
| **Mutation = la note** | Stryker ≥ 80 % sur chaque fichier pur ajouté ; une mutation posée à la main par garde-fou important (et attrapée). |
| **Pas de bruit** | Un test rouge doit se reproduire 3 fois ; seeds fixés. |
| **Vite à chaud** | Une mutation se vérifie par vitest SEUL, jamais pendant un contrôle navigateur (incident du 2026-09-25). |
| **Familles** | A. propriétés fast-check (pur) ; B. simulateur PostgREST en mémoire (refus RLS = 0 ligne) ; C. RLS (selon D21) ; D. rendu jsdom ; E. clôture. Pas d'E2E (pas de Playwright). |

### Score de mutation de départ (étape 0)

Relevé le 2026-10-04 (Stryker 10, `--mutate` limité aux 5 fichiers
existants, 3 min 13 s). Score = (tués + délais) / mutants ; entre
parenthèses, sur le seul code couvert.

| Fichier | Mutants | Tués | Délai | Survivants | Sans couverture | Score |
|---|---|---|---|---|---|---|
| `merge/portee.ts` | 274 | 180 | 0 | 72 | 22 | **65,7 %** (71,4 %) |
| `merge/apply.ts` | 126 | 96 | 0 | 22 | 8 | **76,2 %** (81,4 %) |
| `merge/consignes.ts` | 23 | 15 | 0 | 8 | 0 | **65,2 %** (65,2 %) |
| `relecture.ts` | 472 | 333 | 3 | 123 | 13 | **71,2 %** (73,2 %) |
| `diff.ts` | 239 | 160 | 28 | 40 | 11 | **78,7 %** (82,5 %) |
| **Total** | 1 134 | 784 | 31 | 265 | 54 | **71,9 %** (75,5 %) |

Aucun n'atteint 80 %. Les fichiers à venir (`llmDemandes`,
`selectionImpression`, `corbeille`, `transfert`, `zoom`) sont déjà listés
dans `stryker.config.json` : un fichier absent n'est qu'un avertissement
(« did not result in any files »), pas une erreur.

Simulateur partagé : `src/lib/classeur/test/simulateurSupabase.ts`
(témoins dans `simulateurSupabase.test.ts`).

---

## Angles à clarifier

Trente divergences ont été relevées ; onze demandent une préférence de
l'utilisateur (questions oui / non ou A / B), les autres ont une réponse par
défaut sûre et réversible. Tout est dans [D-decisions.md](./D-decisions.md).

---

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|---|---|---|
| Pur `lib/classeur` | `merge/portee.ts`, `merge/apply.ts`, `merge/consignes.ts`, `relecture.ts`, `print/usePageScale.ts` | `llmDemandes.ts`, `selectionImpression.ts`, `corbeille.ts`, `transfert.ts`, `zoom.ts`, `test/simulateurSupabase.ts` (+ tests) |
| Service / cache | `service.ts`, `keys.ts`, `lib/queryPersist.ts` | — |
| Hooks | `hooks/useMerge.ts`, `hooks/useImages.ts`, `hooks/useClasseur.ts` | `hooks/useZoomApercu.ts` |
| Interface | `EchangeJsonDialog.tsx`, `HistoriqueDocumentDialog.tsx`, `ChapterBoard.tsx`, `PrintPreview.tsx`, `ItemPages.tsx`, `DocumentDetail.tsx`, `ClasseurDashboard*.tsx`, `PageShapes.tsx` | `detail/DiffTexte.tsx`, `detail/ZoomApercu.tsx`, `dialogs/ImprimerModifiesDialog.tsx`, `dialogs/CorbeilleDialog.tsx`, `dialogs/TransfertDialog.tsx` (si le menu ne suffit pas) |
| Base | aucune RPC | éventuellement un index (5) et une colonne (5, si D15 = B) ⚠ |
| Serveur | `vercel.json` (si 9 voie serveur) | `api/pdf.ts` (si 9 voie serveur) |
| Outillage / docs | `stryker.config.json`, `CLAUDE.md` | — |
| **Total** | **≈ 22 modifiés** | **≈ 14 nouveaux** (+ tests) |

---

## Annexe — les 17 questions d'origine

| Q | Fonction | Réponse | Étape |
|---|---|---|---|
| 1 | Voir le texte modifié par le LLM avant d'importer, refuser un document | **Oui** | 1 |
| 2 | Demandes toutes prêtes pour le LLM | **Oui** | 3 |
| 3 | Relecture automatique de la réponse du LLM avant import | **Oui** | 2 |
| 4 | Envoyer une sélection de documents au LLM | Non | — |
| 5 | Télécharger directement un PDF | **Oui** | 9 |
| 6 | Imprimer une sélection | **Oui** | 4 |
| 7 | Imprimer ce qui a changé depuis une date | **Oui** | 5 |
| 8 | Page paysage par document | Non | — |
| 9 | Rechercher / remplacer | Non | — |
| 10 | Plein écran | Non | — |
| 11 | Zoom de l'aperçu A4 | **Oui — « attention à bien penser l'UI et l'UX »** | 8 |
| 12 | Annoter une photo | Non | — |
| 13 | Photo directe depuis le téléphone | Non | — |
| 14 | Liens entre documents | Non | — |
| 15 | Dupliquer | Non | — |
| 16 | Corbeille | **Oui** | 6 |
| 17 | Copier / déplacer vers un autre classeur | **Oui** | 7a-7c |

Les « Non » ne sont pas à reproposer.
