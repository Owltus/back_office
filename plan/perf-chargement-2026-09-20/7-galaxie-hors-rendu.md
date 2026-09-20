# Étape 7 — Sortir la simulation de la galaxie du fil d'exécution de la page

> **SANS OBJET — mesurée le 2026-09-20, le problème n'existe pas.**
> Aucune ligne de code modifiée. Le détail ci-dessous est conservé parce que la
> démarche compte autant que le résultat, et parce que la mesure sera à refaire
> si le volume de données change d'ordre de grandeur.

## Ce que disait l'audit

L'agent chargé du poids et du rendu avait classé cette page en tête de ses
suspects : `lib/facturation/galaxy.ts:108` fixe `iters: 400` et `:230-232` fait
une double boucle sur les nœuds actifs, le tout exécuté de façon synchrone dans
un `useMemo` de rendu (`FacturationGalaxie.tsx:32`). Soit un coût en
**400 × N²/2**. Son estimation : « pour 200 nœuds actifs, environ 8 millions
d'itérations, plusieurs centaines de millisecondes à plus d'une seconde de fil
principal gelé ».

Cette estimation reposait sur un `N` **supposé**. L'agent l'avait d'ailleurs dit
lui-même : « je n'ai pas le N réel en production ».

## Ce que dit la mesure

Comptage en lecture seule sur la base de production, le 2026-09-20 :

| Grandeur | Valeur |
|---|---:|
| Imputations distinctes (nœuds `code`) | **8** |
| Émetteurs (nœuds `issuer`) | **14** |
| Liens émetteur → code | 15 |
| Lignes de `facturation_wordpool` | 1 648 |
| Journal d'apprentissage | 34 documents |
| Référentiel d'imputations | 97 |

Les mots ne sont **pas** des nœuds de la simulation — le commentaire de la boucle
est explicite, elle ne traite que « imputations + émetteurs ». Le `N` réel de la
double boucle vaut donc **22**, pas 200.

`400 × 22² / 2 ≈ 97 000` calculs de distance. C'est de l'ordre de la
milliseconde. Il n'y a rien à corriger, et un Web Worker serait ici une
complication pure : le coût de démarrage du worker dépasserait de loin le calcul
qu'il porterait.

## Quand rouvrir ce dossier

Le coût est **quadratique** : il reste négligeable tant que le nombre
d'imputations plus émetteurs reste sous quelques centaines. Repères :

| Nœuds actifs | Calculs | Ordre de grandeur |
|---:|---:|---|
| 22 (aujourd'hui) | 97 000 | ~1 ms |
| 100 | 2 000 000 | ~20 ms |
| 300 | 18 000 000 | ~200 ms, perceptible |
| 1 000 | 200 000 000 | inacceptable |

Le seuil de vigilance est donc autour de **300 émetteurs + imputations**. En
dessous, ne pas toucher. Au-dessus, la voie la plus simple n'est pas le worker
mais la réduction du coût algorithmique — baisser `iters` (400 est-il
nécessaire ?) ou découper l'espace en grille, ce qui ramène le coût à ~O(N).

⚠ Si `iters` change un jour, la disposition de la galaxie change avec : c'est une
signature visuelle que l'utilisateur connaît. Comparer deux captures sur le même
jeu de données avant de valider.

## Ce que cette étape aura quand même servi

Elle rappelle la règle du projet, et pour la deuxième fois en quinze jours :
**ne jamais optimiser sur une estimation.** Le 2026-09-06, la colonne générée sur
`pdj_breakfasts` avait été abandonnée parce que les 339 ms cumulés valaient 5,5 ms
à froid. Ici, ce sont 8 millions d'opérations supposées qui valent 97 000 réelles.
Un chantier de deux heures évité par une requête de comptage.
