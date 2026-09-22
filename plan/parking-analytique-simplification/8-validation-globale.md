# Étape 8 — Validation globale

## Objectif

Vérifier que le chantier est complet, qu'il n'a rien débordé hors de son
périmètre, et que les deux vues analytique se comportent comme annoncé dans un
navigateur.

## Contexte

Trois risques justifient une étape de contrôle à part entière.

Le premier est la **fuite hors périmètre**. Le métier du parking est partagé
avec la bande de synthèse RepJour, qui consomme `captageIndex`. Une suppression
un peu large aurait cassé une page que le chantier ne vise pas. Le contrôle
doit l'affirmer, pas l'espérer.

Le deuxième est la **régression silencieuse du CA**. Le périmètre du chiffre
d'affaires inclut les réservations au statut `checkout`. Retirer l'indicateur
d'impayés ne doit rien y changer ; la seule preuve acceptable est la comparaison
du montant affiché avant et après, sur un mois de référence.

Le troisième est le **saut de mise en page**. Le squelette de chargement est
paramétré à la main dans chaque board. Si le nombre de cartes ou de colonnes
déclaré ne correspond plus au contenu, la page saute au montage — un défaut
que le projet a déjà traité ailleurs et qui ne se voit qu'à l'écran, jamais
dans les tests.

Une autre session travaille sur l'application en parallèle : le contrôle du
`git diff` doit confirmer que le chantier n'a touché que ses neuf fichiers.

## Fichier(s) impacté(s)

Aucun fichier modifié à cette étape. Contrôles seuls, plus la mise à jour de la
mémoire projet si le chantier est validé.

## Travail à réaliser

### 1. Recherche de résidus

```
grep -rn "captageIndex" src/
grep -rn "aptage" src/components/parking/
grep -rn "mpay" src/components/parking/ParkingAnalytique*.tsx
grep -rn "CLIENT_SPOTS" src/
grep -rn "hotel-year\|hotel-month" src/
```

Attendu : **aucun résultat** pour `captageIndex` et pour `CLIENT_SPOTS`, dans
tout `src/`. Aucune occurrence de captage ni d'impayé dans les deux boards
analytique. Plus aucune des clés de requête hôtelière. Les seules occurrences
de « captage » qui subsistent dans `src/components/` doivent toutes relever du
captage **PDJ**, notion distincte qui reste en service — les lister une à une
et vérifier qu'aucune ne concerne le parking.

### 2. Contrôles automatiques

```
npx tsc --noEmit
pnpm lint
pnpm test
pnpm build
```

`pnpm build` sert aussi à vérifier le découpage des chunks, conformément à la
règle du projet sur les modifications de performance : deux requêtes réseau
disparaissent, aucun chunk ne doit grossir.

### 3. Contrôle du périmètre modifié

```
git diff --name-only main
```

Attendu : exactement les douze fichiers modifiés et le fichier supprimé
annoncés par l'index. En particulier,
ni `src/router.tsx`, ni `src/components/parking/ParkingBoard.tsx`, ni aucun
fichier de `supabase/`. `DayCrossSummary.tsx` et `DashboardBoard.tsx` **sont**
attendus dans la liste depuis la décision D1.

### 4. Parcours navigateur

Sur `/parking/analytique` puis sur un mois précis :

- quatre cartes par vue, alignées, sans saut entre le squelette et le contenu ;
- aucun taux d'occupation supérieur à 100 % dans le tableau mensuel ;
- l'axe de la courbe mensuelle va de 0 à 100 sur un mois chargé comme sur un
  mois creux ;
- le CA du mois est identique au montant relevé avant le chantier ;
- l'export PDF de chaque vue produit un tableau à huit puis sept colonnes, sans
  colonne vide ni en-tête orpheline.

Sur `/parking` (planning), qui ne devait pas bouger :

- l'en-tête de jour affiche toujours le taux sur douze places, et vire au rouge
  quand les places tampon sont prises ;
- la bande de surbooking est toujours là.

Sur `/repjour`, bande de synthèse :

- le bloc parking affiche trois tuiles (Occupation, Arrivées, Départs), sans
  trou dans la grille ;
- la tuile « Captage » du bloc **PDJ** est toujours là et affiche une valeur —
  c'est une autre notion, elle ne devait pas bouger ;
- la bande se charge au moins aussi vite qu'avant : deux requêtes de sa salve
  initiale ont disparu.

### 5. Mémoire projet

Mettre à jour la mémoire `parking-occupation-over`, qui documente le revirement
inverse du 2026-08-12 (« base 12 places CLIENT, dépasse 100 % »). Elle est
désormais périmée pour l'analytique et doit dire ce qui est vrai : analytique
sur 14 places bornée à 100 %, planning toujours sur 12 places avec dépassement
et zone critique. Sans cette mise à jour, la prochaine session lira une
consigne contraire au code.

## Ordre d'exécution

1. Lancer les cinq recherches de résidus.
2. Lancer `npx tsc --noEmit`, `pnpm lint`, `pnpm test`, `pnpm build`.
3. Contrôler la liste des fichiers modifiés.
4. Parcourir les trois pages dans un navigateur.
5. Mettre à jour la mémoire `parking-occupation-over`.
6. Commit final. **Pas de push** sans demande explicite.

## Critère de validation

- La tuile Captage du bloc PDJ de la bande RepJour fonctionne toujours.
- Les cinq recherches de résidus donnent exactement les résultats attendus
  ci-dessus, sans exception à justifier.
- `npx tsc --noEmit`, `pnpm lint`, `pnpm test` et `pnpm build` passent tous les
  quatre.
- `git diff --name-only main` liste neuf fichiers, et aucun de la liste
  d'exclusion.
- Aucune valeur supérieure à 100 % dans la colonne Occupation du tableau
  mensuel, sur au moins trois mois différents dont un mois chargé.
- Le CA parking d'un mois de référence est inchangé au centime près.
- La mémoire `parking-occupation-over` décrit la règle actuelle, pas
  l'ancienne.

## Contrôle qualité (revue)

Étape critique (validation de clôture). `/borg` n'étant pas installé, revue
manuelle. (1) Relire le `git diff` complet du chantier d'un bout à l'autre, en
cherchant spécifiquement les suppressions accidentelles dans les zones
voisines du captage — c'est le mode de défaillance le plus probable.
(2) Vérifier qu'aucune clé TanStack Query n'a changé de forme : les clés
disparues doivent l'être faute d'appelant, jamais par renommage. (3) Vérifier que `FIRST_STAFF_SPOT` est toujours exporté et utilisé par le
planning, et que sa suppression n'a pas été confondue avec celle de
`CLIENT_SPOTS`.
(4) Vérifier qu'aucun fichier de `supabase/` n'a été touché, et qu'aucune
commande SQL n'a été lancée pendant le chantier.
