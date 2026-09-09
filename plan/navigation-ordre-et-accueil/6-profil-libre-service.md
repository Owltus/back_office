# Étape 6 — Réglage en libre-service sur le profil

## Objectif

Permettre à chacun de composer l'ordre de ses propres pages depuis `/profil`,
sans passer par l'admin.

## Contexte

Décision actée : l'admin règle depuis `/comptes` pour n'importe quel compte, et
chacun règle le sien depuis `/profil`. Cette seconde moitié coûte peu, la
première ayant produit le composant : `PageOrderList` est réutilisée telle
quelle, avec le compte courant pour cible.

Côté base, rien à faire. La policy `Users update own profile` autorise déjà un
compte à écrire toute colonne de sa ligne hormis `role` et `email` — c'est ce
qui permet aujourd'hui de modifier son prénom depuis `/profil`. Aucune RPC,
aucune policy supplémentaire.

`ProfilBoard` est par ailleurs le seul consommateur actuel de `refreshProfile`
(`ProfilBoard.tsx:88`), donc le rafraîchissement du contexte après écriture y
suit un chemin déjà tracé.

## Fichier(s) impacté(s)

- `src/components/repjour/boards/ProfilBoard.tsx` (modifié)

## Travail à réaliser

### 1. Monter la liste

Ajouter une section à la page de profil, sous les champs d'identité, qui rend
`PageOrderList` pour le compte courant. Les pages listées sont celles que le
compte peut voir, dans son ordre effectif — c'est-à-dire exactement ce qu'il a
sous les yeux dans sa barre de navigation.

### 2. Un mot d'explication

La page d'accueil étant la tête de liste, une phrase courte suffit à le dire :
la première page est celle qui s'ouvre à la connexion. Reprendre la même
mention que dans le modal des comptes, pour que les deux écrans se répondent.

### 3. L'écriture et le rafraîchissement

`update profiles set page_order = ...` sur sa propre ligne, puis
`refreshProfile()` pour que la barre suive immédiatement. Même régime que
partout ailleurs : application immédiate, verrou pendant l'appel, patch après
succès.

### 4. Ce qu'il ne faut pas faire

Ne pas dupliquer la logique de réconciliation : `PageOrderList` reçoit l'ordre
effectif calculé par les fonctions de l'étape 2, elle ne le recalcule pas.

## Ordre d'exécution

1. Monter `PageOrderList` dans `ProfilBoard`.
2. Brancher l'écriture et `refreshProfile`.
3. Vérifier qu'un compte en lecture seule sur toutes ses pages peut quand même
   régler son ordre : c'est une préférence d'affichage, pas un droit.

## Critère de validation

- Un compte non-admin réordonne ses pages depuis `/profil` et voit sa barre
  changer aussitôt, sans rechargement.
- Sa page d'accueil suit à la connexion suivante.
- Il ne peut pas modifier l'ordre d'un autre compte — vérifié par la policy,
  déjà en place.
- L'admin obtient le même résultat depuis `/profil` que depuis `/comptes` sur
  son propre compte.
- `npx tsc --noEmit`, `pnpm test` et `pnpm build` au vert.

## Contrôle qualité (revue)

Non critique. Un point de vigilance : deux écrans écrivent désormais la même
colonne. Vérifier qu'un réglage fait sur `/profil` puis consulté depuis
`/comptes` montre bien la même chose, et qu'aucun des deux ne réécrit la
préférence à l'ouverture — seul un geste de l'utilisateur doit écrire.
