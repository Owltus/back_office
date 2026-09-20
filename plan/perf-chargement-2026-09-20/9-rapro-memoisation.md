# Étape 9 — Rapro : sortir les recalculs du corps du rendu

## Objectif

Rendre la saisie du rapprochement réactive, sans changer une ligne de ce qu'elle
affiche. C'est le meilleur rapport gain/effort de l'audit.

## Contexte

`src/components/rapro/RaproBoard.tsx` fait **1 398 lignes** et ne contient
**aucun `useMemo`, aucun `useCallback`, aucun `memo()`**. C'est le seul board du
projet dans ce cas : `BreakfastBoard` en a 17 et 9, `CaisseBoard` 10 et 2,
`ParkingBoard` 4.

Le composant rend deux grilles complètes de chambres — `:986`→`:992` et
`:1107`→`:1138`, chacune un `FLOORS.map` imbriquant un `rooms.map`, soit environ
80 chambres — et recalcule au passage, **dans le corps du rendu**, sept
agrégations :

| Ligne | Calcul |
|---|---|
| `:163` | `lowerCandidates` |
| `:167` | `reduce` |
| `:260-261` | `filter().map()` |
| `:291` | `optionalMissing` |
| `:299` | `windowDays.map` |
| `:304` | `windowDays.map` |
| `:385` | `freeRooms` |

Chacun de ces calculs est refait **à chaque `setState`**, donc à chaque clic sur
une chambre et à chaque frappe au clavier. C'est invisible sur une machine de
bureau au repos et très sensible sur tablette.

Rien ici ne touche au réseau ni à la base : c'est du pur travail de navigateur.

## Fichier(s) impacté(s)

- `src/components/rapro/RaproBoard.tsx` (modifié)

## Travail à réaliser

### 1. Mémoïser les sept calculs

Chacun dans un `useMemo` dont les dépendances sont **exactement** ce qu'il lit.
C'est le point délicat : une dépendance oubliée produit un affichage périmé,
c'est-à-dire un bug silencieux dans un outil de rapprochement comptable. Une
dépendance en trop ne coûte qu'un recalcul.

En cas de doute sur un calcul, **mettre la dépendance en trop**. Le gain vient
surtout des quatre plus lourds ; il n'est pas nécessaire de tous les traiter pour
en tirer l'essentiel.

### 2. Stabiliser les gestionnaires d'événements des grilles

Les deux grilles passent des fonctions de rappel à ~80 cellules chacune. Une
fonction recréée à chaque rendu force le rendu de toutes les cellules. Envelopper
dans `useCallback` les gestionnaires de clic, de clic droit et de double-clic
passés aux chambres.

### 3. Mémoïser la cellule de chambre si elle est extraite

Si les grilles rendent un composant de chambre distinct, l'envelopper dans
`memo()`. Si le rendu est fait en ligne dans le `.map`, **ne pas extraire un
composant pour le plaisir** : le gain du point 2 suffit, et une extraction
inutile brouille le code.

### 4. Ne pas toucher à la logique

Le rapprochement porte des règles métier subtiles et documentées (roulement d'une
chambre bloquée, sur-statut posé à la main, résolution au nettoyage). Cette étape
est **purement mécanique** : on déplace des calculs, on n'en change aucun. Si une
mémoïsation demande de réécrire la logique, c'est qu'elle est mal placée — la
laisser.

## Ordre d'exécution

1. Les quatre calculs les plus lourds (`:163`, `:260-261`, `:299`, `:304`).
2. Les trois autres.
3. Les `useCallback` des grilles.
4. `npx tsc --noEmit`
5. `pnpm test` — les tests de roulement (`carryover`) sont le filet principal ici.
6. `pnpm lint`

## Critère de validation

- `pnpm test` reste vert, en particulier les tests de roulement et de
  réconciliation.
- Parcours manuel complet sur un jour réel : clic gauche (cycle de couleurs),
  clic droit (sur-statut), double-clic (« bloquée la veille »), clôture. Les
  résultats sont **identiques** à avant.
- Une chambre bloquée roule toujours au jour suivant, et le liseré de la veille
  reste immuable vis-à-vis du jour courant.
- Ressenti : sur tablette, le clic sur une chambre répond sans latence
  perceptible.
