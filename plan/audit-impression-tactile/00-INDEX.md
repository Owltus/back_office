# Plan — Audit et fiabilisation de l'impression en mode tactile

## Contexte

PDJ imprime désormais parfaitement en mode tactile (mobile/tablette) après le
correctif de cette session (`MobileToolbar` sans `print:hidden`, corrigé).
L'utilisateur observe que les AUTRES boutons « Imprimer » de l'app (Rapro,
RepJour, Parking, Caisse, et les 10 pages analytique) ne semblent pas avoir le
même comportement en tactile, et a demandé un audit complet, exhaustif,
« n'oublie rien ».

Un swarm de 5 agents d'exploration a passé au crible : les 4 boards jsPDF
(Rapro/RepJour/Parking/Caisse), les 5 fichiers `lib/*/pdf.ts` correspondants,
l'infrastructure partagée (`MobileToolbar`, `PrintButton`, `usePrintShortcut`,
`useResponsiveShell`, `print.ts`, `AnalytiqueShell`), les 10 pages analytique,
et le câblage précis des boutons dans chaque barre d'outils basse tactile.

## Décisions retenues (checkpoint utilisateur)

### D1 — Faire converger vers le comportement PDJ (Option B retenue)

Constat de l'audit : PDJ utilise `window.print()` natif (CSS `@media
print`) — sur tactile, ça ouvre la VRAIE interface d'impression du
navigateur. Les 4 boards jsPDF (Rapro/RepJour/Parking/Caisse) et les 10
pages analytique génèrent au contraire un PDF vectoriel ouvert dans un
nouvel onglet (`window.open` + `pdf.autoPrint()`) : sur desktop, le lecteur
PDF intégré exécute `autoPrint()` (identique à PDJ) ; sur la plupart des
navigateurs mobiles, il n'existe pas de lecteur PDF capable d'exécuter cette
instruction — l'onglet affiche juste le PDF, sans ouvrir d'interface
d'impression. C'était la cause la plus probable du ressenti « ça ne marche
pas pareil que PDJ ».

**Décision : Option B.** Faire converger le comportement TACTILE de ces 5
surfaces (4 boards + le socle analytique partagé) vers celui de PDJ —
`window.print()` + CSS `@media print` sur un document HTML dédié — tout en
GARDANT le PDF vectoriel jsPDF inchangé côté souris (le document jsPDF
actuel reste le mécanisme desktop, aucune régression attendue là-dessus).

Conséquence architecturale majeure : chacune des 5 surfaces doit désormais
porter DEUX rendus du même document — le PDF jsPDF (souris, inchangé) et un
document HTML imprimable dédié, stylé `@media print`, sur le modèle exact de
`.pdj-header`/`.pdj-floors`/`src/styles/pdj.css` (activé sur tactile
uniquement). Pour limiter le risque de dérive entre les deux rendus (signalé
dans l'audit), **les deux consomment la MÊME donnée déjà préparée** par
chaque board (`RaproPdfData`, `RepjourPdfData`, `ParkingSheetPdfData`,
`CaissePdfData`, l'extraction `extractAnalytique`) — jamais une
réimplémentation indépendante à partir de l'état brut du board.

C'est un chantier nettement plus lourd que l'audit initial (5 documents HTML
imprimables à construire, dont Parking en paysage multi-feuilles — le plus
complexe). Les étapes 3 à 7 ci-dessous en portent chacune une tranche,
séparément testable.

### D2 — Durcissement `print:hidden` transverse : inclus dans ce chantier

L'audit a trouvé plusieurs éléments `fixed`/`sticky` sans `print:hidden`
(Dialog/Sheet, modale maison de `ImportSection.tsx`, `EffectOverlay.tsx`,
`<thead sticky>` de `AnalytiqueTable.tsx`, header de `BootSkeleton`) qui
pourraient s'imprimer si l'utilisateur déclenche l'impression NATIVE du
navigateur pendant qu'ils sont affichés — risque distinct du bouton
Imprimer de l'app, mais qui devient PLUS pertinent avec D1 : désormais 5
surfaces supplémentaires impriment nativement le DOM sur tactile, donc
CHAQUE élément flottant de l'app doit être `print:hidden` pour ne jamais
polluer un de ces nouveaux documents imprimés. **Décision : inclus (étape
10).**

### D3 — Exception ponctuelle sur les primitives shadcn : accordée

`CLAUDE.md` interdit de retoucher à la main les primitives shadcn
« vendored » (`src/components/ui/`). L'étape 10 doit pourtant y ajouter
`print:hidden` sur `DialogOverlay`/`DialogContent`/`SheetOverlay`/
`SheetContent` — seul endroit pour corriger le risque à la racine, hérité
automatiquement par toute modale/tiroir de l'app. **Décision : exception
ponctuelle accordée**, strictement limitée à l'ajout de cette classe
additive (aucune autre modification de ces fichiers).

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-parking-garde-fous.md](./1-parking-garde-fous.md) | Parking : pdfBusy, try/catch, disabled (chemin souris jsPDF) | — | P0 | 30 min | Parking aligné sur le pattern des 3 autres boards jsPDF |  |
| 2 | [2-rapro-mobiletoolbar.md](./2-rapro-mobiletoolbar.md) | Rapro : migration vers `MobileToolbar` partagé | — | P0 | 45 min | Rapro sur le socle partagé, `print:hidden` hérité — CRITIQUE maintenant que le tactile imprime nativement ce DOM (D1) | ⚠ |
| 3 | [3-rapro-print-natif.md](./3-rapro-print-natif.md) | Rapro : document HTML imprimable + bascule tactile vers `window.print()` | 2 | P0 | 2h | Rapro imprime en tactile comme PDJ | ⚠ |
| 4 | [4-repjour-print-natif.md](./4-repjour-print-natif.md) | RepJour : document HTML imprimable + bascule tactile | — | P0 | 2h | RepJour imprime en tactile comme PDJ | ⚠ |
| 5 | [5-parking-print-natif.md](./5-parking-print-natif.md) | Parking : document HTML imprimable (paysage, 4 feuilles) + bascule tactile | 1 | P0 | 3h | Parking imprime en tactile comme PDJ | ⚠ |
| 6 | [6-caisse-print-natif.md](./6-caisse-print-natif.md) | Caisse : document HTML imprimable + bascule tactile | — | P0 | 2h | Caisse imprime en tactile comme PDJ | ⚠ |
| 7 | [7-analytique-print-natif.md](./7-analytique-print-natif.md) | Analytique (socle partagé, 10 pages) : document HTML imprimable + bascule tactile | — | P0 | 2h30 | Les 10 pages analytique impriment en tactile comme PDJ, en un seul socle | ⚠ |
| 8 | [8-harmonisation-erreurs.md](./8-harmonisation-erreurs.md) | Harmonisation gestion d'erreur (chemin souris jsPDF restant) | 1, 2 | P1 | 30 min | Plus aucun board n'avale une erreur en silence sur le chemin desktop |  |
| 9 | [9-nettoyage-dette.md](./9-nettoyage-dette.md) | Nettoyage : `printRaproMonthly` mort, `caisse/pdf.ts` dupliqué, fuite `revokeObjectURL` | 3, 4, 5, 6 | P2 | 30 min | Code mort retiré, harnais PDF jsPDF (souris) unifié |  |
| 10 | [10-durcissement-print-hidden.md](./10-durcissement-print-hidden.md) | Durcissement `print:hidden` transverse (D2 + exception D3) | 3, 4, 5, 6, 7 | P0 | 45 min | Dialog/Sheet/modale RepJour/EffectOverlay protégés d'une impression native accidentelle sur les 5 nouvelles surfaces |  |
| 11 | [11-polish-mineur.md](./11-polish-mineur.md) | Polish : aria-label dynamiques, condition `disabled` Parking, `printWithTitle` réentrance (réutilisé par 5 surfaces de plus), raccourci Affichage | 1, 3, 4, 5, 6, 7 | P2 | 45 min | Cohérence fine entre les 5 boards, `print.ts` robuste à un usage 6× plus large |  |
| 12 | [12-validation-globale.md](./12-validation-globale.md) | Validation globale | 1-11 | P0 | 45 min | `tsc`/tests/build verts, checklist de test manuel par page (5 boards + 10 analytique) | ⚠ |

## Ordre d'exécution

1 et 2 d'abord (garde-fous existants, indépendants). 2 débloque 3 (Rapro).
4, 5 (après 1), 6 peuvent démarrer dès le début, en parallèle de 2/3 — ce
sont des documents indépendants. 7 (analytique) est indépendant aussi, mais
son socle partagé bénéficie d'être fait APRÈS avoir livré au moins un board
(3 ou 4) pour réutiliser les mêmes conventions CSS `@media print` plutôt que
d'inventer un troisième style. 8 et 9 ferment le chemin souris jsPDF restant
(peuvent suivre 1/2 sans attendre 3-7). 10 a besoin que les 5 documents
imprimables existent (3-7) pour savoir précisément quels éléments flottants
ils peuvent exposer. 11 et 12 ferment le chantier.

## Architecture cible

Chaque board (Rapro/RepJour/Parking/Caisse) et le socle analytique gagnent un
bloc HTML imprimable dédié, sur le modèle de PDJ (`.pdj-header`/`.pdj-floors`
+ `src/styles/pdj.css` `@media print`) : toujours présent dans le DOM,
invisible à l'écran (`print:hidden` sur le reste, le bloc imprimable
lui-même cible `hidden print:block` ou équivalent), stylé uniquement via
`@media print`. Sur tactile, le bouton Imprimer appelle `printWithTitle()`
(`src/lib/print.ts`, déjà utilisé par PDJ) au lieu de
`printXxxSheet(...)`/jsPDF. Sur souris, RIEN ne change : jsPDF reste le
mécanisme, inchangé.

```
src/components/rapro/RaproBoard.tsx        [modifié — étape 2, 3, 8]
src/components/repjour/boards/DashboardBoard.tsx  [modifié — étape 4, 11]
src/components/parking/ParkingBoard.tsx    [modifié — étape 1, 5, 8, 11]
src/components/caisse/CaisseBoard.tsx      [modifié — étape 6]
src/components/analytique/AnalytiqueShell.tsx     [modifié — étape 7]
src/components/analytique/AnalytiqueTable.tsx     [modifié — étape 7, 10]
src/styles/rapro.css                       [modifié — étape 3]
src/styles/repjour.css                     [modifié — étape 4]
src/styles/parking.css                     [NOUVEAU — étape 5 ; n'existe pas encore, Parking n'a que du Tailwind]
src/styles/caisse.css                      [modifié — étape 6, 9]
src/styles/analytique.css                  [NOUVEAU — étape 7 ; n'existe pas encore]
src/styles.css                             [modifié — étape 5, 7 (ajout des deux @import ci-dessus)]
src/lib/rapro/pdf.ts                       [modifié — étape 9, chemin souris seul]
src/lib/repjour/pdf.ts                     [modifié — étape 9, chemin souris seul]
src/lib/parking/pdf.ts                     [modifié — étape 9, chemin souris seul]
src/lib/caisse/pdf.ts                      [modifié — étape 9, chemin souris seul]
src/lib/analytique/pdf.ts                  [INCHANGÉ — reste le mécanisme souris]
src/lib/print.ts                           [modifié — étape 11, réentrance]
src/components/ui/dialog.tsx               [modifié — étape 10, exception D3]
src/components/ui/sheet.tsx                [modifié — étape 10, exception D3]
src/components/repjour/ImportSection.tsx   [modifié — étape 10]
src/components/shared/EffectOverlay.tsx    [modifié — étape 10]
src/components/auth/AppAuthGate.tsx        [modifié — étape 10]
src/components/affichage/AffichageBoard.tsx       [modifié — étape 11, si présent]
```

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|-------------------|-------------------|
| Boards (composants React) | 5 | 0 |
| Styles CSS d'impression | 3 (rapro.css, repjour.css, caisse.css) + styles.css | 2 (parking.css, analytique.css) |
| Génération PDF (lib, chemin souris) | 4 | 0 |
| Primitifs UI partagés | 2 | 0 |
| Infra tactile/impression partagée | 4 | 0 |
| **Total** | **~20** | **0-2** |
