# Étape 4 — Validation globale

## Objectif

Vérifier que le chantier tient d'un bout à l'autre : homogénéité visuelle avec Affichage, dépôt limité à la colonne gauche (style PDJ), tampon redimensionnable et net, sans régression sur les acquis (détection, multi-pages, grille responsive, tampon déplaçable).

## Contexte

Étape finale ⚠ : elle valide l'ensemble des modifications frontend, y compris les interactions (drag, resize, dépôt) qui ne sont pas couvertes par les tests unitaires. Aucune écriture DB n'est en jeu (prototype 100 % local).

## Fichier(s) impacté(s)

- Aucun nouveau changement de code attendu (uniquement corrections si un critère échoue).

## Travail à réaliser

### 1. Validation automatique

```bash
npx tsc --noEmit
npx vitest run
pnpm build
```

Vérifier : 0 erreur TypeScript, suite verte (dont les nouveaux cas `scale`), build OK et découpage des chunks préservé (`extract`/`stamp` toujours en lazy).

### 2. Vérification navigateur (localhost:3000/facturation, compte admin)

- État vide : les trois panneaux (gauche, centre, droite) sont visibles d'emblée, en cartes, sans barre d'en-tête — aspect homogène avec Affichage.
- Dépôt : glisser un PDF sur la dropzone gauche l'ajoute ; le style est celui de PDJ ; déposer hors de la colonne gauche ne fait rien.
- Tampon : redimensionnement par les coins (coin opposé fixe, bornes respectées), rendu net ; déplacement toujours possible.
- Multi-pages : grille responsive intacte (2 colonnes sur large écran, 1 sinon) ; le tampon se pose et se redimensionne sur n'importe quelle page.
- Apposer le tampon : le PDF téléchargé porte le cartouche à la bonne page, position et taille conformes à l'aperçu.

## Ordre d'exécution

1. Lancer les trois commandes de validation.
2. Vérifier les points navigateur ci-dessus.
3. Corriger tout écart puis reboucler.

## Critère de validation

- `npx tsc --noEmit`, `npx vitest run`, `pnpm build` : tous verts.
- Tous les points de la vérification navigateur sont satisfaits.

## Contrôle /borg

Audit ciblé sur la zone touchée (frontend Facturation), à lancer après exécution :
- Cohérence de la géométrie partagée : l'aperçu HTML et `stamp.ts` produisent le MÊME cartouche (page, position, échelle) — pas de dérive entre les deux chemins.
- Bornage : `stampScale` et la position restent dans les limites de la page à toute échelle (pas de cartouche hors page).
- Non-régression : détection déterministe, apprentissage `localStorage`, multi-pages et grille responsive inchangés.
- Pas de dépôt résiduel au niveau document (le drag doit être confiné à la colonne gauche).
