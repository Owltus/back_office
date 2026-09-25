# Plan — Page « Classeur »

## Contexte

Demande du 2026-09-25 : ajouter une neuvième page de navigation, « Classeur »,
vide pour l'instant, mais dont tout le câblage est en place et respecte les
pratiques de droits par page déjà en vigueur. Le contenu viendra dans un
chantier séparé.

Une page de la navbar est déclarée à trois endroits (CLAUDE.md, section
Authentification) : le registre client `PAGES`, le CHECK de
`user_page_permissions.page` et celui de `profiles.page_order`. L'ajout de
`literie` avait laissé la leçon : une page absente des CHECK en base fait
échouer l'attribution du droit depuis `/comptes` (23514), et une page absente
d'une préférence d'ordre stockée doit malgré tout apparaître (c'est
`orderedPages` qui complète).

---

## Ce qui a été fait

| # | Couche | Fichier | Nature |
|---|--------|---------|--------|
| 1 | Registre | `src/lib/permissions/pages.ts` | clé `classeur`, libellé, route `/classeur`, icône `NotebookTabs` |
| 2 | Routes | `src/routes/classeur.tsx`, `src/routes/classeur/index.tsx` | layout + page sous `PageGuard page="classeur"` ; `routeTree.gen.ts` régénéré |
| 3 | Board | `src/components/classeur/ClasseurBoard.tsx` | `PageHeader` + encart « en construction », aucune lecture Supabase |
| 4 | Base | `supabase/page_classeur_2026-09-25.sql` | les deux CHECK recréés avec la 9e clé, borne `page_order` 8 → 9, vérification en fin de script |
| 5 | Tests | `registres.test.ts`, `navigation.test.ts`, `navigation.property.test.ts`, `authorization.property.test.ts`, `RouteSkeleton.test.ts` | valeurs recopiées à la main (9 pages, 216 cellules), `/classeur` sur le repli `board` |
| 6 | Contrôle | `supabase/verif_audit_2026-09-06.sql` | contrôle n° 11 étendu à la 9e clé |
| 7 | Doc | `CLAUDE.md` | précédent à suivre pour toute page future |

Ce qui n'a PAS été fait, volontairement :

- aucune silhouette de squelette dédiée (`PageShapes`) : la page n'a pas de
  forme, le repli `board` du shell est exact ;
- aucune table, aucune policy, aucune RPC : rien à protéger tant qu'il n'y a
  pas de données ;
- aucun droit attribué à aucun compte : l'admin voit la page par son grade ;
  les autres comptes ne la verront qu'une fois le droit accordé depuis
  `/comptes`.

---

## Quand le contenu arrivera

1. Toute table nouvelle : RLS activée, lecture gatée par
   `private.get_page_level('classeur') is not null`, écriture par niveau
   (`ecriture` / `gestion`) selon le modèle `page_permissions_rls*`, jamais de
   policy `to public`, jamais `using (true)`.
2. Toute RPC privilégiée : fonction `security definer` dans `private`, relais
   `security invoker` de même signature dans `public`, garde de niveau écrite
   `is distinct from` ou `page_level_rank(...) >= n`.
3. Toute lecture : `useQuery`, `queryKey` `['classeur', '<vue>', …]` ; si elle
   est nominative, l'ajouter à `PREFIXES_SENSIBLES` (`lib/queryPersist.ts`).
4. Une silhouette dans `PageShapes.tsx` relevée sur le DOM réel, une variante
   `classeur` dans `RouteSkeleton`, et le test `PageShapes.test.tsx` qui la
   compte.
5. Fenêtre de grâce éventuelle dans `lib/permissions/actions.ts`, reprise à
   l'identique côté RLS.

---

## Critère de validation

- `npx tsc --noEmit`, `pnpm lint`, `npx vitest run` verts.
- `pnpm build` produit un chunk pour `/classeur`.
- Script SQL appliqué : les trois lignes de vérification rendent `true`,
  `true`, `0`.
- En production, admin : onglet « Classeur » visible, page rendue, réordonnable
  depuis `/profil` ; depuis `/comptes`, le droit `classeur` s'attribue sans
  erreur à un compte utilisateur.
