# Étape 3 — Intégration board : garde jour/droit + application en lot + retour

## Objectif

Brancher l'automode dans `BreakfastBoard.tsx` : à la frappe de la séquence `automode`, si le jour affiché est éditable, appliquer en lot `setServed(room, served)` pour toutes les cibles de `autoModeTargets(dayRows)`, avec mise à jour optimiste et un retour bref (nombre de chambres cochées). Uniquement pour le jour affiché (`selectedDate`).

## Contexte

- Cible = `selectedDate` ; données = `dayRows` du `useQuery(['pdj','day', selectedDate])` (`BreakfastBoard.tsx:196`).
- Cocher une chambre = `setServed(serviceDate, room, n)` (`src/lib/pdj/service.ts:161`) — `UPDATE` Supabase direct, gardé par la RLS J-3. Le motif optimiste de `handleServe` (`BreakfastBoard.tsx:507`) met à jour `queryClient.setQueryData(['pdj','day', date])` puis persiste, avec `invalidateQueries` en cas d'échec.
- **Aucun batch** : on boucle. Regrouper les écritures (ex. `Promise.all`) et poser une **seule** mise à jour optimiste du cache pour les N chambres (éviter 80 re-renders / clignotements).
- Droit d'écriture par jour = `dayEditable` (`BreakfastBoard.tsx:168`, `canEditPdjDay`). Hors fenêtre, `setServed` échoue silencieusement (RLS) → il faut garder l'action côté client.

Décisions appliquées : D3 (n'agir que sur `served === 0`, déjà porté par `autoModeTargets`), D4 (respecter `dayEditable`, message si non éditable), D5 (application instantanée + retour bref).

## Fichier(s) impacté(s)

- `src/components/pdj/BreakfastBoard.tsx` (modifié)

## Travail à réaliser

### 1. Armer le hook

```ts
useKeySequence('automode', runAutoMode, { enabled: canEdit })
```

Monté dans `BreakfastBoard` ; `enabled` coupé si le rôle n'a aucun droit d'écriture (`canEdit = can('pdj','ecriture')`).

### 2. Écrire `runAutoMode`

```ts
const runAutoMode = useCallback(async () => {
  if (!dayEditable) {
    // D4 : message clair — jour hors fenêtre d'écriture (niveau gestion requis).
    notify('Jour non modifiable : automode indisponible.')
    return
  }
  const targets = autoModeTargets(dayRows ?? [])
  if (targets.length === 0) {
    notify('Automode : rien à cocher (tout est déjà saisi ou aucun PDJ inclus).')
    return
  }
  // 1 seule maj optimiste du cache pour les N chambres (pas 80 re-renders).
  // 2 persistance en lot (Promise.all de setServed) ; rollback via invalidate si échec.
  // 3 retour : « Automode : N chambres cochées ».
}, [dayEditable, dayRows, selectedDate, queryClient])
```

Points d'implémentation :
- **Optimiste groupé** : construire le nouveau `dayRows` (poser `breakfasts_served`/`served` sur les chambres cibles) et `setQueryData` une fois.
- **Persistance** : `await Promise.all(targets.map(t => setServed(selectedDate, t.room, t.served)))`. En cas d'erreur, `invalidateQueries(['pdj','day', selectedDate])` pour resynchroniser.
- **Idempotence** : `autoModeTargets` exclut déjà les chambres saisies ; relancer est sûr.
- **Retour (D5)** : réutiliser le mécanisme de feedback déjà présent dans le board (toast/bandeau existant) ; sinon un petit état transitoire. Pas de modale de confirmation.

### 3. Ne rien changer d'autre

Ne pas toucher au calcul du CA, au PDF, ni à la vue financière : l'automode ne fait qu'écrire `breakfasts_served = breakfasts_included`, ce qui laisse `computePdjCA` inchangé (aucun extra créé).

## Ordre d'exécution

1. Importer `useKeySequence`, `autoModeTargets` (et `isPdjDayBlank` si utilisé pour le message).
2. Écrire `runAutoMode` (garde `dayEditable`, cibles, optimiste groupé, `Promise.all`, retour).
3. Armer `useKeySequence('automode', runAutoMode, { enabled: canEdit })`.
4. `npx tsc --noEmit` + `pnpm build`.

## Critère de validation

- `npx tsc --noEmit` passe ; `pnpm build` OK.
- Sur un jour importé **vierge** et éditable : taper `automode` coche toutes les chambres facturées à leur dû ; le CA PDJ affiché est inchangé (aucun extra).
- Sur un jour déjà partiellement saisi : les chambres déjà cochées ne sont pas écrasées.
- Sur un jour non éditable (hors fenêtre J-3, rôle `ecriture`) : message clair, aucune écriture.
- Taper `automode` dans un champ de saisie (ex. recherche/mot-clé) ne déclenche rien (garde focus).

## Contrôle /borg

Étape critique (écriture en masse sur données de production PDJ). Auditer après exécution :
- **Anti-écrasement (D3)** : aucune chambre à `breakfasts_served > 0` n'est modifiée ; vérifier que `autoModeTargets` est bien la seule source des écritures.
- **Fenêtre RLS (D4)** : l'action est bloquée côté client si `!dayEditable` ; confirmer qu'aucune écriture n'est tentée hors fenêtre pour un rôle `ecriture`, et pas de « faux succès » (gérer l'échec RLS silencieux via `invalidateQueries`).
- **Idempotence** : relancer `automode` deux fois de suite ne crée pas d'extras ni ne double aucune valeur.
- **Cohérence CA** : `computePdjCA` / la vue financière donnent le même total avant/après (seul `served` change, pas `included`).
- **Optimiste** : en cas d'échec d'une écriture du lot, le cache est resynchronisé (pas d'état optimiste bloqué).
- **Portée** : l'écouteur clavier est bien retiré au démontage du board (pas de fuite d'écouteur global hors PDJ).
