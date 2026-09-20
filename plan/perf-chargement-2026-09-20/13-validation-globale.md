# Étape 13 — Validation globale et comparaison chiffrée

## Objectif

Prouver que le chantier a servi, et dire honnêtement ce qui reste.

## Contexte

Le plan de septembre 2026 prévoyait une « mesure en base 24 h après mise en
production » qui n'a laissé **aucune trace écrite** : on ne sait pas si elle a été
faite. Cette étape existe pour que le même trou ne se reproduise pas.

Deux rappels qui conditionnent la lecture des résultats :

- Si les angles **D1** (temps réel) et **D2** (taille de l'instance) n'ont pas été
  tranchés, la famine CPU demeure. Les gels de plusieurs secondes reviendront, et
  ce n'est **pas** un échec du chantier : les étapes 2 à 11 suppriment des attentes
  qui existaient même sur une base au repos. Il faut le dire clairement dans le
  bilan plutôt que de laisser croire à une régression.
- Les mesures doivent être prises **aux mêmes heures** qu'à l'étape 1. La famine
  est intermittente : comparer une mesure de 7 h du matin à une mesure de 15 h ne
  démontre rien.

## Fichier(s) impacté(s)

- `plan/perf-chargement-2026-09-20/releve-apres.md` (nouveau)
- `plan/perf-chargement-2026-09-20/00-INDEX.md` (modifié : bandeau d'état)
- `CLAUDE.md` (modifié : règles nouvelles ou corrigées)
- Mémoire du projet (nouvelle entrée)

## Travail à réaliser

### 1. Rejouer l'étape 1 à l'identique

```bash
supabase db query --linked -f supabase/verif_perf_2026-09-20.sql
```

Puis les trois scénarios navigateur, aux mêmes heures, trois fois chacun.

### 2. Tableau de comparaison

| Mesure | Avant | Après | Attendu |
|---|---|---|---|
| Premier pixel, ouverture à froid | | | supprimé le blocage de la police |
| Contenu affiché, jeton expiré | | | ≤ 3 s au lieu de ≤ 40 s |
| Requêtes au montage de `/repjour` | ~20 en 3 vagues | | 1 vague |
| Clic → premier changement visible | | | squelette immédiat |
| Poids gzip de `/facturation/galaxie` | 428 677 o | | < 300 000 o |
| Poids gzip d'une page analytique | 359 915 o | | ≈ 260 000 o |
| `pdj_daily_agg`, un mois, à froid | 312 ms | | < 50 ms |
| `Rows Removed by Filter` | 802 | | ≈ 0 |
| Part CPU de l'applicatif | 14,7 % | | selon D1/D2 |

### 3. Contrôles de non-régression

Ces points ne sont pas négociables — ils sont le résultat de chantiers antérieurs
et plusieurs ont déjà été cassés une fois.

- **Le pipeline de nuit fonctionne.** C'est le plus important : vérifier qu'un
  rapport est bien parti le lendemain matin, journal à l'appui. Aucune étape n'y
  touche, mais c'est le filet de sécurité de l'hôtel et il se vérifie par
  constatation, jamais par déduction.
- **L'envoi manuel reste disponible** (RepJour, admin, bouton avion).
- **Le chemin d'éjection de l'authentification** est intact : seul
  `profile === null` éjecte ; une erreur réseau ne renvoie jamais vers `/login` et
  n'efface jamais le cache local.
- **Le temps réel** continue de refléter les changements entre deux onglets, sur
  le parking, les coches PDJ et les lits bébé — sauf si D1 a décidé le contraire,
  auquel cas le nouveau comportement doit être documenté.
- **Les mises à jour optimistes du parking** (glisser-déposer, copie,
  <kbd>Ctrl</kbd>+<kbd>Z</kbd>) fonctionnent.
- **Les chiffres métier sont identiques** : chiffre d'affaires PDJ, occupation
  parking, rapprochement, feuilles de caisse, cartes de synthèse RepJour.
- **Les contrôles de sécurité passent** : `supabase/verif_complet.sql` et
  `verif_advisor.sql`.
- `pnpm test`, `npx tsc --noEmit`, `pnpm lint`, `pnpm build`.

### 4. Consigner les règles nouvelles

Trois enseignements méritent d'entrer dans `CLAUDE.md`, parce qu'ils contredisent
ou précisent ce qui y est écrit :

- **`getSession()` n'est pas local** quand le jeton approche de son expiration.
  Le commentaire qui l'affirmait était faux et a coûté cher. La règle « auth non
  bloquante » doit préciser que l'attente est **bornée**, pas supposée nulle.
- **Une feuille de style tierce bloque le rendu**, même chargée par `<link>` avec
  `preconnect`. La règle « polices hors du CSS » est nécessaire mais pas
  suffisante.
- **Distinguer une requête lente d'une base affamée.** La signature est
  `stddev ≥ mean`, un `min_exec_time` sub-milliseconde, et un `max_exec_time` qui
  plafonne au même endroit sur des familles indépendantes. Quand cette signature
  est présente, `explain analyze` à froid est le seul juge — c'est le complément
  de la leçon du 2026-09-06.

### 5. Bandeau d'état sur l'index

Ajouter en tête de `00-INDEX.md` le bandeau d'usage du projet, avec les écarts
réels par rapport au plan et les étapes éventuellement non faites.

## Ordre d'exécution

1. Rejouer les mesures.
2. Écrire `releve-apres.md` et le tableau de comparaison.
3. Dérouler les contrôles de non-régression.
4. Mettre à jour `CLAUDE.md`.
5. Poser le bandeau d'état sur l'index.
6. Écrire l'entrée de mémoire du projet.
7. Commiter. **Ne pas pousser sans demande explicite.**

## Critère de validation

- `releve-apres.md` existe, avec des mesures prises aux mêmes heures qu'à
  l'étape 1.
- Le tableau de comparaison est rempli, y compris les lignes où le gain est nul ou
  négatif — un chantier honnête consigne aussi ce qui n'a pas marché.
- Tous les contrôles de non-régression sont passés, et le rapport de nuit
  **constaté** parti.
- `CLAUDE.md` porte les trois règles nouvelles.
- L'index porte son bandeau d'état.

## Contrôle qualité (revue)

`/borg` n'étant pas installé, revue manuelle ciblée en clôture :

1. **Relire le diff complet du chantier** d'un seul tenant, en cherchant ce qui a
   été modifié sans figurer dans aucune étape.
2. **Vérifier qu'aucune règle de `CLAUDE.md` n'a été enfreinte au passage** :
   exports nommés, alias `#/` avec extension, pas de `select *` sur table à
   données personnelles, invalidations temps réel avec temporisation, clés de cache
   stables d'un jour à l'autre.
3. **Vérifier qu'aucun fichier SQL d'autorité n'a été rejoué** et que les fichiers
   remplacés portent leur en-tête.
4. **Confirmer qu'aucune écriture non prévue n'a touché la production** :
   relire l'historique des commandes `supabase db query` de la séance.
5. Si une étape a été sautée, l'écrire dans le bandeau d'état — pas la passer sous
   silence.
