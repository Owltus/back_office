# Étape 4 — PDF : balance et reportées au document

## Objectif

Refléter la nouvelle logique dans la feuille imprimée (`src/lib/rapro/pdf.ts`) :
faire apparaître la **balance** dans le bandeau de compteurs et un repère pour les
chambres **reportées** — le tout en restant sur **une page A4**. Pas de nouveau
statut à représenter (D2).

## Contexte

`renderRaproDocument` (`src/lib/rapro/pdf.ts`) produit : en-tête + date, un bandeau
de **5 compteurs** (Vendues / Nettoyées / Bloquées / Refus / No-show, l.99-118
alimentés par `RaproPdfData.counts` l.31-37), la grille complète par étage en
couleurs de statut (l.120-146, couleurs `CELL_FILL` l.73-79), une légende
(l.150-167), le cadre commentaire, la mention de clôture et deux cadres de
signature. Le vocabulaire de statut est inchangé (D2) → `CELL_FILL`/légende ne
bougent pas ; seuls la balance et le repère « reportée » s'ajoutent.

Contrainte « une page A4 » explicite (`plan/rapro-cloture-commentaire-pdf/`) ; la
hauteur de grille est déjà serrée (`cellH = 4.6`). Ajouter une case/repère doit
tenir sans déborder.

## Fichier(s) impacté(s)

- `src/lib/rapro/pdf.ts` (modifié)
- `src/components/rapro/RaproBoard.tsx` (modifié — `handleGeneratePdf` transmet balance + reportées)

## Travail à réaliser

### 1. Balance dans le bandeau

Ajouter la balance à `RaproPdfData.counts` (l.31-37) et au bandeau (`cells`,
l.99-105). Étudier le nombre de cases : passer de 5 à 6 réduit la largeur —
vérifier la lisibilité, ou relibeller « Bloquées » en « Balance / Reste » (cohérent
avec l'écran, étape 3).

### 2. Chambres reportées

Transmettre l'ensemble `carried` (étape 2) à `RaproPdfData` et marquer les cases
reportées (liseré ou astérisque, pas une couleur de statut) + une entrée de
légende. Rendre les reportées inoccupées du jour si elles doivent figurer.

## Ordre d'exécution

1. Étendre `RaproPdfData` (balance, `carried`) et l'appel `handleGeneratePdf`.
2. Ajouter la case balance au bandeau ; vérifier la largeur (5 → 6 cases).
3. Marquer les reportées + entrée de légende.
4. Générer un PDF de contrôle et vérifier le rendu sur une page A4.
5. `npx tsc --noEmit`.

## Critère de validation

- Le bandeau montre la balance ; à balance 0, la valeur est cohérente avec l'écran.
- Les reportées sont visibles et présentes dans la légende.
- Le document tient sur **une seule page A4** (pas de débordement de la grille).
- `npx tsc --noEmit` vert.
