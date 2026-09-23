# Étape 2 — Divergences de cache et invalidation qui rate sa cible

## Objectif

Refermer cinq défauts préexistants qui coûtent aujourd'hui plus cher que les
allers-retours qu'on veut supprimer, sans créer aucune RPC ni demander aucun
arbitrage.

## Contexte

### Défaut 1 — l'analytique périme le cache que le board protégeait

En TanStack Query v5, le `staleTime` est **par observateur** : quand deux
composants montent la même clé avec des seuils différents, le plus court décide
du refetch. Quatre clés sont dans ce cas.

| clé | qui pose un seuil long | qui ne pose rien |
|---|---|---|
| `['pdj','addon-all']` | `BreakfastBoard.tsx:463-475` et `DayCrossSummary.tsx:186-193` — **1 h** / gcTime 2 h | `PdjAnalytiqueBoard.tsx:76-79`, `PdjAnalytiqueMoisBoard.tsx:107-110` → **60 s** |
| `['pdj','analytics','all-history']` | `BreakfastBoard.tsx:488-500` — **1 h** / gcTime 2 h | `PdjAnalytiqueMoisBoard.tsx:93-97` → 5 min |
| `['caisse','analytics']` | `CaisseAnalytiqueBoard.tsx:46-55` — **10 min** | `CaisseAnalytiqueMoisBoard.tsx:47-50` → 60 s |
| `['parking','arrivals-all']` | `ParkingAnalytiqueBoard.tsx:46-54` — **10 min** | `ParkingAnalytiqueMoisBoard.tsx:60-63` → 60 s |

Le seuil d'une heure sur `['pdj','addon-all']` n'a pas été posé au hasard : le
commentaire de `BreakfastBoard.tsx:466-474` cite l'audit du 2026-09-20 — **312
appels de `select * from pdj_addon_production` sans `WHERE`, à 128 ms de
moyenne, sur quinze jours**. Ouvrir l'analytique PDJ ramène cette clé à 60 s et
**rouvre exactement la régression que ce commentaire dit d'éviter**.

### Défaut 2 — une invalidation qui rate sa cible

`RaproBoard.tsx:623-624` :

```ts
queryClient.invalidateQueries({ queryKey: ['rapro', 'daily-agg'] })
```

Le filtrage TanStack compare **élément par élément**. Cette invalidation attrape
`['rapro','daily-agg', 2026]` mais **pas** `['rapro','daily-agg-range',
windowFrom, date]` (`DayCrossSummary.tsx:346-350`) : l'élément d'index 1 diffère
littéralement. Après une clôture ou une réouverture rapro, les moyennes 30 jours
de la bande RepJour restent périmées jusqu'au `gcTime`.

### Ce qui n'est PAS un défaut, vérifié

`['caisse','analytics']` avec son seuil de 10 min est invalidée à chaque action
caisse par `CaisseBoard.tsx:644` (`invalidateQueries({ queryKey: ['caisse'] })`,
appelé en succès comme en échec). Le seuil ne protège donc de rien dès qu'un
hôtelier travaille — mais c'est un choix cohérent (les chiffres doivent suivre
la saisie), pas un bug. On aligne les seuils, on ne touche pas à l'invalidation.

## Fichier(s) impacté(s)

- `src/components/pdj/PdjAnalytiqueBoard.tsx` (modifié : `staleTime`/`gcTime`)
- `src/components/pdj/PdjAnalytiqueMoisBoard.tsx` (modifié : idem, 2 clés)
- `src/components/caisse/CaisseAnalytiqueMoisBoard.tsx` (modifié : `staleTime`)
- `src/components/parking/ParkingAnalytiqueMoisBoard.tsx` (modifié : `staleTime`)
- `src/components/rapro/RaproBoard.tsx` (modifié : invalidation élargie)

## Travail à réaliser

### 1. Aligner les quatre clés sur le seuil le plus long

Règle retenue : **la clé porte le seuil de son lecteur le plus exigeant**, et
chaque site d'appel le répète avec un commentaire qui renvoie à l'autorité.

Pour `['pdj','addon-all']` et `['pdj','analytics','all-history']` :
`staleTime: 60 * 60_000`, `gcTime: 2 * 60 * 60_000`.
Pour `['caisse','analytics']` : `staleTime: 10 * 60_000`.
Pour `['parking','arrivals-all']` : `staleTime: 10 * 60_000`.

⚠ Ne pas centraliser ces réglages dans une constante partagée tant que les clés
ne sont pas consolidées : une constante donnerait l'illusion qu'un seul endroit
fait autorité, alors que TanStack évalue par observateur. Un commentaire à
chaque site est plus honnête qu'une fausse source unique.

### 2. Élargir l'invalidation rapro

Deux voies :

**Voie A (retenue)** — ajouter l'invalidation manquante à côté de l'existante :

```ts
queryClient.invalidateQueries({ queryKey: ['rapro', 'daily-agg'] })
queryClient.invalidateQueries({ queryKey: ['rapro', 'daily-agg-range'] })
```

Explicite, se lit sans connaître les règles de filtrage de TanStack, et ne
touche à rien d'autre.

**Voie B** — renommer `['rapro','daily-agg-range', …]` en
`['rapro','daily-agg','range', …]` pour qu'elle tombe sous le préfixe existant.
Plus élégant, mais change une clé consommée par la bande RepJour : plus de
surface pour un gain nul.

### 3. Vérification du diagnostic avant correction

Le raisonnement « le staleTime est par observateur » vient de la documentation
et du commentaire d'audit, **il n'a pas été rejoué**. Avant de corriger,
confirmer sur `pg_stat_statements` que `select * from pdj_addon_production` est
bien appelé plus souvent qu'une fois par heure et par poste. Si le compteur
dit le contraire, le diagnostic est faux et l'étape tombe.

## Ordre d'exécution

1. Confirmer le diagnostic sur `pg_stat_statements` (point 3).
2. Aligner les quatre `staleTime` (point 1).
3. Corriger l'invalidation rapro (point 2, voie A).
4. `npx tsc --noEmit` + `npx vitest run` + `pnpm build`.

## Critère de validation

- `pg_stat_statements` remis à zéro puis, après une session de navigation
  board → analytique → board, le compteur de
  `select * from pdj_addon_production` n'augmente **pas** entre les deux
  passages sur le board.
- Après une clôture rapro, les cartes de la bande RepJour reflètent le nouveau
  chiffre **sans rechargement de page**.
- tsc propre, suite de tests verte, build inchangé.
