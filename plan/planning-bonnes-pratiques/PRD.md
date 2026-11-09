# Planning du personnel : bonnes pratiques de mise en place

PRD et charte de la page `/planning`. Version du 2026-11-02 (règles morales en place le soir même),
revue le 2026-11-03 avec les décisions de l'utilisateur (questions Q1, Q7 à Q9, Q12, Q14 à Q17).

Ce document est à la fois :

- une **charte** : ce que nous nous engageons à respecter quand nous faisons un planning ;
- une **spécification** : pour chaque règle, ce que l'application doit faire, comment le mesurer,
  et où elle vit dans le code.

Il ne remplace pas un avis juridique. Les règles de droit sont reprises de la base du prototype
(`docs/regles-hcr.md` du dépôt `planning`, recherche du 2026-10-25) et de
`src/lib/planning/regles.ts`, qui est le SEUL endroit des chiffres de la convention dans l'app.
Ce qui y est marqué "À VÉRIFIER" le reste ici.

---

## 1. Objet et principes

### 1.1 Pourquoi ce document

Un planning décide de la vie des gens : quand ils dorment, quand ils voient leurs proches, quand
ils se reposent. Le calcul sait faire beaucoup de plannings légaux. Beaucoup d'entre eux sont
pourtant mauvais pour ceux qui les vivent.

**Ce n'est pas parce que l'on peut que l'on doit.**

### 1.2 Les quatre principes

1. **L'humain d'abord.** Nous sommes des êtres humains, pas des créneaux. Le repos, le sommeil et
   la vie personnelle comptent autant que la couverture de l'hôtel.
2. **La justice.** Une morale de justice, indépendante du nombre de personnes et des besoins. Les
   moments pénibles se partagent. Personne ne porte seul ce que l'équipe doit porter ensemble.
   Une règle vaut pour tous, la plus récente recrue comme la plus ancienne.
3. **La transparence.** Un planning s'explique. Quand le calcul ne peut pas tenir une règle, il le
   dit, en clair, à la personne qui fait le planning. Jamais d'entorse silencieuse.
4. **La loi n'est qu'un plancher.** Le Code du travail et la convention HCR disent ce qui est
   interdit. Ils ne disent pas ce qui est bien. Nos règles vont au-delà.

### 1.3 Vocabulaire

| Mot                | Sens dans l'app                                                                     |
| ------------------ | ----------------------------------------------------------------------------------- |
| Shift              | Un service d'une personne, un jour, sur un poste, à un horaire.                     |
| Proposé            | Posé par le calcul, en pointillés. Part si l'on régénère ou si l'on clique Effacer. |
| Validé             | Confirmé par la personne qui fait le planning. Le calcul le garde tel quel.         |
| Verrouillé         | Semaine figée par la gestion. Plus rien ne bouge, pour personne (erreur PL423).     |
| Repos              | Jour sans travail compté dans les deux repos de la semaine.                         |
| Absence            | Congé, maladie, formation, école... Motif à code (CP, MA, EC...).                   |
| Décompté           | Une absence qui vaut une journée de contrat : les heures dues baissent.             |
| Journée de contrat | `journeeContrat` : 8 h au-delà de 35 h, sinon le contrat divisé par 5.              |
| Accueil            | Réception, Club et la nuit, tenus ensemble d'un veilleur à l'autre.                 |
| JFR                | Jour férié rattrapé. Voir la partie 5.                                              |

---

## 2. Ordre des priorités

**ORDRE DU 2026-11-09 (décisions de l'utilisateur : « oui, mais vraiment si utile ; tu as beaucoup
de règles de fonctionnement qui peuvent rentrer en conflit ; tous les membres du personnel doivent
pouvoir faire toutes leurs heures quoi qu'il arrive ; les repos de quatre jours, c'est non ; les
moments où tu places quatre personnes le soir alors que personne le matin, c'est non »).** Il passe
devant l'ordre plus bas là où ils diffèrent :

1. **La loi**, dure.
2. **Le rythme 5 et 2** (règle 20) : jamais 6 jours de travail d'affilée (dur), jamais 4 repos ou
   plus entre deux blocs (au-dessus de tout ; quand des absences, l'école, des shifts validés ou la
   semaine voisine l'imposent, le calcul reste possible et la page le dit) ; un repos seul ou un
   bloc de 1 à 3 jours garde le prix fort (au-dessus de la semaine d'heures dues).
3. **Les heures dues du contrat, quoi qu'il arrive** : une heure due vaut plus qu'un changement de
   jours de repos et une place ensemble.
4. **Les places des postes indispensables**, salarié confirmé dur (règle 21).
5. **Le changement de jours de repos** (règle 22) : seulement s'il remplit plus d'une place et
   demie qui resterait vide autrement, une fois par personne sur 4 semaines.
6. **L'équilibre entre les moments d'une zone** (règle 23), au prix d'une place.
7. Le reste, dans l'ordre plus bas.

Les prix se lisent sur la place la plus chère de la semaine (`prixOrdre`) : l'ordre tient quels
que soient les réglages d'importance. Limite assumée : sous une heure, un horaire plus court de 15
ou 30 minutes peut encore tenir une place.

Ce qui suit est l'ordre d'avant, gardé là où le 2026-11-09 ne dit rien.

Quand deux choses se contredisent, on tranche dans cet ordre. Il est le même pour la personne qui
fait le planning et pour le calcul.

1. **La loi.** Jamais enfreinte par le calcul. Règles dures du moteur.
2. **Les places vraiment nécessaires.** Une place vide de l'hôtel, un moment de l'accueil sous son
   chiffre. Une place n'est vide que si personne ne peut la tenir sans enfreindre la loi.
3. **Les heures dues du contrat.** Ne pas donner ses heures à quelqu'un est aussi injuste.
4. **Les règles morales et professionnelles** (partie 4).
5. **Le confort** : jours habituels, petites préférences, départage.

Cet ordre est la réponse à la question Q1, décidée par l'assistant le 2026-11-02 et **confirmée
par l'utilisateur le 2026-11-03** : « Tu dois toujours respecter les besoins de la page
Paramètres > Besoins. Au mieux, tu respectes les bonnes pratiques, la justice et la justesse. S'il
n'y a pas le choix, il faut faire au mieux, le meilleur compromis. » Les besoins (places et
chiffres de l'accueil) passent donc avant toute règle morale ; une règle morale cède quand il n'y a
pas le choix, sans jamais faire échouer le calcul, et une alerte le dit.

**Les extras ne sont JAMAIS placés par le calcul** (décision utilisateur du 2026-11-03, soir :
« les extras, c'est des gens qu'il faut d'abord contacter avant de shifter, laisse les cases
vides »). `compatible` les exclut de tout créneau ; posés à la main, ils sont gardés. Une place
que l'équipe ne peut pas tenir reste vide, et sa raison dit « extra disponible : à appeler et
poser à la main ». Ce qui suit est l'HISTORIQUE (avant ce soir) :

**Les extras** (décision utilisateur du 2026-11-03) : un extra coûte de l'argent. Il ne sert jamais
à libérer un week-end ni à mieux répartir la charge. Il ne vient que pour une place qui resterait
vide autrement (vrai manque de personnel). Moteur : `coutExtra` compte, en plus de ce qu'il
coûtait (heures en plus, 6e jour, dépannage), tout ce qu'un shift peut coûter en règles morales,
en équité et en confort à la personne qu'il soulagerait (`partMoraleExtra`) ; il reste sous la
place vide.

**LA FATIGUE AVANT LES HEURES (décision utilisateur du 2026-11-03, soir : « un placement le plus
humain possible ; vise l'efficacité et non la fatigue des employés »)** : quatre règles de repos
passent désormais AVANT les heures dues, sous les places :

- moins de 12 h entre deux services (règle 3), reprise de jour moins de 2 jours après des nuits
  (règle 7), aucun week-end libre sur 4 semaines (règle 4) : `POIDS_FATIGUE` (290 000), plus que
  les heures dues d'un shift de 12 h. Une personne garde plutôt quelques heures en moins, signalées.
  Conséquence assumée : un collègue peut faire un 6e jour (signalé) pour qu'un autre ait son
  week-end du mois ;
- plus de 6 jours d'affilée (règle 2) : DUR pour le calcul (shifts posés à la main exceptés). Une
  place que seule une personne à son 7e jour pourrait tenir reste vide, à poser à la main. Au poids,
  cette règle doublait le temps d'une semaine et l'amenait au plafond ; dure, la semaine de démo
  passe de 29 s à 8 s.

L'ordre devient donc : loi > places > fatigue (ces quatre règles) > heures dues > autres règles
morales > confort. Le paragraphe Q1 ci-dessus et le tableau 2.1 décrivent l'état d'avant pour ces
quatre règles.

**RENVERSÉ LE 2026-11-04 : LES HEURES AVANT LA FATIGUE (décision utilisateur : « le respect du
nombre d'heures est très important ; si on ne le respecte pas, on les paye quand même alors qu'il
ne les a pas faites »)**. `POIDS_FATIGUE` passe à 20 000 : sous les heures dues d'une heure de
travail (24 000), au-dessus des autres règles morales. Plus de 6 jours d'affilée reste dur. Ordre :
loi > places > passation avec le veilleur et ouverture > heures dues (semaine complète, rythme de
5 jours) > fatigue > autres règles morales > confort. Mesuré sur décembre (copie locale, en
mémoire) : heures manquantes 36 h → 0, semaines courtes 6 → 0 ; en contrepartie, 18 alertes de
week-end libre (0 avant) : en décembre, l'équipe ne peut pas donner à la fois toutes les heures
et tous les week-ends. Un essai avec le week-end libre au-dessus d'un shift (150 000) gardait
24 h manquantes pour 4 alertes : c'est bien un choix entre les deux, pas un défaut du calcul.

**PASSATION AVEC LE VEILLEUR (décision utilisateur du 2026-11-04 : « c'est très important ; le
shift finit à 23 h pour le soir et celui de la nuit commence à 23 h »)** : par nuit de l'accueil,
le dernier du soir part à l'arrivée du veilleur ou après, le premier du matin arrive à son départ
ou avant, le lundi matin avec le veilleur du dimanche d'avant (`POIDS_PASSATION` 300 000, plus
que les heures d'un shift de 12 h ; une présence, pas un compte de personnes : la même règle que
l'oracle `transmissions` ; cherchée seulement quand le moment de jour qui relaie est demandé). Décembre : 5 passations du soir manquées sur 35 nuits → 1, sur un jour déjà
validé.

**CONTINUITÉ ENTRE ÉQUIPES OBLIGATOIRE (D8, décision utilisateur du 2026-11-05 : « il faut a
minima que les deux shifts terminent et commencent en même temps pour garantir le fonctionnement
et la continuité, et au mieux se croisent »)**. Réglage `passations.continuiteObligatoire`, vrai
par défaut (migration `20261105110000`). Un trou entre la fin d'une équipe et l'arrivée de la
suivante (journée de l'accueil d'un veilleur à l'autre, ou entre deux équipes d'un poste), et une
passation avec le veilleur manquée, coûtent une PLACE NÉCESSAIRE (P1) : plus que tout ce qu'il
faudrait payer pour ajouter une personne sur un créneau qui les tiendrait. Jamais dur : si
personne ne peut les tenir, ils restent (D3). Le chevauchement (relève) reste une préférence.
Mesuré (copie locale, en mémoire, comme « Compléter le mois ») : décembre, trous de l'accueil
22 h 30 → 7 h 30, places vides 10 → 9, relèves manquées 3 → 1, passations manquées 0 → 0, heures
dues manquées 36 h → 36 h ou 43 h selon la graine ; 29/06 → 26/10 : trous de l'accueil 2 h 15 → 0
et 3 passations manquées → 0 sur la graine qui en avait, une à deux places vides de plus (une
même personne ne tient pas une place ET la continuité, toutes deux P1). Un apprenti ou un
stagiaire (D9) compte comme autonome sur un poste où il est titulaire ou en dépannage ; en
soutien, jamais seul (règle de l'établissement, non réglable) : depuis le 2026-11-09, pendant
tout son shift, dans la zone de son poste (règle 21).

**IMPORTANCE DES POSTES ET BESOINS RÉGLÉS (D4, D11, décisions utilisateur du 2026-11-05 : « les
hôteliers sont plus importants sur les postes de Club et Réception ou la nuit » ; « quand il
manque du monde, Si possible reste vide en premier »)**. Chaque poste a une importance
(Indispensable, Important, Si possible ; base : l'accueil et la nuit Indispensables, la Direction
Si possible, le reste Important) ; chaque besoin est obligatoire ou souhaité, et demande un
titulaire ou accepte un dépannage. Le calcul range les places nécessaires en PALIERS (souhaité,
puis Si possible, Important, Indispensable, `paliersPlaces`) : le prix dérivé d'une place reste
le même (elle n'est vide que si personne ne peut la tenir), un décalage par palier fait qu'à une
personne près, une place d'un palier plus bas reste vide avant toute place d'un palier plus haut ;
un trou entre deux équipes suit le palier de ses postes, une passation avec le veilleur celui de
ses nuits. Un besoin souhaité est tenu si quelqu'un est libre, ne fait pas la plage du poste et
n'est jamais une place à pourvoir. « Titulaire seulement » : un dépannage ne tient jamais la place
(calcul, rattachement d'un shift posé, raison « la place demande un titulaire »). Un poste de
l'accueil peut avoir une heure de FERMETURE, symétrique de l'ouverture (la dernière heure tenue sur
ce poste chaque soir demandé). « À vérifier » dit une ouverture ou une fermeture qu'aucun horaire du
poste ne tient, et un titulaire demandé là où personne n'est titulaire. Une semaine où tous les
postes ont la même importance a le modèle d'avant au caractère près (empreinte de
`generateur.test.ts` inchangée). Mesuré (copie locale, en mémoire, décembre comme « Compléter le
mois » avec horizon, 3 graines) : places vides de l'accueil 10, 9, 10 avant comme après, aucune
place vide Important ni Si possible, trous, passations, relèves et heures dues identiques, 0
infraction, 9 à 15 s pour le mois.

Règle d'or : **quand l'hôtel ne peut pas faire autrement, le calcul peut enfreindre une règle
morale, mais il le dit dans une alerte.** Il ne peut jamais enfreindre la loi.

### 2.1 Ce que fait le calcul aujourd'hui

L'ordre réel est écrit en tête de `src/lib/planning/generateur.ts` (ORDRE DE DÉCISION) :

| Palier | Contenu                                                                             | Poids principaux                                                                                         |
| ------ | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| P0     | La loi : contraintes dures.                                                         | aucun poids ne la passe                                                                                  |
| P1     | Place nécessaire vide, moment de l'accueil sous son chiffre.                        | `coutPlaceVide`, `coutManqueMinimum`, dérivés des autres poids                                           |
| P2     | Trou dans la journée de l'accueil ou entre deux équipes (P1 depuis D8, 2026-11-05). | `POIDS_TROU_QUART` = 1 500 par quart d'heure, + le prix d'une place (`continuiteObligatoire`)            |
| P3     | Contrats : heures dues, personne en plus, 6e jour, heures au-delà.                  | `POIDS_SOUS_CONTRAT` 400 / min, `coutSurplus`, `POIDS_SIXIEME_JOUR` 15 000, `POIDS_SUR_CONTRAT` 50 / min |
| P4     | Le métier : titulaire avant dépannage, horaire demandé avant un autre.              | `POIDS_REMPLACANT` 2 000, `coutDepannage`                                                                |
| P3 bis | Les règles morales (partie 4).                                                      | voir le tableau ci-dessous, chacune au-dessus de la part fixe du dépannage                               |
| P5     | Le confort.                                                                         | `POIDS_JOUR_FIXE` 2 000, `POIDS_MEMES_REPOS` 500, `POIDS_EQUITE` 100                                     |

Les règles morales, entre les heures dues et le confort (2026-11-02) :

| Règle                                                          | Poids                                                                      |
| -------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Rythme de 5 jours pour un contrat de 35 h ou plus              | `POIDS_JOUR_MANQUANT` 80 000                                               |
| Ouverture des postes de l'accueil (première heure)             | `POIDS_OUVERTURE_QUART` 40 000                                             |
| Relève entre le matin et le soir                               | `POIDS_RELEVE` 16 000                                                      |
| 6e jour la semaine du retour d'un congé (règle 13)             | `POIDS_RETOUR_SIXIEME` 15 000, en plus de `POIDS_SIXIEME_JOUR`             |
| Un week-end libre sur 4 semaines (règle 4)                     | `POIDS_WEEKEND_LIBRE` 14 000                                               |
| Plus de 6 jours d'affilée                                      | `POIDS_JOUR_AFFILE` 12 000 par jour en trop                                |
| Plus de 5 nuits d'affilée (règle 7)                            | `POIDS_NUIT_AFFILEE` 12 000 par nuit en trop                               |
| Plus de 5 jours d'affilée                                      | `POIDS_JOUR_AFFILE_CONSEILLE` 10 000                                       |
| Reprise de jour moins de 2 jours après une nuit (règle 7)      | `POIDS_REPRISE_APRES_NUIT` 10 000                                          |
| Deux repos qui se suivent                                      | DUR depuis le 2026-11-04 (avant les places)                                |
| Moins de 12 h entre deux services (règle 3)                    | `POIDS_REPOS_COURT` 6 000 par paire (+ 6 000 au retour d'un congé)         |
| Retour en arrière à 2 jours au plus, soir puis matin (règle 6) | `POIDS_MOMENT_ARRIERE` 6 000 par paire de jours                            |
| Abords d'un jour d'école (règle 14)                            | `POIDS_ECOLE_ABORDS` 6 000 par service                                     |
| Plus d'un changement de moment d'un jour au suivant (règle 6)  | `POIDS_MOMENT_EN_TROP` 5 000 par changement en trop                        |
| Reprise d'un congé un samedi ou un dimanche (règle 13)         | `POIDS_RETOUR_WEEKEND` 5 000                                               |
| Pas de jour de travail isolé                                   | `POIDS_JOUR_ISOLE` 4 000                                                   |
| Heures en plus à qui en a fait le moins (règle 12)             | `POIDS_EQUITE_HEURES_PLUS` 5 par minute et par heure d'avance, 6 h au plus |

Les heures dues (P3, 400 par minute, soit 96 000 pour un shift de 4 h et 192 000 pour un shift de
8 h) passent devant chacune de ces règles prise seule : une personne à qui il manque des heures les
reçoit, au besoin avec une entorse morale signalée (Q1). Chaque règle morale est au-dessus de la
part fixe du dépannage (`PART_FIXE_DEPANNAGE`) : un collègue en dépannage vaut mieux qu'une
entorse. Personne ne fait un 6e jour pour le week-end d'un autre (14 000 < 15 000).
`pireMoral` (`generateur.ts`) compte le pire de ces règles quand on ajoute une personne : la place
vide (`coutPlaceVide`) coûte toujours plus, une place n'est jamais laissée vide pour une règle
morale (propriété vérifiée dans `ordreDecision.test.ts`).

### 2.2 Règle pour le développeur

- Un poids moral se place AU-DESSUS de tout le confort (P5) et de la part fixe du dépannage.
- Il se place SOUS les places nécessaires : `coutPlaceVide` relit les poids, une place reste
  prioritaire quoi qu'on ajoute (voir `pireCoutRemplir`). Tout terme qui peut monter quand on
  ajoute une personne doit y entrer.
- Une règle morale enfreinte produit une alerte de nature `organisation` (jamais `loi`).
- Une règle du moteur = `regles.ts` + `generateur.ts` + `verificateur.ts` + un test accepté ET un
  test refusé.

---

## 3. Le cadre légal appliqué

Ce que l'app applique aujourd'hui, avec la constante qui le porte. Les références (articles du
Code du travail, avenants HCR) sont celles de `docs/regles-hcr.md` du prototype.

### 3.1 Durées

| Règle             | Ce que fait l'app                                                                                                         | Constante                                 | Source citée                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------- |
| R-JOUR-MAX        | Durée d'un service : réception et veille 12 h, cuisine 11 h, autre 11 h 30, administratif 10 h. Comptée pauses comprises. | `JOUR_MAX_CATEGORIE`                      | Avenant n° 2, art. 6.1 ; avenant n° 19, art. 4 ; Code L3121-18 et L3121-19 |
| R-SEMAINE-MAX-ABS | 48 h au plus par semaine, école comprise.                                                                                 | `SEMAINE_MAX`                             | Avenant n° 2, art. 6.2 ; Code L3121-20                                     |
| R-TP-HEURES-COMPL | Temps partiel : au plus 1/3 du contrat en plus, et moins de 35 h.                                                         | `plafondTempsPartiel`                     | Avenant n° 2, art. 13 ; Code L3123-9                                       |
| R-CADRE-FJ        | Forfait jours : pas de décompte d'heures, 13 h d'amplitude, 5 jours.                                                      | `FORFAIT_JOUR_MAX`, `FORFAIT_SEMAINE_MAX` | Avenant n° 22 bis                                                          |
| R-STAGE-TEMPS     | Stagiaire : 10 h par jour au plus.                                                                                        | `STAGE_JOUR_MAX` (À VÉRIFIER)             | Code de l'éducation L124-1 et suivants                                     |

### 3.2 Repos

| Règle             | Ce que fait l'app                                                                                                                      | Constante                                          | Source citée                         |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------ |
| R-REPOS-QUOTIDIEN | 11 h de repos entre deux services, semaines voisines comprises, en heure réelle (changement d'heure compris).                          | `REPOS_QUOTIDIEN`                                  | Code L3131-1 ; CCN 1997, art. 21 § 4 |
| R-SIX-JOURS-MAX   | 6 jours travaillés au plus par semaine civile.                                                                                         | `JOURS_TRAVAILLES_MAX`                             | Code L3132-1                         |
| R-REPOS-HEBDO-35H | Une fois par semaine, 35 h de repos d'affilée (24 h + 11 h).                                                                           | `REPOS_HEBDO_MIN`                                  | Code L3132-2 ; CCN 1997, art. 21 § 3 |
| R-REPOS-HEBDO-HCR | 2 jours de repos par semaine, 5 jours de préférence, au moins 3 repos sur deux semaines. Sous les 3 repos : alerte, permis par la loi. | `JOURS_TRAVAILLES_PREFERES`, `REPOS_DEUX_SEMAINES` | CCN 1997, art. 21 § 3                |

### 3.3 Mineurs, apprentis

| Règle                         | Ce que fait l'app                                                                                                                 | Constante                             | Source citée          |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | --------------------- |
| R-MINEUR-JOUR-MAX             | 8 h par jour.                                                                                                                     | `MINEUR_JOUR_MAX`                     | prototype             |
| R-MINEUR-SEMAINE-MAX          | 35 h par semaine.                                                                                                                 | `MINEUR_SEMAINE_MAX`                  | prototype             |
| R-REPOS-QUOTIDIEN-MINEUR      | 12 h de repos entre deux services.                                                                                                | `MINEUR_REPOS_QUOTIDIEN`              | prototype             |
| R-REPOS-HEBDO-MINEUR          | 2 jours de repos qui se suivent, 5 jours au plus.                                                                                 | `reposConsecutifs` dans `versSolveur` | prototype             |
| R-NUIT-MINEUR                 | Aucun travail entre 22 h et 6 h.                                                                                                  | `nuitInterdite`                       | Code L3163-1, L3163-2 |
| R-ECOLE-HEURES, R-ECOLE-JOURS | Un jour d'école est une journée de travail complète : il compte dans les jours travaillés, les heures dues et le plafond de 48 h. | `journeeContrat`, `heuresDues`        | Code L6222-24         |

### 3.4 Ce qui n'est PAS encore appliqué

À savoir avant de croire qu'un planning est conforme :

- la moyenne de 46 h sur 12 semaines (R-SEMAINE-MAX-MOY12) et celle des travailleurs de nuit
  (44 h, R-NUIT-SEMAINE-MOY12) ;
- le contrôle de la pause de 20 min dès 6 h (R-PAUSE-6H) ; chaque horaire porte sa pause, en
  général 45 min ;
- le report des demi-journées de repos de la CCN (art. 21 § 3, b) ;
- le délai de prévenance de 7 jours pour un temps partiel (R-TP-PREVENANCE) ;
- les règles de jours fériés de la convention (R-FERIES-HCR, R-FERIE-1MAI, R-FERIE-MINEUR) : seule
  la règle de l'hôtel (JFR, partie 5) est appliquée, en place en local et pas encore livrée.

### 3.5 Entorses permises à la main

Le calcul ne les choisit jamais. La personne qui fait le planning peut les poser, avec une alerte :

- un repos de 11 h (12 h pour un mineur) entre deux services, raccourci : la ligne du menu le
  signale avant le clic ;
- jusqu'à 12 jours d'affilée sur deux semaines : chaque semaine garde ses 35 h et ses 6 jours,
  mais l'alerte JOURS-AFFILES et l'alerte R-REPOS-HEBDO-HCR s'affichent.

Un shift validé reste en place même s'il enfreint une règle : c'est un fait. Le contrôle le
signale.

---

## 4. Les règles morales et professionnelles

Seize commandements. Les quinze premiers ont été proposés le 2026-11-02 ; le seizième est la
règle des jours fériés de l'hôtel.

Pour chacun : **énoncé**, **pourquoi**, **comment** (règle mesurable), **exception**, **statut**.

### Le repos

#### 1. Deux repos qui se suivent, chaque semaine

- **Pourquoi.** Un seul jour libre ne repose pas. Deux jours collés permettent de vraiment
  décrocher.
- **Comment.** Chaque semaine civile, au moins une paire de jours de repos consécutifs. Mesure :
  nombre de semaines où les repos sont séparés.
- **Exception.** Quand des shifts déjà posés ou validés, ou l'école, n'en laissent aucune. Une
  semaine type qui fixe deux repos ou plus décide seule.
- **RÉVISÉ le 2026-11-04 (décision d'une responsable : « 90 % du temps, les hôteliers doivent
  avoir deux jours de repos consécutifs ; fais au mieux pour les personnes présentes, et si je dois
  avoir des trous dans mes besoins, tu me dis »).** La paire passe AVANT les places nécessaires :
  contrainte dure du calcul sur une semaine complète, une place reste vide plutôt que de la casser,
  et la place vide le dit (« Perdrait ses deux jours de repos de suite », REPOS-SEPARES bloque dans
  `raisonCommune`). Plus de 6e jour par le calcul (il ne laisse qu'un repos). Le dimanche et le
  lundi d'à côté font la paire quand ce jour voisin est connu libre (rythme du mardi au samedi),
  ce qui renverse la relecture du 2026-11-03 ci-dessous. Alerte REPOS-SEPARES aussi pour une
  semaine de 6 jours. Banc de décembre (copie locale, en mémoire) : semaines sans paire 25 → 15
  (toutes expliquées : repos fixes dimanche-lundi, paire à cheval, shifts validés), 6e jours 4 → 1,
  aucune place vide de plus, 6 h dues de moins sur le mois, même temps de calcul.
- **Statut.** EN PLACE. Moteur : `POIDS_REPOS_SEPARES` (8 000, avant le 2026-11-04) ; placement des repos déduits :
  `placerRepos` (règle 2, les repos se suivent). Alerte REPOS-SEPARES quand une semaine a au moins
  deux repos et aucune paire. **Corrigé le 2026-11-03 (relecture du banc)** : la paire se cherche
  DANS la semaine. Un dimanche libre de la semaine d'avant suivi du lundi libre ne la remplace plus :
  avant, des repos le lundi et le jeudi passaient pour collés, et le jeudi restait un repos seul au
  milieu du travail, sans alerte.

#### 2. Jamais plus de 6 jours d'affilée, viser 5

- **Pourquoi.** La fatigue s'accumule. La loi permet 12 jours de suite sur deux semaines. Nous
  disons non.
- **Comment.** Sur toute suite de jours, semaines voisines comprises, 6 jours de travail d'affilée
  au plus. Une semaine vise 5 jours. L'école compte comme un jour de travail.
- **Exception.** Un 6e jour pour tenir une place vide, signalé (SIXIEME-JOUR). Au-delà de 6 jours
  d'affilée : seulement à la main, avec l'alerte JOURS-AFFILES.
- **Statut.** EN PLACE. `JOURS_AFFILES_MAX` = 6 (`regles.ts`), `POIDS_JOUR_AFFILE` (12 000 par
  jour en trop), alerte JOURS-AFFILES (`verificateur.ts`). Viser 5 : `JOURS_TRAVAILLES_PREFERES`,
  `POIDS_SIXIEME_JOUR` (15 000), et `POIDS_JOUR_MANQUANT` (80 000) pour qu'un 39 h ne se fasse pas
  en 4 jours de 10 h.

#### 3. Pas de soir suivi d'un matin : au moins 12 h entre deux services

- **Pourquoi.** Finir à 23 h et reprendre à 7 h, c'est 8 h de repos réel, trajet et sommeil
  compris. La loi dit 11 h. Le corps en demande plus.
- **Comment.** Viser au moins 12 h entre la fin d'un service et le début du suivant. Entre 11 h et
  12 h : coût, et alerte. `REPOS_CONFORT` = 12 h dans `regles.ts`. Moteur : un coût par paire de
  créneaux de deux jours qui se suivent dont l'écart est sous 12 h (même forme que la contrainte
  de 11 h, en souple). Vérificateur : alerte "seulement X h de repos entre deux services (12 h
  conseillées)".
- **Exception.** Quand aucune autre personne ne peut tenir le matin.
- **Statut.** EN PLACE le 2026-11-02 (Q8 décidée par l'assistant : 13 h ; **12 h par décision
  de l'utilisateur du 2026-11-03**). `REPOS_CONFORT`
  (`regles.ts`), `POIDS_REPOS_COURT` (6 000 par paire, semaines voisines comprises), alerte
  REPOS-COURT. Le plancher légal de 11 h (`REPOS_QUOTIDIEN`) reste dur.

#### 4. Un week-end complet libre au moins une fois par mois

- **Pourquoi.** La famille, les amis, les enfants vivent le week-end. Un mois sans un samedi et un
  dimanche libres ensemble coupe une personne des siens.
- **Comment.** Sur toute fenêtre de 4 semaines (`SEMAINES_EQUITE`), au moins un samedi et le
  dimanche qui suit sans travail ni école. Moteur : si les 3 semaines d'avant n'en ont aucun, un
  coût si celle-ci n'en a pas. Vérificateur : alerte "aucun week-end libre depuis 4 semaines".
- **Exception.** Aucune, pas même la semaine type (décision utilisateur du 2026-11-03, partage
  d'abord). Qui veut travailler le week-end le dit par sa semaine type (Q12) : il en fait plus que
  les autres, mais garde un week-end libre sur 4.
- **Statut.** EN PLACE le 2026-11-02. `weekendLibreAvant` (`avecHistoire`, `semaine.ts`) : un
  samedi et un dimanche sans shift sur les 3 semaines d'avant (semaines pas encore faites : rien
  n'est dit). **Précisé le 2026-11-03** : un jour du week-end compte comme libre s'il n'a ni shift
  ni absence, ou une absence qui laisse vraiment libre (`absenceLibre`) : un repos (motif de nature
  repos), une absence sans décompte (repos exceptionnel, récupération, repos forfait), un congé
  choisi (`CODES_CONGE_LIBRE` : CP, JF, JFR). Ne comptent PAS : maladie, formation, sans solde,
  absence autorisée rémunérée, congé pour décès, école. Un week-end malade n'est pas un week-end
  avec les siens : la personne reste protégée, et l'alerte revient. `POIDS_WEEKEND_LIBRE` (14 000, sous le
  6e jour : personne ne fait un jour de plus pour le week-end d'un autre ; jamais d'extra pour
  lui, voir partie 2). Alerte WEEKEND-LIBRE.
  **Partage d'abord (décision utilisateur du 2026-11-03)** : la semaine type ne passe plus avant.
  Quand une fiche fixe le samedi ou le dimanche en Travaille (`weekendFixe`) et que la personne n'a
  eu aucun week-end libre les 3 semaines d'avant, la semaine type s'efface cette semaine-là
  (`weekendLibere`, `avecHistoire`) : plus de repos fixes (ils peuvent passer au week-end), samedi
  et dimanche ne sont plus des jours habituels, et ils ne sont pas posés d'office à l'ouverture de
  la semaine (`weekendsLiberes`, `aPoserFixes`). À l'écran, son samedi habituel est vide (ou en
  repos proposé) et le bilan le dit : "week-end libre cette semaine à la place de sa semaine type
  (aucun depuis 4 semaines)" (WEEKEND-LIBERE). Si une place de la page Besoins ne peut pas être
  tenue autrement, la place passe avant et WEEKEND-LIBRE le dit.
  **Q15 (décision utilisateur du 2026-11-03)** : la nuit du dimanche au lundi, qu'elle commence à
  23:00 ou à minuit (écrite 24:00), est posée le dimanche (`horaireDe`) : elle rend le week-end
  travaillé, au calcul, au vérificateur et dans la lecture des semaines d'avant (testé).
  **La nuit du vendredi au samedi aussi** (décision utilisateur du 2026-11-03, « le plus logique ») :
  on finit le samedi matin et on dort le samedi. Même lecture aux trois endroits (testé).

#### 5. Un repos posé ou validé est sacré

- **Pourquoi.** Une personne organise sa vie autour d'un repos annoncé. Le reprendre, c'est
  trahir une promesse.
- **Comment.** Un repos fixe de la semaine type, un repos posé à une date (motif R) ou un repos
  validé ne reçoit jamais de shift par le calcul.
- **Exception.** Aucune pour le calcul, sauf UNE : la semaine où la semaine type cède pour le
  week-end libre (règle 4, partage d'abord), ses repos fixes passent au samedi et au dimanche. Ce
  n'est pas un repos repris : la personne a le même nombre de repos, ensemble, le week-end. À la
  main : seulement avec l'accord de la personne.
- **Statut.** EN PLACE pour le calcul. Repos fixes : `reposFixes`. Repos posés et validés :
  `planning_absences.epinglee`, motif de nature `repos`, RPC `planning_valider_avec_repos`. Le
  vérificateur signale un shift sur un repos fixe (REPOS-FIXE).

### Le rythme

#### 6. Une semaine stable

- **Pourquoi.** Passer du matin au soir puis au matin dérègle le sommeil. Le passage du matin vers
  le soir se supporte mieux que l'inverse.
- **Comment.** Dans une semaine, changer de moment (matin, middle, soir, nuit) au plus une fois.
  Si l'on change, plutôt du matin vers le soir. Mesure : nombre de changements de moment entre deux
  jours travaillés qui se suivent. Moteur : un coût par changement, un coût plus fort pour un soir
  suivi d'un matin dans la semaine.
- **Exception.** Une semaine où une absence imprévue oblige à couvrir.
- **Statut.** EN PLACE le 2026-11-02. Moment de chaque créneau (`Creneau.moment`, celui de
  l'horaire). `CHANGEMENTS_MOMENT_MAX` = 1 : au-delà d'un changement de moment d'un jour au
  suivant dans la semaine, `POIDS_MOMENT_EN_TROP` (5 000 par changement) ; un jour à un moment plus
  tôt qu'un des
  `MOMENT_ARRIERE_JOURS` (2) jours d'avant (soir puis matin, nuit puis jour) coûte
  `POIDS_MOMENT_ARRIERE` (6 000 par paire de jours). Décision de l'assistant : au-delà de deux jours,
  les repos ont remis l'horloge à zéro ; un changement se compte d'un jour au suivant, pas à travers
  un repos. Mesuré : deux versions qui lisaient toute la semaine (moments distincts, chaîne du
  premier au dernier jour) laissaient une vraie semaine au plafond de 40 s ; celle-ci tient en 10 à
  16 s. Alerte MOMENTS (changements d'un jour au suivant, retour en arrière).

#### 7. Les nuits avec mesure

- **Pourquoi.** Le travail de nuit use. Il faut des séries courtes et un vrai repos après.
- **Comment.** Pas plus de 5 nuits d'affilée. Après une série de nuits, 2 jours de repos pleins
  avant de reprendre (pas de jour : repos, puis matin). Moteur : borne souple sur les suites de
  créneaux de nuit, coût si la série est suivie de moins de 2 jours sans travail.
- **Exception.** Aucun veilleur disponible, signalé.
- **Statut.** EN PLACE le 2026-11-02. `NUITS_AFFILEES_MAX` = 5 et `REPOS_APRES_NUITS` = 2
  (`regles.ts`), semaine d'avant comprise (`nuitsAvant`). `POIDS_NUIT_AFFILEE` (12 000 par nuit en
  trop), `POIDS_REPRISE_APRES_NUIT` (10 000). Alerte NUITS. En place aussi : aucune nuit pour un
  mineur (`nuitInterdite`), et la plage de l'accueil tenue d'un veilleur à l'autre
  (`plageAccueil`, `nuitDeLaVeille`). Non fait : le partage des nuits entre veilleurs (règle 10).

#### 8. Les mêmes repos d'une semaine à l'autre

- **Pourquoi.** Savoir quels jours on est libre permet de prévoir sa vie : un cours, un enfant, un
  rendez-vous.
- **Comment.** Les jours de repos d'une semaine reprennent ceux de la semaine d'avant quand rien
  ne s'y oppose. Mesure : jours de repos qui changent d'une semaine à l'autre. Moteur : un coût par
  jour de repos de la semaine d'avant qui devient travaillé.
- **Exception.** Une rotation voulue (week-ends partagés, règle 10).
- **Statut.** EN PLACE le 2026-11-02, comme petite préférence (décision de l'assistant) :
  `POIDS_MEMES_REPOS` (500 par jour, du confort, compté dans la part fixe du dépannage). Seuls les
  jours de semaine (lundi à vendredi) : le week-end tourne (règles 4 et 10), sinon ceux qui ont eu
  un week-end libre le garderaient. `reposAvant` (`avecHistoire`). Alerte MEMES-REPOS quand aucun
  repos de la semaine d'avant n'est gardé. **Neutre pour le week-end depuis le 2026-11-03** (banc :
  un repos en semaine devenait « collant », la personne ne retrouvait plus ses week-ends, et le
  total des week-ends libres baissait dans 6 scénarios sur 7) : qui a travaillé le week-end d'avant
  (`weekendTravailleAvant`) peut garder ses repos OU les passer au samedi et dimanche sans coût ni
  alerte. C'est l'exception prévue (rotation des week-ends, règle 10). Mesuré : un poids de 1 000 faisait pencher vers un
  6e jour d'affilée ; 500 ne le fait pas.

#### 9. Jamais un jour de travail isolé

**RÉVISÉ le 2026-11-04 (décisions d'une responsable : « tu ne peux pas donner des jours et redonner
des jours ensuite, ce n'est ni joli ni une bonne pratique » ; « privilégie vraiment les semaines
de 5 jours, plus humain »)** : pour un contrat de 35 h et plus (`rythmeHumain`, sur le CONTRAT,
jamais les heures dues de la semaine), jamais un jour seul entre deux jours sans travail ET au
plus 5 jours d'affilée, semaines voisines comprises et aussi dans la semaine : contraintes DURES
du calcul, une place reste vide plutôt et sa raison le dit (« règle de l'hôtel »). Jours avant
l'arrivée = repos, jours après le départ = travail, école = travail, semaine voisine inconnue =
rien demandé (le lundi esquissé de k+1 ne tient jamais un dimanche). Le dimanche d'avant
travaillé et le samedi d'avant libre poussent le lundi (`POIDS_DIMANCHE_SEUL`, souple). Petits
contrats : comme avant (coût et alerte « à éviter »). Repos obligé : un jour vide entre deux repos
certains est montré « Repos ». Relecture adverse (3 agents, chaque constat vérifié) : 6 défauts
reproduits et corrigés (règles levées par un congé, raison cachée par un jour isolé déjà posé,
semaine suivante lue autrement par le calcul et l'écran, lundi-samedi d'affilée, arrivée et départ,
repos obligé). Banc de décembre (copie locale, en mémoire) : 6 séries de 6 jours → 0, 6 jours
isolés → 1 (le dernier jour de la période), aucune place vide de plus, 14 h de contrat en moins
sur le mois (deux personnes, une journée chacune).

- **Pourquoi.** Revenir un seul jour entre un congé et des repos, c'est perdre le bénéfice des
  deux.
- **Comment.** Pas de jour de travail seul entre deux jours sans travail (congé, repos, absence).
  L'école, un jour hors contrat et le bord de la semaine comptent comme du travail.
- **Exception.** Une place vide qui ne peut être tenue autrement.
- **Statut.** EN PLACE, avec une limite écrite le 2026-11-03. Moteur : `POIDS_JOUR_ISOLE` (4 000)
  seulement contre un jour où le travail est impossible (congé, absence, repos fixe). Contre deux
  repos choisis par le calcul, c'est la règle 1 qui joue (la paire perdue coûte 8 000) : pour une
  personne à deux repos, un jour seul entre eux sépare forcément ses repos. Une personne à trois
  jours libres ou plus (petit contrat, semaine creuse) n'est pas protégée par le calcul. Mesuré :
  le coût partout portait une vraie semaine de 1,9 s à 4,1 s, et même limité aux contrats de moins
  de 35 h il laissait une semaine réelle du banc au plafond de 40 s. `placerRepos` (règle 3) pour
  les repos déduits. **Alerte JOUR-ISOLE** (nouvelle,
  2026-11-03) : tout jour de travail seul entre deux jours sans travail, semaines voisines
  comprises, dès que la semaine compte au moins 3 jours de travail (un petit contrat de 1 ou 2
  jours a forcément des jours seuls) ; jamais pour un extra.

### La justice

#### 10. Les moments pénibles se partagent

- **Pourquoi.** Week-ends, soirs, matins tôt et nuits pèsent. Ils ne doivent pas toujours tomber
  sur les mêmes.
- **Comment.** Chacun suit sa part, au prorata de ses heures dues, sur les 4 dernières semaines à
  poids égal. Un matin tôt est un matin qui commence à l'heure la plus tôt des matins du poste.
- **Exception.** Une personne qui ne peut tenir que ces moments (contrat, poste).
- **Statut.** EN PLACE pour week-ends, soirs et matins tôt : `SEMAINES_EQUITE` (4), `POIDS_EQUITE`
  (100 par jour d'écart), `EQUITE_RATTRAPAGE_MAX`, `equiteDe` (`semaine.ts`). À FAIRE pour les
  nuits. Le poids actuel est du confort (P5) : il ne fait jamais faire une heure en plus.
  **Tout l'accueil ensemble (décision utilisateur du 2026-11-03, Q16)** : `posteEquite` met dans
  un même groupe (`POSTE_ID_ACCUEIL`) tous les titulaires ET les soutiens (apprentis, stagiaires)
  d'un poste ouvert du matin et du soir (Réception, Club), chacun à sa part de contrat. Avant, on
  n'était comparé qu'aux personnes du même premier poste de titulaire, et un apprenti n'était
  comparé à personne. La Veille de nuit garde son groupe (ses soirs ne se comparent pas à ceux du
  jour) ; extras et forfaits jours restent hors équité. Le résumé du mois dit « Accueil de 0 à
  N ».

#### 11. Les jours de fête aussi

- **Pourquoi.** Travailler Noël ou le jour de l'An coûte plus qu'un autre jour.
- **Comment.** Qui travaille le 24 au soir, le 25, le 31 au soir ou le 1er janvier une année est
  prioritaire pour le repos ces jours-là l'année suivante. Il faut lire les shifts de l'année
  d'avant sur ces dates (une lecture sobre). Moteur : un coût sur ces jours pour les personnes qui
  les ont travaillés l'an dernier.
- **Exception.** Aucune autre personne capable de tenir le poste.
- **Statut.** REPORTÉE (décision de l'assistant du 2026-11-02) : il faut un an d'historique de
  shifts, que l'app n'a pas encore (planning en service depuis octobre 2026). À reprendre à
  l'automne 2027, avec la liste des jours (Q6).

#### 12. Les heures en plus ne tombent pas toujours sur les mêmes

- **Pourquoi.** Les heures en plus fatiguent et désorganisent. Elles se partagent comme le reste.
- **Comment.** Suivre sur 4 semaines les heures au-delà du contrat de chacun, rapportées au
  contrat. Moteur : coût d'équité, comme la règle 10. Vérificateur : alerte quand une personne
  dépasse son contrat 3 semaines sur 4.
- **Exception.** Une personne qui demande des heures en plus.
- **Statut.** EN PLACE le 2026-11-02. `equiteAvant.minutesEnPlus` et `semainesEnPlus`
  (`avecHistoire`, 4 semaines d'avant, au-delà des heures dues de chaque semaine) ;
  `coefsHeuresPlus` (`generateur.ts`) : `POIDS_EQUITE_HEURES_PLUS` (5 par minute et par heure
  d'avance sur le moins chargé du groupe, chacun ramené à sa part, `EQUITE_HEURES_PLUS_MAX` 6 h),
  en plus de `POIDS_SUR_CONTRAT`. Alerte HEURES-PLUS à `SEMAINES_EN_PLUS_ALERTE` (3) semaines sur 4.

### Le respect de la vie personnelle

#### 13. Un retour de congé en douceur

- **Pourquoi.** Reprendre après des vacances par six jours ou par un soir suivi d'un matin gâche
  le repos pris.
- **Comment.** La semaine du retour après un congé d'au moins 5 jours (décision de l'assistant) :
  pas de 6e jour, pas de repos de moins de 12 h, reprise plutôt pas un samedi ou un dimanche.
  Moteur : pour cette personne et cette semaine, le coût du 6e jour et celui de la règle 3
  renforcés, et un coût si son premier jour de travail est un samedi ou un dimanche.
- **Exception.** Une place vide, signalée.
- **Statut.** EN PLACE le 2026-11-02. `CONGE_LONG` = 5 jours d'absence décomptée d'affilée (hors
  école). **Précisé le 2026-11-03** : les repos fixes et posés font le pont SANS compter (3 jours de
  congé collés à 2 repos ne font pas un congé long ; avant, ils suffisaient, ce qui contredisait la
  décision « un congé d'au moins 5 jours »). `retourConge` (`avecHistoire`) : premier jour possible
  de la reprise s'il tombe cette semaine. `POIDS_RETOUR_SIXIEME` (15 000), `POIDS_RETOUR_REPOS_COURT`
  (6 000), `POIDS_RETOUR_WEEKEND` (5 000). Alerte RETOUR-CONGE.

#### 14. Protéger l'école des apprentis

- **Pourquoi.** L'apprenti apprend aussi en classe. Arriver épuisé au CFA, c'est apprendre moins.
- **Comment.** Pas de service qui finit tard (après 21 h) la veille d'un jour d'école. Pas de
  matin tôt le lendemain d'un jour d'école. Moteur : coût sur ces créneaux. Seuil d'heure à
  trancher (Q7).
- **Exception.** Aucune autre personne, signalé.
- **Statut.** EN PLACE le 2026-11-02 (Q7 décidée par l'assistant). `ECOLE_VEILLE_FIN` = 21:00 et
  `ECOLE_LENDEMAIN_DEBUT` = 08:00 (`regles.ts`), pour tout jour d'école, semaines voisines comprises
  (`finAvantEcole`, `debutApresEcole`). `POIDS_ECOLE_ABORDS` (6 000 par service). Alerte
  ECOLE-ABORDS. En place aussi : le jour d'école compte comme une journée de travail, et le
  calendrier jour par jour (`equipe/ecole.ts`).

#### 15. Un planning qui s'explique et qui se tient

- **Pourquoi.** Un planning qui change sans prévenir empêche de vivre. Un planning qu'on ne
  comprend pas ne se respecte pas.
- **Comment.** Une semaine validée ne bouge plus sans accord. Le calcul garde les shifts validés
  tels quels. Une semaine verrouillée est figée pour tous. Chaque place vide dit pourquoi
  (`raisonsPlaces.ts`), chaque entorse a son alerte.
- **Exception.** Aucune pour le calcul.
- **Statut.** EN PLACE. Shifts validés gardés comme faits (`imposees` dans `generateur.ts`).
  Verrou par trigger (PL423), passé refusé (PL409). Raisons des places : `raisonsPlaces.ts`.

#### 16. Un jour férié travaillé se rattrape

- **Pourquoi.** Règle de l'hôtel. Après un an de maison, un jour férié travaillé est rendu.
- **Comment.** Voir la partie 5.
- **Statut.** EN PLACE (local, non livré) le 2026-11-02. **Corrigé le 2026-11-03** : le JFR peut
  se poser sur un jour Travaille de la semaine type (voir 5.5). Avant, six personnes dont la
  semaine type fixe chaque jour ne recevaient jamais leur JFR et le perdaient en silence au bout de
  4 semaines. `droitAuRattrapage` et
  `FERIE_RATTRAPAGE_JOURS` (`regles.ts`), `feries.ts`, poids `POIDS_JFR_EN_ATTENTE` et
  `POIDS_JFR_COLLE` (`generateur.ts`), alerte JOUR-FERIE (`verificateur.ts`), motif JFR
  (migration `20261102120000`), mention Férié à l'écran.

#### 17. Une équipe qui travaille ensemble

- **Pourquoi.** Demande de l'utilisateur du 2026-11-03 : « éviter d'avoir des hôteliers seuls le
  soir ; qu'ils restent ensemble le maximum possible, à trente minutes près ; synchro comme le
  matin ; un changement de shift parfait ». Une personne qui arrive à 16 h 15 quand l'autre est là
  depuis 14 h 30, ou qui reste seule de 23 h 15 à minuit, travaille seule sans raison.
- **Comment.** À l'accueil (Réception et Club ensemble, personnes autonomes ; la nuit à part),
  chaque jour :
  - les personnes du soir arrivent à 30 min près (`EQUIPE_TOLERANCE`) ;
  - elles partent à 30 min près : personne ne reste seul la fin du soir ;
  - chacune croise une personne du matin au moins le temps de la relève réglée (30 min par défaut,
    page Besoins), pas seulement une paire par jour. L'heure d'arrivée du soir n'est pas écrite :
    elle suit les départs réels du matin (« autour de 15 h » avec un matin qui part à 15 h 45).
  - Le matin n'a pas de coût : l'ouverture de 07:00 le regroupe déjà (écart moyen des arrivées du
    matin : 3 à 5 min sur le banc). Le même coût sur le matin rendait une semaine de démo dix fois
    plus longue.
- **Exception.** Jamais une place vide ni des heures dues perdues pour elle (ordre Q1). Un soir
  qui ne demande qu'une personne la laisse seule : c'est le chiffre des Besoins.
- **Statut.** EN PLACE (local, non livré) le 2026-11-03. `equipesSynchro` et `equipesAccueil`
  (`generateur.ts`, poids `POIDS_EQUIPE_ARRIVEE` 4 000, `POIDS_EQUIPE_DEPART` 3 000 une fois par
  jour, `POIDS_RELEVE_CHACUN` 5 000 par personne, comptés dans `pireMoral`), oracle
  `equipesDesynchro` (`verificateur.ts`), message « Soir jeudi 5 : arrivées étalées de 14 h 30 à
  16 h 15… » dans les points d'attention (`phraseEquipe`). Tests `equipes.test.ts`. Banc du
  2026-11-03 (6 scénarios réels de 9 semaines, en mémoire) : écart moyen des arrivées du soir 44-56
  → 19-24 min, des départs 49-59 → 19-26 min ; soirs aux arrivées étalées 13-15 → 0 ; soirs aux
  départs étalés 18-23 → 0-2 ; personnes du soir sans relève 7-11 → 0 ; aucune infraction, aucune
  place vide, aucune semaine sous les heures dues de plus. Écartées : une fenêtre fixe (elle
  faisait payer une personne seule et passait devant un trou) et une fenêtre choisie par le
  calcul (dix fois plus lent).

#### 18. Des journées pleines et régulières

- **Pourquoi.** Décision d'une responsable du 2026-11-04 : « en 35 h, place uniquement des
  horaires de 7 h ; en 39 h, des journées de 8 h sauf une à 7 h ; les autres horaires, un peu
  bâtards, ne seront placés que manuellement ».
- **Comment.** `journeesDuCalcul` (`regles.ts`) : 35 h → journées de 7 h (5 × 7 h) ; 39 h →
  8 h et 7 h, au plus une journée de 7 h (4 × 8 h + 7 h). Contraintes DURES du calcul
  (`compatible` et un plafond aux heures dues : jamais d'heures en plus). La semaine d'une absence
  décomptée, de l'école, d'une arrivée en cours de semaine ou d'un JFR pris, la journée étoile
  d'un 39 h saute (`etoileSacrifiee`) : 39 h + un congé = 4 × 8 h = 32 h dues (31 h avant). La
  journée est jugée sur l'heure murale de l'horaire (`travailMural`) : une nuit de 8 h reste de
  8 h au changement d'heure.
- **Exceptions.** Un shift posé ou validé n'est jamais refusé ; son surplus au-delà de la plus
  longue journée permise s'ajoute au plafond (un 8 h posé pour un 35 h : 8 h + 4 × 7 h). Une
  semaine type qui fixe un horaire ni de 7 h ni de 8 h décide seule. Forfait jours, extras et
  contrats ni 35 h ni 39 h : rien ne change.
- **Statut.** EN PLACE (local, non livré) le 2026-11-04. Raisons d'une place vide :
  JOURNEE-TYPE (« Pas une journée de son contrat ») et HEURES-FAITES (« Dépasserait ses heures
  de la semaine »), dites seulement pour juger une place, jamais pour un shift posé. Tests
  `journeesCalcul.test.ts` (13 mutants tués). Relecture adverse (3 agents, un vérificateur par
  constat) : 13 défauts réels sur 16 constats, tous corrigés. Banc de décembre (copie locale, en
  mémoire, horizon glissant comme dans l'app, moteur d'avant comparé) : shifts hors 7 h / 8 h
  3 → 0, heures en plus 9 h → 0 h, heures de contrat non faites 16 → 15 h, la même nuit vide
  qu'avant (lundi 21/12 : chacun dépasserait ses heures), 43 → 31 s pour le mois.
- **Middle** (même décision) : posé seulement s'il reste des heures ; la superviseuse n'est pas
  comptée à l'accueil (poste principal d'abord, dépannage ensuite). Rien à changer au moteur.

#### 19. Le middle est un coup de main, l'équipe du matin arrive ensemble

- **Pourquoi.** Une responsable, 2026-11-04 et 2026-11-05 : « les middles sont des shifts en
  option, un coup de main » ; « que matin, nuit… soient des notions abstraites, que le moteur se
  concentre sur les horaires ». Banc de la nuit du 2026-11-05 : les 18 semaines faites à la main
  (29/06 au 26/10, copie locale, en mémoire) recalculées par le moteur et comparées aux vraies.
- **Comment.** (a) Le moment d'un horaire se CALCULE d'après ses heures (`moment.ts`,
  `avecMomentCalcule`), plus aucun choix à la main ; un horaire libre aussi (`momentLibre`). (b) Un
  middle ne compte ni au matin ni au soir du tableau de l'accueil (`momentsAccueil`, révise D11) :
  compté deux fois, il remplaçait un vrai soir. Il reste un candidat, posé s'il reste des heures,
  et compte pour les trous. (c) Au matin de l'accueil, arriver après l'ouverture du poste coûte
  un peu, par minute (`POIDS_ARRIVEE_MATIN_MINUTE`, `coutArriveeMatin`) : à la main, presque
  tous les matins commencent à 07:00.
- **Mesuré.** Personne seule à l'accueil, sur 126 jours : à 21 h, 69 jours avec l'ancien moteur,
  12 avec le nouveau, 21 à la main ; à 07:15, 21 / 22 / 25. Places à pourvoir : 3 sur 855
  (190 pour les plannings faits à la main, jugés sur les mêmes règles, avec 98 trous et 11
  infractions ; le moteur : 2 trous, 0 infraction). Écarté : garder le même horaire toute la
  semaine (31 % → 25 % de changements d'heure d'arrivée, 22 % à la main) triplait le temps de
  calcul et dégradait les soirs.
- **Personne seule à l'accueil** (même nuit) : quand l'équipe ne suffit pas pour les chiffres
  (3 le matin, 2 le soir), le calcul mettait le manque au hasard (« 3 et 1 » plutôt que « 2 et
  2 ») : de 6 à 30 soirs avec une personne seule selon la graine. Chaque quart d'heure de la
  journée de l'accueil avec une seule personne coûte un peu (`POIDS_SEUL_QUART`), jusqu'à
  l'arrivée possible la plus tôt du veilleur (un veilleur seul est la règle). Moments avec une
  personne seule (9 heures par jour, 126 jours, 3 graines) : 121 en moyenne → 99 ; chaque
  semaine recalculée seule sur le passé réel : 118 → 102 (157 à la main, sur 119 jours).
- **Affinage en deux temps** (même nuit, `affiner`) : après le calcul, un second calcul
  minuscule ne choisit plus que l'horaire précis de chaque shift de l'accueil dans son moment,
  pour garder les mêmes horaires dans la semaine, sans dépasser le coût du calcul de plus de 600.
  Heure d'arrivée changée d'un jour au suivant : 34 % → 28 % (23 % à la main).
- **Écartés après mesure.** Les habitudes de chacun (préférer les horaires qu'une personne fait
  d'ordinaire) : comptées d'un moment à l'autre, elles s'entretenaient et vidaient les soirs
  (6 à 30 soirs seuls selon la graine) ; limitées à un moment, aucun gain mesurable.
- **Statut.** EN PLACE (local, non livré) le 2026-11-05.

#### 20. Toujours 5 jours de travail, puis 2 jours de repos

- **Pourquoi.** Décision de l'utilisateur, 2026-11-09 : « les repos, il faut qu'ils soient
  absolument sur 2 jours d'affilée, donc c'est normal que pour la semaine de travail ce soit le
  cas aussi ». Décembre généré montrait des semaines « TTrrTTT » et un repos seul (« r TT r TTT »,
  le lundi faisant la paire avec le dimanche d'avant, le jeudi seul).
- **Comment.** Pour un contrat de 35 h et plus (le rythme humain), semaines voisines comprises :
  jamais un repos seul ; un bloc de travail fait exactement 5 jours, au plus 5 contre un jour
  neutre ou une semaine inconnue ; exactement 2 repos entre deux blocs, sauf contre un jour
  neutre. Révisé le même jour (« les jours d'école au CFA, considère-les comme des jours de
  travail… que tout soit cohérent ») : l'école et une absence décomptée de 5 jours au plus
  (congé, maladie, formation, férié chômé, JFR) comptent comme du TRAVAIL (un apprenti fait
  « 5 jours, 2 repos, 5 jours d'école, 2 repos ») ; le repos posé, fixe ou sans décompte compte
  comme du REPOS ; seuls le hors contrat et une absence de plus de 5 jours d'affilée sont
  NEUTRES. Révisé encore le même jour (décision de l'utilisateur) : une FORMATION compte
  TOUJOURS comme du travail, même de deux semaines, jamais neutre (case du motif « Compte comme
  du travail pour le rythme », `rythme_travail`) ; au milieu d'un congé, elle ne coupe pas
  l'absence et n'y compte pas (« 4 jours de congé, 2 de formation, 4 de congé » : le congé reste
  une absence longue, neutre). Avant tout le reste pour le calcul (une place reste vide plutôt ; quand des faits la
  rendent impossible, le moins de fautes possible, jamais une semaine vide), y compris sur la
  semaine suivante esquissée ; jamais sur un jour posé ;
  une semaine type à deux repos fixes ou plus décide seule. Alerte RYTHME-5-2 (« règle de
  l'hôtel »), qui bloque une place comme les deux repos de suite. Réglable : « Rythme 5 jours puis
  2 jours strict » (oui par défaut). Une seule définition, `rythmeStrict.ts`.
- **Mesuré.** Banc de décembre (copie locale, en mémoire, 3 graines) : places à pourvoir 9 →
  13-14, repos seuls 5 → 0, blocs hors 5 et 2 de 18-22 à 4 (3 contre des shifts validés ou la
  semaine d'avant), heures dues manquantes 43 → 16 h, aucune infraction, au plus 4 s par semaine.
  Après la révision (même banc) : places à pourvoir 13-14 → 12, plus aucun bloc de 7 ou 9 jours
  avant une semaine de CFA, blocs hors 5 et 2 10 → 8 (tous dus à des faits), heures dues
  manquantes 8 → 29-36 h (deux apprentis hors du rythme après une semaine validée), aucune
  infraction, 12,2 s au pire par semaine.
- **Correctif du 2026-11-09 (signalement utilisateur).** Un jour posé (shift validé) faisait
  SAUTER tout motif qui le contenait : une apprentie, après une semaine d'école et un lundi
  validé, recevait « 3 jours, 2 repos, 2 jours » puis « 3 jours, 4 repos », sans que la faute
  coûte rien. Un jour posé compte désormais comme du travail connu, comme l'école ; il n'est
  jamais retiré, la faute se paie sur les autres jours. Banc : blocs hors 5 et 2 8 → 3 (contre
  les propositions anciennes de la semaine d'après), places à pourvoir 12-13 → 11.
- **Statut.** EN PLACE (local, non livré) le 2026-11-09.

#### 21. Un apprenti ou un stagiaire jamais sans un salarié confirmé

- **Pourquoi.** Décision de l'utilisateur, 2026-11-09 : « imagine un hôtel où tout le personnel
  sur le poste sont des apprentis, pas ouf niveau responsabilité. Donc toujours avec un CDI ou
  CDD hôtelier normal, et pareil pour les stagiaires. » Décembre généré montrait un mercredi
  matin tenu par un apprenti et deux stagiaires de 07:30 à 15:15, les CDI n'arrivant qu'à 14:30.
- **Comment.** Case du type de contrat « Jamais sans un salarié confirmé » (Stagiaire et
  Apprenti). Une personne dont le contrat a la case, quel que soit son niveau (titulaire compris)
  et quel que soit leur nombre, n'est jamais sur son poste sans, à tout moment de son shift, une
  personne titulaire ou en dépannage dont le contrat n'a pas la case, sur un poste de la même
  ZONE (décision de l'utilisateur du même jour : « peu importe sur le poste, mais il faut du
  monde… je ne veux pas de poste en dur » ; aujourd'hui, Réception et Club dans la zone
  Accueil), ou sur le même poste quand il n'a pas de zone. Son niveau se lit sur le poste
  qu'elle tient. La définition du soutien jamais seul étendue à toute la durée du shift
  (`morceaux`, `accompagnement` dans `zones.ts`). Le SOUTIEN jamais seul suit la même exigence
  depuis le même jour (décision de l'utilisateur) : une personne autonome là pendant tout son
  shift, dans la zone de son poste ou, sans zone, sur le poste (avant : un simple chevauchement,
  ou la même place pour un besoin). Une fonction pour les deux (`minutesSeul`). DUR pour le calcul (la place reste vide plutôt), jamais sur un shift posé ;
  alerte ACCOMPAGNE-SEUL sur un shift posé à la main ; raison d'une place vide ; « À vérifier »
  pour un poste sans aucun salarié confirmé.
- **Mesuré.** Banc de décembre (copie locale, en mémoire, horizon, 3 graines) : quarts d'heure
  sans salarié confirmé 548 à 664 → 4 (un shift validé), places à pourvoir 11 → 28
  (les mercredis et jeudis matin, où seuls des apprentis et des stagiaires sont libres), heures
  dues manquantes 29 → 29, aucune infraction, 38,7 s au pire par semaine. Par zone : rien ne
  bouge (28 places, 29 h, 4 quarts d'heure) ; ces matins-là, aucun salarié confirmé de la zone
  n'est libre, sur aucun poste.
- **Statut.** EN PLACE (local, non livré) le 2026-11-09, par zone le même jour.

#### 22. Changer ses jours de repos, une fois, si c'est vraiment utile

- **Pourquoi.** Décision de l'utilisateur, 2026-11-09 : « oui, mais vraiment si utile ». Au
  rythme 5 et 2, 5 + 2 = 7 : des repos posés le mercredi le restent toute l'année. Sur la copie
  de décembre, trois salariés confirmés du matin avaient leur repos le mercredi : aucun mercredi
  matin tenable, les apprentis et stagiaires (règle 21) renvoyés le soir (0 le matin, 4 ou 5 le
  soir), 28 places à pourvoir.
- **Comment.** Une TRANSITION décale les repos d'un jour : 3 repos de suite une fois (ils
  reculent) ou un bloc de 4 jours une fois (ils avancent) (`estTransition`, `rythmeStrict.ts`).
  Elle coûte 1,5 place du palier le plus haut (`PLACES_PAR_TRANSITION`, `prixOrdre`) : elle ne se
  fait que si elle remplit plus d'une place et demie qui resterait vide. Sous les heures dues :
  celle qui garde 5 jours dans la semaine (le bloc de 4) passe devant celle qui en retire un. Une
  seule par personne sur 4 semaines (`FENETRE_TRANSITION`, `transitionsRecentes` lu sur les
  semaines d'avant), la suivante au prix fort. Dite « changement de jours de repos »
  (RYTHME-TRANSITION), jamais bloquante ; un repos obligé ne naît jamais d'une transition.
- **Mesuré.** Banc de décembre (copie locale, en mémoire, « Compléter le mois », horizon, 3
  graines, mêmes résultats aux trois) : places à pourvoir 28 → 12 (les 12 restantes : plus
  personne n'a d'heures, raison HEURES-FAITES), mercredis matin 0 sur 3 → 3 sur 3 et jeudis 1 sur
  3 → 3 sur 3, soirs de ces jours 3 à 5 pour 2 → 2 pour 2. Deux transitions : le salarié confirmé
  aux repos mardi-mercredi passe au lundi-mardi par un bloc de 4 jours (du jeudi 3 au dimanche
  6 décembre), sans perdre une heure ; une apprentie, avant sa semaine de CFA. Repos de 4 jours
  ou plus 1 → 0, aucune infraction, 28,6 → 8,4 s au pire par semaine.
- **Heures dues qui manquent encore (22 h, contre 29).** (1) Un CDI dont le contrat finit le
  lundi 30/11 : ce lundi est un repos VALIDÉ, ses 8 h dues ne peuvent pas être faites (un repos
  sans décompte ne les retire pas). (2) Une apprentie, 14 h la semaine du 7/12 (21 avant) : sa
  semaine du 23/11, validée, met ses repos au mercredi-jeudi, et sa semaine de CFA du 14/12 (du
  lundi au vendredi) exige les repos au samedi-dimanche d'avant ; passer de l'un à l'autre en
  deux semaines demanderait trois transitions. Avec une seule, le calcul fait un bloc de 4 jours
  et un bloc de 2 (une faute au prix fort) plutôt que 4 repos ou un repos seul de plus.
- **Statut.** EN PLACE (local, non livré) le 2026-11-09.

#### 23. Jamais du monde en trop sur un moment pendant qu'un autre manque

- **Pourquoi.** Décision de l'utilisateur, 2026-11-09 : « les moments où tu places quatre
  personnes le soir alors que personne le matin, c'est non ».
- **Comment.** Dans une zone, un jour : une personne au-dessus du chiffre d'un moment pendant
  qu'un autre moment est sous son minimum coûte une place (`equilibreMoments`, une variable 0/1
  par paire de moments ; aucun nom de moment ni de zone, les chiffres du tableau). Un horaire qui
  compte dans les deux moments n'est pas « en trop ». Sous les heures dues : une personne qui n'a
  pas d'autre moment pour ses heures vient quand même, et la page le dit en clair (« Mercredi 9 :
  0 le matin, 4 le soir à l'Accueil », `desequilibres`, `phraseDesequilibre`).
- **Mesuré.** Banc de décembre (3 graines) : jours où un moment manque pendant qu'un autre est
  en trop, 4 → 0 (tous des mercredis : 0 le matin, 3 à 5 le soir).
- **Statut.** EN PLACE (local, non livré) le 2026-11-09.

### Tableau récapitulatif

| N°  | Règle                                | Statut                       | Où                                                                                   |
| --- | ------------------------------------ | ---------------------------- | ------------------------------------------------------------------------------------ |
| 1   | Deux repos qui se suivent            | en place                     | `POIDS_REPOS_SEPARES`, `placerRepos`, alerte REPOS-SEPARES                           |
| 2   | 5 jours d'affilée au plus (35 h +)   | DUR (35 h et plus)           | `JOURS_AFFILES_CONSEILLES`, `rythmeHumain`, alerte JOURS-AFFILES                     |
| 3   | 12 h entre deux services             | en place                     | `REPOS_CONFORT`, `POIDS_REPOS_COURT`, alerte REPOS-COURT                             |
| 4   | Un week-end libre par mois           | en place, partage d'abord    | `weekendLibreAvant`, `weekendLibere`, `POIDS_WEEKEND_LIBRE`, WEEKEND-LIBRE / -LIBERE |
| 5   | Repos posé ou validé sacré           | en place                     | `reposFixes`, `epinglee`, `planning_valider_avec_repos`                              |
| 6   | Semaine stable                       | en place                     | `CHANGEMENTS_MOMENT_MAX`, `POIDS_MOMENT_EN_TROP`, `POIDS_MOMENT_ARRIERE`, MOMENTS    |
| 7   | Nuits avec mesure                    | en place                     | `NUITS_AFFILEES_MAX`, `REPOS_APRES_NUITS`, `POIDS_NUIT_AFFILEE`, alerte NUITS        |
| 8   | Mêmes repos d'une semaine à l'autre  | en place (préférence)        | `reposAvant`, `weekendTravailleAvant`, `POIDS_MEMES_REPOS`, MEMES-REPOS              |
| 9   | Pas de jour isolé                    | DUR (35 h et plus)           | `rythmeHumain`, `POIDS_DIMANCHE_SEUL`, alerte JOUR-ISOLE                             |
| 10  | Moments pénibles partagés            | en place (sauf nuits)        | `SEMAINES_EQUITE`, `POIDS_EQUITE`, `equiteDe`                                        |
| 11  | Jours de fête partagés               | reportée                     | (un an d'historique manque)                                                          |
| 12  | Heures en plus partagées             | en place                     | `coefsHeuresPlus`, `POIDS_EQUITE_HEURES_PLUS`, alerte HEURES-PLUS                    |
| 13  | Retour de congé en douceur           | en place                     | `CONGE_LONG`, `retourConge`, `POIDS_RETOUR_*`, alerte RETOUR-CONGE                   |
| 14  | École des apprentis protégée         | en place                     | `ECOLE_VEILLE_FIN`, `ECOLE_LENDEMAIN_DEBUT`, `POIDS_ECOLE_ABORDS`, ECOLE-ABORDS      |
| 15  | Planning qui se tient                | en place                     | `imposees`, PL423, PL409, `raisonsPlaces.ts`                                         |
| 16  | Jour férié rattrapé (JFR)            | en place (local, non livré)  | `feries.ts`, `droitAuRattrapage`, `POIDS_JFR_EN_ATTENTE`, alerte JOUR-FERIE          |
| 17  | Équipe ensemble (soir, relève)       | en place (local, non livré)  | `equipesSynchro`, `EQUIPE_TOLERANCE`, `POIDS_RELEVE_CHACUN`, `equipesDesynchro`      |
| 18  | Journées de 7 h / 8 h (35 h, 39 h)   | DUR (35 h et 39 h)           | `journeesDuCalcul`, `etoileSacrifiee`, `journeeDe`, JOURNEE-TYPE, HEURES-FAITES      |
| 19  | Middle coup de main, matin ensemble  | en place (local, non livré)  | `moment.ts`, `momentsAccueil`, `momentLibre`, `coutArriveeMatin`, `POIDS_SEUL_QUART` |
| 20  | 5 jours puis 2 repos, strict         | DUR (35 h et plus, réglable) | `rythmeStrict.ts`, `rythmeStrictModele`, `prixOrdre`, alerte RYTHME-5-2              |
| 21  | Jamais sans un salarié confirmé      | DUR (case du contrat)        | `accompagne`, `confirmeSur`, `morceaux`, alerte ACCOMPAGNE-SEUL                      |
| 22  | Changer ses repos, si vraiment utile | 1,5 place, 1 sur 4 semaines  | `estTransition`, `prixOrdre`, `transitionsRecentes`, alerte RYTHME-TRANSITION        |
| 23  | Matin et soir équilibrés             | une place (sous les heures)  | `equilibreMoments`, `desequilibres`, `phraseDesequilibre`                            |

Le code des règles 1, 3, 4, 6, 7, 8, 12, 13 et 14 date du 2026-11-02 : en place en local, pas
encore livré. Relecture du 2026-11-03 (banc de 7 scénarios réels, en mémoire) : règles 1, 4, 8, 9,
13 et 16 corrigées comme écrit dans leurs statuts ; lecture des semaines d'avant testée
(`historique.test.ts`). Tests : `reglesMorales.test.ts` (pour chaque règle, un cas où le calcul l'évite et un
cas où il ne peut pas faire autrement, avec l'alerte ; chaque poids vérifié par mutation).

---

## 5. Jours fériés et jour férié rattrapé (JFR)

### 5.1 La règle de l'hôtel

Décision de l'utilisateur, le 2026-11-02 :

- Pendant la **première année** du contrat, aucun jour férié n'ouvre de droit.
- Après cette première année, **chaque jour férié travaillé est un jour récupéré**.
- Ce jour récupéré est un statut nouveau : **Jour férié rattrapé**, code **JFR**.
- Le JFR se prend **dans les jours ou les semaines qui suivent** le jour férié.
- **Date d'entrée inconnue** : on part du principe que la personne est là depuis moins d'un an.
  Pas de JFR.

À ne pas confondre avec le motif **JF** (jour férié chômé), qui existe déjà : JF marque un jour
férié où la personne ne travaille pas ; JFR marque le jour rendu plus tard.

### 5.2 Les jours fériés

Les 11 jours fériés français, calculés dans l'app (module pur `src/lib/planning/feries.ts`,
`joursFeries(annee)`, `ferieDe(date)` qui rend le nom ou rien) :

| Jour               | Date              |
| ------------------ | ----------------- |
| Jour de l'An       | 1er janvier       |
| Lundi de Pâques    | Pâques + 1 jour   |
| Fête du Travail    | 1er mai           |
| Victoire 1945      | 8 mai             |
| Ascension          | Pâques + 39 jours |
| Lundi de Pentecôte | Pâques + 50 jours |
| Fête nationale     | 14 juillet        |
| Assomption         | 15 août           |
| Toussaint          | 1er novembre      |
| Armistice          | 11 novembre       |
| Noël               | 25 décembre       |

Pâques est calculé par l'algorithme de Meeus et Butcher. Repères : Pâques 2026 tombe le 5 avril
(lundi de Pâques 6 avril, Ascension 14 mai, lundi de Pentecôte 25 mai). Pâques 2027 tombe le
28 mars (lundi 29 mars, Ascension 6 mai, lundi de Pentecôte 17 mai).

### 5.3 Qui a droit

Le jour férié F ouvre droit à un JFR pour une personne si TOUT est vrai :

1. sa date d'entrée est connue ;
2. F tombe au moins un an après sa date d'entrée (date d'entrée + 1 an, ce jour compris) ;
3. son contrat n'est ni extra ni stagiaire ;
4. elle a un shift ce jour-là, proposé ou validé.

Un jour férié tombé sur un repos, une absence ou l'école n'ouvre pas de droit (voir Q3).

### 5.4 Le solde et la fenêtre

Pour la semaine calculée, qui commence le lundi L :

- on retient les jours fériés F entre L moins 28 jours et L plus 6 jours, qui ouvrent droit, dont
  le shift est déjà en base, et qui précèdent le jour où l'on propose le JFR ;
- chaque JFR déjà posé pour la personne rattrape UN jour férié d'avant lui, le plus ancien
  d'abord, et ne sert qu'une fois. Les jours fériés des 28 jours d'avant la fenêtre (de L moins
  56 jours à L moins 28 jours) prennent leurs JFR en premier : sans cela, le JFR d'un jour férié
  sorti de la fenêtre serait compté pour le suivant (cas du 1er puis du 11 novembre) ;
- s'il reste au moins un jour : **un JFR à proposer cette semaine, un au plus**.

À la génération, un jour férié de la semaine calculée ne compte que si son shift reste : validé
(hors Tout recalculer, qui retire aussi les shifts validés à venir) ou jour passé. Un shift
seulement proposé ce jour-là va être recalculé : le JFR vient alors la semaine suivante.

Tant que le jour férié n'est pas rattrapé, une alerte "Jour férié du jj/mm travaillé : à
rattraper" s'affiche dans le bilan de la personne, et le calcul propose son JFR chaque semaine.
Elle est de nature organisation, jamais bloquante. **Il reste dû jusqu'à ce qu'il soit rendu**
(décision utilisateur du 2026-11-03, Q9 et Q14). Borne : la fenêtre `FERIE_RATTRAPAGE_JOURS` vaut
désormais 91 jours (13 semaines) ; les vues lisent donc 26 semaines en arrière (`premierLundiLu`),
par pages de 1 000 lignes (`toutLire`, `service.ts` : l'API tronquait sans erreur au-delà). Un jour
férié qui ne trouve pas sa place en 13 semaines sort de la lecture : c'est la seule limite qui
reste.

**La direction au forfait jours** (décision utilisateur du 2026-11-03) : un cadre au forfait jours
seul titulaire de son poste reçoit son JFR AVANT le calcul (`jfrDesCadresSeuls`), le premier jour
permis collé à un jour sans travail ; ce jour-là il est absent, donc sa place n'existe pas
(`sansSonCadre`). Laissé au solveur, il ne le prenait jamais : sa place vide coûtait plus que le
rattrapage.

### 5.5 Ce que fait le calcul

- Le JFR se pose sur un jour où la personne pourrait être absente : pas déjà absente, pas d'école,
  sous contrat, ni un repos fixe de la semaine type, ni le jour de sa journée étoile fixée, après le
  jour férié qui l'ouvre. **Un jour Travaille de la semaine type est permis** (décision de
  l'assistant du 2026-11-03) : un JFR rend justement un jour qu'on aurait travaillé. Un jour libre
  de la fiche passe d'abord (le jour habituel garde sa prime, `POIDS_JOUR_FIXE`). L'horaire fixé de
  ce jour, posé en proposition à l'ouverture de la semaine, est recalculé par Compléter comme toute
  proposition. Le jour de l'étoile est écarté parce
  qu'un JFR ce jour-là changerait ce qu'il retire aux heures dues (8 h ailleurs, 7 h ce jour-là
  pour un 39 h) : calcul et bilan ne seraient plus d'accord.
- Il vaut une **absence décomptée** : une journée de contrat (`journeeContrat`). Les heures dues
  baissent d'autant, et le rythme de 5 jours aussi (4 jours de travail attendus).
- Ne pas le prendre coûte `POIDS_JFR_EN_ATTENTE` (20 000). C'est au-dessus du 6e jour
  (15 000), sous les heures dues, les places et le jour manquant. Une place vide passe donc avant
  le JFR : le JFR attend la semaine suivante.
- Préférence légère pour un jour collé aux repos (prolonger un repos plutôt que couper une
  semaine).
- Le JFR est écrit comme une **absence proposée** (`planning_absences.epinglee = false`, motif
  JFR), comme un repos proposé : il part avec les propositions (nouvelle génération, Effacer), et
  se confirme avec Valider.

### 5.6 Ce que montre l'écran

- Un JFR proposé s'affiche comme les autres absences, à la couleur de son motif, en pointillés.
- L'en-tête d'un jour férié, vue mois et vue semaine, porte une mention discrète "Férié", avec
  le nom du jour en infobulle.
- Bilan : "Jour férié du jj/mm travaillé : à rattraper" tant que le JFR n'est pas pris. Rien
  pour une personne sans droit.

### 5.7 Exemples

1. **Droit ouvert.** Entrée le 1er mars 2025. Elle travaille le mercredi 11 novembre 2026. Plus
   d'un an : droit. Si son shift du 11 novembre est validé (ou le jour passé), le calcul de la
   semaine du 9 novembre peut placer le JFR jeudi, vendredi, samedi ou dimanche, de préférence
   contre ses repos. Si ce shift n'est que proposé, il est recalculé : le JFR vient la semaine du
   16 novembre. S'il ne peut pas (place vide), il le
   propose la semaine du 16 novembre, et ainsi de suite jusqu'à la semaine du 7 décembre.
2. **Première année.** Entrée le 15 janvier 2026, elle travaille le 11 novembre 2026. Moins d'un
   an : pas de JFR.
3. **Un an pile.** Entrée le 11 novembre 2025, elle travaille le 11 novembre 2026 : droit (le jour
   anniversaire compte).
4. **Date vide.** Fiche sans date d'entrée : pas de JFR, aucune alerte.
5. **Extra ou stagiaire.** Jamais de JFR. Un stagiaire a tous ses jours fériés (décision
   utilisateur du 2026-11-02, en attendant une règle plus fine) : il n'est jamais placé un jour
   férié, la case montre Jour férié (motif JF, ajouté au calcul sans être écrit en base,
   `avecFeriesStagiaires`), et une journée de contrat de moins est due dans sa semaine.
   **Mineur.** Le calcul évite de le placer un jour férié (`POIDS_MINEUR_FERIE`, au-dessus du
   confort et du 6e jour, sous les contrats et les places) ; s'il y travaille, l'alerte
   MINEUR-FERIE le signale. Après un an, il a droit au JFR comme les autres.
6. **Heures.** Un 35 h qui prend un JFR doit 28 h cette semaine (4 jours de 7 h). Un 39 h doit
   32 h (31 h si sa journée étoile est fixée sur un jour qui reste).
7. **Deux jours fériés proches.** Travaillés le vendredi 1er mai et le vendredi 8 mai 2026 : deux
   JFR, un par semaine au plus. Le premier peut tomber la semaine du 4 mai, le second la semaine du
   11 mai.
8. **En retard.** Un 14 juillet travaillé, JFR pas pris au bout de 4 semaines : il reste dû,
   l'alerte reste, le calcul le propose chaque semaine (jusqu'à 13 semaines lues).
9. **Un JFR pour deux jours fériés ?** Travaillés le 1er et le 11 novembre 2026, un seul JFR posé
   le 12 novembre. Il rattrape le 1er. Le 11 reste à rattraper, même vu depuis la semaine du
   30 novembre où le 1er est sorti de la fenêtre.

---

## 6. Repos, congés et absences

### 6.1 Deux repos par semaine, toujours

Chaque semaine compte deux repos, même en congé (décision du 2026-11-02). Les congés se comptent
en jours ouvrés : 5 par semaine. Trois semaines d'arrêt, ce sont donc 2 repos par semaine et
5 jours de congé, pas 7.

Placement des repos déduits (`placerRepos`, `semaine.ts`), de la règle la plus forte à la plus
faible :

1. un jour libre avant un jour de congé : un congé ne devient repos que s'il n'y a pas assez de
   jours libres ;
2. les repos se suivent ;
3. jamais un jour de travail isolé ;
4. s'il y a un congé, les repos se collent au bloc d'absence ;
5. à égalité, le plus tard dans la semaine (samedi et dimanche).

Un jour de congé en trop (plus de 5 dans la semaine) peut devenir un repos : l'écran y montre
Repos, Valider l'écrit à la place du congé.

**Congés et repos fixes (décision du 2026-11-09)** : « tu ne devrais pas pouvoir poser des jours de
vacances sur des jours de repos fixes ; tu peux le faire, mais c'est ignoré et remplacé par les
jours de repos classiques ».

- **R1.** Une absence décomptée (congé, maladie, formation, jour férié, JFR) posée un jour « Repos »
  de la semaine type est ignorée : le jour reste un repos fixe (heures dues, jours pris, rythme,
  écran). La saisie d'une plage (fiche, clic droit, volet) saute ces jours et le dit : « Les
  vendredis et samedis sont ses repos : ils restent des repos. » Une absence déjà enregistrée est
  relue puis ignorée, jamais effacée. L'école, un motif sans décompte et un repos posé ne sont pas
  concernés. `absenceIgnoree`, `joursSautesReposFixes` (`semaine.ts`).
- **R2.** Sans repos fixes, au plus `7 - 2 repos dus` jours d'absence décomptée par semaine civile
  (moins les jours hors contrat) ; les jours en trop sont des repos proposés, placés par
  `placerRepos`, validables. Avec un seul repos fixe : il compte dans les 2, R2 en ajoute un.
  Pour le rythme, ces repos ne comptent qu'une fois validés. `reposDusSemaine`,
  `absencesDecompteesMax`.
- **Statut.** EN PLACE. Cas réel (veilleur 39 h, repos fixes vendredi et samedi, congé du dimanche
  au samedi) : 4 congés et 8 h dues au lieu de 6 congés et rien, la nuit du dimanche posée puis
  5 nuits.

Un repos déduit n'est posé que sur une semaine remplie (générée ou faite à la main), ou quand les
heures sont couvertes, ou quand 5 jours sont pris. Jamais pour un extra. Pour un apprenti ou un
stagiaire, seulement sur une semaine remplie.

### 6.2 Trois sortes de repos

| Sorte  | Origine                   | Affichage                    | Peut partir ?                                |
| ------ | ------------------------- | ---------------------------- | -------------------------------------------- |
| Fixe   | Semaine type de la fiche. | Repos, toujours validé.      | Non.                                         |
| Déduit | Calculé (`reposDeduits`). | Pointillés, proposition.     | Oui, avec les propositions. Valider l'écrit. |
| Posé   | Motif R à une date.       | Comme un repos fixe, validé. | Seulement à la main.                         |

Repos exceptionnel reste une absence, pas un repos.

### 6.3 Absences

- Une absence se pose jour par jour (une ligne par jour).
- Un jour d'absence retire le shift du jour.
- Une absence décomptée (congé, maladie, formation, JFR...) vaut une journée de contrat : les
  heures dues baissent.
- Le motif R (repos) ne retire aucune heure due.
- L'école (motif de nature école) compte comme une journée de travail, jamais comme un repos.

### 6.4 Continuité

- Les repos, les 6 jours d'affilée, les 3 repos sur deux semaines et le repos de 11 h se lisent
  avec les semaines voisines déjà faites.
- Le repos de 35 h se lit avec la semaine d'avant-avant (`avantAvant`). Non chargée : borne
  prudente.

---

## 7. Contrats et heures

### 7.1 Heures dues

`heuresDues` (`regles.ts`) est la seule source :

- sans absence : le contrat ;
- avec absences ou école : une journée de contrat par jour qui reste, sur 5 jours ;
- école et absences sur les 5 jours : rien de dû.

Exemples : 35 h et un congé, 28 h ; 39 h et deux jours d'école, 24 h (23 h si la journée étoile
tombe sur un jour qui reste).

### 7.2 Journée étoile

Au-delà de 35 h (39 h par exemple), une seule journée courte par semaine : 4 jours de 8 h et un
jour de 7 h. La journée étoile se fait sur un vrai horaire d'au moins 7 h et de moins de 8 h
(`JOURNEE_ETOILE_MIN`, `etoile.ts`). Jamais pour un forfait jours ni un extra.

### 7.3 Par type de contrat

| Contrat       | Ce qu'il faut savoir                                                                                                                                                                                             |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CDI, CDD      | Rythme de 5 jours dès 35 h. CDD : fin de contrat obligatoire.                                                                                                                                                    |
| Temps partiel | Heures en plus : 1/3 du contrat au plus, total sous 35 h.                                                                                                                                                        |
| Forfait jours | Pas d'heures comptées, 13 h d'amplitude, 5 jours. Poste tenu par lui seul (la Direction) : pas de place les jours où il est absent (`sansSonCadre`).                                                             |
| Apprenti      | Fin de contrat obligatoire. École jour par jour, journée complète. Ligne vide hors école tant que la semaine n'est pas remplie. Soutien : jamais seul sur son poste. Jamais sans un salarié confirmé (règle 21). |
| Stagiaire     | 10 h par jour au plus. Fin obligatoire. Soutien. Pas de JFR. Jamais sans un salarié confirmé (règle 21).                                                                                                         |
| Extra         | Jamais de fin, interrupteur Actif. Placé seulement sur l'accueil, en dernier avant une place vide (`coutExtra`). Jamais de repos déduit. Pas de JFR.                                                             |
| Mineur        | 8 h par jour, 35 h, 12 h de repos, 2 repos qui se suivent, aucune nuit.                                                                                                                                          |

### 7.4 Début et fin de contrat

Les jours hors contrat ne comptent pas. Le rythme de 5 jours se compte sur les jours de présence :
un départ un jeudi laisse 4 jours attendus (décision du 2026-11-02).

Le premier jour du contrat est travaillé (demande d'une responsable du 2026-11-04 : « mes
stagiaires commencent leur stage par deux jours de repos »). La semaine où le contrat commence, le
premier jour sur place (le jour d'entrée, ou le suivant s'il est pris par une absence, l'école ou un
repos fixe) reçoit une prime, `POIDS_PREMIER_JOUR` (10 000) : au-dessus des repos accolés et du jour
isolé, sous la fatigue et les heures. Elle ne fait que déplacer un repos. Pas de prime en dépannage.

---

## 8. Ce que le calcul ne fait jamais

1. Enfreindre la loi (partie 3). Seul un shift validé peut le faire, et il est signalé.
2. Toucher une semaine verrouillée ou passée.
3. Déplacer, changer ou retirer un shift validé, un repos fixe, posé ou validé, une absence posée.
4. Poser un shift sur un jour d'école, d'absence ou hors contrat.
5. Poser un horaire qui ne fait pas partie de ceux de la personne (`codesPermis`).
6. Mettre un apprenti ou un stagiaire seul sur son poste.
7. Placer un extra ailleurs que sur l'accueil.
8. Raccourcir le repos de 11 h, ou dépasser 6 jours d'affilée.
9. Mettre une personne en plus du chiffre d'un moment pour son confort.
10. Inventer une place à la Direction quand la directrice est absente.
11. Écrire quoi que ce soit sans que la personne qui fait le planning clique Valider : le calcul
    propose, l'humain décide.

---

## 9. Alertes et responsabilités

### 9.1 Deux natures d'alerte

- **Loi** : une règle légale n'est pas tenue. À corriger avant de publier.
- **Organisation** : une règle de l'hôtel ou une règle morale n'est pas tenue. À regarder, à
  assumer, ou à corriger.

Exemples d'alertes en place (`verificateur.ts`) : R-REPOS-QUOTIDIEN, R-SIX-JOURS-MAX,
R-REPOS-HEBDO-35H, R-SEMAINE-MAX, R-JOUR-MAX, R-NUIT-MINEUR (loi) ; JOURS-AFFILES, SIXIEME-JOUR,
R-REPOS-HEBDO-HCR sur deux semaines, REPOS-FIXE, ABSENCE, HORS-CONTRAT, HORAIRE-PERSO,
SOUTIEN-SEUL, ACCUEIL-MANQUE, ACCUEIL-SURPLUS (organisation).

Alertes des règles morales (2026-11-02, `alertesMorales`, liste `REGLES_MORALES`), toujours
d'organisation : REPOS-SEPARES (1), REPOS-COURT (3), WEEKEND-LIBRE (4), MOMENTS (6), NUITS (7),
MEMES-REPOS (8), HEURES-PLUS (12), RETOUR-CONGE (13), ECOLE-ABORDS (14). Sur une place à pourvoir,
elles apparaissent comme "à éviter" pour la personne, jamais comme ce qui bloque
(`raisonsPlaces.ts`, `raisonCommune`).

### 9.2 Ce que doit faire la personne qui fait le planning

1. **Remplir les fiches.** Contrat, heures, date d'entrée (sans elle, pas de JFR), fin de contrat,
   semaine type, école, postes. Le panneau À vérifier dit ce qui manque.
2. **Poser les absences et les repos promis avant de calculer.** Ce qui est posé est respecté.
3. **Lire chaque alerte.** Une alerte n'est pas une erreur du calcul : c'est une information.
   Corriger, ou assumer en connaissance de cause.
4. **Valider.** Une semaine non validée peut tout changer au prochain calcul.
5. **Prévenir.** Une semaine validée qui doit changer se discute avec la personne concernée.
6. **Regarder la justice sur le mois**, pas seulement la semaine : week-ends, soirs, nuits,
   heures en plus.
7. **Ne jamais contourner une règle à la main sans raison.** L'app permet certaines entorses : ce
   n'est pas une invitation.

---

## 10. Questions ouvertes

À trancher par l'utilisateur. Rien n'est codé sur ces points tant qu'il ne l'a pas dit.

- **Q1. Heures dues ou règles morales ?** FERMÉE, confirmée par l'utilisateur le 2026-11-03 : la
  loi, les besoins de la page Besoins, les heures dues, puis les règles morales, puis le confort.
  « S'il n'y a pas le choix, il faut faire au mieux, le meilleur compromis. » Voir partie 2.
- **Q2. Jours fériés de la convention.** La convention HCR (avenant n° 6, selon le prototype)
  prévoit, après un an, 10 jours fériés en plus du 1er mai, dont 6 garantis compensés même s'ils
  tombent un jour de repos. Notre règle ne compense que le jour travaillé. Faut-il compenser aussi
  un férié garanti tombé sur un repos ?
- **Q3. Férié sur un repos ou une absence.** Confirmer : pas de JFR.
- **Q4. 1er mai.** La loi le paie double s'il est travaillé (L3133-6, selon le prototype). Un JFR
  en plus, ou le paiement seulement ?
- **Q5. Mineurs les jours fériés.** Décidé le 2026-11-02 : évités par le calcul et signalés
  (MINEUR-FERIE), pas interdits. Reste à confirmer avec la règle exacte de la convention.
- **Q5 bis. Stagiaires.** Tous leurs jours fériés, provisoirement. Règle exacte à donner.
- **Q6. Jours de fête de la règle 11.** Lesquels : 24 et 25 décembre, 31 décembre et 1er janvier ?
  D'autres ?
- **Q7. École (règle 14).** FERMÉE : après 21:00 la veille, avant 08:00 le lendemain, gardés par
  l'utilisateur le 2026-11-03.
- **Q8. Seuil de la règle 3.** FERMÉE le 2026-11-03 : 12 h (décision de l'utilisateur ; 13 h
  avant).
- **Q9. Fenêtre du JFR.** FERMÉE le 2026-11-03 : il reste dû, avec une alerte, jusqu'à ce qu'il
  soit rendu ; proposé chaque semaine. Limite technique : 13 semaines lues (partie 5).
- **Q10. Saisonniers.** La convention parle de 9 mois d'ancienneté pour les saisonniers. Y en
  a-t-il ?
- **Q11. Temps partiel et JFR.** Un JFR vaut une journée de contrat, comme un congé. Confirmer pour
  un contrat de moins de 5 jours par semaine.
- **Q12. Préférences personnelles.** FERMÉE le 2026-11-03 : pas de case. La semaine type suffit
  pour dire qui veut travailler le week-end ; elle ne retire pas le week-end libre sur 4 (règle 4,
  partage d'abord).
- **Q13. Ordre des nouvelles règles.** SANS OBJET : toutes faites le 2026-11-02 sauf la règle 11
  (reportée), dans l'ordre des poids de la partie 2.1.
- **Q14. Alerte du JFR au-delà de 4 semaines.** FERMÉE le 2026-11-03 avec Q9 : l'alerte reste
  tant que le JFR n'est pas rendu (13 semaines lues). La direction au forfait jours le reçoit aussi
  (partie 5).
- **Q15. Une nuit qui commence à minuit, le week-end ?** FERMÉE le 2026-11-03 : la nuit du dimanche
  au lundi rend le week-end travaillé (règle 4).
- **Q16. L'équité pour les personnes seules sur leur poste et les apprentis.** FERMÉE le
  2026-11-03 : tout l'accueil ensemble, apprentis compris, chacun selon son contrat (règle 10). La
  Veille de nuit garde son groupe.
- **Q17. Un extra pour un week-end libre ?** FERMÉE le 2026-11-03 : non. « Tu n'attribues pas des
  week-ends à quelqu'un en ajoutant des extras pour la justice de répartition. On évite de prendre
  des extras au possible parce que ça coûte de l'argent. Mais s'il n'y a pas le choix (vrai manque
  de personnel), c'est autre chose. » Voir partie 2 (`partMoraleExtra`).
- **Le veilleur** (relevé par le banc, décision utilisateur du 2026-11-03) : il fait toutes les
  nuits de la semaine parce que sa semaine type le fixe. On garde ainsi ; la règle 7 (5 nuits puis
  2 jours) reste tenue.
- **Temps de calcul** (décision utilisateur du 2026-11-03) : 60 s au plus par semaine (40 s
  avant).

Banc du 2026-11-03 (9 scénarios réels hors dépôt, dont 2 en sous-effectif : 3 puis 4 départs
de l'accueil simulés en mémoire) : 0 infraction, 0 place vide (2 de moins qu'avant sur le
scénario du veilleur en congé), week-ends vraiment libres +3 à +6 par scénario, personnes sans
week-end libre sur 4 semaines 9 → 6 à 8, soirs des deux apprentis rééquilibrés (27 et 9 → 13 et 12) ; en sous-effectif, places tenues, aucun extra à 3 départs, 14 shifts d'extra à 4 départs,
mais des 6e jours et des semaines de 47 h pour 3 personnes ; 4 semaines sur 81 au plafond de
60 s ; repos qui changent d'une semaine à l'autre en hausse (41 → 48 sur le scénario de base).
