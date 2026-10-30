# Plan — Planning : le moteur joue avec les codes pour tenir les cycles

Date : 2026-10-30. Demande utilisateur : « tu dois savoir comprendre les
besoins et comprendre ce qui est déjà en place et ajuster pour que cela
complète au mieux les choses… je ne suis pas le premier à faire un logiciel
RH pour attribuer les shifts. »

Réponses du même jour (questionnaire), qui ont REMPLACÉ une première version
fondée sur une « courbe de présence » par plages (jugée pas claire) :

- « je t'impose des besoins et des codes horaires, tu dois pouvoir jouer avec
  les outils pour trouver des possibilités ; si tu ne trouves pas, tu laisses
  des trous : à l'impossible nul n'est tenu » ;
- « des besoins de personnel minimal pour les journées de travail… les trois
  cycles dans la journée : matin, soir, nuit… et les middle, c'est un shift
  bâtard » ; à comprendre « de manière plus dure » ;
- « place tout ce que tu peux placer ; si c'est trop exotique, dis que tu ne
  peux pas faire de choix et laisse vide… après, à nous de prendre un extra » ;
- « le chevauchement c'est mieux, mais pas obligatoire ».

> **EXÉCUTÉ le 2026-10-30 en essaim, NON poussé.** Décisions D1-D16
> ([D-decisions.md](./D-decisions.md)). Bilan en fin de fichier.

---

## Contexte : ce qui ne va pas aujourd'hui (vérifié dans le code)

1. Un shift posé à la main ne compte pour un besoin que s'il a **le même
   code** (`correspondances`, `semaine.ts:521-566`). Un M6 posé à la place
   d'un M3 laisse le besoin M3 « vide » : le moteur cherche encore quelqu'un,
   d'où des doublons.
2. Si personne ne peut tenir le code imposé (repos de 11 h, contrat), le
   moteur laisse la place vide **sans essayer un code voisin du même cycle**
   que la personne pourrait faire.
3. Le minimum du matin et du soir (consignes) est **souple et bas** : il passe
   après les heures dues des contrats (`coutConsigne`, `generateur.ts:166`).
   La nuit n'a pas de minimum.
4. Rien ne voit un **trou entre deux cycles** (le matin finit à 15 h, le soir
   commence à 16 h).

## Ce que font les logiciels reconnus (recherche du 2026-10-30)

| Pratique établie                                                                    | Chez                  | Ce qu'on en tire                                          |
| ----------------------------------------------------------------------------------- | --------------------- | --------------------------------------------------------- |
| Les shifts déjà posés comptent dans la couverture, quel que soit le modèle de shift | Genesys, Skello       | Un shift posé compte pour le besoin de son cycle          |
| Le moteur crée des shifts ouverts qui suivent la demande, puis les attribue         | Quinyx, UKG           | Le moteur peut prendre un autre code permis du même cycle |
| Minimum par plage, souple ; le manque est affiché, jamais inventé                   | Quinyx, Infor         | Place vide expliquée, « prendre un extra »                |
| Un shift n'est créé que s'il sert vraiment                                          | Infor                 | Pas de shift ajouté qui ne remplit aucun besoin           |
| Couverture vérifiée au quart d'heure, écart affiché                                 | UKG, Skello, Dayforce | Contrôle des trous entre cycles, en interne               |

## Le principe retenu

- **Vous imposez** : les besoins par poste, jour et code (inchangés), et un
  **minimum par cycle** (matin, soir, nuit) par jour.
- **Le moteur compte d'abord ce qui est posé**, par cycle : un M6 posé compte
  pour le besoin M3 du même poste et du même jour, puisque c'est un matin. Le
  code exact reste préféré, le voisin est accepté.
- **Il complète dans cet ordre (D13)** : un titulaire avec le code imposé,
  un titulaire avec un autre code permis du même cycle (« M6 au lieu de
  M3 »), un dépannage (adjointe, superviseur, extra) avec le code imposé, un
  dépannage avec un autre code. Aucun code horaire n'est ajouté ni modifié.
- **Le minimum par cycle devient dur au sens du métier** : il passe avant les
  contrats et le confort, comme une place nécessaire. Jamais avant la loi.
- **Si rien ne marche**, la place reste vide avec sa raison et la phrase
  « Je ne peux pas la remplir : prenez un extra ou changez un shift ».
- **Chevauchement de relève** : un petit bonus, jamais une obligation.
- **Trou entre cycles** : vu au quart d'heure, signalé, et le moteur l'évite
  quand il le peut (coût, pas règle).

## Ce que l'exploration a établi

| Fait établi                                                                                                         | Conséquence                                                                                |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Les codes ont déjà une famille : matin, middle, soir, nuit, court (`20261028110000_planning_familles_horaires.sql`) | Le cycle d'un code est connu, aucune saisie de plus                                        |
| `planning_consignes.periode` n'admet que matin et soir                                                              | Migration : ajouter nuit (étape 2)                                                         |
| Une booléenne par (salarié, créneau), créneaux = besoins + shifts posés hors besoins (`semaine.ts:1222-1233`)       | Les remplaçants sont des créneaux candidats rattachés à un besoin (étape 4)                |
| `traduire` ne relit que les créneaux `b…` (`semaine.ts:1263-1286`)                                                  | À étendre aux remplaçants                                                                  |
| La consigne compte un shift = 1 par période (`generateur.ts:497-517`)                                               | Garde ce comptage pour le minimum par cycle (c'est bien « combien de personnes le matin ») |
| Temps : 1,3 à 2,1 s par semaine, limite 10 s                                                                        | Les remplaçants restent bornés (même poste, même jour, même cycle)                         |
| `raisonsBlocage` dit pourquoi chacun ne peut pas prendre une place                                                  | Réutilisé pour la place laissée vide                                                       |
| `coherence.ts:653-684` contrôle consignes contre besoins                                                            | Branchement des contrôles d'avance (étape 7)                                               |

---

## Phases

| #   | Fichier                                                  | Phase                                                                             | Dépend de | Priorité | Effort | Livrable                                | Critique |
| --- | -------------------------------------------------------- | --------------------------------------------------------------------------------- | --------- | -------- | ------ | --------------------------------------- | -------- |
| 1   | [1-decisions.md](./1-decisions.md)                       | D11 et D12 (le middle)                                                            | —         | P0       | 5 min  | Décisions écrites                       |          |
| 2   | [2-base.md](./2-base.md)                                 | Minimum de nuit dans les consignes                                                | 1         | P0       | 1 h    | Migration + pgTAP                       | ⚠        |
| 3   | [3-compter-par-cycle.md](./3-compter-par-cycle.md)       | Un shift posé compte pour le besoin de son cycle                                  | 1         | P0       | 3 h    | `correspondances` par cycle, tests      |          |
| 4   | [4-moteur-remplacants.md](./4-moteur-remplacants.md)     | Codes remplaçants du même cycle, minimum par cycle plus dur, bonus de relève      | 3         | P0       | 1 j    | Génération qui joue avec les codes      | ⚠        |
| 5   | [5-place-vide-expliquee.md](./5-place-vide-expliquee.md) | « Je ne peux pas la remplir » avec la raison                                      | 4         | P0       | 3 h    | Places vides parlantes                  |          |
| 6   | [6-trous-entre-cycles.md](./6-trous-entre-cycles.md)     | Trou entre deux cycles vu au quart d'heure                                        | 3         | P1       | 3 h    | Point d'attention + coût dans le moteur |          |
| 7   | [7-ecrans.md](./7-ecrans.md)                             | Besoins (nuit, phrase du principe), case « M6 au lieu de M3 », contrôles d'avance | 2-6       | P0       | 4 h    | Écrans à jour                           |          |
| 8   | [8-mesure-et-cloture.md](./8-mesure-et-cloture.md)       | Essais sur les vraies semaines, codes exotiques, /martin, CLAUDE.md               | 2-7       | P0       | 4 h    | Bilan chiffré                           | ⚠        |

## Ordre d'exécution : un essaim en 5 vagues

Détail, propriété des fichiers et consignes de chaque agent :
[10-essaim.md](./10-essaim.md).

| Vague        | Agents en parallèle                                 | Étapes                             | Sortie                             |
| ------------ | --------------------------------------------------- | ---------------------------------- | ---------------------------------- |
| 0 Fondations | 1                                                   | 2 + contrat des types, `cycles.ts` | migration nuit, types, commit      |
| 1 Moteur     | 4 : Présence, Moteur, Assemblage, Oracle            | 3, 4, 6                            | génération qui joue avec les codes |
| 2 Écrans     | 3 : Besoins, Alertes, Survol                        | 5, 7                               | ce qui se voit                     |
| 3 Contrôle   | 4 : Mesure, Martin, Relecture adverse, Essais réels | 8                                  | preuves chiffrées                  |
| 4 Clôture    | orchestrateur                                       | 8                                  | bilan, CLAUDE.md, commits          |

Un fichier n'a qu'un lot propriétaire ; seuls l'orchestrateur commite et
lance la suite complète. 12 agents au total, jamais plus de 4 à la fois.

## Fichiers impactés (résumé)

| Couche    | Fichiers modifiés                                                                                                             | Fichiers nouveaux                        |
| --------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Base      | `supabase/tests/05_planning*.sql`                                                                                             | migration `…_planning_consigne_nuit.sql` |
| Métier    | `semaine.ts`, `generateur.ts`, `verificateur.ts`, `modele.ts`, `presence.ts`, `regles.ts`, `coherence.ts`, `raisonsPlaces.ts` | `cycles.ts` (+ tests)                    |
| Écrans    | `BesoinsPage.tsx`, `ConsignesPresence.tsx`, `attention.ts`, `PanneauAlertes.tsx`, cases mois et semaine                       | —                                        |
| Doc       | `CLAUDE.md` (section Planning)                                                                                                | ce dossier                               |
| **Total** | **~15 modifiés**                                                                                                              | **~3 nouveaux**                          |

---

## Bilan (2026-10-30)

Commits : ebd0e33 (plan) → 7e9a566 (vague 0) → d004e5a (vague 1) → 8aa31c8
(vague 2) → 5ea5d9e, dec17ad (moteur allégé, deux temps) → 7b4ee9e
(correctifs) → commit suivant (correctifs du calcul en deux temps), tous
locaux.

Essaim : 19 agents (3 reconnaissances, 1 fondations, 4 moteur, 3 écrans,
mesure, 2 optimisations, Martin, essais navigateur, 2 relectures adverses,
1 correction). Un fichier = un lot ; l'orchestrateur seul commite.

| Mesure (8 semaines réelles, base locale) | Avant (37f3b17)   | Après                             |
| ---------------------------------------- | ----------------- | --------------------------------- |
| Temps moyen par semaine                  | 0,36 s            | 1,3 s                             |
| Pire temps                               | 0,87 s            | 2,1 s                             |
| Contraintes par semaine                  | ~3 000            | ~7 300 (82 000 sans la réduction) |
| Infractions à la loi                     | 0                 | 0                                 |
| Places nécessaires vides                 | 0                 | 0                                 |
| Minimums par cycle non tenus (règle D11) | 5 à 6 par semaine | 0                                 |
| Trous entre équipes                      | 1 à 6 par semaine | 0                                 |
| Remplaçants posés                        | sans objet        | 0 (le code exact suffit)          |
| Tests planning (lib + écrans)            | 685               | 861                               |

Essai « codes exotiques » (3 M6 posés sur des besoins M3) : places tenues,
`code_demande` rempli, aucun doublon. Essais dans le navigateur (port à
part, compte d'essai supprimé, 209 shifts d'essai effacés par id) : textes
conformes, aucune erreur de console.

Relectures adverses : (1) remplaçant choisi pour des heures de contrat →
corrigé (5ea5d9e) ; nuit sur un poste « Tous », soutien rattaché par cycle,
raison commune non bloquante, comptage du vérificateur → corrigés (7b4ee9e).
Martin : deux défauts prouvés par test (contrôle « cycle sans code » qui
contredisait la somme ; version courte mal placée, défaut ANTÉRIEUR au
chantier) → corrigés (7b4ee9e). Relecture finale : solution vide prise
pour bonne au temps limite, heures dues sacrifiées au premier temps,
budget du second temps, remplaçant fait court → corrigés (commit
suivant). Stryker : arrêté, trop long sur ces
fichiers (pas de score) ; mutations faites à la main par chaque lot, toutes
attrapées.

À faire par l'utilisateur ou à décider :

- changer un code au clic droit peut changer le poste sans le dire (mode
  manuel du même jour : le Club n'avait pas le M5, le shift est passé en
  Supervision) ;
- aucune consigne de nuit n'existe encore en base : à poser dans Besoins si
  voulu ;
- livraison : la migration nuit part au prochain « push » ; `db diff` local
  montre un trigger de storage (`enforce_versioning_status_transition`) lié
  à l'image Docker, pas au chantier : à vérifier avant de livrer.
