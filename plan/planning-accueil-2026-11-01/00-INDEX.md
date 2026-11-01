# Plan — Planning : un seul tableau pour l'accueil

Date : 2026-11-01. Demande utilisateur : « les besoins sont trop complexes… tous les hôteliers sont polyvalents… si je te dis qu'il en faut 3 un jour, il faut 3 personnes, peu importe qu'il soit réception ou club ». Décisions D1-D15 ([D-decisions.md](./D-decisions.md)).

---

## Contexte : ce qui ne va pas aujourd'hui (vérifié dans le code)

| Fait établi                                                                                                                                                                  | Conséquence                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Le moteur ne place que sur des besoins poste × horaire × jour (`semaine.ts` `preparerGeneration` l.1430-1663) ; les consignes ne sont qu'un coût (`generateur.ts` l.665-760) | Pour l'accueil, l'utilisateur doit remplir deux réglages qui se contredisent : 8 points « les besoins demandent 2, la consigne en veut 3 » en prod |
| Un middle ne compte dans aucun moment (`presence.ts` l.67, D11 du 2026-10-30)                                                                                                | Révisé : il compte matin ET soir (D11 du 2026-11-01)                                                                                               |
| Un soutien n'entre pas dans le compte d'une consigne (`generateur.ts` l.746)                                                                                                 | Révisé : il compte (D5), mais reste accompagné                                                                                                     |
| Les extras sont exclus du placement automatique (`compatible` l.418)                                                                                                         | Révisé : derniers recours avant la case vide (D7)                                                                                                  |
| `planning_consignes` n'est lue par aucune fonction SQL ; tout passe par `service.ts`                                                                                         | Pas de RPC à changer ; une contrainte et un alignement des données suffisent                                                                       |
| `PresenceMinimum.tsx` est déjà un tableau moment × jour                                                                                                                      | Base de l'écran : un seul compteur au lieu de deux                                                                                                 |

---

## Phases

| #   | Fichier                                          | Phase                                                      | Dépend de | Priorité | Effort | Livrable                           | Critique |
| --- | ------------------------------------------------ | ---------------------------------------------------------- | --------- | -------- | ------ | ---------------------------------- | -------- |
| 1   | [1-decisions.md](./1-decisions.md)               | D8, D9, D10                                                | —         | P0       | 5 min  | Décisions écrites                  |          |
| 2   | [2-base.md](./2-base.md)                         | Chiffre exact en base, données alignées, seed, pgTAP       | 1         | P0       | 2 h    | Migration jouée en local           | ⚠        |
| 3   | [3-moteur.md](./3-moteur.md)                     | Pool accueil dans le générateur                            | 1         | P0       | 1 j    | Génération sur le tableau          | ⚠        |
| 4   | [4-oracle-controle.md](./4-oracle-controle.md)   | Vérificateur, contrôle des réglages, places à pourvoir     | 3         | P0       | 4 h    | Oracle et messages alignés         | ⚠        |
| 5   | [5-ecran.md](./5-ecran.md)                       | Tableau de l'accueil, onglets des postes à part, pastilles | 2, 4      | P0       | 4 h    | Écran Besoins simplifié            |          |
| 6   | [6-essai-copie-prod.md](./6-essai-copie-prod.md) | Essai sur une copie de la prod, /martin                    | 5         | P0       | 3 h    | Semaines réelles générées, mesures | ⚠        |
| 7   | [7-livraison.md](./7-livraison.md)               | Push sur demande                                           | 6         | P0       | 30 min | En prod                            | ⚠        |

---

## Ordre d'exécution

| Vague | Agents en parallèle | Étapes | Sortie                         |
| ----- | ------------------- | ------ | ------------------------------ |
| 0     | —                   | 1      | D8-D10 tranchées               |
| 1     | base ; moteur       | 2, 3   | migration locale ; générateur  |
| 2     | oracle et contrôle  | 4      | vérificateur et `coherence.ts` |
| 3     | écran               | 5      | page Besoins                   |
| 4     | martin (2-3 agents) | 6      | rapport, corrections           |
| 5     | —                   | 7      | livraison sur « push »         |

Démarrage en dev : `pnpm db:start`, copie de la prod par `node scripts/copier-prod.mjs` (lancée par l'utilisateur ou avec son accord), `pnpm dev`. Docker doit être allumé.

---

## Architecture cible

```text
Tableau de l'accueil (planning_consignes, minimum = maximum)
   matin / soir / nuit × 7 jours, un chiffre exact
            │
            ▼
preparerGeneration : pour chaque jour, poste de l'accueil, horaire permis
   → créneaux candidats p<jour>-<poste>-<horaire> (aucun besoin b…)
            │
            ▼
generateur : Σ personnes du moment = N (manque P1, surplus selon D8)
   middle compté matin + soir ; soutien compté, accompagné par poste
   titulaire < dépannage < extra < vide ; trous sur l'accueil entier
            │
            ▼
verificateur (oracle indépendant) + coherence (« il faut 3, personne ne peut »)
```

---

## Implications transverses

- **Base** : aucune colonne retirée ; contrainte `minimum = maximum` posée après alignement des données (D9, D14).
- **Moteur** : les besoins Réception et Club sont ignorés, pas supprimés (D13).
- **Interface** : vocabulaire simple, pas de « consigne », pas de « minimum ».
- **Données réelles** : toutes les écritures en local d'abord ; la prod ne reçoit que la migration à la livraison.

## Phases de test /martin — règles communes

Oracle indépendant pour chaque règle (accepté ET refusé), propriétés fast-check, mutation vérifiée à la main sur les règles nouvelles, jamais d'écriture en prod.

## Angles à clarifier

Voir D8, D9, D10 et les réponses par défaut D12-D15.

## Fichiers impactés (résumé)

| Couche             | Fichiers modifiés                                                                                                          | Fichiers nouveaux |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Base               | `supabase/tests/05_planning.test.sql`, `supabase/seed/generer.ts`                                                          | 1 migration       |
| Moteur             | `semaine.ts`, `generateur.ts`, `presence.ts`, `cycles.ts`, `modele.ts`, `regles.ts`                                        | —                 |
| Oracle et contrôle | `verificateur.ts`, `coherence.ts`, `raisonsPlaces.ts`                                                                      | —                 |
| Interface          | `BesoinsPage.tsx`, `PresenceMinimum.tsx`, `historique.ts`, `reglages/besoins.ts`, `semaine/Presence.tsx`, `PostesPage.tsx` | —                 |
| Tests              | ~15 fichiers `*.test.ts(x)` du planning                                                                                    | tests du pool     |
| **Total**          | **~30 modifiés**                                                                                                           | **~3 nouveaux**   |
