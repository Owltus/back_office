# Plan — Pages Analytique par onglet (PDJ, Parking, Caisse, Rapro)

## Contexte

L'onglet `/repjour` dispose d'une vue analytique aboutie : une route enfant
`/repjour/analytique` (vue annuelle + détail mensuel `$year/$month`), atteinte
par un bouton-icône `LineChart` placé dans la barre d'action du board principal.
Le contenu vit dans des Boards sous `components/repjour/boards/`, s'appuie sur le
graphique partagé `KpiLineChart`, sur `PageHeader`/`PageContainer` transverses, et
charge ses données via `useQuery` (clé `['repjour', ...]`), la route layout étant
en `ssr: false`.

L'objectif est de reproduire ce gabarit sur les quatre autres onglets — PDJ,
Parking, Caisse, Rapro — pour obtenir les URL `/pdj/analytique`,
`/parking/analytique`, `/caisse/analytique`, `/rapro/analytique`, et d'ajouter sur
chaque board principal le même bouton « Analytique », afin de garder une cohérence
d'usage d'un onglet à l'autre.

Deux constats du travail de reconnaissance orientent le chantier. D'abord, obtenir
une URL enfant `/<onglet>/analytique` impose de transformer chaque route feuille
actuelle (`pdj.tsx`, `parking.tsx`, `caisse.tsx`, `rapro.tsx`) en route layout
(`Outlet` + `ssr: false`), sur le modèle de `repjour.tsx` : une route feuille qui
rend directement son board n'affichera jamais d'enfant. Ensuite, Rapro possède
déjà une vue analytique fonctionnelle, mais sous une route sœur `/rapro-mois` (pas
`/rapro/analytique`) : son cas est une migration d'URL, pas une création. Le
backend Supabase reste en lecture seule : aucune écriture, aucun DDL, aucun SQL de
migration dans ce chantier.

## Angles à clarifier

- **D1 — Rapro a déjà sa page analytique sous `/rapro-mois`.** Les composants
  `RaproAnalytiqueBoard` et `RaproMonthlyBoard` existent et marchent, mais l'URL
  et le bouton pointent vers `/rapro-mois`, pas `/rapro/analytique`.
  **Option A retenue (recommandée)** : migrer proprement — déplacer les deux
  routes sous le nouveau layout `rapro/`, repointer le bouton du `RaproBoard`,
  supprimer les anciennes routes `rapro-mois/`. Cohérence totale, boards réutilisés
  tels quels. Contrepartie : une URL existante qui marche change. Option B : garder
  `/rapro-mois` et créer un doublon `/rapro/analytique` (déconseillé, duplication).
  Étape 4.
- **D2 — Structure de route pour obtenir `/<onglet>/analytique`.**
  **Option A retenue (recommandée)** : convertir chaque route feuille en route
  layout (`Outlet` + `ssr: false`) façon `repjour.tsx`, avec un `index.tsx`
  reprenant le contenu actuel et une route `analytique.index.tsx`. URL conformes à
  la demande. Contrepartie : on déplace du code de routing qui fonctionne
  aujourd'hui. Option B : routes sœurs top-level type `/rapro-mois` (URL
  `/pdj-analytique`), moins de refactor mais URL non conformes à la demande.
  Étapes 1 à 4.
- **D3 — Périmètre de données réaliste par onglet (des trous existent).**
  Parking n'a aucun montant en base → pas de chiffre d'affaires, seulement
  occupation/rotation/statuts (payé, réservé, impayé). PDJ ne dispose que d'un
  `fetchDay` mono-jour → il faut ajouter une lecture multi-jours. Rapro
  n'historise que `nettoyee`/`refus`/`noshow` (déjà agrégés dans `monthly.ts`) ;
  l'occupation et les chambres reportées sont dérivées au runtime depuis le PDJ,
  donc hors périmètre d'une série temporelle simple. Caisse n'a aucune couche
  d'agrégation → à créer. **Option A retenue (recommandée)** : viser un MVP
  réaliste par onglet, décrit dans chaque fiche d'étape, sans promettre de métrique
  non disponible.
- **D4 — Garde par rôle sur les pages analytique.**
  **Option A retenue (recommandée)** : envelopper chaque page analytique dans
  `ProtectedRoute` (`allowedRoles` utilisateur/super_utilisateur/admin) comme
  `/repjour/analytique`. Les routes feuilles PDJ/Parking/Caisse actuelles ne
  l'utilisent pas (elles s'appuient sur `AppAuthGate` racine) ; on aligne sur le
  gabarit repjour. Étapes 1 à 4.
- **D5 — `/rodin` et `/borg` indisponibles dans cet environnement.** Le rôle de
  remise en question a été assuré ci-dessus (D1 à D4). Les audits des étapes
  critiques (marquées ⚠) seront réalisés manuellement — `npx tsc --noEmit`,
  `pnpm lint`, `pnpm build`, parcours applicatif, skill `/verify` — et non via un
  audit `/borg` automatique.

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-pdj-analytique.md](./1-pdj-analytique.md) | PDJ (pilote) | — | P0 | 2h30 | `/pdj/analytique` + bouton, pattern layout établi | ⚠ |
| 2 | [2-parking-analytique.md](./2-parking-analytique.md) | Parking | 1 | P1 | 2h | `/parking/analytique` + bouton (occupation, statuts) |  |
| 3 | [3-caisse-analytique.md](./3-caisse-analytique.md) | Caisse | 1 | P1 | 3h | `/caisse/analytique` + bouton + couche `caisse/analytics.ts` | ⚠ |
| 4 | [4-rapro-migration-analytique.md](./4-rapro-migration-analytique.md) | Rapro | 1 | P1 | 1h30 | `/rapro-mois` migré vers `/rapro/analytique`, bouton repointé | ⚠ |
| 5 | [5-validation-globale.md](./5-validation-globale.md) | Validation | 1,2,3,4 | P1 | 1h | build + routes régénérées + parcours des 4 onglets | ⚠ |

## Ordre d'exécution

- **Étape 1 en premier (pilote)** : PDJ établit le pattern complet à répliquer —
  conversion de la route feuille en layout, lecture multi-jours, board analytique,
  bouton dans la barre d'action. Les étapes 2 à 4 en dépendent car elles copient ce
  patron.
- **Sprint réplication (séquentiel ou parallélisable après l'étape 1)** : étapes 2
  (Parking), 3 (Caisse) et 4 (Rapro) touchent des fichiers disjoints par onglet ;
  une fois le pattern PDJ figé, elles peuvent être menées en parallèle. Étape 3
  (Caisse) est la plus lourde (couche d'agrégation neuve) ; étape 4 (Rapro) est la
  plus légère (migration de routes existantes).
- **Étape 5 en dernier** : validation globale — régénération du `routeTree.gen.ts`,
  `tsc`/`lint`/`build`, parcours manuel des quatre nouveaux boutons et pages,
  vérification qu'aucune route existante n'a régressé (notamment `/rapro-mois`
  supprimée).
- Après toute création/déplacement de route : `pnpm generate-routes` (ou laisser le
  plugin Vite régénérer `src/routeTree.gen.ts`), jamais d'édition manuelle du
  fichier généré.

## Architecture cible

```
src/
├── routes/
│   ├── pdj.tsx                          ← devient layout (Outlet + ssr:false)
│   ├── pdj/
│   │   ├── index.tsx                    ← contenu actuel (BreakfastBoard)
│   │   └── analytique.index.tsx         ← nouvelle vue analytique PDJ
│   ├── parking.tsx                      ← layout
│   ├── parking/
│   │   ├── index.tsx                    ← contenu actuel (ParkingBoard)
│   │   └── analytique.index.tsx         ← nouvelle vue analytique Parking
│   ├── caisse.tsx                       ← layout
│   ├── caisse/
│   │   ├── index.tsx                    ← contenu actuel (CaisseBoard)
│   │   └── analytique.index.tsx         ← nouvelle vue analytique Caisse
│   ├── rapro.tsx                        ← layout
│   ├── rapro/
│   │   ├── index.tsx                    ← contenu actuel (RaproBoard)
│   │   ├── analytique.index.tsx         ← migré depuis rapro-mois/index.tsx
│   │   └── analytique.$year.$month.tsx  ← migré depuis rapro-mois/$year.$month.tsx
│   └── rapro-mois/                      ← supprimé (migré sous rapro/)
├── components/
│   ├── pdj/PdjAnalytiqueBoard.tsx       ← nouveau (gabarit repjour)
│   ├── parking/ParkingAnalytiqueBoard.tsx  ← nouveau
│   ├── caisse/CaisseAnalytiqueBoard.tsx    ← nouveau
│   └── repjour/charts/KpiLineChart.tsx     ← réutilisé tel quel
└── lib/
    ├── pdj/service.ts                   ← + lecture multi-jours (fetchRange)
    └── caisse/analytics.ts              ← nouveau (agrégation par mois/shift/mode)
```

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|-------------------|-------------------|
| Routes | `routes/pdj.tsx`, `routes/parking.tsx`, `routes/caisse.tsx`, `routes/rapro.tsx` (+ suppression `routes/rapro-mois/*`) | `routes/pdj/index.tsx`, `routes/pdj/analytique.index.tsx`, `routes/parking/index.tsx`, `routes/parking/analytique.index.tsx`, `routes/caisse/index.tsx`, `routes/caisse/analytique.index.tsx`, `routes/rapro/index.tsx`, `routes/rapro/analytique.index.tsx`, `routes/rapro/analytique.$year.$month.tsx` |
| Boards principaux | `components/pdj/BreakfastBoard.tsx`, `components/parking/ParkingBoard.tsx`, `components/caisse/CaisseBoard.tsx`, `components/rapro/RaproBoard.tsx` | — |
| Boards analytique | — | `components/pdj/PdjAnalytiqueBoard.tsx`, `components/parking/ParkingAnalytiqueBoard.tsx`, `components/caisse/CaisseAnalytiqueBoard.tsx` |
| Métier / services | `lib/pdj/service.ts` | `lib/caisse/analytics.ts` |
| Généré | `src/routeTree.gen.ts` (régénéré) | — |
| **Total** | **~9 modifiés (dont suppression rapro-mois)** | **~13 nouveaux** |
