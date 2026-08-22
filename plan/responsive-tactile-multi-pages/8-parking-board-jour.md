# Étape 8 — Parking : board jour, densité et édition séparées

## Objectif

Séparer dans `ParkingBoard.tsx` les deux préoccupations aujourd'hui confondues
dans `useIsCompact()` : la densité géométrique de la grille (légitimement liée
à la largeur) et la capacité d'édition/glisser-déposer (qui devrait dépendre
du pointeur, pas de la largeur) — selon l'arbitrage D3. Câbler le socle de
l'étape 1 pour l'identité de page et les actions du `PageHeader`.

## Contexte

**Ne pas commencer le code de cette étape avant que D3 soit tranchée**
(`00-INDEX.md`). Deux angles morts réels, déjà vérifiés dans le code actuel :
un ordinateur à la souris en fenêtre étroite (<768px) perd l'édition à tort
(`canEdit = can(...) && !isCompact`, `isCompact` = pure largeur) ; une
tablette tactile large (768-1024px, donc `isCompact=false`) garde le
glisser-déposer pleinement actif au doigt, avec des poignées de
redimensionnement de 6px non adaptées au tactile.

Parking n'utilise PAS la prop `leading` de `PageHeader` (le commentaire de
`PageHeader.tsx` qui l'affirme est obsolète/faux — à corriger à l'occasion,
sans effort dédié).

## Fichier(s) impacté(s)

- `src/components/parking/ParkingBoard.tsx`
- `src/components/shared/PageHeader.tsx` (commentaire seulement, correction de la mention `leading` obsolète pour Parking)
- `src/components/shared/StepNav.tsx` (commentaire seulement, correction de la mention « sélecteur de plage » — c'est un calendrier à sélection simple)

## Travail à réaliser

### 1. Décision D3 — séparer densité et édition

Piste par défaut (à ajuster selon l'arbitrage exact retenu) :
```tsx
const { isTouchDevice } = useResponsiveShell()
// isCompact : garde SA sémantique actuelle (largeur pure, 768px) —
// pilote UNIQUEMENT la densité géométrique de la grille (colonnes, hauteur).
const isCompact = useIsCompact()
// canEdit : dépend désormais du pointeur, pas de la largeur — un ordinateur
// à la souris en fenêtre étroite garde l'édition ; un écran tactile (large
// ou non) passe en lecture seule pour le glisser-déposer.
const canEdit = can('parking', 'ecriture') && !isTouchDevice
```
Effet : la géométrie compacte (colonnes réduites, noms tronqués) continue de
se déclencher sous 768px comme aujourd'hui, INDÉPENDAMMENT du fait que
l'édition soit active ou non. Un ordinateur à la souris en fenêtre étroite
récupère l'édition en mode compact géométrique (drag-and-drop possible sur une
grille resserrée — à valider visuellement que ça reste utilisable). Une
tablette tactile large (768-1024px, densité normale) passe en lecture seule
malgré sa largeur confortable.

Si l'arbitrage retenu diffère (ex. garder `isCompact` comme seul facteur
d'édition aussi, mais élargir son seuil ou ajouter `isTouchDevice` en OU plutôt
qu'en remplacement), adapter la formule ci-dessus en conséquence — le principe
à respecter dans tous les cas : la variable qui contrôle `canEdit` doit
intégrer `isTouchDevice`, pas seulement une largeur.

### 2. Poignées de redimensionnement en tactile

Si `canEdit` peut désormais être vrai sur une tablette qui n'active PAS le
mode compact géométrique (large, ≥768px) — attendre, avec la formule ci-dessus
`canEdit` dépend de `isTouchDevice`, donc si tactile → `canEdit=false` → les
poignées ne s'affichent plus du tout pour ce cas. Ce sous-point ne s'applique
que si l'arbitrage D3 retenu autorise malgré tout l'édition tactile dans
certains cas (ex. tablette + stylet) — dans ce cas, agrandir les poignées
(`w-1.5`, 6px) à une cible tactile plus généreuse pour cet usage précis.

### 3. Câblage `PageHeader` standard

`useResponsiveShell` pour `isNavbarMobile`, gating `title`, barre basse
tactile pour Aide/Vue analytique/Impression (le panoramique reste actif à
toute largeur/tout pointeur, ce n'est pas une action de la barre — rien à
changer là). Pas de `LockBadge` à ajouter (aucune notion de statut clôturé
sur Parking).

### 4. Corrections de commentaires (sans effort dédié)

`PageHeader.tsx` lignes 8-12 et `StepNav.tsx` (mention « sélecteur de plage ») :
corriger pour refléter le code réel de Parking (pas de `leading`, calendrier à
sélection simple `mode="single"`, pas une plage).

## Ordre d'exécution

1. Décision D3 (§1) — c'est le cœur de l'étape, tout le reste en dépend.
2. Poignées tactiles (§2), si applicable selon l'arbitrage.
3. Câblage `PageHeader`/barre basse (§3).
4. Corrections de commentaires (§4).

## Critère de validation

- `npx tsc --noEmit`, `npx vitest run`, `npx pnpm build`.
- Vérification manuelle : ordinateur à la souris en fenêtre étroite (<768px)
  garde le glisser-déposer ; tablette tactile large (768-1024px, émulée ou
  réelle) passe en lecture seule malgré sa largeur ; la densité géométrique
  (colonnes réduites) continue de se déclencher sous 768px indépendamment.

## Contrôle qualité (revue)

Étape marquée critique : Parking a une fonctionnalité de glisser-déposer
identifiée dans DESIGN.md comme la SEULE exception à l'exigence d'opérabilité
clavier/souris de l'app — toucher sa condition d'activation demande une revue
attentive. `/borg` non installé, revue manuelle ciblée :

- Confirmer qu'aucun rôle avec droit d'écriture ne perd l'édition à tort sur
  un usage desktop normal (fenêtre large, souris) — seule la fenêtre étroite
  OU le tactile doivent désormais restreindre, jamais le rôle seul.
- Confirmer que la RLS Supabase reste l'autorité réelle des droits (ce
  changement est uniquement un repli ergonomique front, comme documenté pour
  `isCompact` existant).
