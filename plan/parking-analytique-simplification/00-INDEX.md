# Plan — Analytique parking : retrait du captage et des impayés, occupation sur 14 places

## Contexte

La page `/parking/analytique` (vue annuelle et détail mensuel) affiche six
cartes. Deux d'entre elles ne sont pas suivies dans la réalité du service :
le **captage** (remplissage du parking rapporté à celui de l'hôtel) et les
**impayés** (réservations parties au statut `checkout`). Elles occupent de la
place, coûtent deux requêtes réseau par vue, et personne ne les lit. Elles
partent.

Le troisième point est un changement de définition, pas un retrait. Le taux
d'occupation du parking est aujourd'hui calculé sur **12 places « client »**
alors que le numérateur compte les **14 places** réellement occupées. C'était
un choix délibéré du 2026-08-12 : faire dépasser 100 % pour rendre visible le
débordement sur les deux places tampon (13 et 14). L'utilisateur revient sur ce
choix : le dénominateur passe à 14, le taux redevient borné à 100 %.

Périmètre strict : la page analytique du parking. Le **planning** `/parking`
garde sa propre mécanique de zone critique et son taux sur 12 places — il
recalcule tout localement (`ParkingBoard.tsx:808`) et n'est donc pas touché
mécaniquement par le chantier. Cette cohabitation est un angle à trancher
(voir D2), pas un effet de bord accidentel.

Une autre session Claude Code travaille sur l'application en parallèle. Aucune
étape de ce plan ne touche `src/router.tsx`, le SQL, l'authentification ni les
routes : la surface se limite à `src/lib/parking/`, aux deux boards analytique
et au panneau d'aide.

## Remise en question (à défaut de /rodin)

**Est-ce le bon chantier ?** Oui pour les deux retraits : un indicateur que
personne ne lit coûte plus cher qu'il ne rapporte — deux requêtes par vue,
`['parking','hotel-year']` et `['parking','hotel-month']`, n'existent que pour
le captage et disparaissent avec lui. Le point sur l'occupation est plus
discutable : c'est le **troisième** revirement sur cette base de calcul (`/14`
partout jusqu'au 2026-08-04, `/12` avec dépassement assumé depuis le
2026-08-12, `/14` à nouveau aujourd'hui). Le chantier est peu coûteux et
réversible, mais il faut acter ce qu'on perd : l'information « on a débordé sur
les places tampon » disparaît de l'analytique. À 14/14 on lira 100 %,
exactement comme à 12 places client pleines et 2 tampon vides — deux situations
différentes, un seul chiffre. Si c'est cette information qu'on veut garder,
l'alternative moins destructrice est de conserver le taux sur 12 et d'ajouter
une colonne « dont tampon ». Elle n'est pas retenue, mais elle existe.

**Alternative moins coûteuse ?** Pour les cartes, non : masquer sans supprimer
laisserait le code mort et les requêtes. Pour l'occupation, changer la valeur
de `CLIENT_SPOTS` de 12 à 14 serait la modification d'une seule ligne — c'est
précisément le piège. La constante s'appelle « places client », elle sert aussi
au captage de la bande RepJour, et le mensonge sémantique se paierait au
prochain lecteur. Le plan utilise `SPOTS` (déjà égal à 14) et laisse
`CLIENT_SPOTS` intacte.

**Angle mort.** Passer le dénominateur à 14 ne garantit pas mathématiquement un
taux sous 100 % **sur la vue annuelle**. Ce taux mensuel impute les nuits d'une
réservation en entier au mois de son arrivée (approximation documentée dans
`analytics.ts:85-89`) : un séjour long démarrant le 30 du mois gonfle le mois
d'arrivée. Le dépassement devient rare, il ne devient pas impossible. Seule la
vue mensuelle jour par jour est strictement bornée, parce qu'elle compte des
places distinctes réellement occupées (`count(distinct spot)`, plafonné à 14).
C'est l'objet de l'angle D3.

## Décisions actées (validées le 2026-09-22)

- **D1 — option B.** Le captage part **partout**, y compris la tuile de la
  bande de synthèse RepJour. `captageIndex` et ses champs porteurs sont
  supprimés du métier. Le plan gagne l'étape 5.
- **D2 — option A.** La divergence entre le planning (taux sur 12 places,
  alerte de surbooking) et l'analytique (taux sur 14 places, borné à 100 %) est
  assumée et expliquée dans le panneau d'aide. Le planning n'est pas modifié.
- **D3 — option A** (recommandation retenue par défaut) : axe fixe `[0, 100]`
  sur la vue mensuelle, calcul dynamique conservé sur la vue annuelle.
- **D4 — option A** (recommandation retenue par défaut) : aucun script SQL,
  les colonnes devenues inutiles restent dans les vues.

## Angles à clarifier

*Les angles D1 et D2 ont été tranchés le 2026-09-22 ; ils sont conservés
ci-dessous pour mémoire du raisonnement.*

**D1 — Que devient le « Captage » parking de la bande de synthèse RepJour ?**
*Tranché : option B — le captage part partout.*
`captageIndex` est importé par `src/components/repjour/DayCrossSummary.tsx:22`,
qui affiche une tuile « Captage » parking sous le rapport journalier. Le
chantier ne parle que de la page analytique.
*Option A (recommandée, retenue par défaut dans ce plan)* — on ne touche pas à
RepJour. `captageIndex`, `clientNights` et `occupiedClient` restent dans le
métier ; seuls leurs usages dans les deux boards parking disparaissent. Coût :
du code conservé pour un unique appelant. Risque : nul.
*Option B* — on retire aussi la tuile RepJour. Le bloc parking passe de 4 à 3
tuiles (grille à revérifier), `captageIndex` et ses champs porteurs se
suppriment entièrement, `analytics.property.test.ts` disparaît. Coût : une
étape de plus, hors du périmètre annoncé.
*Option C* — retirer le captage des cartes mais garder la colonne du tableau.
Incohérent, non recommandé.

**D2 — Assume-t-on que le planning et l'analytique affichent deux taux
différents pour le même jour ?**
*Tranché : option A — on assume, et le panneau d'aide l'explique.*
Après le chantier, une journée à 13 places
occupées se lira **108 %** en en-tête du planning (base 12, zone critique
rouge) et **92,9 %** dans le tableau analytique (base 14).
*Option A (recommandée)* — on assume, et on l'écrit dans le panneau d'aide : le
planning surveille le débordement, l'analytique mesure le remplissage. Deux
questions, deux dénominateurs.
*Option B* — aligner aussi le planning sur 14. Cela supprime la zone critique
rouge et la bande de surbooking (`ParkingBoard.tsx:798-825`, `1702-1753`), donc
l'alerte visuelle quotidienne. Sort du périmètre annoncé.

**D3 — Comment borner l'axe des graphiques ?** Le `yDomain` est aujourd'hui
dynamique (`Math.max(100, pic)` arrondi à la dizaine) dans les deux vues.
*Option A (recommandée)* — `[0, 100]` en dur sur la vue **mensuelle**, où le
dépassement est impossible, et conservation du calcul dynamique sur la vue
**annuelle**, où il vaudra 100 en pratique mais ne tronquera jamais une courbe
si l'approximation d'imputation fait dépasser un mois.
*Option B* — `[0, 100]` en dur partout. Plus simple à lire, mais tronque
silencieusement un mois qui dépasserait.
*Option C* — corriger l'approximation d'imputation pour que le taux annuel
devienne lui aussi borné. Chantier métier réel, hors périmètre.

**D4 — Nettoie-t-on les types et la vue SQL ?** La colonne `unpaid` de la vue
`parking_arrivals_agg`, ainsi que `client_nights` et `occupied_client`,
continueront d'être renvoyées par PostgREST (`select('*')`) sans être lues.
*Option A (recommandée)* — on ne touche pas au SQL. Retirer une colonne d'une
vue impose un `drop view` puis recréation sur une base de production, pour un
gain nul. Les types TS `ParkingArrivalsRow` / `ParkingDailyOccRow` restent le
miroir fidèle de la vue, avec un commentaire signalant le champ non exploité.
*Option B* — nettoyage SQL complet. Opération destructive sur la production,
sans bénéfice mesurable. Non recommandée.

**D5 — Divergence entre deux agents, tranchée par vérification.** Sur
`ParkingAnalytiqueMoisBoard`, l'agent « données » a estimé que la requête
`['parking','arrivals-all']` ne servait « que l'impayé », tandis que l'agent
« UI » affirme qu'elle alimente aussi `caByDate` et le CA du mois. L'étape 4
tranche par lecture directe du fichier avant toute suppression. En l'état des
deux rapports, **la requête est conservée**.

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-occupation-quatorze-places.md](./1-occupation-quatorze-places.md) | Dénominateur du taux d'occupation porté à `SPOTS` (14), documentation réalignée | — | P0 | 45 min | `analytics.ts` calcule sur 14 places | |
| 2 | [2-metier-retrait-indicateurs.md](./2-metier-retrait-indicateurs.md) | Retrait de l'impayé agrégé du métier | 1 | P0 | 45 min | `ParkingMonthStats.unpaid` supprimé | ⚠ |
| 3 | [3-board-annuel.md](./3-board-annuel.md) | Vue annuelle : 6 cartes vers 4, 10 colonnes vers 8, requête hôtel supprimée | 2 | P0 | 1h | `ParkingAnalytiqueBoard.tsx` sans captage ni impayés | |
| 4 | [4-board-mensuel.md](./4-board-mensuel.md) | Vue mensuelle : 6 cartes vers 4, 8 colonnes vers 7, requête hôtel supprimée | 2 | P0 | 45 min | `ParkingAnalytiqueMoisBoard.tsx` sans captage ni impayés | |
| 5 | [5-repjour-bande-synthese.md](./5-repjour-bande-synthese.md) | Tuile Captage retirée de la bande RepJour, puis suppression de `captageIndex` du métier | 3-4 | P0 | 1h | Bloc parking à 3 tuiles, captage absent de tout le code | ⚠ |
| 6 | [6-aide-et-coherence.md](./6-aide-et-coherence.md) | Panneau d'aide : section analytique réécrite, cohabitation des deux taux expliquée | 3-5 | P1 | 30 min | `ParkingHelpPanel.tsx` fidèle à l'écran | |
| 7 | [7-tests.md](./7-tests.md) | Tests métier réalignés sur 14 places, tests du captage et de l'impayé retirés | 5 | P0 | 45 min | `pnpm test` au vert, test emblématique du 13/12 réécrit | |
| 8 | [8-validation-globale.md](./8-validation-globale.md) | Recherche de résidus, contrôles, parcours des trois pages | 1-7 | P0 | 45 min | Chantier vérifié de bout en bout | ⚠ |

## Ordre d'exécution

Séquentiel strict. Les étapes 1 et 2 posent le socle métier. Les étapes 3 et 4
sont indépendantes l'une de l'autre et pourraient être menées en parallèle,
mais elles touchent deux fichiers voisins qui partagent leurs conventions de
grille : les enchaîner évite deux styles divergents. L'étape 6 pourrait
remonter juste après l'étape 2, les tests ne portant que sur le métier ; elle
est placée après l'interface pour que `pnpm test` et `npx tsc --noEmit`
s'exécutent sur un arbre complet.

Aucun script SQL, aucune migration, aucune opération destructive n'est prévue.
La vue `parking_arrivals_agg` continuera de renvoyer les colonnes devenues
inutiles : c'est inoffensif, et cela évite un `drop view` sur la production
(angle D4). Aucune clé de cache TanStack Query n'est renommée ; deux clés
disparaissent simplement faute d'appelant.

Commit à chaque étape, sans push — conformément à la règle du projet, le push
attend une demande explicite.

## Architecture cible

```
src/lib/parking/
  model.ts                         [modifié]  CLIENT_SPOTS supprimée, FIRST_STAFF_SPOT conservé
  analytics.ts                     [modifié]  occupation sur SPOTS (14), unpaid et captageIndex retirés
  service.ts                       [modifié]  commentaires des champs non exploités
  analytics.test.ts                [modifié]  attendus 12 vers 14, assertions unpaid retirées
  analytics.property.test.ts       [supprimé] entierement dedie a captageIndex

src/lib/shared/
  analytics-month-guard.test.ts    [modifié]  fixture alignée sur le type

src/components/parking/
  ParkingAnalytiqueBoard.tsx       [modifié]  4 cartes, 8 colonnes, requête hôtel retirée
  ParkingAnalytiqueMoisBoard.tsx   [modifié]  4 cartes, 7 colonnes, requête hôtel retirée
  ParkingHelpPanel.tsx             [modifié]  section analytique réécrite
  ParkingBoard.tsx                 [intouché] planning : taux sur 12, zone critique conservée

src/components/repjour/
  DayCrossSummary.tsx              [modifié]  bloc parking à 3 tuiles, dénominateur hôtelier retiré
  boards/DashboardBoard.tsx        [modifié]  prop hotelRoomsSold retirée
src/lib/repjour/services/
  data.ts                          [modifié]  commentaire de fetchNuiteesByMonth

src/lib/analytique/
  pdf.ts                           [modifié]  commentaire d'exemple citant CAPTAGE
```

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|-------------------|-------------------|
| SQL Supabase | 0 | 0 |
| Métier (lib) | `model.ts`, `analytics.ts`, `service.ts`, `repjour/services/data.ts`, `analytique/pdf.ts` | — |
| Tests | `analytics.test.ts`, `analytics-month-guard.test.ts` (+ `analytics.property.test.ts` supprimé) | — |
| Composants | `ParkingAnalytiqueBoard.tsx`, `ParkingAnalytiqueMoisBoard.tsx`, `ParkingHelpPanel.tsx`, `DayCrossSummary.tsx`, `DashboardBoard.tsx` | — |
| **Total** | **12 modifiés, 1 supprimé** | **0 nouveau** |

## Différé (hors chantier, à garder en tête)

- `ParkingMonthStats.paid` et `.reserved` n'ont **aucun consommateur** dans
  l'interface — les deux agents le confirment séparément. Ils étaient déjà
  morts avant ce chantier ; les retirer élargirait le périmètre sans raison.
- L'approximation d'imputation des nuits au mois d'arrivée
  (`analytics.ts:85-89`) reste en place. C'est elle, et non le dénominateur,
  qui empêche de garantir un taux annuel sous 100 % (angle D3).
- L'alignement du planning sur 14 places (angle D2, option B) supprimerait
  l'alerte de surbooking. À ne rouvrir que sur demande explicite.
