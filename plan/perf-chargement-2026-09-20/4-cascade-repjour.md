# Étape 4 — `/repjour` : trois vagues de requêtes au lieu d'une seule

## Objectif

Supprimer deux allers-retours réseau complets sur la page la plus consultée de
l'application, sans changer une seule ligne de ce qu'elle affiche.

## Contexte

`/repjour` lance ~20 requêtes pour ~2 000 lignes. Le volume n'est pas le problème :
**l'ordonnancement l'est.**

Vague 1 — `DashboardBoard.tsx:185-220` lance 8 requêtes en parallèle. Correct.

Vague 2 — `DayCrossSummary` porte 12 `useQuery`/`useQueries`
(`DayCrossSummary.tsx:161-382`). Mais ce composant n'est monté que dans une branche
conditionnelle :

```tsx
// DashboardBoard.tsx:872-933
report && rj && rmtd && pm && budget && ecart && ( <DayCrossSummary … /> )
```

Ses 12 requêtes n'existent donc **qu'après** le retour de la vague 1. Or aucune
d'elles n'a besoin de ces données : leurs clés de cache ne dépendent que de
`date`, connue dès le premier rendu. C'est une dépendance **de rendu**, pas de
donnée — et elle coûte un aller-retour réseau complet.

Vague 3 — `['rapro','days-range']` (`DayCrossSummary.tsx:357`) attend
`raproOldestQ.data` pour calculer sa fenêtre (`:351-354`). Celle-là est une vraie
dépendance de donnée, mais elle part de la vague 2, donc de la vague 1 : troisième
aller-retour.

Sur une base au repos, deux allers-retours coûtent quelques centaines de
millisecondes. Sur une base en famine (où une lecture triviale passe de 0,024 ms
à 1 135 ms), ils coûtent plusieurs secondes — et c'est la page d'accueil.

## Fichier(s) impacté(s)

- `src/components/repjour/boards/DashboardBoard.tsx` (modifié : branche conditionnelle)
- `src/components/repjour/DayCrossSummary.tsx` (modifié : rendu tolérant aux données absentes)

## Travail à réaliser

### 1. Monter `DayCrossSummary` sans attendre la vague 1

Deux façons, à trancher à l'exécution selon ce que la relecture du composant rend
le plus simple.

**Voie 1 (préférée) — monter toujours, rendre conditionnellement.** Le composant
est monté dès le premier rendu ; ses `useQuery` partent immédiatement ; il rend
son propre squelette tant que ses données ou celles de la vague 1 manquent. La
condition actuelle devient une condition d'**affichage à l'intérieur** du
composant, plus une condition de montage.

```tsx
// DashboardBoard.tsx — la bande de synthèse n'a besoin que de la date pour
// lancer ses lectures. La conditionner au rapport du jour lui faisait attendre
// un aller-retour réseau entier pour rien.
<DayCrossSummary date={date} report={report} budget={budget} … />
```

Et dans `DayCrossSummary`, là où les valeurs de la vague 1 sont consommées,
rendre le squelette existant plutôt que du vide.

**Voie 2 — hisser les requêtes.** Déplacer les 12 `useQuery` dans
`DashboardBoard` et passer les résultats en props. Plus invasif, et cela dilue la
cohésion du composant. À ne retenir que si la voie 1 se heurte à trop de valeurs
non optionnelles.

⚠ Dans les deux cas : **ne pas changer les clés de cache**. Elles sont partagées
avec `/pdj`, `/parking` et `/rapro` (`['pdj','addon-all']`, `['rapro','oldest']`,
`PDJ_DATES_KEY`…), et ce partage est un acquis des chantiers de juillet et août.

### 2. Faire partir la vague 3 en même temps — LAISSÉE EN L'ÉTAT

*Décision du 2026-09-20, en cours d'exécution.* Le repli prévu par l'étape a été
retenu, pour une raison qui n'apparaissait pas à la lecture de l'audit :
`['rapro','oldest']` porte `staleTime: Infinity` et `gcTime: 60 * 60_000`. La
borne historique n'est donc lue **qu'une fois par heure et par poste** ; la
troisième vague n'existe qu'au tout premier chargement d'une séance, pas à chaque
ouverture de la page.

Le gain se réduisait à un aller-retour, une fois par heure. En face, il fallait
découpler la fenêtre de roulement de sa borne historique, c'est-à-dire toucher au
calcul du « bloquées de la veille » — une règle métier subtile, au cœur du
rapprochement. Le rapport n'était pas bon.

Ce qui suit reste vrai si la situation change :

`['rapro','days-range']` (`:357`) attend `raproOldestQ.data` parce que
`carryoverWindow` a besoin de la borne basse. Deux options :

- Si la fenêtre de roulement a une longueur **bornée connue** (elle l'est côté
  `/rapro` : 7 jours), calculer la fenêtre à partir de la date seule et laisser la
  borne historique servir uniquement à **écrêter** le résultat. La requête part
  alors en vague 1.
- Sinon, laisser en l'état et le noter : une vague sur trois éliminée est déjà le
  gros du gain.

### 3. Ne pas toucher à ce qui va bien

- Le resync au retour d'onglet de `DashboardBoard.tsx:258-287` (debounce 500 ms,
  écart minimum 30 s) est correct.
- `DashboardBoard` n'a **pas** d'abonnement Realtime, et c'est voulu depuis le
  2026-09-06 (`daily_reports` n'est pas publiée). Ne pas en réintroduire un.
- Les invalidations larges `['repjour']` (`:266, 305, 575, 598, 961`) sont toutes
  liées à une action utilisateur. Les laisser.

## Ordre d'exécution

1. Relire `DayCrossSummary.tsx` pour établir quelles props de la vague 1 sont
   réellement indispensables à son rendu.
2. Appliquer la voie 1 dans `DashboardBoard.tsx:872-933`.
3. Rendre `DayCrossSummary` tolérant aux props absentes.
4. Traiter la vague 3 si la borne le permet.
5. `npx tsc --noEmit`
6. `pnpm test`
7. `pnpm build`

## Critère de validation

- Dans l'onglet Réseau, à l'ouverture de `/repjour` : **toutes les requêtes
  partent dans la même salve**, plus deux salves décalées. C'est visible d'un coup
  d'œil sur la chronologie.
- Le contenu affiché est **identique** à avant, à la valeur près, sur un jour avec
  rapport et sur un jour sans rapport.
- La bande de synthèse affiche un squelette pendant son chargement, jamais un
  blanc ni un saut de mise en page.
- Aucun `queryKey` n'a changé : vérifier qu'ouvrir `/repjour` puis `/pdj` ne
  relance pas les lectures partagées.
