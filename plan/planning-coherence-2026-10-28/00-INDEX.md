# Plan — Planning : des réglages cohérents, simples, qui s'attribuent tout seuls

Date : 2026-10-28. Demande utilisateur : « créer un plan d'action pour corriger
tout ça et appliquer des vraies logiques de logiciels de RH tout en faisant en
sorte que la complexité soit limitée… configurable, mais pas débilement dur à
comprendre… je ne vois pas d'inconvénient à s'embêter à bien configurer les
choses pour que ensuite ça se fasse tout seul. »

> **EN ATTENTE DU GO.** Décisions D1 à D19 tranchées par l'utilisateur le
> 2026-10-29 (questionnaire), voir [D-decisions.md](./D-decisions.md) parties B et C. Tout en local, commit
> par `pnpm commit`, aucun push sans demande.

---

## Contexte

L'audit du 2026-10-28 (4 agents + vérifications) a montré un moteur solide sur
le droit, mais des réglages qui forment une chaîne sans liens visibles : la même
règle se règle à cinq endroits, plusieurs choix agissent en silence, deux textes
promettent plus que le moteur ne fait, et rien n'indique l'ordre de réglage.

Le but n'est pas d'ajouter des options. C'est que chaque réglage ait **un seul
endroit**, **un sens écrit en clair**, et que l'app **dise elle-même** ce qui
ne colle pas, avec un lien vers l'endroit où le corriger.

## Ce que font les logiciels reconnus (recherche du 2026-10-28)

Sources : aides de Skello, Quinyx, Deputy, Shiftbase, Planday, When I Work,
Agendrix, Sling ; Code du travail L6222-24.

| Pratique établie                                                                                                | Chez                                                    | Ce qu'on en tire                                                                    |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Une seule source de besoin, par poste et créneau ; le global n'est qu'un minimum / maximum sur la même grandeur | Quinyx, Deputy, Skello                                  | Les consignes matin / soir sont un contrôle des besoins, pas un second système (D1) |
| L'éligibilité vit au poste ou à la compétence                                                                   | Planday, Shiftbase, Deputy                              | Les codes se règlent au poste ; la fiche n'est qu'une exception visible             |
| Le vide a un sens écrit, jamais implicite                                                                       | When I Work (vide = aucun), Shiftbase (choix explicite) | « Tous les codes / Seulement ceux-ci », jamais une liste vide qui ouvre tout        |
| Contrôle de préparation avant de générer, chaque ligne avec son lien                                            | Shiftbase                                               | Panneau « À vérifier » = guide de démarrage                                         |
| Génération = meilleure tentative, jamais garantie ; trous montrés                                               | Tous                                                    | Textes honnêtes ; places à pourvoir sur une ligne visible                           |
| Raison précise par trou, lien vers le réglage                                                                   | Aucun outil trouvé                                      | Notre différence : `raisonsBlocage` existe déjà                                     |
| Priorités du générateur affichées en clair                                                                      | Skello                                                  | Une phrase « dans quel ordre le planning automatique décide »                       |
| École CFA = absence posée d'avance qui compte des heures                                                        | Skello, L6222-24                                        | Les heures d'école entrent dans les plafonds                                        |

## Ce que l'exploration a établi

| Fait établi                                                                                                                                                | Conséquence                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Le moteur prend poste ∩ fiche sans repli (`generateur.ts:81-102`) ; trois copies UI se replient sur le poste (`MenuJour.tsx:55-70`, `edition.ts:152-194`)  | Une fonction unique, sans repli, utilisée partout (étape 2)                                                                  |
| Les trois listes sont `bigint[] not null default '{}'`                                                                                                     | « Tous / Seulement ceux-ci » se fait SANS migration : `{}` = tous, et le mode « Seulement » exige au moins un code (étape 3) |
| La semaine type est filtrée par la fiche seule (`SectionsFiche.tsx:269-287`)                                                                               | Elle passe par la fonction unique (étape 4)                                                                                  |
| `alertes_besoins` produit (`semaine.ts:838`), jamais lu                                                                                                    | Remonté dans le contrôle de cohérence (étape 5)                                                                              |
| Code fixé = contrainte dure (`generateur.ts:99`), sans alerte en mode auto                                                                                 | Contrôlé d'avance (étape 5)                                                                                                  |
| Heures d'école non comptées (`generateur.ts:480-494`, `verificateur.ts:221-228`) ; L6222-24 : temps de CFA = temps de travail                              | Étape 9, avec migration probable                                                                                             |
| Effectif souple : un trou de 4 h (24 000) coûte moins qu'un 6e jour (15 000) plus 4 h au-delà du contrat (12 000)                                          | Étape 10 : la place nécessaire passe avant le confort, jamais avant la loi                                                   |
| « Poste à part » est dans `PostesPage.tsx:355-368` ; « Planning complet généré » dans `VueSemaine.tsx:377`, « Mois complet généré » dans `VueMois.tsx:305` | Étape 1                                                                                                                      |
| Aucun lien depuis les places à pourvoir (`PanneauAlertes.tsx:165-219`)                                                                                     | Étape 8                                                                                                                      |

---

## Phases

| #   | Fichier                                                    | Phase                                               | Dépend de | Priorité | Effort | Livrable                                                                                                                                                          | Critique |
| --- | ---------------------------------------------------------- | --------------------------------------------------- | --------- | -------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1   | [1-textes-honnetes.md](./1-textes-honnetes.md)             | Textes vrais, un mot par idée                       | —         | P0       | 2 h    | FAIT df42e42 : textes vrais, Catégorie HCR / Groupe, fin de génération honnête                                                                                    |          |
| 2   | [2-regle-unique-codes.md](./2-regle-unique-codes.md)       | Une seule règle des codes permis                    | —         | P0       | 4 h    | FAIT 98453f9 : `eligibilite.ts`, moteur et menus sur la même règle, sans repli + correctifs 35a630a                                                               | ⚠        |
| 3   | [3-tous-ou-certains.md](./3-tous-ou-certains.md)           | « Tous » ou « Seulement ceux-ci », jamais implicite | 2         | P0       | 3 h    | FAIT 4213e8a : `TousOuCertains`, poste, fiche, groupe ; Seulement démarre tout coché                                                                              |          |
| 4   | [4-fiche-exceptions.md](./4-fiche-exceptions.md)           | La fiche hérite du poste                            | 2, 3      | P1       | 4 h    | FAIT bb59b21 : une liste parmi l'union des codes de ses postes, ligne par poste, codes morts, semaine type par `codesPermis`                                      |          |
| 5   | [5-controle-coherence.md](./5-controle-coherence.md)       | Contrôle de cohérence avec liens                    | 2         | P0       | 6 h    | FAIT e19c994 : `coherence.ts`, panneau À vérifier groupé par écran, `?ouvrir=` vers le volet ; shifts incohérents laissés à l'étape 11                            | ⚠        |
| 6   | [6-besoins-et-consignes.md](./6-besoins-et-consignes.md)   | Besoins et matin / soir réconciliés                 | 5         | P0       | 3 h    | FAIT c339312 : « Besoins : N » sous chaque case, même somme que le contrôle (`sommeBesoinsPresence`), « Ajuster » vers la vue par poste                           |          |
| 7   | [7-guide-demarrage.md](./7-guide-demarrage.md)             | Ordre de réglage et « Prêt à générer »              | 5         | P1       | 3 h    | FAIT e78fa3f : menu dans l’ordre de réglage, numéroté et coché, carte Pour commencer, Compléter grisé avec sa raison, points à voir avant de générer              |          |
| 8   | [8-places-a-pourvoir.md](./8-places-a-pourvoir.md)         | Places à pourvoir qui disent où agir                | 5         | P1       | 4 h    | FAIT 4dafaa7 : `raisonsPlaces.ts` (chaque règle : phrase + lien ou mention), places regroupées, titulaires d'abord, « Placer quelqu'un » ; navigateur non vérifié |          |
| 9   | [9-heures-ecole.md](./9-heures-ecole.md)                   | Heures d'école dans les plafonds                    | 1         | P1       | 5 h    | Un mineur ne dépasse plus 35 h école comprise                                                                                                                     | ⚠        |
| 10  | [10-priorites-generateur.md](./10-priorites-generateur.md) | Ordre de décision du générateur, écrit et tenu      | 6         | P1       | 6 h    | Nécessaire avant confort, titulaire avant dépannage, équité au mieux                                                                                              | ⚠        |
| 11  | [11-donnees-a-ranger.md](./11-donnees-a-ranger.md)         | Ranger les données qui contredisent les réglages    | 5         | P2       | 2 h    | Corrections proposées en un clic (dev)                                                                                                                            |          |
| 12  | [12-cloture.md](./12-cloture.md)                           | Vérification d'ensemble                             | tout      | P0       | 3 h    | Martin, borg, essai navigateur, bilan                                                                                                                             | ⚠        |

## Ordre d'exécution

1. **1** puis **2** : les textes d'abord (sans risque), puis la fonction unique dont tout le reste dépend.
2. **3**, **4**, **5** : les réglages qui s'appuient sur la règle unique, puis le contrôle qui la relit.
3. **6**, **7**, **8** : l'interface qui exploite le contrôle.
4. **9**, **10** : le moteur, une fois que tout ce qu'il fait se voit à l'écran.
5. **11**, **12** : rangement et vérification d'ensemble.

## Architecture cible

```
Horaires (codes)  ->  Postes (codes du poste : Tous | Seulement ceux-ci)
                        |
Équipe (fiche) ------> postes tenus + exceptions de codes (dans ceux du poste)
                        |                     semaine type (codes filtrés)
Besoins  -----------> par poste x jour x code  (SEULE source de besoin)
   Matin / soir ----> au moins / au plus, CONTRÔLE sur la somme des besoins
                        |
lib/planning/eligibilite.ts   codesPermis()   <- menus, fiche, moteur, vérificateur
lib/planning/coherence.ts     verifierReglages() -> points { gravité, texte, lien }
                        |
Panneau « À vérifier »  (paramètres + avant de générer) = guide de démarrage
Génération -> propositions -> places à pourvoir { raison, lien }
```

## Implications transverses

### Base

Aucune migration prévue sauf l'étape 9 (durée d'une journée d'école, selon D2).
Les listes vides gardent leur sens « tous » : aucun réécriture de données.

### Interface

Respecter `plan/planning-portage-2026-10-27/B-conventions-ui.md` et les règles
de la page : phrases courtes, vouvoiement, ni « IA » ni tiret cadratin ni « » à
l'écran, aucune case destructrice, `PageAvecEnTete`, volets, listes compactes.
Ne pas revenir aux cartes toujours ouvertes (décision du 2026-10-28).

### Moteur

Une règle changée = `regles.ts` + `generateur.ts` + `verificateur.ts` + un test
accepté ET refusé. L'oracle différentiel avec le prototype ne tient plus pour
les étapes 9 et 10 : l'écart est voulu et doit être écrit dans le test.

### Données réelles

Aucun nom de personne dans le dépôt ni dans les rapports. Les corrections de
l'étape 11 se font en dev ; en prod, par l'app, par l'utilisateur.

## Phases de test /martin — règles communes

Base locale, compte `*@exemple.test` supprimé à la fin, transactions annulées,
navigateur sur `localhost:3001` seulement. Chaque oracle est indépendant du code
testé (propriétés fast-check pour `codesPermis` et `verifierReglages`).

## Angles à clarifier

Voir [D-decisions.md](./D-decisions.md) partie A (D1 à D8 ; D9 à D11 n'ont qu'une réponse par défaut). Les trois qui
changent le plus : D1 (consignes = contrôle ou contrainte), D2 (durée d'une
journée d'école), D3 (une place nécessaire passe-t-elle avant un 6e jour).

## Fichiers impactés (résumé)

| Couche                     | Fichiers modifiés                                                                                                                                                                           | Fichiers nouveaux                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Moteur `src/lib/planning/` | `semaine.ts`, `generateur.ts`, `verificateur.ts`, `regles.ts`, `affichage.ts`, `types.ts`                                                                                                   | `eligibilite.ts`, `coherence.ts` (+ tests) |
| Écrans planning            | `MenuJour.tsx`, `semaine/edition.ts`, `EditeurShift.tsx`, `VueSemaine.tsx`, `VueMois.tsx`, `PanneauAlertes.tsx`, `attention.ts`                                                             | `PretAGenerer.tsx`                         |
| Paramètres                 | `EnTeteParametres.tsx`, `PostesPage.tsx`, `BesoinsPage.tsx`, `ConsignesPresence.tsx`, `SectionsFiche.tsx`, `SectionIdentite.tsx`, `GestionCategories.tsx`, `HorairesPage.tsx`, `ChoixCodes` | `ControleReglages.tsx`                     |
| Base                       | —                                                                                                                                                                                           | une migration à l'étape 9 (selon D2)       |
| **Total**                  | **environ 25 modifiés**                                                                                                                                                                     | **environ 6 nouveaux**                     |
