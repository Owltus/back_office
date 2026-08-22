# Plan — Généraliser le système responsive tactile de Rapprochement

## Contexte

Le système responsive mis en place sur `/rapro` cette session (détection tactile
réelle `(hover:none) and (pointer:coarse)` plutôt que la largeur d'écran, barre
d'outils basse fixe sur écran tactile, identité de page migrée dans la Navbar
sous 1024px, alignement des actions à droite en mode souris) a été validé par
l'utilisateur et jugé digne d'être déployé sur les 4 autres domaines de l'app
(RepJour, PDJ, Parking, Caisse).

Exigence explicite de l'utilisateur : **pas de copier-coller**. Chaque domaine
doit consommer un socle réutilisable, pas une réécriture locale de la même
logique. C'est la contrainte structurante de ce plan.

Swarm de reconnaissance : 5 agents d'exploration en parallèle (inventaire
complet de l'implémentation Rapro + audit de l'existant sur RepJour/PDJ/
Parking/Caisse), puis un agent de synthèse. `/rodin` n'est pas installé sur ce
projet (déjà noté dans d'autres plans du dépôt, ex. `plan/caisse-cautions/`) —
remplacé par une remise en question manuelle, détaillée ci-dessous.

## Remise en question (à défaut de `/rodin`)

**Le bon chantier, dans le bon ordre ?** Oui : l'essentiel du socle est déjà
générique (`PageHeader`, `StepNav`, `DatePickerButton`, `LockBadge`,
`AnalytiqueBackButton` ont tous déjà les props nécessaires ; `AnalytiqueShell`
a déjà `mobileIdentity`/`mobileToolbar`). Le travail réel est plus étroit que
« porter un système » : c'est finir une extraction déjà à moitié faite, puis
brancher 4 boards "jour" dessus.

**Alternative moins coûteuse rejetée** : copier-coller le JSX de la barre
basse de Rapro dans chaque domaine — exclu explicitement par l'utilisateur, et
de toute façon la moins bonne option technique (4 sources de vérité au lieu
d'une).

**Ajustement apporté à la proposition du swarm** : l'agent de synthèse proposait
de refactoriser `RaproBoard.tsx` lui-même pour qu'il consomme le nouveau socle
(DRY total). **Écarté pour ce chantier** : `RaproBoard.tsx` est du code de
PRODUCTION déjà testé manuellement en profondeur par l'utilisateur sur de
nombreux tours cette session — le retoucher sans bénéfice utilisateur visible
introduit un risque de régression sur une page qui marche, pour un gain
purement cosmétique (DRY interne). Le socle est donc extrait par
**généralisation** de ce qui existe déjà dans `AnalytiqueShell.tsx`
(`ToolbarCell`, le conteneur `<nav>`, le calcul combiné des deux media
queries) vers un nouveau module partagé — `AnalytiqueShell.tsx` migre dessus
(fichier unique, déjà bien isolé, facile à revalider), mais **`RaproBoard.tsx`
n'est pas touché**. Les 4 nouveaux domaines consomment directement le nouveau
socle : aucun copier-coller, mais aucun risque ajouté sur le code déjà validé.
Un migration ultérieure de `RaproBoard.tsx` vers le même socle reste possible
mais n'est pas dans ce plan — à proposer séparément si l'utilisateur la
souhaite un jour.

**Angles morts au-delà des 3 décisions produit identifiées par le swarm** :
- Les tests automatisés (vitest/jsdom) ne peuvent pas vérifier fidèlement un
  comportement basé sur de vraies media features (`hover`/`pointer`) — la
  validation de ce chantier reposera sur `tsc`/`build`/relecture de code et
  test manuel, comme pour tout le travail responsive de cette session.
- DESIGN.md affirme actuellement que le mode mobile/tactile n'est « consommé
  aujourd'hui que par les deux vues Rapprochement » — cette phrase devient
  fausse dès la première page portée ; sa mise à jour est intégrée à l'étape
  de validation finale, pas oubliée en aparté.
- Deux dérives documentation/code préexistantes, sans lien avec ce chantier
  mais repérées au passage par le swarm, sont corrigées à l'occasion (sans
  effort dédié) : le commentaire de `PageHeader.tsx` qui prétend que Parking
  pilote son planning via `leading` (faux, Parking n'utilise pas ce prop), et
  celui de `StepNav.tsx` qui parle d'un « sélecteur de plage » pour Parking
  (c'est un calendrier à sélection simple, pas une plage).

## Angles à clarifier — décisions produit (TRANCHÉES par l'utilisateur)

Ces trois points ont été remontés par le swarm sans arbitrage, puis tranchés
par l'utilisateur avant exécution :

- **D1 → TRANCHÉ : rester clavier uniquement.** L'automode PDJ reste réservé
  au poste de bureau avec clavier physique, documenté comme tel, aucun
  déclencheur tactile à construire.
- **D2 → TRANCHÉ : garder la logique par shift.** Le pager tactile de Caisse
  avance par shift (matin→soir→nuit→lendemain), comme le `StepNav` desktop
  actuel — pas de sélecteur de shift dédié à construire.
- **D3 → TRANCHÉ : séparer densité et édition.** Sur Parking, la densité de
  la grille reste liée à la largeur (`isCompact`, 768px, inchangé) ; la
  capacité d'édition/glisser-déposer dépend désormais du pointeur
  (`isTouchDevice`), pas de la largeur.

Détail des options écartées, conservé pour traçabilité :

- **D1 — PDJ, automode clavier-only.** Le raccourci caché « automode » (coche
  automatiquement le dû facturé) se déclenche en tapant le mot au clavier
  physique, sans bouton ni geste visible. Sur un usage tactile pur (tablette
  sans clavier), il est aujourd'hui totalement inatteignable. Deux options :
  (a) lui donner un déclencheur tactile équivalent (bouton discret, geste
  dédié), ou (b) assumer qu'il reste réservé au clavier physique, documenté
  comme tel.
- **D2 — Caisse, navigation par shift.** Le `StepNav` de Caisse avance par
  SHIFT (matin→soir→nuit→lendemain), pas par jour civil comme Rapro. Le pager
  tactile bas-fixe de Rapro (Préc./Suiv. = 1 jour) ne correspond pas à ce
  modèle. Faut-il que le pager tactile de Caisse avance par shift (comme
  aujourd'hui, juste rendu en barre basse), ou faut-il introduire un
  sélecteur de shift dédié (pills matin/soir/nuit) en plus du calendrier ?
  Question annexe : où placer le bouton « Caution » (création, pas navigation
  ni impression) dans une éventuelle barre basse ?
- **D3 — Parking, densité vs édition.** Une seule variable de largeur
  (`isCompact`, <768px) pilote AUJOURD'HUI à la fois la densité géométrique de
  la grille (légitimement liée à la largeur) et la capacité d'édition/glisser-
  déposer (`canEdit`, qui devrait dépendre du pointeur, pas de la largeur).
  Deux angles morts déjà réels dans le code : un ordinateur à la souris en
  fenêtre étroite perd l'édition à tort ; une tablette tactile large
  (768-1024px) garde le glisser-déposer actif au doigt avec des poignées de
  6px non adaptées. Faut-il séparer ces deux préoccupations (densité = largeur
  toujours ; édition = détection tactile réelle comme Rapro), et si oui,
  agrandir aussi les poignées de redimensionnement en tactile ?

**RepJour n'a aucune décision en attente** — portage possible immédiatement
après l'extraction du socle, sans validation utilisateur supplémentaire.

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-extraction-socle-responsive.md](./1-extraction-socle-responsive.md) | Extraction | — | P0 | 2h | `useResponsiveShell`, `MobileToolbar`, gating navbar factorisé | ⚠ |
| 2 | [2-repjour-board-jour.md](./2-repjour-board-jour.md) | RepJour | 1 | P0 | 1h30 | Board jour RepJour responsive tactile | |
| 3 | [3-repjour-analytique.md](./3-repjour-analytique.md) | RepJour | 1 | P1 | 20min | Vues analytique RepJour responsive | |
| 4 | [4-pdj-board-jour.md](./4-pdj-board-jour.md) | PDJ | 1, D1 tranchée | P0 | 1h30 | Board jour PDJ responsive tactile | |
| 5 | [5-pdj-analytique.md](./5-pdj-analytique.md) | PDJ | 1 | P1 | 20min | Vues analytique PDJ responsive | |
| 6 | [6-caisse-board-jour.md](./6-caisse-board-jour.md) | Caisse | 1, D2 tranchée | P0 | 2h | Board jour Caisse responsive tactile (shift) | |
| 7 | [7-caisse-analytique.md](./7-caisse-analytique.md) | Caisse | 1 | P1 | 20min | Vues analytique Caisse responsive | |
| 8 | [8-parking-board-jour.md](./8-parking-board-jour.md) | Parking | 1, D3 tranchée | P0 | 2h | Board jour Parking : densité/édition séparées | ⚠ |
| 9 | [9-parking-aide-analytique.md](./9-parking-aide-analytique.md) | Parking | 1 | P1 | 30min | Aide tactile + vues analytique Parking | |
| 10 | [10-validation-globale.md](./10-validation-globale.md) | Validation | 2-9 | P0 | 30min | DESIGN.md à jour, tsc/tests/build, revue manuelle | ⚠ |

## Ordre d'exécution

Séquentiel sur l'étape 1 (fondation) puis les 4 domaines sont **indépendants
entre eux** (aucun ne dépend d'un autre domaine) — peuvent être exécutés dans
n'importe quel ordre une fois l'étape 1 posée, ou en parallèle si l'utilisateur
le souhaite. À l'intérieur d'un domaine, l'étape "board jour" précède l'étape
"analytique" par convention de lecture, mais n'a pas de dépendance technique
stricte entre elles (les deux consomment le même socle de l'étape 1, aucune
n'a besoin du résultat de l'autre).

Recommandation d'ordre pratique : RepJour d'abord (aucune décision produit en
attente, valide le socle sur un 2e domaine avant d'attaquer les 3 domaines aux
décisions ouvertes), puis PDJ/Caisse/Parking dans l'ordre où leurs décisions
respectives (D1/D2/D3) sont tranchées.

## Architecture cible

```
src/components/shared/
  useMatchMedia.ts          [inchangé]
  useResponsiveShell.ts     [nouveau]   { isNavbarMobile, isTouchDevice }
  MobileToolbar.tsx         [nouveau]   <nav> fixe + réserve pb-20, générique
  PageHeader.tsx            [inchangé]
  StepNav.tsx               [inchangé]
  LockBadge.tsx             [inchangé]
lib/
  navbarSubtitle.ts         [modifié]   gating factorisé (voir étape 1)
components/analytique/
  AnalytiqueShell.tsx       [modifié]   consomme useResponsiveShell + MobileToolbar
  ToolbarCell               [déplacé]   vers MobileToolbar.tsx, ré-exporté pour compat
components/rapro/
  RaproBoard.tsx            [INCHANGÉ — hors périmètre, cf. Remise en question]
components/repjour/boards/
  DashboardBoard.tsx        [modifié]   consomme useResponsiveShell + MobileToolbar
  AnalytiqueBoard.tsx       [modifié]   mobileIdentity/mobileToolbar activés
  AnalytiqueMoisBoard.tsx   [modifié]   idem
components/pdj/
  BreakfastBoard.tsx        [modifié]
  PdjAnalytiqueBoard.tsx    [modifié]
  PdjAnalytiqueMoisBoard.tsx[modifié]
components/caisse/
  CaisseBoard.tsx           [modifié]
  CaisseAnalytiqueBoard.tsx [modifié]
  CaisseAnalytiqueMoisBoard.tsx [modifié]
components/parking/
  ParkingBoard.tsx          [modifié]
  ParkingHelpPanel.tsx      [modifié]
  ParkingAnalytiqueBoard.tsx[modifié]
  ParkingAnalytiqueMoisBoard.tsx [modifié]
DESIGN.md                   [modifié]   retire "consommé uniquement par Rapro"
```

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|--------------------|--------------------|
| Socle partagé | 2 (`navbarSubtitle.ts`, `AnalytiqueShell.tsx`) | 2 (`useResponsiveShell.ts`, `MobileToolbar.tsx`) |
| RepJour | 3 | 0 |
| PDJ | 3 | 0 |
| Caisse | 3 (+ `LockBadge` usage, `PrintButton` usage) | 0 |
| Parking | 4 | 0 |
| Documentation | 1 (`DESIGN.md`) | 0 |
| **Total** | **~16 modifiés** | **2 nouveaux** |
