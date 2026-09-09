# Étape 2 — Modèle client de la navigation

## Objectif

Écrire, en métier pur et testable, les deux règles dont tout le reste dépend :
l'ordre effectif des pages d'un compte, et sa page d'accueil.

## Contexte

Aujourd'hui ces deux notions sont confondues dans une seule ligne de code :
`firstAllowedPage()` (`src/lib/permissions/index.ts:45-47`) prend la première
page de `PAGES` que le compte peut voir. Son unique appelant est
`PageGuard.tsx:96`. Le registre `PAGES` reste la source des libellés, des
routes et des icônes ; ce qui change, c'est que son ordre devient un **repli**
et non plus une loi.

La règle de réconciliation est le point le plus important de tout le chantier.
Une préférence stockée peut désigner une page à laquelle le compte n'a plus
droit, ou ignorer une page qu'on vient de lui accorder — c'est arrivé au
projet lors de l'ajout de `literie`. Une nouvelle page ne doit jamais devenir
invisible pour les comptes existants.

## Fichier(s) impacté(s)

- `src/lib/permissions/navigation.ts` (nouveau)
- `src/lib/permissions/navigation.test.ts` (nouveau)
- `src/lib/permissions/index.ts` (modifié)
- `src/lib/permissions/pages.ts` (modifié : commentaire de tête)
- `src/lib/auth/access.ts` (modifié)
- `src/lib/repjour/types.ts` (modifié)

## Travail à réaliser

### 1. La réconciliation

```ts
export function orderedPages(
  perms: PagePermissions,
  grade: Grade,
  stored: readonly string[] | null,
): PageDef[]
```

Règle, dans cet ordre :

1. filtrer `stored` sur les clés connues de `PAGES` — une clé inconnue est
   ignorée en silence, jamais une erreur ;
2. ne garder que les pages visibles (`canView`) ;
3. compléter avec les pages visibles absentes de `stored`, dans l'ordre du
   registre.

Ce troisième point rend inutile toute maintenance de la préférence lors d'un
octroi ou d'un retrait de droit : la donnée peut rester partielle et périmée
sans jamais produire d'affichage faux.

### 2. La page d'accueil

Décision actée : la page d'accueil **est** la tête de l'ordre effectif. La
fonction se réduit donc à cette lecture, ce qui a une vertu : elle ne peut pas
désigner une page non autorisée, puisque `orderedPages` a déjà filtré.

```ts
export function homePage(
  perms: PagePermissions,
  grade: Grade,
  stored: readonly string[] | null,
): PageKey | null
```

Renvoie `null` quand le compte n'a aucune page — `PageGuard` affiche déjà
`NoAccessNotice` dans ce cas. Le point à ne pas manquer : **aucun chemin de
repli ne relit la préférence brute**, sinon une préférence invalide produit une
boucle de redirection.

Ajouter `homeRoute(...)` qui renvoie la route à donner au routeur, en passant
par `PAGE_BY_KEY`.

### 3. Le contrat de lecture

Étendre `Profile` (`src/lib/repjour/types.ts`) d'un champ `page_order` nullable
et le parsing de `parseMyAccess` (`src/lib/auth/access.ts`) — la colonne arrive
seule dans la charge, `get_my_access()` employant `to_jsonb(p)`.

Rester tolérant, dans l'esprit de `toPagePermissions` : une valeur absente,
nulle ou d'un type inattendu vaut « aucune préférence », jamais une exception. La doctrine des trois issues du
fichier (erreur réseau, profil disparu, droits vides) ne change pas.

### 4. Les tests

`navigation.test.ts` couvre au minimum : préférence nulle ; préférence
partielle ; préférence contenant une page non autorisée ; préférence
contenant une clé inconnue ; préférence contenant un doublon ; page
nouvellement accordée absente de la préférence ; compte sans aucun droit ;
compte admin (`grade === 'admin'`, donc `gestion` partout sans ligne de
permission) ; page de tête devenue inaccessible, dont l'accueil doit basculer
sur la suivante.

## Ordre d'exécution

1. Écrire `navigation.ts` et ses tests.
2. Étendre le type `Profile` et `parseMyAccess`, compléter `access.test.ts`.
3. Marquer `firstAllowedPage` comme repli — ne pas la supprimer, `PageGuard`
   s'en sert et l'étape 3 l'alignera.
4. Corriger le commentaire de tête de `pages.ts` : l'ordre du registre n'est
   plus la loi, c'est le repli.

## Critère de validation

- `npx tsc --noEmit` sans erreur.
- Les nouveaux tests passent, et le total de la suite reste vert.
- Aucune fonction de ce fichier n'importe React : le module est pur.
- Un appel avec une préférence nulle rend exactement l'ordre actuel de
  `PAGES` filtré par les droits — l'absence de préférence ne change rien.

## Contrôle qualité (revue)

Non critique, mais deux points à relire : la réconciliation ne doit jamais
perdre une page autorisée, et `homePage` ne doit jamais renvoyer une page non
autorisée. Ces deux propriétés méritent chacune un test nommé explicitement,
car ce sont elles qui empêchent respectivement une page invisible et une
boucle de redirection.
