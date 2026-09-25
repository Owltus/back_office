# Étape 2 — Métier pur : types, clés, service, utilitaires

## Objectif

Remplacer l'adaptateur SQLite générique et les hooks maison de Registre
(`useQuery` à base de `useEffect`, bus d'événements) par un service Supabase
typé et des clés TanStack Query, sans React.

## Fichier(s) impacté(s)

- `src/lib/classeur/types.ts` — lignes DB (snake_case comme la base), union
  `ChapterItem`, `computeStatus`, `statusConfig`
- `src/lib/classeur/keys.ts` — `classeurKeys` (`list`, `one`, `chapters`,
  `chapter`, `items`, `classeurItems`, `periodicites`, `mergeHistory`)
- `src/lib/classeur/service.ts` — lectures à colonnes explicites, écritures,
  suppression douce, réordonnancement, déplacement d'éléments
- `src/lib/classeur/slug.ts` — `slugify`, `stripAccents`, `sanitizeFilename`
- `src/lib/classeur/naming.ts` — `DEFAULT_REGISTRY_NAME`, `buildEstablishment`,
  `formatDate`, icônes Lucide (`getChapterIcon`, `iconEntries`)
- Tests : `slug.test.ts`, `types.test.ts`, `service.test.ts` (client Supabase
  simulé : forme des requêtes, filtre `deleted_at`, tri `sort_order`)

## Travail à réaliser

1. Types miroirs des tables de l'étape 1.
2. Service : chaque `queryFn` rend des objets nus (JSON-safe), jamais de
   `Set`/`Map` — règle `survitAuJson`.
3. Écritures : `insert().select('id').single()` pour rendre l'identifiant ;
   suppression douce = `update({ deleted_at })` ; suppression d'un classeur =
   suppression douce du classeur seul (les enfants suivent par navigation).
4. Réordonnancement : une écriture par ligne déplacée (pas de RPC),
   `sort_order` recalculé côté client.
5. Invalidation : les composants invalident `classeurKeys.*` après mutation ;
   pas d'événements maison.

## Critère de validation

- `npx vitest run src/lib/classeur` vert.
- Aucun `select('*')`.
