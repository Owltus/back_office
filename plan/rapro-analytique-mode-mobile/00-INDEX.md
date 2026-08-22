# Plan — Déploiement du mode mobile de Rapprochement vers ses pages Analytique

## Contexte

La page `/rapro` (feuille du jour) a reçu cette session un mode mobile complet et
validé : barre d'outils basse fixe (pager Précédent/Suivant + actions), identité
de page (titre + badge de statut) déplacée dans la Navbar globale sous 1024px via
`lib/navbarSubtitle.ts`, cibles tactiles à 44px, contenu d'aide adapté au tactile.
Ce pattern est déjà documenté comme générique dans `DESIGN.md` (sections
« Barre d'outils basse mobile », « Navigation (barre du haut) », « Status Badge »).

L'utilisateur demande de porter EXACTEMENT ce même mode mobile — même barre
d'outils, même logique — vers les deux pages enfants analytique du
rapprochement : la vue annuelle (`RaproAnalytiqueBoard.tsx`) et le détail mensuel
(`RaproMonthlyBoard.tsx`).

Contrainte structurante découverte à l'exploration : ces deux vues sont montées
sur `AnalytiqueShell.tsx`, un socle **partagé par 10 pages analytique** de l'app
(RepJour/PDJ/Parking/Rapro/Caisse × annuel+mensuel). Le titre et les actions
(dont le bouton Imprimer) sont possédés par le shell, pas par les boards — toute
migration de l'identité de page vers la Navbar ou toute barre basse fixe doit
donc être ajoutée à `AnalytiqueShell.tsx` sous forme de **props optionnelles**
(sur le modèle de `printTitle`, déjà optionnel), pour ne rien changer aux 8
autres pages qui ne les activeront pas.

Autre contrainte : le bouton Imprimer (avec son état `disabled`/`loading`) est
déjà géré à l'intérieur du shell (`handlePrint`), pas par les boards — la
cellule "Imprimer" de la future barre basse doit donc être injectée PAR le
shell lui-même, les boards ne fournissant que leurs cellules propres
(navigation temporelle / retour).

## Angles à clarifier

- **D1 — Contenu exact de la barre basse mobile par vue** (structurant). Rapro
  (page journalière) a 5 cellules (Préc./Aide/Analytique/Imprimer/Suiv.) parce
  que la page a 5 actions distinctes. Les vues analytique n'ont PAS toutes ces
  actions : proposition retenue par défaut —
  - Vue annuelle : 3 cellules, `[Année précédente] [Imprimer] [Année suivante]`
    (reprise exacte des actions déjà présentes dans l'en-tête aujourd'hui : le
    `YearNav` + `PrintButton` — aucune action nouvelle inventée).
  - Vue mensuelle : 2 cellules, `[Retour] [Imprimer]` (reprise exacte de
    `AnalytiqueBackButton` + `PrintButton` déjà présents — pas de pager mois par
    mois inventé, cette navigation n'existe pas aujourd'hui sur cette page).
  - **Pas de cellule "Aide"** : aucun modal d'aide n'existe aujourd'hui sur ces
    deux pages (contrairement à `/rapro`) — en créer un serait une fonctionnalité
    nouvelle, hors du périmètre « même manière et logique », donc omise.
  Si l'utilisateur veut un contenu différent (ex. ajouter un lien retour vers
  `/rapro` sur la vue annuelle), le dire avant le GO.
- **D2 — Identité de page dans la Navbar** (structurant). Le nom de page affiché
  par la Navbar (`currentPage.label`) est déjà "Rapprochement" pour toutes les
  routes `/rapro/*` (aucune config à ajouter). Le `title` de chaque vue
  (`"Analytique"` pour l'annuelle, `"Août 2026"` pour le mensuel) deviendrait le
  sous-titre Navbar sous 1024px, exactement comme le jour l'est pour `/rapro`.
  Aucun badge de statut n'existe pour ces vues (pas de notion de clôture
  annuelle/mensuelle) — rien à migrer de ce côté, ce n'est pas un oubli.
- **D3 — Portée de l'extension d'`AnalytiqueShell.tsx`** (structurant, TRANCHÉ).
  Nouvelles props strictement OPTIONNELLES (`mobileIdentity?: boolean`,
  `mobileToolbar?: ReactNode`), sans valeur par défaut activée : les 8 autres
  pages analytique (RepJour/PDJ/Parking/Caisse) ne changent pas de comportement
  tant qu'elles ne passent pas ces props. Décision actée à l'exploration,
  reprise ici pour traçabilité — pas une option à trancher par l'utilisateur.

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-hook-usematchmedia-partage.md](./1-hook-usematchmedia-partage.md) | Factorisation | — | P0 | 15 min | Hook `useMatchMedia` partagé, réutilisé par RaproBoard | |
| 2 | [2-extension-analytique-shell.md](./2-extension-analytique-shell.md) | Socle | 1 | P0 | 45 min | `AnalytiqueShell` accepte `mobileIdentity` + `mobileToolbar` | ⚠ |
| 3 | [3-barre-mobile-vue-annuelle.md](./3-barre-mobile-vue-annuelle.md) | Vue annuelle | 2 | P0 | 30 min | `RaproAnalytiqueBoard` en mode mobile complet | |
| 4 | [4-barre-mobile-vue-mensuelle.md](./4-barre-mobile-vue-mensuelle.md) | Vue mensuelle | 2 | P0 | 20 min | `RaproMonthlyBoard` en mode mobile complet | |
| 5 | [5-documentation-et-validation.md](./5-documentation-et-validation.md) | Validation | 3, 4 | P0 | 20 min | DESIGN.md à jour, tsc/tests/build verts | ⚠ |

## Ordre d'exécution

Séquentiel strict : l'étape 1 (hook partagé) est un pré-requis mécanique pour
les étapes 3 et 4. L'étape 2 (extension du shell) doit être posée avant de
câbler les deux boards (3 et 4), qui peuvent ensuite être faits dans n'importe
quel ordre (indépendants l'un de l'autre — même dépendance commune à l'étape 2).
L'étape 5 clôt le chantier : documentation + suite de validation complète.

## Architecture cible

```
src/components/shared/useMatchMedia.ts        [nouveau]  hook extrait de RaproBoard.tsx
src/components/rapro/RaproBoard.tsx           [modifié]  importe le hook au lieu de le redéfinir
src/components/analytique/AnalytiqueShell.tsx [modifié]  + props mobileIdentity / mobileToolbar
src/components/rapro/RaproAnalytiqueBoard.tsx [modifié]  passe mobileIdentity + mobileToolbar (pager année)
src/components/rapro/RaproMonthlyBoard.tsx    [modifié]  passe mobileIdentity + mobileToolbar (retour)
DESIGN.md                                     [modifié]  extension documentée (props optionnelles du shell)
```

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|--------------------|--------------------|
| Frontend (composants) | 4 | 1 |
| Documentation | 1 | 0 |
| **Total** | **5 modifiés** | **1 nouveau** |
