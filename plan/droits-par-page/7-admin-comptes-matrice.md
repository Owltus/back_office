# Étape 7 — Écran d'administration : grade + matrice pages × niveau

## Objectif

Donner à l'administrateur, depuis `/comptes`, l'outil pour piloter la nouvelle granularité : choisir le **grade** d'un compte (admin / utilisateur) et, pour un utilisateur, régler **page par page** le niveau (aucun / Lecture / Écriture / Gestion). Le tout câblé sur les RPC serveur de l'Étape 1.

## Contexte

`ComptesBoard` propose aujourd'hui un unique `RoleSelect` à 3 valeurs, écrit directement par `supabase.from('profiles').update({ role })`. On remplace ce sélecteur mono-valeur par : (a) un sélecteur de grade à 2 valeurs, appelant `set_user_grade` ; (b) une matrice des 8 pages, chaque ligne offrant {—, Lecture, Écriture, Gestion}, appelant `set_page_permission` / `remove_page_permission`. Un compte de grade `admin` n'affiche pas la matrice (il a Gestion partout par nature).

## Fichier(s) impacté(s)

- `src/components/repjour/boards/ComptesBoard.tsx` (refonte du bloc rôle → grade + matrice)
- (annexes) `src/components/repjour/boards/ProfilBoard.tsx` : affichage lecture seule des droits de l'utilisateur courant (facultatif, transparence)

## Travail à réaliser

### 1. Sélecteur de grade

Remplacer `ROLES = ['utilisateur','super_utilisateur','admin']` par `GRADES = ['utilisateur','admin']`. À la sauvegarde :
```ts
await supabase.rpc('set_user_grade', { p_user: targetId, p_grade: grade })
```
(remplace l'`update({ role })` direct — cohérent avec l'étanchéité : le changement de grade passe par un canal serveur gardé).

### 2. Matrice pages × niveau (grade utilisateur)

Charger les permissions de la cible : `supabase.from('user_page_permissions').select('page, level').eq('user_id', targetId)` (l'admin y a accès via la policy SELECT self-or-admin). Rendu : une ligne par entrée de `PAGES`, un contrôle segmenté à 4 crans :

```
Page            Accès
RepJour         [ — | Lecture | Écriture | Gestion ]
PDJ             [ — | Lecture | Écriture | Gestion ]
Parking         [ — | Lecture | Écriture | Gestion ]
…
Facturation     [ — | Lecture | Écriture | Gestion ]
Artefact        [ — | Lecture | Écriture | Gestion ]
```

Sur changement :
```ts
if (next === '—') await supabase.rpc('remove_page_permission', { p_user, p_page })
else              await supabase.rpc('set_page_permission', { p_user, p_page, p_level: next })
```

Idéalement optimiste (patch local immédiat, rollback si l'RPC échoue) ou invalidation `useQuery`. Prévoir un raccourci « Tout Lecture » / « Retirer tout » pour aller vite.

### 3. Cohérence d'affichage

- Badge de grade sur chaque compte (comme l'actuel badge de rôle), 2 couleurs.
- Pour un compte admin : masquer la matrice, afficher « Accès total (administrateur) ».
- Réutiliser `LEVEL_LABELS` (Étape 3) pour les libellés ; pas de valeurs en dur.

### 4. Création de compte

À la création (`handleCreate`) : grade par défaut `utilisateur`, **aucune permission** (l'admin ouvre ensuite les pages). L'insert `profiles` conserve `role: 'utilisateur'`. Les permissions se posent après création via la matrice.

## Ordre d'exécution

1. Remplacer `RoleSelect` (3 rôles) par le sélecteur de grade (2 valeurs) + appel `set_user_grade`.
2. Ajouter le chargement des permissions de la cible + la matrice + les appels RPC.
3. Adapter badges/labels ; masquer la matrice pour les admins.
4. Ajuster la création (grade `utilisateur`, zéro permission).
5. `tsc` + `build`.

## Critère de validation

- L'admin change un grade → propagé en base via `set_user_grade` ; l'utilisateur cible le voit au cycle de revalidation.
- L'admin ouvre « Parking : Écriture » → l'utilisateur voit Parking apparaître dans sa navbar (après revalidation) et peut y saisir.
- L'admin met « Caisse : — » → la page disparaît pour l'utilisateur et l'écriture est refusée en base.
- Un non-admin ne peut pas atteindre `/comptes` (grade), et les RPC refusent ses appels (garde serveur).
- `tsc` + `build` verts.

## Contexte complémentaire

C'est l'écran qui rend la migration « table rase » exploitable : sans lui, un utilisateur reste sans accès. Il doit donc être terminé avant la bascule (Étape 8) pour permettre le pré-remplissage des droits.
