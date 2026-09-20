# Étape 9 — Rapro : sortir les recalculs du corps du rendu

> **DIFFÉRÉE — vérifiée le 2026-09-20 : le constat est exact, le gain ne l'est pas.**
> Aucune ligne de code modifiée.

## Ce que disait l'audit

« `RaproBoard.tsx` fait 1 398 lignes et ne contient aucun `useMemo`, aucun
`useCallback`, aucun `memo()`. Sept agrégations sont recalculées dans le corps du
rendu à chaque frappe. C'est le meilleur rapport gain/effort de l'audit. »

## Ce que dit la vérification

Le constat de forme est **exact** : `grep -c 'useMemo\|useCallback'` rend **0**
sur ce fichier. C'est bien le seul board du projet dans ce cas — `BreakfastBoard`
en compte 17 et 9, `CaisseBoard` 10 et 2, `ParkingBoard` 4.

Mais la taille des collections change tout. Les sept calculs incriminés portent
sur :

| Calcul | Ligne | Ce qu'il parcourt |
|---|---|---|
| `lowerCandidates` + `reduce` | 163, 167 | **2 éléments** |
| `occupied` (Set) | 260-261 | les lignes PDJ du jour, ~50 |
| `optionalMissing` | 291 | une poignée d'alertes |
| `windowDays.map` ×2 | 299, 304 | **7 éléments** |
| `freeRooms` | 385 | les mêmes ~50 lignes PDJ |

Soit, cumulé, une centaine d'opérations par rendu. Les deux grilles de chambres
rendent ~80 cellules chacune. À l'échelle de React, c'est de l'ordre de la
milliseconde — invisible, y compris sur tablette.

L'agent a déduit un coût de la **forme** du fichier (1 398 lignes, aucune
mémoïsation) plutôt que de la **taille des données**. Sur 80 chambres et 50
lignes de petit-déjeuner, la mémoïsation ne rapporte rien de mesurable.

## Pourquoi c'est différé et non classé sans objet

Contrairement aux étapes 7 et 8, il reste ici un vrai sujet — mais de
**maintenabilité**, pas de performance. Un fichier de 1 400 lignes sans aucune
mémoïsation est fragile : le jour où un calcul plus lourd y est ajouté, rien
n'avertira, et l'habitude sera prise.

Ce qui interdit de le faire **maintenant**, dans ce chantier : `RaproBoard` porte
les règles métier les plus subtiles du projet — roulement d'une chambre bloquée,
sur-statut posé à la main, résolution au nettoyage, liseré de la veille immuable
vis-à-vis du jour courant. Une dépendance de `useMemo` oubliée y produirait un
affichage périmé, c'est-à-dire un faux chiffre dans un outil de rapprochement
comptable, sans le moindre signal.

Risque réel contre gain nul : le compte n'y est pas. À reprendre dans un chantier
de lisibilité, où la mémoïsation sera un effet de bord d'un découpage en
sous-composants, pas une fin en soi.
