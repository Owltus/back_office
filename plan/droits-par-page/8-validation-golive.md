# Étape 8 — Validation d'étanchéité, pré-remplissage, bascule

## Objectif

Prouver que la granularité est **réellement étanche** (pas seulement à l'écran), pré-remplir les droits des comptes existants pour que la bascule soit transparente, puis basculer. C'est le jalon qui autorise à considérer le chantier « sûr ».

## Contexte

Jusqu'ici l'UI (Étapes 5, 6) et la base (Étapes 1, 2) ont été construites séparément. Cette étape les confronte : on vérifie qu'un compte bridé ne peut **ni voir** une page interdite, **ni y écrire via l'API** en contournant l'UI. On traite aussi la conséquence de la décision « table rase » : au go-live les non-admins n'ont aucun droit → il faut leur ré-attribuer avant de basculer, sinon coupure de service.

## Fichier(s) impacté(s)

- Aucun fichier de code nouveau : validation + opérations d'administration.
- Éventuel `supabase/prefill_permissions.sql` (nouveau, optionnel — pré-remplissage en masse si beaucoup de comptes)

## Travail à réaliser

### 1. Test d'étanchéité adversarial (le plus important)

Créer un compte de test grade `utilisateur` avec un seul droit (ex. `parking: lecture`). Vérifier, **en contournant l'UI** (appel direct à l'API Supabase depuis la console ou un script, avec le JWT du compte de test) :

- `SELECT` parking : autorisé.
- `INSERT`/`UPDATE`/`DELETE` parking : **refusé par la RLS** (pas seulement bouton masqué).
- `INSERT` caisse / pdj / rapro / affichage / facturation : **refusé** (aucun droit).
- `set_page_permission` / `set_user_grade` appelés par ce compte : **refusés** (`not authorized`).
- `INSERT` direct dans `user_page_permissions` par ce compte : **refusé** (pas de policy write).

Si l'un de ces tests passe alors qu'il devrait échouer → **stop**, retour Étape 2 (RLS incomplète).

### 2. Test fonctionnel par niveau (UI)

Pour chaque niveau, sur 2-3 pages représentatives :
- Lecture : navigation OK, aucune action ; impression/PDF disponibles (elles l'étaient à tous).
- Écriture : saisie/import OK, pas de suppression/clôture-réouverture sensible.
- Gestion : actions complètes (suppression, réouverture hors grâce caisse, destinataires RepJour).
- Grade admin : accès total aux 8 pages + `/comptes`.
- Utilisateur sans aucune page : `NoAccessNotice`.

### 3. Pré-remplissage des droits (avant bascule)

Deux voies (au choix de l'utilisateur) :
- **Manuelle** via `/comptes` (Étape 7) : recommandé si peu de comptes — l'admin ouvre les pages de chacun.
- **En masse** via `supabase/prefill_permissions.sql` : `INSERT` de permissions pour reproduire l'usage antérieur (ex. donner Écriture sur les pages métier aux ex-`super_utilisateur`, Lecture aux ex-`utilisateur`), à partir d'une liste fournie par l'utilisateur. Opération d'écriture de masse → confirmation explicite.

### 4. Validation technique

- `npx tsc --noEmit` vert.
- `pnpm build` vert (vérifier le découpage des chunks : le nouveau domaine `permissions` est léger, pas de régression de poids).
- `pnpm lint` / `pnpm check`.

### 5. Bascule

Ordre conseillé : (1) SQL socle + RLS déjà exécutés (Étapes 1-2) ; (2) déploiement du client (Étapes 3-7) ; (3) backfill grades exécuté ; (4) pré-remplissage des droits ; (5) communication aux utilisateurs. Le backfill `super_utilisateur → utilisateur` ne doit être joué **qu'après** que les droits par page sont prêts, pour éviter une fenêtre où d'ex-super se retrouvent sans rien.

## Ordre d'exécution

1. Tests d'étanchéité adversariaux (§1) — bloquants.
2. Tests fonctionnels par niveau (§2).
3. Pré-remplissage des droits (§3).
4. Validation technique (§4).
5. Bascule ordonnée (§5).

## Critère de validation

- Tous les tests d'étanchéité §1 se comportent comme attendu (écritures non autorisées **refusées en base**).
- Tous les tests fonctionnels §2 conformes.
- Aucun compte non-admin ne se retrouve sans accès au go-live (pré-remplissage fait).
- `tsc` + `build` + `lint` verts.

## Contrôle /borg

Étape critique (validation globale, dernière du plan, porte la garantie de sécurité). /borg doit auditer : la matrice de tests d'étanchéité couvre bien chaque table durcie à l'Étape 2 (aucune page oubliée) ; le pré-remplissage n'accorde pas par erreur des droits trop larges (principe du moindre privilège) ; l'ordre de bascule ne crée pas de fenêtre d'accès nul ni d'accès total transitoire ; il ne subsiste aucun chemin d'écriture non couvert par la RLS (revue croisée UI ↔ policies) ; le grade `super_utilisateur` n'est plus attribuable ni présent après backfill.
