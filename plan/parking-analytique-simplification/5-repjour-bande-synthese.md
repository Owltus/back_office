# Étape 5 — Bande de synthèse RepJour : retrait de la tuile Captage

## Objectif

Retirer la tuile « Captage » parking de la bande de synthèse affichée sous le
rapport journalier, ainsi que les deux requêtes et la prop qui n'existaient que
pour elle. C'est ce qui rend possible la suppression complète de `captageIndex`
à l'étape 2.

## Contexte

Cette étape sort du périmètre initialement annoncé — elle a été ajoutée sur
décision explicite de l'utilisateur (angle D1, option B : le captage part
partout). Sans elle, `captageIndex` devrait survivre pour un unique appelant.

La bande `DayCrossSummary` affiche trois blocs de quatre tuiles (PDJ, Parking,
Rapprochement). Le bloc parking compte aujourd'hui Occupation, Arrivées,
Départs et Captage : il passera à trois tuiles.

Le point vérifié avant d'écrire cette étape, et qui conditionne tout : le
dénominateur hôtelier ne sert **que** le captage parking. La lecture
`['repjour','nuitees-month', year, month]` (`DayCrossSummary.tsx:267-274`) est
gardée par `enabled: canParking`, alimente `hotelByDate` (`275-283`), et ce
`hotelByDate` n'a que deux lecteurs : `parkingAgg` ligne 318 et la dépendance
du `useMemo` ligne 331. La prop `hotelRoomsSold` (`145`, `150`) n'a elle aussi
qu'un seul usage, ligne 334. Tout part ensemble.

Attention au piège de l'homonymie : la bande affiche **deux** tuiles
« Captage », l'une pour le PDJ et l'autre pour le parking. Le captage PDJ est
une notion sans rapport (inclus + extras rapportés aux clients), il passe par
`#/lib/pdj/`, et il **reste en place**. Seule la tuile parking part.

Effet de bord bienvenu : la bande fait partir ses lectures dans une seule salve
au premier rendu du tableau de bord (commentaire `150-158`, audit du
2026-09-20). Deux requêtes de moins dans cette salve, sur un chemin de
démarrage que le projet a déjà travaillé.

## Fichier(s) impacté(s)

- `src/components/repjour/DayCrossSummary.tsx` (modifié)
- `src/components/repjour/boards/DashboardBoard.tsx` (modifié : la prop passée au composant)
- `src/lib/repjour/services/data.ts` (modifié : commentaire de `fetchNuiteesByMonth`)

## Travail à réaliser

### 1. Retirer l'affichage

Bloc `showParking`, lignes 471-529 : supprimer la `StatTile` « Captage »
(lignes 517-528, `ACCENT.pink`). Le bloc passe de quatre à trois tuiles —
vérifier le rendu de la grille de `SummaryBlock`, les autres blocs en comptant
quatre.

**Ne pas toucher** à la tuile « Captage » du bloc PDJ (lignes 445-467).

### 2. Retirer les calculs

- `332-334` — `parkingCaptage`.
- `313-329` — dans `parkingAgg` : les accumulateurs `capClient` / `capRooms`,
  la boucle qui les remplit, le commentaire « Captage MOYEN », et la clé
  `avgCaptage` du retour.
- `294` et `302` — le champ `occupiedClient` du type local `winDays` et sa
  lecture `r?.occupied_client ?? 0`, devenus sans usage.
- `22` — l'import de `captageIndex`.

### 3. Retirer le dénominateur hôtelier

- `255-274` — le commentaire de tête, `coverMonths`, `monthsCovering` et la
  lecture `useQueries` `['repjour','nuitees-month', ...]`.
- `275-283` — `hotelByDate`.
- `331` — retirer `hotelByDate` des dépendances du `useMemo`.
- `23` — l'import de `fetchNuiteesByMonth`, et celui de `monthsCovering` s'il
  ne sert plus.
- `145` et `148-150` — la prop `hotelRoomsSold` et sa documentation.

Vérifier que `monthsCovering` n'est pas utilisé ailleurs dans le fichier avant
de retirer son import.

### 4. Mettre à jour le point de montage

`DashboardBoard.tsx:953-959` : retirer l'argument `hotelRoomsSold` passé à
`<DayCrossSummary />`, et le commentaire ligne 953 qui parle d'« un
dénominateur de captage ». Vérifier si la valeur qui l'alimentait devient
elle-même morte dans `DashboardBoard` ; si oui, la retirer, sinon la laisser.

### 5. Corriger la documentation du module

- `DayCrossSummary.tsx:49-51` — la ligne du bloc de tête qui annonce
  « Parking : Occupation (NOMBRE) / Arrivées / Départs / Captage ». Retirer la
  mention du captage. **Conserver** la ligne PDJ voisine (45-48), qui mentionne
  un captage toujours affiché.
- `src/lib/repjour/services/data.ts:77` — le commentaire de
  `fetchNuiteesByMonth` annonce « Sert la bande de synthèse RepJour (taux de
  captage PDJ et parking) ». La fonction garde d'autres appelants : corriger
  seulement la mention du captage parking, ne pas supprimer la fonction sans
  avoir vérifié qui l'appelle encore.

### 6. Supprimer le captage du métier

C'est le dernier geste, et il n'est possible qu'ici : après les étapes 3, 4 et
les points ci-dessus, `captageIndex` n'a plus aucun appelant. Dans
`src/lib/parking/analytics.ts` :

- `34-55` — le bloc de documentation « CAPTAGE PARKING — définition unique ».
- `57-69` — la fonction `captageIndex`.
- `6` — l'import de `TOTAL_ROOMS`, qui ne servait qu'elle.
- `78-80`, `115`, `144`, `166`, `173` — le champ
  `ParkingMonthStats.clientNights`, sa documentation, son initialisation dans
  `emptyMonth`, son accumulateur local et son affectation.
- `186-189`, `229` — le champ `ParkingDayStats.occupiedClient` et sa
  documentation, qui annonce elle-même « conservées pour le seul calcul de
  captage ».
- `1` — l'import de `CLIENT_SPOTS`, devenu sans usage.

Dans `src/lib/parking/model.ts` : `CLIENT_SPOTS` (`26-28`) n'a plus aucun
consommateur — le planning recalcule `FIRST_STAFF_SPOT - 1` localement
(`ParkingBoard.tsx:808`) sans jamais l'importer. Supprimer l'export et son
commentaire. **Conserver `FIRST_STAFF_SPOT`**, qui porte le sens métier et
reste utilisé.

Dans `src/lib/parking/service.ts` : `client_nights` (`27-28`) et
`occupied_client` (`53-54`) restent déclarés — ce sont des colonnes réellement
renvoyées par les vues (angle D4) — mais leur commentaire doit dire qu'ils ne
sont plus exploités.

## Ordre d'exécution

1. Retirer la tuile de l'affichage.
2. Retirer `parkingCaptage`, puis les calculs dans `parkingAgg`.
3. Retirer les requêtes hôtelières, `hotelByDate` et la prop.
4. Mettre à jour `DashboardBoard.tsx`.
5. Corriger les deux commentaires de documentation.
6. Vérifier qu'aucun appelant de `captageIndex` ne subsiste, puis supprimer la
   fonction, ses champs porteurs et `CLIENT_SPOTS`.
7. `npx tsc --noEmit` et `pnpm lint`.
8. Commit.

## Critère de validation

- `grep -n "aptage" src/components/repjour/DayCrossSummary.tsx` ne renvoie plus
  que les lignes du captage **PDJ**, aucune du parking.
- `grep -rn "nuitees-month" src/` ne renvoie plus rien.
- `grep -rn "hotelRoomsSold" src/` ne renvoie plus rien.
- `grep -rn "captageIndex\|CLIENT_SPOTS\|clientNights\|occupiedClient" src/`
  ne renvoie plus rien, hors fichiers de test traités à l'étape 7.
- `FIRST_STAFF_SPOT` est toujours exporté par `model.ts` et toujours utilisé
  par le planning.
- Le bloc parking de la bande affiche trois tuiles, alignées, sans trou dans
  la grille.
- La tuile « Captage » du bloc PDJ est toujours présente et affiche une valeur.
- `npx tsc --noEmit` et `pnpm lint` sans erreur ni import inutilisé.
