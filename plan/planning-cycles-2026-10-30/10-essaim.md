# Organisation de l'exécution — essaim d'agents

Comment les étapes 2 à 8 sont exécutées par plusieurs agents en parallèle,
sans qu'ils se marchent dessus. Établi le 2026-10-30 après trois
reconnaissances parallèles (moteur, écrans, base et outillage).

---

## Rôles

| Rôle              | Qui                                  | Fait                                                                                                                                      | Ne fait jamais                                                        |
| ----------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Orchestrateur     | la session principale                | découpe, lance les vagues, relit chaque retour (`git diff`), lance les tests de la vague, COMMITE (`pnpm commit`), tient `D-decisions.md` | écrire en prod, `db:reset`, push                                      |
| Agent de lot      | `general-purpose`, un par lot        | modifie SES fichiers seulement, écrit les tests de son lot, lance `vitest` ciblé, rend un résumé + incertitudes                           | toucher un fichier d'un autre lot, commiter, lancer la suite complète |
| Sous-agent Martin | lancé par l'orchestrateur en vague 3 | propriétés, mutation, chaos UI                                                                                                            | conclure sans oracle déterministe                                     |
| Relecteur adverse | `general-purpose`, regard neuf       | lit le code, pas mes conclusions                                                                                                          | corriger lui-même                                                     |

Règles communes à tout agent :

- base LOCALE seulement (`supabase db query --local`, migration par
  `supabase migration up --local`) ; la base locale porte de vraies données :
  lecture seule hors migration ;
- aucun vrai nom dans le dépôt (tests sous pseudonymes, `test/hotelReel.ts`) ;
- aucun code horaire ajouté ni modifié ;
- textes d'écran : phrases courtes, « LLM » jamais « IA », ni tiret cadratin
  ni guillemets français, vouvoiement ;
- une règle du moteur changée = `generateur.ts` + `verificateur.ts` + un test
  accepté et un refusé.

## Propriété des fichiers (un fichier = un seul lot)

| Fichier                                                                                                                                                           | Lot             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `modele.ts`, `types.ts`, `cycles.ts` (nouveau), migration nuit, `05_planning.test.sql`                                                                            | V0 Fondations   |
| `presence.ts`, `presence.test.ts`                                                                                                                                 | V1-A Présence   |
| `generateur.ts`, `ordreDecision.test.ts`, `generateur.test.ts`                                                                                                    | V1-B Moteur     |
| `semaine.ts`, `semaine.test.ts`, `test/planningMemoire.ts`                                                                                                        | V1-C Assemblage |
| `verificateur.ts`, `verificateur.test.ts`, `auditMoteur.test.ts`                                                                                                  | V1-D Oracle     |
| `BesoinsPage.tsx`, `ConsignesPresence.tsx`, `BesoinsPage.test.tsx`, `semaine/Presence.tsx`, `coherence.ts`, `coherence.test.ts`, `service.ts` (tri des consignes) | V2-E Besoins    |
| `attention.ts`, `attention.test.ts`, `PanneauAlertes.tsx`, `PlacesAPourvoir.tsx` (+ test), `raisonsPlaces.ts` (+ test)                                            | V2-F Alertes    |
| `semaine/Cartes.tsx`, `semaine/VueSemaine.tsx`, `mois/GrilleMois.tsx`                                                                                             | V2-G Survol     |

---

## Vague 0 — Fondations (1 agent, séquentiel, ~1 h)

Le CONTRAT dont dépendent tous les autres lots. Rien d'autre ne démarre avant.

- Migration `…_planning_consigne_nuit.sql` : `drop`/`add constraint
planning_consignes_periode_check` avec `('matin','soir','nuit')` (nom à
  relire d'abord dans `pg_constraint`) ; pgTAP l.297-300 INVERSÉ (nuit
  acceptée), valeur inconnue refusée, `plan(n)` augmenté.
- `types.ts:96` et `modele.ts:36,236` : période `'matin' | 'soir' | 'nuit'`.
- `modele.ts` `Creneau` : `place: string | null` (id `b…` d'un remplaçant,
  null sinon). `ShiftOut` (dans `semaine.ts`, champ seulement, déclaré ici par
  exception) : `code_demande: number | null` pour le survol.
- `cycles.ts` : `cycleDe(horaire | shift)` (famille ; sans code, heure de
  début), `trousDuJour` signature + tests de base.

Sortie : `tsc` vert (les usages cassés par l'élargissement du type sont
corrigés au plus simple, en laissant le vrai traitement aux lots). Commit.

## Vague 1 — Moteur (4 agents en parallèle, ~1 j)

Lancés dans UN message. Chacun teste contre le contrat de V0, avec des
`Probleme` construits à la main quand le lot voisin n'est pas fini.

- **A Présence (étape 3, D11, D15)** : `periodePresence` rend `null` pour un
  middle (le court garde son heure de début ; `periodeShift` inchangé pour
  l'équité) ; nuit = code de famille nuit sur un poste qui a des codes de
  nuit, sans regarder `poste.presence` ; tri à trois valeurs (`bilanPresence`
  l.79) ; `clePresence`.
- **B Moteur (étapes 4 et 6, D5, D7, D13)** : groupe de couverture par
  `c.place ?? c.id` (un seul manque par place, total ≤ effectif) ;
  `POIDS_REMPLACANT` ≈ 2 000, sous `PART_FIXE_DEPANNAGE` (4 609), voir la
  divergence 1 ; `pireCoutRemplir` + `POIDS_REMPLACANT` ; minimum par cycle en
  P1 avec un coût séparé du maximum (P2) ; `presenceLaPlusChere` ne relit que
  le maximum ; soutien jamais seul compté sur le groupe ; coût des trous entre
  cycles (P2) ; bonus de relève (P5). Paliers d'`ordreDecision.test.ts`
  étendus (l.107-153, 209-300, 303-434, 530).
- **C Assemblage (étapes 3 et 4)** : `correspondances` en deux passes (code
  exact, puis même poste, jour et cycle ; épinglés d'abord ; soutien sur
  soutien) ; `creneauRemplacant` calqué sur `creneauBesoin`, codes du poste
  (`codesDuPoste`) du même cycle, middle ne remplace qu'un middle ;
  `traduire` relit les `r…` avec l'horaire réel ; `presenceDe` pour la nuit ;
  `code_demande` rempli ; `APourvoirOut` porte les raisons des remplaçants.
- **D Oracle (étapes 4 et 6)** : `manquants` et SUREFFECTIF par place ;
  recompte indépendant des minimums par cycle ; `trousDuJour` complet (quart
  d'heure, minutes réelles, nuit du dimanche, changement d'heure, middle
  compté, soutien non compté).

Fin de vague : l'orchestrateur assemble, `tsc`, `vitest run src/lib/planning`,
corrige les jointures, commite lot par lot.

## Vague 2 — Écrans (3 agents en parallèle, ~4 h)

- **E Besoins (étape 7)** : carte « Personnes par cycle » avec la nuit (icône
  lune), phrase du principe, tests de rendu renommés ; `Presence.tsx` à trois
  périodes ; `coherence.ts` : tri à trois valeurs, « minimum par cycle sans
  aucun code de ce cycle », besoin sans fiche ni remplaçant ; tri des
  consignes dans `service.ts`.
- **F Alertes (étape 5)** : « Je ne peux pas remplir ce M3. » + raison commune
  - « Prenez un extra ou changez un shift. » ; « Il manque 1 personne le matin
    mardi » ; famille « Trous entre équipes » ; tri à trois valeurs ;
    `REGLES_BLOCAGE` et son test exhaustif.
- **G Survol (étape 7)** : « M6 au lieu de M3 » dans l'infobulle de la semaine
  (`texteCarte`) et du mois, depuis `code_demande` ; aucun signe en plus sur la
  case.

Fin de vague : tests de rendu, commit.

## Vague 3 — Contrôle (4 agents en parallèle, ~3 h)

- **H Mesure** : script dans le scratchpad (jamais commité) qui lit la base
  locale, appelle `preparerGeneration` puis `generer`, chronomètre et compte
  les colonnes de `modele.lp()` ; même script sur 37f3b17 (worktree) pour
  l'avant.
- **I Martin** : Stryker ciblé (`--mutate` sur `cycles.ts`, `presence.ts`,
  `semaine.ts` correspondances, `generateur.ts` couverture), propriétés
  fast-check (un shift rattaché une fois, code exact prioritaire, ordre D13).
- **J Relecture adverse** : le diff de tout le chantier, sans mon résumé.
- **K Essais réels** : navigateur sur localhost:3001, compte de test
  `*@exemple.test` supprimé ensuite, semaines « codes exotiques » et « échec et
  mat » ; écritures rejouées puis annulées en local.

## Vague 4 — Clôture (orchestrateur)

Correctifs des vagues 3, `CLAUDE.md`, mémoire, bilan chiffré dans
`00-INDEX.md` (format du plan précédent), commits. Rien ne part sans « push ».

---

## Divergences remontées par les reconnaissances

1. **Coût d'un remplaçant.** Option A (recommandée) : `POIDS_REMPLACANT`
   ≈ 2 000, sous la part fixe du dépannage ; les paliers actuels tiennent,
   mais le confort (un jour habituel vaut 2 000) peut, rarement, faire
   préférer un code voisin au code exact pour la même personne. Option B :
   ordre strict quoi qu'il arrive, mais la part fixe du dépannage double
   (9 218) et le dépannage cesse d'être moins cher que les heures en plus et
   le 6e jour : les paliers du plan précédent tombent.
2. **Source du survol** : champ explicite `code_demande` (retenu) plutôt que
   relire `besoin_id`, dont le sens change avec le comptage par cycle.
3. **Middle et équité** : D11 ne parle que des minimums ; l'équité des soirs
   reste calculée comme aujourd'hui (par défaut).
4. **`regles.ts`** : aucun chiffre nouveau trouvé ; il n'est touché que si un
   seuil apparaît (relève).
5. **`/rodin`** : non relancé ; le chantier a déjà été remis en question par
   l'utilisateur lui-même (première version abandonnée, D1 à D14).
