# Plan — Ordre des pages et page d'accueil par compte

## Contexte

La navigation affiche aujourd'hui les pages dans un ordre figé, celui du
tableau `PAGES` (`src/lib/permissions/pages.ts:35-44`) : repjour, pdj, parking,
rapro, caisse, affichage, facturation, literie. Le commentaire de ce fichier
l'énonce déjà — « l'ordre définit l'ordre d'affichage ET la page d'accueil par
défaut ». Cet ordre vaut pour tout le monde, et la racine du site redirige en
dur vers `/repjour`.

Le chantier rend cet ordre propre à chaque compte, réglable depuis la fenêtre
de gestion des comptes et depuis la page de profil, la page placée en tête
devenant la page d'accueil de ce compte.

Deux constats de la reconnaissance encadrent le travail.

Le premier est une dette déjà identifiée : le plan `droits-par-page`, étape 5,
prévoyait que « `/` et le logo pointent vers `firstAllowedPage()` au lieu de
`/repjour` en dur ». Cette étape n'a jamais été appliquée. Il en résulte un
défaut visible en production : le compte n'ayant que `parking:lecture` atterrit
sur `/repjour`, voit un squelette, puis est renvoyé sur `/parking` par
`PageGuard`. Double saut à chaque connexion. Quatre endroits codent cette
cible en dur : `src/routes/index.tsx:7`, `src/routes/login.tsx:28`,
`src/routes/login.tsx:46` et `src/components/Navbar.tsx:166`.

Le second est ce qui rend le chantier peu coûteux : la RPC de démarrage
`public.get_my_access()` construit son champ `profile` avec `to_jsonb(p)`.
Toute colonne ajoutée à `profiles` remonte donc au client sans modifier la RPC,
et se retrouve dans le cache `localStorage` hydraté de façon synchrone au
montage. La préférence est lisible au démarrage sans aucune lecture réseau
supplémentaire — l'audit du 2026-09-06 avait justement ramené deux lectures
REST à une seule.

## Remise en question (à défaut de `/rodin`)

Une passe adverse a été menée sur la pertinence du chantier, appuyée sur l'état
réel des comptes en production. Ses réserves sont conservées ici : elles ne
condamnent pas le chantier, mais elles disent où la valeur est mince.

- Sur les six comptes existants, quatre ont le même jeu de six ou sept pages.
  La personnalisation porte sur des listes quasi identiques.
- Le compte le plus utilisé, « Réception », est **partagé** entre plusieurs
  personnes. L'ordre y est un réglage de poste, modifiable par n'importe
  laquelle d'entre elles pour toutes les autres.
- La page d'accueil et l'ordre de la barre n'ont pas le même poids : l'accueil
  supprime une navigation répétée à chaque prise de service, l'ordre ne
  supprime aucun clic puisque les onglets restent tous visibles.

Ces réserves ont été présentées et le périmètre complet a été retenu.

## Décisions actées (validées le 2026-09-09)

- **Périmètre** : accueil et ordre livrés ensemble, en un seul chantier.
- **Couplage** : la page en tête de liste **est** la page d'accueil. Un seul
  réglage, donc une seule donnée à stocker. L'interface devra dire clairement
  que déplacer une page en tête change l'écran d'arrivée du compte.
- **Qui règle** : l'admin depuis `/comptes` pour n'importe quel compte, et
  chacun depuis `/profil` pour le sien.
- **Cas admin** : l'admin peut personnaliser son propre ordre comme les autres.

Ces quatre décisions tranchent le choix de stockage, qui n'est donc plus
ouvert. L'admin n'ayant **aucune ligne** dans `user_page_permissions` (son
accès total est implicite), la préférence ne peut pas être portée par les
lignes de permission. Et puisque chacun règle la sienne, la policy
`Users update own profile` — qui autorise déjà un compte à écrire toute
colonne de sa ligne hormis `role` et `email` — convient **sans modification**,
tandis que `Admin manages profiles` couvre l'écriture croisée.

Le stockage retenu est donc une **colonne `page_order text[]` nullable sur
`profiles`** : aucune policy à modifier, aucune RPC à créer, aucun changement
de `get_my_access()`, et la valeur nulle vaut « ordre du registre » pour les
six comptes existants, sans backfill.

## Angles tranchés en cours de rédaction

1. **Périmètre de la liste ordonnable** : seulement les pages accordées au
   compte. Le modal contient déjà la matrice des droits ; deux listes de huit
   lignes à tenir cohérentes dans une même fenêtre serait une source d'erreur.
   *Tranché : étapes 5 et 6.*
2. **Trace au journal** : aucune. `audit_log` est un journal de sécurité de
   seize lignes ; un ordre d'affichage que l'utilisateur peut changer lui-même
   n'y a pas sa place, et l'y écrire imposerait d'élargir le CHECK sur
   `action`. *Tranché : étape 1. Révisable si l'usage montre le contraire.*

## Divergences entre agents (non tranchées)

- **Exécution du `beforeLoad` de `/`.** L'agent « comptes » affirme qu'il
  s'exécute aussi côté serveur, ce qui interdirait de lire `localStorage`.
  L'agent « routing » démontre l'inverse : `vite.config.ts` active
  `spa: { enabled: true }`, `vercel.json` réécrit tout vers `_shell.html`, et
  `dist/client` ne contient aucune page prérendue — le `beforeLoad` s'exécute
  donc côté client à l'hydratation. L'étape 3 commence par confirmer ce point
  avant d'écrire la redirection.
- **Emplacement de `get_my_access()`.** L'énoncé de la mission la disait dans
  le schéma `private` avec un relais. Le catalogue de production la donne dans
  `public`, en `SECURITY INVOKER`, sans relais. Fait retenu : le catalogue.

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-sql-preferences-navigation.md](./1-sql-preferences-navigation.md) | Colonne `profiles.page_order`, contrainte d'inclusion, contrôles | — | P0 | 45 min | `supabase/nav_page_order_2026-09-09.sql` appliqué, `verif_*` au vert | ⚠ |
| 2 | [2-modele-client-navigation.md](./2-modele-client-navigation.md) | Métier pur : réconciliation ordre/droits, page d'accueil, types, tests | 1 | P0 | 1h | `src/lib/permissions/navigation.ts` + tests vitest | |
| 3 | [3-accueil-dynamique.md](./3-accueil-dynamique.md) | Les quatre cibles en dur remplacées, cohérence avec `PageGuard` | 2 | P0 | 1h30 | Plus aucun `/repjour` en dur, double saut supprimé | ⚠ |
| 4 | [4-navbar-ordre-personnalise.md](./4-navbar-ordre-personnalise.md) | La Navbar consomme l'ordre du compte (bureau et tiroir) | 2 | P0 | 45 min | Onglets rendus dans l'ordre du compte | |
| 5 | [5-comptes-reordonnancement.md](./5-comptes-reordonnancement.md) | Liste ordonnable dans le modal `/comptes` (admin, tout compte) | 4 | P1 | 1h30 | Ordre modifiable par l'admin | |
| 6 | [6-profil-libre-service.md](./6-profil-libre-service.md) | Même liste sur `/profil`, pour son propre compte | 5 | P1 | 45 min | Chacun règle son ordre sans passer par l'admin | |
| 7 | [7-validation-globale.md](./7-validation-globale.md) | Contrôles SQL, parcours, tests, build, `CLAUDE.md` | 1-6 | P0 | 1h | Chantier vérifié de bout en bout | ⚠ |

## Ordre d'exécution

Séquentiel strict. Les étapes 1 à 4 forment un socle cohérent et déjà utile —
l'ordre est lu et appliqué partout, la page d'accueil suit, le double saut
disparaît — mais rien n'est encore réglable depuis l'interface. Les étapes 5
et 6 ouvrent le réglage, d'abord à l'admin puis à chacun.

Discipline de production, conforme au projet : le script SQL de l'étape 1 est
écrit et commité **avant** d'être appliqué, essayé à blanc dans une transaction
annulée, puis appliqué par `supabase db query --linked -f`. Aucune opération
destructive n'est prévue ; si une s'imposait, elle demanderait une
confirmation explicite.

## Architecture cible

```
supabase/
  nav_page_order_2026-09-09.sql         [nouveau]  colonne + CHECK + contrôles

src/lib/permissions/
  pages.ts                              [modifié]  registre : ordre = repli, plus une loi
  navigation.ts                         [nouveau]  orderedPages, homePage, homeRoute
  navigation.test.ts                    [nouveau]  réconciliation, replis, cas limites
  index.ts                              [modifié]  firstAllowedPage devient un repli

src/lib/auth/
  access.ts                             [modifié]  lecture de page_order
src/lib/repjour/
  types.ts                              [modifié]  Profile étendu

src/components/auth/
  AuthContext.tsx                       [modifié]  expose l'ordre et l'accueil
  PageGuard.tsx                         [modifié]  repli aligné sur la même source
src/components/
  Navbar.tsx                            [modifié]  onglets ordonnés, logo dynamique
src/components/comptes/
  PageOrderList.tsx                     [nouveau]  liste ordonnable, partagée
src/routes/
  index.tsx                             [modifié]  redirection dynamique
  login.tsx                             [modifié]  deux cibles dynamiques
src/components/repjour/boards/
  ComptesBoard.tsx                      [modifié]  liste ordonnable dans le modal
  ProfilBoard.tsx                       [modifié]  même liste, compte courant
```

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|-------------------|-------------------|
| SQL Supabase | 0 | 1 |
| Métier (lib) | 4 | 2 |
| Composants et routes | 7 | 1 |
| **Total** | **11 modifiés** | **4 nouveaux** |

## Différé (hors chantier, à garder en tête)

- Le glisser-déposer pour réordonner : aucune dépendance de ce type n'existe
  dans le projet, et une paire de boutons de montée et descente couvre le
  besoin tout en restant accessible au clavier et au doigt.
- Le gel de l'ordre pendant une séance de travail. La revalidation des droits
  tourne toutes les trois minutes et rapatrie le profil : un ordre modifié par
  l'admin réorganise la barre sous le curseur de l'utilisateur. Acceptable au
  vu de la fréquence attendue, à revoir si le cas se produit.
- La suppression de `ROLE_HOME` (`src/lib/repjour/roles.ts`) et de
  `ProtectedRoute`, vestiges de la migration « droits par page » qui codent
  eux aussi `/repjour` en dur pour `/profil`, `/comptes` et `/easter-eggs`.
- Une trace au journal des changements d'ordre, si l'usage montre qu'elle
  manque.
