# Plan — Planning : un moteur réglable pour tout établissement

Date : 2026-11-05. Demande utilisateur : « j'ai besoin que mon moteur soit autonome et configurable et pas que les notions spécifiques au fonctionnement de mon planning soient en dur, il doit être utilisable pour tout type d'établissement » ; « ajouter des notions de paramétrage dans les pages de paramètres de la page planning… tu dois savoir déduire les règles en fonction des paramètres ».

> **EXÉCUTÉ le 2026-11-05, NON poussé.** Commits cf49a97a, 3d4a7fc1, 7ca1b354, d5689e89, 2a49e52d, 181859d8, db08dac4, 41f2adee, 7e847d75, ad57704c, b7d4f93f. Livraison : 3 migrations (20261105100000, 110000, 120000), `--avec-donnees` (modèles de contrat insérés, importance remplie, continuité à vrai).
>
> **Bilan.** Décembre (copie locale, 3 graines) : places à pourvoir 11 → 9-10, trous 21 → 16-17, relèves manquées 3 → 1, heures dues manquantes 36 → 43 h, 0 infraction. Toutes les différences viennent de D8 (continuité désactivée = chiffres d'avant). Second établissement fictif (`autreEtablissement.test.ts`) : suit ses propres règles. Relecture adverse : 8 défauts prouvés, corrigés (b7d4f93f). 1 477 tests, pgTAP 108/108, empreinte 8874c146. Restent : `personnes_nuit` non branché ; moments recalculés aussi pour les semaines passées ; horaire libre entre 21 h et 22 h désormais en nuit.
>
> Avant exécution : plan écrit sans toucher au code (demande utilisateur : « ne touche pas au code »). Questions D1 à D11 TRANCHÉES le 2026-11-05 ([D-decisions.md](./D-decisions.md), partie C). Pas de multi-établissement ni de services coupés ni de lissage sur deux semaines : de bonnes pratiques pour UN hôtel, tout réglable.

---

## Contexte

Le moteur fait déjà un bon planning pour l'hôtel. Mais une trentaine de règles propres à cet hôtel sont écrites dans le code, surtout dans `regles.ts`, `generateur.ts`, `moment.ts` et `presence.ts`. Un autre établissement ne pourrait pas les changer.

Exemples, relevés par l'inventaire du 2026-11-05 :

- 35 h = journées de 7 h ; 39 h = 4 × 8 h + 7 h (`journeesDuCalcul`, `CONTRAT_35H`, `CONTRAT_39H`).
- Deux repos de suite obligatoires (`regleHotel`, generateur.ts:1738), au plus 5 jours d'affilée (`JOURS_AFFILES_CONSEILLES`), jour isolé interdit (`rythmeHumain`).
- Limites des moments : nuit après 21 h, matin avant 9 h, etc. (`momentPropose`, moment.ts:33).
- Une seule zone « accueil » (`POSTE_ID_ACCUEIL = 0`), un seul veilleur, passation avec le veilleur, relève de chacun, équipe du soir à 30 min près.

Ce qui est déjà réglable : horaires, postes (accueil, ouverture, fermé, fériés chômés), besoins, présence de l'accueil, relève (`planning_reglages.releve_minutes`), fiche salarié (semaine type, repos fixes, étoile fixée, horaires imposés).

---

## Le principe retenu

Trois étages, jamais mélangés.

| Étage                             | Qui le règle                                                                                                  | Exemples                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **La loi**                        | Personne. Écrite dans le code, montrée en lecture seule.                                                      | Repos de 11 h, 48 h, 6 jours, mineurs                                      |
| **Les règles de l'établissement** | La gestion, dans une nouvelle page « Règles de l'établissement ». Valeurs par défaut = l'hôtel d'aujourd'hui. | Journées par contrat, deux repos de suite, passations, limites des moments |
| **Les réglages internes**         | Personne. Les poids du calcul, jamais montrés en chiffres.                                                    | `POIDS_*`, temps limite                                                    |

Le moteur **déduit** le reste des réglages, sans demander :

- les jours de travail d'un contrat = ses heures ÷ la durée de ses journées ;
- la passation avec le veilleur existe seulement si un poste tient la nuit ;
- une règle impossible à tenir avec les réglages (39 h sans version de 7 h sur ses postes) est dite dans « À vérifier », jamais devinée.

---

## Ce que l'exploration a établi

| Fait établi                                                                                  | Conséquence                                                        |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Une seule ligne `planning_reglages` (id 1), modifiable par la gestion seule                  | Les règles globales y vont en colonnes, sans nouveau droit         |
| Le JSON `semaine_type` n'est contrôlé que sur `mode`                                         | « 7 h le vendredi » s'ajoute sans colonne : clé `duree_minutes`    |
| Besoin obligatoire et souhaité existent déjà (`effectif`, `renfort`)                         | Pas de case « poste obligatoire » à créer, sauf décision contraire |
| Relève par défaut : 30 dans `service.ts`, 0 dans `semaine.ts:2708`                           | Un seul défaut à fixer                                             |
| `periodeLibre` (presence.ts:63) met la nuit à 22 h, `momentPropose` à 21 h                   | Une seule source des limites de moments                            |
| Règle étoile en trois endroits : `etoile.ts`, migration `20261102100000`, `brouillon.ts:305` | À rendre réglable aux trois ensemble                               |
| Un seul shift par personne et par jour (generateur.ts:1427)                                  | Services coupés impossibles : hors périmètre sauf décision         |
| Empreinte de `generateur.test.ts` (8874c146)                                                 | Preuve que les défauts reproduisent exactement l'hôtel             |

---

## Phases

| #   | Fichier                                                            | Phase                                                                              | Dépend de | Priorité | Effort               | Livrable                                                         | Critique |
| --- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | --------- | -------- | -------------------- | ---------------------------------------------------------------- | -------- |
| 1   | [D-decisions.md](./D-decisions.md)                                 | Trancher les questions                                                             | —         | P0       | 15 min (utilisateur) | Réponses D1 à D10                                                |          |
| 2   | [2-socle-regles.md](./2-socle-regles.md)                           | Un seul objet « règles de l'établissement » côté code, sans rien changer au calcul | 1         | P0       | 1 j                  | `RegleEtablissement`, défauts, lecture unique                    | ⚠        |
| 3   | [3-base.md](./3-base.md)                                           | Ranger les règles en base                                                          | 2         | P0       | 0,5 j                | Migration d'ajout, pgTAP, seed                                   | ⚠        |
| 4   | [4-moteur-lit-les-regles.md](./4-moteur-lit-les-regles.md)         | Le moteur et le vérificateur lisent les règles au lieu des constantes              | 2, 3      | P0       | 2 j                  | Même empreinte, mêmes résultats au banc                          | ⚠        |
| 5   | [5-page-regles.md](./5-page-regles.md)                             | Règles réparties dans les pages existantes (D7 = réparties)                        | 3, 4      | P1       | 1,5 j                | Équipe, Horaires, Postes enrichis                                |          |
| 6   | [6-fiche-duree-fixee.md](./6-fiche-duree-fixee.md)                 | Fiche : jour étoile choisi, horaire choisi par le planning                         | 4         | P1       | 0,5 j                | Jour étoile imposé ou placé au mieux                             |          |
| 7   | [7-besoins-et-priorites.md](./7-besoins-et-priorites.md)           | Page Besoins refaite + importance des postes                                       | 1, 4      | P1       | 2 j                  | Obligatoire / souhaité, niveau, ouverture, passation, importance | ⚠        |
| 8   | [8-controle-et-aide.md](./8-controle-et-aide.md)                   | « À vérifier » et l'aide lisent les règles                                         | 5         | P1       | 0,5 j                | Règles déduites dites à l'écran                                  |          |
| 9   | [9-essai-autre-etablissement.md](./9-essai-autre-etablissement.md) | Essai sur un second établissement fictif, et banc de l'hôtel                       | 4 à 8     | P0       | 1 j                  | Bilan avant → après                                              | ⚠        |

---

## Ordre d'exécution

1. L'utilisateur répond aux questions (étape 1).
2. Socle puis base (2, 3) : aucun changement visible, tout est prouvé identique.
3. Moteur (4) : le cœur. Même empreinte, sinon on s'arrête.
4. En parallèle : page (5), fiche (6), besoins (7).
5. Contrôle et aide (8).
6. Essai final (9).

---

## Architecture cible

```text
Pages de paramètres                 Base                         Moteur
-------------------                 ----                         ------
Horaires / Postes / Équipe /        planning_reglages (1 ligne)  regles.ts : la LOI seule
Besoins                             + colonnes des règles        |
Règles de l'établissement  ----->   planning_modeles_contrat --> lireRegles(referentiel)
  Contrats                          semaine_type.duree_minutes     -> RegleEtablissement
  Repos et rythme                                                   |
  Passations                                                        v
  Moments                                                    generateur / verificateur /
  Accueil                                                    moment / presence / coherence
  La loi (lecture seule)                                     (plus aucune constante d'hôtel)
```

---

## Implications transverses

- **Base** : uniquement des AJOUTS (colonnes avec défaut, une table). Rien retiré dans ce chantier.
- **Interface** : une page de plus ; Besoins perd la relève (déplacée), selon D7.
- **Moteur** : aucun poids ne devient réglable. On règle la règle (active ou non, durée, tolérance), jamais son poids.
- **Données réelles** : les défauts reproduisent l'hôtel d'aujourd'hui. Personne ne doit voir un planning différent après la livraison.

---

## Phases de test /martin

- Propriété : pour tout jeu de règles, le vérificateur et le générateur jugent pareil (même oracle).
- Les règles par défaut donnent l'empreinte 8874c146 et le banc de décembre à l'identique.
- Valeurs extrêmes : 0 min de relève, limites de moments qui se croisent, contrat sans journée possible : jamais de modèle impossible, toujours un point « À vérifier ».
- Droits : un compte « écriture » ne peut pas changer une règle (0 ligne, pgTAP).

---

## Angles à clarifier

Voir [D-decisions.md](./D-decisions.md), partie A. Divergences relevées par l'exploration, à trancher :

- Le défaut de la relève est 30 min dans un fichier et 0 dans un autre.
- « Un apprenti ou un stagiaire n'est jamais seul » : loi ou choix de l'hôtel ? L'inventaire hésite.
- Les extras : la décision du 2026-11-03 dit « jamais par le calcul », mais il reste un `coutExtra` dans le générateur. À relire à l'étape 4.

---

## Fichiers impactés (résumé)

| Couche                            | Fichiers modifiés                                                                                                            | Fichiers nouveaux                           |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Moteur `src/lib/planning/`        | regles.ts, generateur.ts, verificateur.ts, moment.ts, presence.ts, semaine.ts, etoile.ts, coherence.ts, types.ts, service.ts | reglesEtablissement.ts                      |
| Écrans `src/components/planning/` | EnTeteParametres.tsx, BesoinsPage.tsx, SectionsFiche.tsx, equipe/brouillon.ts, AidePlanningContenu.tsx, ControleReglages.tsx | parametres/ReglesPage.tsx (et ses sections) |
| Routes                            | —                                                                                                                            | routes/planning/regles.tsx                  |
| Base                              | supabase/tests/05_planning.test.sql, supabase/seed/generer.ts                                                                | 1 migration d'ajout                         |
| Docs                              | CLAUDE.md, plan/planning-bonnes-pratiques/PRD.md                                                                             | —                                           |
| **Total**                         | **≈ 18 modifiés**                                                                                                            | **≈ 4 nouveaux**                            |
