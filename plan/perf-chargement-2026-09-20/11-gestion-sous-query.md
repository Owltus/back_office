# Étape 11 — Les quatre derniers écrans hors TanStack Query

## Objectif

Refermer un différé ouvert depuis juillet et rappelé en septembre : quatre écrans
lisent encore Supabase à la main, sans cache, contre la règle du projet.

## Contexte

`CLAUDE.md` est sans ambiguïté : « toute nouvelle lecture Supabase passe par
`useQuery` (jamais `useEffect` + `useState` + fetch manuel) ».

Quatre écrans y dérogent, et ce sont des survivances, pas des choix :

| Écran | Fichier | Nature |
|---|---|---|
| Gestion budgétaire | `src/components/repjour/boards/BudgetContent.tsx:65-95` | `fetchBudgetYears()` puis, à sa résolution, `fetchYearBudget(year)` — **deux vagues**, zéro cache |
| Gestion des données | `src/components/repjour/boards/DataContent.tsx:244-262` | `fetchUnifiedDays` (deux `select('*')`), zéro cache |
| Gestion des comptes | `src/components/repjour/boards/ComptesBoard.tsx:180-191` | `supabase.from('profiles').select('*')` dans un `useEffect` |
| Profil | `src/components/repjour/boards/ProfilBoard.tsx:43` | idem |

Le différé a été relevé deux fois : dans `plan/squelette-chargement-global/00-INDEX.md`
(angle D2, « plus propre mais chantier séparé, non retenu ici ») et dans
`plan/perf-resilience-2026-09-05/00-INDEX.md` (différé n°3). Il n'a jamais été
traité.

Conséquences concrètes : chaque visite repaye tout le réseau, y compris un
aller-retour sur l'autre depuis l'ouverture d'un onglet ; aucune de ces lectures ne
bénéficie du disjoncteur ni de la politique de réessais ; et sur `/comptes`, un
`select('*')` sur `profiles` rapatrie des données personnelles là où des colonnes
explicites suffiraient — ce que la règle des « lectures sobres » interdit.

L'impact en temps est modeste : ce sont des pages peu fréquentées et de petites
tables. L'intérêt de l'étape est la **cohérence** : ce sont les quatre derniers
endroits où une panne réseau ne se comporte pas comme partout ailleurs.

## Fichier(s) impacté(s)

- `src/components/repjour/boards/BudgetContent.tsx` (modifié)
- `src/components/repjour/boards/DataContent.tsx` (modifié)
- `src/components/repjour/boards/ComptesBoard.tsx` (modifié)
- `src/components/repjour/boards/ProfilBoard.tsx` (modifié)

## Travail à réaliser

### 1. Gestion budgétaire — supprimer la cascade au passage

Les deux lectures deviennent deux `useQuery`, la seconde dépendant de la première
par `enabled`. Mais la cascade peut disparaître complètement : `fetchYearBudget`
n'a besoin que d'une **année**, et l'année affichée par défaut est connue sans
attendre la liste (l'année courante). La liste des années ne sert qu'à peupler le
sélecteur.

```ts
// Les deux lectures partaient en cascade : la liste des années, puis le budget.
// Le budget de l'année courante ne dépend pourtant d'aucune liste — les deux
// partent désormais ensemble.
const anneesQ = useQuery({ queryKey: ['repjour', 'budget-years'], … })
const budgetQ = useQuery({ queryKey: ['repjour', 'budget-year', annee], … })
```

⚠ Réutiliser les clés existantes là où elles existent déjà ailleurs : `/repjour`
lit `['repjour','budget', y, m]` et l'analytique `['repjour','budget-years']`. Une
clé dupliquée sous un autre nom ferait deux lectures au lieu d'une.

### 2. Gestion des données

`fetchUnifiedDays` sous `useQuery`. Regarder au passage si cet écran a réellement
besoin des deux `select('*')` ou si des colonnes explicites suffisent — la règle du
projet les impose sur toute table à données personnelles.

### 3. Comptes et profil

Ces deux écrans lisent `profiles`. Points d'attention :

- **Colonnes explicites**, jamais `select('*')` : `profiles` porte des données
  personnelles.
- Après une action d'administration (création de compte, changement de rôle,
  réinitialisation de mot de passe), **invalider la clé** plutôt que recharger à la
  main. C'est le comportement attendu et c'est plus fiable que le rechargement
  actuel.
- ⚠ `ProfilBoard` est l'écran où l'utilisateur modifie son propre ordre de pages.
  `AuthContext` expose `refreshProfile` / `refreshPermissions`, qui appellent
  `fetchMyAccess()` **hors single-flight et hors disjoncteur** — c'est assumé dans
  le code. Ne pas empiler une lecture TanStack Query par-dessus sans vérifier
  laquelle fait autorité, sous peine de deux sources de vérité pour le même profil.

## Ordre d'exécution

1. `BudgetContent.tsx`, cascade supprimée.
2. `DataContent.tsx`.
3. `ComptesBoard.tsx`, avec invalidation après action.
4. `ProfilBoard.tsx`, en dernier — c'est celui qui touche à l'authentification.
5. `npx tsc --noEmit`
6. `pnpm test`
7. `pnpm lint`

## Critère de validation

- Plus aucun `useEffect` + `supabase.from(...)` dans `src/components/` : vérifiable
  par `grep -rn "useEffect" src/components | grep -l supabase`, qui doit ne rien
  rendre d'autre que les abonnements temps réel.
- Revenir sur `/gestion` après l'avoir quittée : les données s'affichent
  **immédiatement** depuis le cache, puis se rafraîchissent.
- Une panne réseau simulée sur `/gestion` et `/comptes` produit le bandeau de
  panne, comme sur les autres pages — aujourd'hui elles échouent en silence.
- Créer un compte sur `/comptes` : la liste se met à jour sans rechargement manuel.
- Modifier son ordre de pages sur `/profil` : la navigation se réordonne, et un
  rechargement complet donne le même résultat.
