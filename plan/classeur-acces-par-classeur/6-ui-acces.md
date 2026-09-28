# Étape 6 — Interface de gestion des accès

## Objectif

Permettre à la gestion et à l'admin de régler, classeur par classeur,
l'accès pour tous et les exceptions ; proposer « Privé » à la création.

## Fichier(s) impacté(s)

- `src/components/classeur/dialogs/AccesClasseurDialog.tsx` (nouveau)
- `src/components/classeur/dialogs/ClasseurDialog.tsx` (création : option)
- `src/components/classeur/ClasseurDashboard.tsx` / `ClasseurDashboardActions.tsx` (carte « Accès »)
- `src/components/classeur/ClasseurList.tsx` (menu d'un classeur, badge)

## Travail à réaliser

### 1. Dialogue « Accès au classeur » (gestion / admin)

- **Accès pour tous** : Aucun (privé) / Lecture / Écriture.
- **Exceptions** : liste des personnes ayant un droit sur la page Classeur
  (RPC `classeur_personnes`), chacune avec : « Comme tout le monde » (pas
  d'exception) / Aucun / Lecture / Écriture, et son **niveau effectif**
  affiché (« Lecture — plafonné par son droit de page »).
- Le créateur est signalé (« créateur : écriture par défaut »).
- Enregistrement par ligne, erreurs inline (pas de toasts), `isPending`
  pour les gardes.

### 2. Création

`ClasseurDialog` : choix « Lecture pour tous » (défaut) / « Privé », visible
seulement pour la gestion et l'admin (la base force de toute façon `lecture`
pour les autres).

### 3. Points d'entrée

- Accueil d'un classeur : carte « Accès au classeur » (gestion / admin).
- Liste des classeurs : badge **Privé** (accès pour tous = aucun) ou
  **Partagé** (exceptions présentes) visible de la gestion.

## Critère de validation

- Un changement d'accès se voit immédiatement dans la liste d'un autre
  compte au rafraîchissement (invalidation `classeurKeys.all`).
- Test de rendu : le dialogue n'affiche jamais d'adresse e-mail.
