# Plan — PDJ « automode » (cheat code de cochage auto)

## Contexte

Sur la page PDJ (`/pdj`, `src/components/pdj/BreakfastBoard.tsx`), le staff se retrouve à devoir cocher **à la main** toutes les cases de petit-déjeuner sur des jours pourtant **bien importés en base** mais dont aucune case n'a été saisie. Or l'information du **dû facturé** existe déjà : chaque ligne `pdj_breakfasts` porte `breakfasts_included` (le nombre de PDJ inclus, plafonné à 2 par le trigger `pdj_clamp_breakfasts_included`), et c'est exactement ce qu'affiche la **vue financière** (`roomFinance` / `computePdjCA`).

L'idée : un **code façon cheat GTA**. Quand on arrive sur un jour où rien n'est coché, on tape la séquence de touches `automode` au clavier (sans champ de saisie visible) et l'app **coche automatiquement** toutes les cases correspondant au rapport financier — c'est-à-dire, pour chaque chambre facturée (`breakfasts_included > 0`), elle pose `breakfasts_served = breakfasts_included`. **Uniquement pour le jour affiché.**

Contraintes clés relevées à la reconnaissance :
- Cocher une case = `setServed(serviceDate, room, n)` (`src/lib/pdj/service.ts`), un `UPDATE` Supabase **direct** gardé par la **RLS fenêtre J-3** (`pdj_rls_fenetre_3j.sql`) : niveau `gestion` = tout jour, niveau `ecriture` = seulement `service_date >= current_date - 3`. Le miroir client est `dayEditable` (`canEditPdjDay`, `src/lib/pdj/editability.ts`).
- **Aucune fonction batch** n'existe : on boucle `setServed` par chambre (idempotent, `UPDATE` absolu).
- Le trigger `pdj_clamp_breakfasts_included` réécrit `breakfasts_included` à chaque `UPDATE` (sans effet ici : même valeur). Le dû facturé est **autoritaire côté serveur**.
- Le détecteur de séquence clavier existe déjà (`SecretEffect.tsx`) mais il ne sait déclencher qu'un `EffectDefinition` visuel, pas une action métier ; et il n'a **aucune garde de focus** (`INPUT`/`TEXTAREA`).

Aucune migration ni changement de schéma : le chantier réutilise `setServed`, les tables et la RLS existantes.

## Angles à clarifier

Décisions à trancher (recommandation en premier). Aucune n'est bloquante pour démarrer, mais elles orientent l'implémentation.

- **D1 — Infra du cheat code.**
  - **Option A (recommandée)** : nouveau hook dédié `useKeySequence(target, onMatch, { ignoreEditable })`, monté **uniquement dans le board PDJ**. Déclenche une **action** (pas un effet visuel), portée maîtrisée, ~15 lignes. Reprend le buffer glissant + normalisation de `SecretEffect.tsx` et la garde focus de `useUndoRedoShortcut.ts`.
  - Option B : réutiliser l'infra easter eggs (`easter_eggs` + `SecretEffect`). Rejetée par défaut : elle est typée « mot-clé → effet visuel » de bout en bout (colonne `effect_id`, registre `EFFECTS`) et **globale à toute l'app** (montée dans `AppAuthGate`) — la détourner pour une action métier PDJ l'alourdit.
  - Option C (médiane) : factoriser `useKeySequence` puis faire consommer ce hook **aussi** par `SecretEffect`. Plus propre à terme mais touche la feature easter eggs (scope + risque). À reporter.

- **D2 — Périmètre du cochage.**
  - **Option A (recommandée)** : cocher le **dû inclus** — pour chaque chambre où `breakfasts_included > 0`, poser `breakfasts_served = breakfasts_included`. Jamais d'extra (un extra = `served > included`, saisie staff, non dérivable d'un jour vierge). Reste strictement cohérent avec `computePdjCA` (n'invente aucun extra, ne fait pas diverger le CA).
  - Option B : cocher aussi un « attendu » par PAX (`min(adults, 2)`). Rejetée : diverge du rapport financier.

- **D3 — Garde anti-écrasement.**
  - **Option A (recommandée)** : n'agir QUE sur les chambres à `breakfasts_served === 0` (jamais d'écrasement d'une saisie existante). Rend l'automode **sûr et idempotent** même si le jour est partiellement rempli, tout en couvrant le cas « jour vierge » décrit par l'utilisateur.
  - Option B : exiger que le jour soit **entièrement** vierge (tous `served === 0`) pour agir, sinon ne rien faire. Plus proche de la formulation initiale mais moins robuste.

- **D4 — Jours anciens et fenêtre RLS J-3.** Le besoin (« jours bien importés ») vise souvent des jours **anciens**. Un rôle `ecriture` ne peut écrire que dans les 3 derniers jours (RLS + `dayEditable`) : l'automode y échouerait silencieusement. Recommandation : l'automode **respecte `dayEditable`** et affiche un message clair si le jour n'est pas éditable ; les jours anciens nécessitent le niveau `gestion` (admin). À confirmer : l'utilisateur opère-t-il en `gestion` ?

- **D5 — Retour visuel.** Recommandation : appliquer **instantanément** (l'esprit « cheat code »), avec un **retour bref** (nombre de chambres cochées) — un petit toast/bandeau transitoire, pas de confirmation modale. À confirmer : veut-on en plus un clin d'œil visuel (effet du moteur `EffectOverlay`) ?

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-hook-sequence-clavier.md](./1-hook-sequence-clavier.md) | Hook `useKeySequence` (détection de séquence + garde focus) | — | P1 | 1h | Hook clavier réutilisable, testable, monté à la demande | |
| 2 | [2-metier-cibles-automode.md](./2-metier-cibles-automode.md) | Métier pur : `autoModeTargets(dayRows)` + tests | — | P0 | 1h | Fonction pure listant (room, served) à poser + tests verts | |
| 3 | [3-integration-board-automode.md](./3-integration-board-automode.md) | Intégration board : garde jour/droit + application en lot + retour | 1, 2 | P0 | 2h | `automode` opérationnel sur le jour affiché | ⚠ |
| 4 | [4-validation-globale.md](./4-validation-globale.md) | Validation globale (tsc/build/tests + scénarios manuels) | 3 | P0 | 1h | Chantier vérifié de bout en bout | ⚠ |

## Ordre d'exécution

Séquentiel : 1 et 2 sont indépendants (parallélisables) et sans risque ; 3 les assemble et porte **tout le risque** (écriture en masse sur des données de production PDJ) — d'où son marquage critique (audit `/borg` sur l'anti-écrasement D3, le respect de la fenêtre RLS D4, l'idempotence, et la cohérence avec `computePdjCA`). L'étape 4 clôt par une validation globale (dernière étape → critique par convention).

## Architecture cible

```
src/
├── components/
│   ├── shared/
│   │   └── useKeySequence.ts        ← [nouveau] détecteur de séquence clavier générique (action)
│   └── pdj/
│       └── BreakfastBoard.tsx       ← [modifié] branche useKeySequence('automode') → applique le lot
└── lib/
    └── pdj/
        ├── automode.ts              ← [nouveau] autoModeTargets(dayRows): { room, served }[]
        └── automode.test.ts         ← [nouveau] tests de la fonction pure
```

Réutilisés sans modification : `setServed` (`src/lib/pdj/service.ts`), `breakfastCode` (`src/lib/pdj/breakdown.ts`), `canEditPdjDay` (`src/lib/pdj/editability.ts`), le motif optimiste de `handleServe`. Aucun fichier SQL touché.

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|-------------------|-------------------|
| Frontend (hook clavier) | — | `src/components/shared/useKeySequence.ts` |
| Métier PDJ | — | `src/lib/pdj/automode.ts`, `src/lib/pdj/automode.test.ts` |
| Composant PDJ | `src/components/pdj/BreakfastBoard.tsx` | — |
| **Total** | **1 modifié** | **3 nouveaux** |
