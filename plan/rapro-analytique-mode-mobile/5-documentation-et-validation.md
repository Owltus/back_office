# Étape 5 — Documentation DESIGN.md et validation globale

## Objectif

Documenter l'extension du socle analytique dans `DESIGN.md` (props optionnelles
`mobileIdentity`/`mobileToolbar` d'`AnalytiqueShell`, portée limitée à Rapro
pour l'instant) et valider l'ensemble du chantier sur les 4 étapes précédentes.

## Contexte

DESIGN.md documente déjà le pattern comme générique (sections « Barre d'outils
basse mobile », « Navigation (barre du haut) ») avec Rapro comme SEUL exemple
d'usage. Il faut ajouter une note que ce pattern est désormais consommé par le
socle `AnalytiqueShell` (via des props opt-in) et par quelles pages
concrètement (les deux vues Rapro, pas les 8 autres pages analytique).

## Fichier(s) impacté(s)

- `DESIGN.md` (modifié)

## Travail à réaliser

### 1. Compléter la section « Barre d'outils basse mobile »

Ajouter une ligne factuelle : le pattern est désormais exposé par
`AnalytiqueShell` via `mobileToolbar` (fonction recevant la cellule Imprimer
déjà construite par le shell) et `mobileIdentity` (bascule du titre vers la
Navbar) — actuellement consommé par les vues annuelle et mensuelle du
Rapprochement uniquement ; les 8 autres pages analytique du socle n'ont pas
(encore) ce mode, ne pas présumer qu'elles l'ont sans vérifier le code.

### 2. Validation globale

```bash
npx tsc --noEmit
npx vitest run
npx pnpm build
```

## Ordre d'exécution

1. Mettre à jour DESIGN.md.
2. Lancer la suite de validation complète (types, tests, build).
3. Si possible, vérification visuelle des deux vues (annuelle + mensuelle) sous
   640px ET entre 640px et 1024px ET au-dessus de 1024px — trois paliers
   distincts à couvrir (comme documenté pour `/rapro`).

## Critère de validation

- `npx tsc --noEmit` : aucune erreur.
- `npx vitest run` : 428 tests (ou plus si des tests ont été ajoutés) verts.
- `npx pnpm build` : succès, découpage des chunks inchangé pour les 8 pages
  analytique non concernées.
- DESIGN.md reflète fidèlement le nouveau comportement (pas de description
  d'un état qui n'existe pas dans le code, conformément à la discipline déjà
  suivie cette session).

## Contrôle qualité (revue)

Étape marquée critique (validation globale de fin de chantier). `/borg` non
installé sur ce projet — remplacer par une relecture manuelle ciblée :

- Relire le diff complet des 5 fichiers modifiés + 1 nouveau, en particulier
  `AnalytiqueShell.tsx`, pour confirmer qu'aucune branche nouvelle ne s'active
  par défaut pour les 8 pages non concernées.
- Confirmer qu'aucun test des autres domaines (RepJour, PDJ, Parking, Caisse)
  n'a été modifié ou n'a de comportement différent après ce chantier.
