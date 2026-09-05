# Étape 8 — Front : `fetchServiceDates` sur la vue légère

## Objectif

Faire lire la liste des dates de service PDJ depuis `pdj_service_dates`
(étape 7) au lieu de la vue agrégée : la seule requête lourde du projet
passe de 248 ms à moins de 10 ms, pour les trois appelants unifiés à
l'étape 6.

## Contexte

`src/lib/pdj/service.ts:63-80` : pagination par 1000 sur `PDJ_AGG_VIEW`,
dédoublonnage côté client. La nouvelle vue renvoie déjà des dates
distinctes (784 aujourd'hui, une page).

## Fichier(s) impacté(s)

- `src/lib/pdj/service.ts` (modifié)

## Travail à réaliser

### 1. Constante et requête

```ts
const PDJ_DATES_VIEW = 'pdj_service_dates'

/** Dates de service DISTINCTES, lues depuis la vue `pdj_service_dates`
 *  (Index Only Scan, quelques ms) au lieu de l'agrégat `pdj_daily_agg`
 *  (scan complet de la table, 248 ms mesurés le 2026-09-05). Pagination
 *  conservée par sécurité. */
export async function fetchServiceDates(): Promise<string[]> { … même boucle, .from(PDJ_DATES_VIEW) … }
```

Le `new Set` final est conservé (idempotent, protège contre un futur
changement de vue).

### 2. Commentaire d'en-tête

Mettre à jour le commentaire 57-62 (qui explique le choix de l'agrégat).

## Ordre d'exécution

1. Après que l'étape 7 est appliquée en prod (sinon 404 sur la vue).
2. `npx tsc --noEmit`, vérification visuelle du sélecteur de jour PDJ, de
   l'analytique PDJ (années disponibles) et du sélecteur rapro.

## Critère de validation

- Onglet Réseau : `pdj_service_dates?select=service_date&order=…` ; plus
  aucune requête `pdj_daily_agg?select=service_date`.
- Les trois sélecteurs proposent exactement les mêmes dates qu'avant
  (comparer le nombre de dates en console : 784 au 2026-09-05).
- `pg_stat_statements` sur 24 h : la requête `pdj_daily_agg … service_date
  … LIMIT` n'apparaît plus dans les nouveaux appels.
