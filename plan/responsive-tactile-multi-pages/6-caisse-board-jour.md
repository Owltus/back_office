# Étape 6 — Caisse : board jour responsive tactile

## Objectif

Câbler `CaisseBoard.tsx` sur le socle de l'étape 1, implémenter la décision
produit D2 (navigation par shift) une fois tranchée, ajouter `compact` au
`LockBadge` existant, harmoniser le double comportement de blocage du
`PrintButton`.

## Contexte

**Ne pas commencer le pager tactile avant que D2 soit tranchée**
(`00-INDEX.md`). Caisse a DÉJÀ un `LockBadge` (« Clôturée »/« Ouverte ») mais
sans le prop `compact` — contrairement à Rapro. `badgeAlignBreakpoint` est au
défaut (`'lg'`), à vérifier intentionnellement comme pour PDJ.

## Fichier(s) impacté(s)

- `src/components/caisse/CaisseBoard.tsx`
- `src/lib/caisse/shift.ts` (SI D2 = ajouter un sélecteur de shift dédié, lecture seule sinon)

## Travail à réaliser

### 1. Câblage responsive standard

`useResponsiveShell`, gating `title`/`actions`/`badge` (ajouter `compact` au
`LockBadge` existant, cohérent avec le fait que son statut migre désormais
dans la Navbar sous 1024px comme sur Rapro), `actionsAlign="end"`.

### 2. Décision D2 — pager tactile et navigation shift

Selon l'arbitrage retenu :
- **Option (a)** : le pager tactile bas-fixe garde la sémantique actuelle
  (Préc./Suiv. = 1 shift, via `stepSlot`) — libellés à adapter (« Shift
  précédent »/« Shift suivant » plutôt que « Jour précédent »/« Jour suivant »,
  déjà le cas dans le `StepNav` desktop actuel).
- **Option (b)** : ajouter un sélecteur de shift dédié (3 pills matin/soir/nuit)
  dans la barre basse EN PLUS du pager, pour sauter directement à un shift
  non adjacent sans multiplier les taps — nouveau composant si retenu, à
  garder simple (pas de `Select` générique, un groupe de 3 boutons suffit).

Le bouton « Caution » (création, hors navigation/impression) : selon
l'arbitrage — piste par défaut si aucune préférence explicite : garder ce
bouton UNIQUEMENT dans l'en-tête desktop (mode souris), l'omettre de la barre
basse tactile (créer une caution est une action ponctuelle, pas une action de
navigation répétée comme Préc./Suiv./Imprimer) ; si l'usage tactile de cette
fonction s'avère fréquent, l'ajouter comme cellule dédiée à revoir plus tard.

### 3. Harmoniser `PrintButton`

Le blocage à l'impression est aujourd'hui incohérent selon le chemin d'entrée
(modale `PrintBlockedDialog` au raccourci Ctrl+P, simple `disabled`+tooltip au
clic bouton). Uniformiser sur le même comportement dans les deux cas — le
choix du comportement final (toujours modale, ou toujours tooltip) est laissé
à l'exécutant selon ce qui est le plus cohérent avec le reste de l'app
(Rapro/RepJour utilisent `disabled`+tooltip au clic ; conserver ce choix pour
Caisse aussi et retirer `PrintBlockedDialog` du chemin clic-clavier, sauf si
l'utilisateur exprime une préférence contraire en cours d'exécution).

## Ordre d'exécution

1. Câblage responsive standard (§1).
2. Décision D2 — pager tactile (§2).
3. Harmonisation `PrintButton` (§3).

## Critère de validation

- `npx tsc --noEmit`, `npx vitest run`, `npx pnpm build`.
- Vérification manuelle desktop (inchangé) + tactile (barre basse, navigation
  shift ou sélecteur dédié selon l'option retenue) + comportement uniforme du
  blocage d'impression (clic bouton ET Ctrl+P donnent le même retour).
