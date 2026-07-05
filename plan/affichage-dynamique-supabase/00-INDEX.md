# Plan — Affichage : passage au dynamique (Supabase)

## Contexte

La page Affichage génère des affiches A3 (avis opérationnels : café en panne, ascenseur en maintenance, coupure d'eau…) à partir de « modèles » aujourd'hui **codés en dur** dans `src/lib/poster/templates.ts` (constante `collection`, 7 modèles figés `as const`). L'état d'édition vit dans un store mémoire (`src/lib/afficheStore.ts`, TanStack Store) réinitialisé à chaque rechargement, et aucun rôle n'est vérifié sur la page.

L'objectif est de **sortir du statique** : persister les modèles côté Supabase pour pouvoir les consulter, en ajouter, les modifier et les supprimer, avec un gating par rôle (lecture pour tous les connectés, écriture réservée). Le patron de référence est le feature **parking**, déjà passé de statique à dynamique (nouvelle table + RLS par rôle + service + UI).

Contrainte critique du projet : le backend Supabase est **partagé** et ses tables existantes sont en LECTURE SEULE. Ce chantier n'y touche pas — il crée une **nouvelle table applicative** (`affiche_templates`) dont le script SQL est **exécuté par l'utilisateur** dans le SQL Editor (jamais d'écriture automatique en prod). La fonction `get_user_role()` est supposée déjà déployée.

## Angles à clarifier

Décisions actées (2026-07-05) : **D1 = super_utilisateur + admin** · **D2 = seed des 7 modèles** · **D3 = `useQuery` + invalidation** (pas de Realtime). Les options ci-dessous restent documentées pour référence.

- **D1 — Matrice de droits en écriture (à trancher).** Qui peut ajouter / modifier / supprimer un modèle ? **Option A (recommandée)** : `super_utilisateur` + `admin` (miroir exact du parking), suppression incluse. Option B : `admin` seul (comme la gestion des comptes). La lecture reste ouverte à tous les connectés dans les deux cas. Impacte Étape 1 (RLS) et Étape 4 (UI).
- **D2 — Sort des 7 modèles codés en dur (à trancher).** **Option A (recommandée)** : les 7 modèles de `templates.ts` sont **seedés** dans la table par le script SQL (l'utilisateur garde ses modèles actuels), puis la constante `collection` est retirée comme source. Option B : la table démarre vide, l'utilisateur recrée ses modèles ; `collection` conservée en repli local. Impacte Étape 1 (seed) et Étape 3 (source unique).
- **D3 — Realtime ou TanStack Query (décision structurante).** Le parking utilise Supabase Realtime ; mais la convention perf récemment actée (CLAUDE.md) dit « nouvelle lecture = `useQuery` sauf besoin realtime ». Les modèles changent rarement et n'exigent pas une synchro live multi-utilisateur. **Option A (recommandée)** : `useQuery` + `invalidateQueries` après mutation (plus simple, aligné convention). Option B : Realtime + optimistic (miroir parking, synchro live). Impacte Étape 1 (publication realtime ou non), Étape 3 et Étape 4.
- **D4 — Périmètre de persistance (acté).** On persiste UNIQUEMENT le modèle (7 champs : name, icon, color, titleFr / messageFr / titleEn / messageEn) ; jamais l'état de session (dates, horaires, tailles, mode auto). Sous-question ouverte : ajouter un bouton « enregistrer l'affiche courante comme modèle » ? (bonus, non requis).
- **D5 — Emplacement des fichiers métier (mineur).** **Option A (recommandée)** : `src/lib/affiche/{model,service}.ts` (miroir `src/lib/parking/`), en déplaçant / ré-exportant le type modèle depuis `src/lib/poster/templates.ts`.

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-sql-table-affiche-templates.md](./1-sql-table-affiche-templates.md) | SQL : table `affiche_templates` + RLS (+ seed / realtime) | — | P0 | 1h | Script `supabase/affiche_templates.sql` exécuté par l'utilisateur | ⚠ |
| 2 | [2-modele-service-affiche.md](./2-modele-service-affiche.md) | Métier : modèle + service Supabase | 1 | P0 | 1h | `src/lib/affiche/{model,service}.ts` | |
| 3 | [3-chargement-dynamique-store.md](./3-chargement-dynamique-store.md) | Chargement dynamique : découplage store ↔ modèles en dur | 2 | P0 | 1h30 | Modèles lus depuis Supabase, init store neutre | |
| 4 | [4-ui-crud-gating-role.md](./4-ui-crud-gating-role.md) | UI CRUD (ajouter / éditer / supprimer) + gating par rôle | 3 | P0 | 2h30 | Dialog modèle + `canEdit`, affordances masquées | |
| 5 | [5-validation-globale.md](./5-validation-globale.md) | Validation globale (typecheck, build, matrice de rôles, RLS) | 1,2,3,4 | P1 | 45 min | Build vert + droits vérifiés | ⚠ |

## Ordre d'exécution

Séquentiel strict : chaque étape dépend de la précédente. L'Étape 1 (SQL) doit être **exécutée par l'utilisateur dans Supabase** avant que les étapes suivantes soient testables de bout en bout — mais le code des étapes 2 à 4 peut être écrit pendant ce temps. Les décisions **D1, D2, D3** doivent être actées avant l'Étape 1 (elles conditionnent le contenu du SQL). L'Étape 5 clôt le chantier par la validation et la vérification RLS (en lecture seule, comme pour le parking).

## Architecture cible

```
src/
├── lib/
│   ├── affiche/
│   │   ├── model.ts            ← type AfficheTemplate (id + 7 champs)          [nouveau]
│   │   └── service.ts          ← DbAfficheTemplate, mappers, CRUD Supabase     [nouveau]
│   ├── afficheStore.ts         ← init neutre, applyTemplate prend un objet     [modifié]
│   └── poster/
│       └── templates.ts        ← collection retirée / repli selon D2           [modifié]
├── components/affiche/
│   ├── AffichageBoard.tsx      ← useQuery modèles + useAuth/canEdit + CRUD      [modifié]
│   └── TemplateDialog.tsx      ← formulaire créer / éditer un modèle           [nouveau]
supabase/
└── affiche_templates.sql       ← CREATE TABLE + RLS + trigger (+ seed/realtime) [nouveau]
```

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|-------------------|-------------------|
| DB / Supabase | — | `supabase/affiche_templates.sql` |
| Métier | `src/lib/afficheStore.ts`, `src/lib/poster/templates.ts` | `src/lib/affiche/model.ts`, `src/lib/affiche/service.ts` |
| Frontend | `src/components/affiche/AffichageBoard.tsx` | `src/components/affiche/TemplateDialog.tsx` |
| **Total** | **3 modifiés** | **4 nouveaux** |
