# Plan — Page « Classeur » : portage de Registre

## Contexte

Le 2026-09-25, la page `classeur` a été câblée vide (registre `PAGES`, routes,
garde, CHECK en base joués — voir la section « Socle » plus bas). Le même jour,
l'utilisateur a demandé d'y **porter son projet Registre**
(`github.com/Owltus/Registre`, 10 700 lignes de front + 1 965 lignes de Rust) :
une application de bureau Tauri v2 + SQLite pour constituer des classeurs
réglementaires (registre de sécurité, carnet sanitaire) structurés par
chapitres et prêts à imprimer.

Consigne explicite : **aucun Rust, tout dans notre stack** (TanStack Start +
TanStack Query + Supabase + RLS par page), « proprement ». C'est un PORTAGE,
pas une fusion : le métier et l'interface se transportent, toute la couche
système (SQLite, dialogues natifs, Edge headless, commandes Tauri) est
réécrite.

Ce qui fait la valeur du projet source, et qu'on garde tel quel :

- un **moteur de pagination A4** pur DOM (veuves/orphelines, tableaux avec
  en-tête répété, listes découpées), avec aperçu à l'écran et impression
  via iframe ;
- des **documents Markdown** riches (GFM, formules KaTeX, diagrammes
  Mermaid, saut de page `===`) ;
- quatre types d'éléments par chapitre : document, feuille de suivi
  périodique, feuille de signature, intercalaire ;
- un **format d'échange JSON v2** (export, import comme nouveau classeur,
  fusion avec prévisualisation, historique et retour arrière).

## Décisions prises (assumées, à contester si besoin)

- **Multi-classeurs conservé** : c'est la structure source, ça coûte peu, et
  ça permet plusieurs registres (sécurité, sanitaire…).
- **Tables préfixées `classeur_`**, identifiants `bigint identity` (les
  routes restent numériques comme dans Registre), colonne `uuid` conservée
  (clé de fusion), **suppression douce** (`deleted_at`) conservée.
- **Droits** : `lecture` = consulter + imprimer ; `ecriture` = créer,
  modifier, réordonner, supprimer (douce) chapitres et éléments, importer
  et fusionner ; `gestion` = supprimer un classeur, restaurer un
  instantané, purger l'historique. Aucune fenêtre de grâce (pas de notion
  de jour).
- **Préférences** (thème) abandonnées : le Back Office a son thème.
- **PDF** : dialogue d'impression du navigateur (« Enregistrer en PDF ») sur
  le même HTML A4, via l'iframe que Registre utilise déjà. Pas de jsPDF ici :
  le contenu est du Markdown mis en page par le DOM, pas un document dessiné.
- **Fichiers** : `<input type=file>` + téléchargement de `Blob`, bornés par
  `lib/shared/files.ts`.
- **Cache persisté** : aucune donnée nominative, les clés `['classeur', …]`
  peuvent être écrites sur disque. Toutes les `queryFn` rendent des objets
  nus (règle `survitAuJson`).
- **Bibliothèques ajoutées** : `react-markdown`, `remark-gfm`, `remark-math`,
  `rehype-katex`, `katex` (dans le chunk de la route) ; `mermaid` et `jszip`
  chargés par `import()` à l'usage (lourds, rarement nécessaires).
- **Données existantes** : non connues à ce jour. L'import JSON (étape 6)
  est le vecteur de migration depuis Registre.

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-base.md](./1-base.md) | Schéma Postgres, triggers, RLS, seed | — | P0 | 2h | `supabase/classeur_2026-09-25.sql` joué et vérifié | ⚠ |
| 2 | [2-metier.md](./2-metier.md) | Types, clés TanStack, service Supabase, utilitaires purs | 1 | P0 | 2h | `lib/classeur/*` + tests | |
| 3 | [3-impression.md](./3-impression.md) | Moteur A4, rendu Markdown, CSS | 2 | P0 | 3h | `lib/classeur/print/*`, `components/classeur/print/*`, `styles/classeur.css` | |
| 4 | [4-pages.md](./4-pages.md) | Routes et pages : liste, tableau de bord, chapitre, détails, dialogues | 2, 3 | P0 | 6h | `routes/classeur/*`, `components/classeur/*` | ⚠ |
| 5 | [5-exports.md](./5-exports.md) | Export Markdown ZIP, export JSON, impression | 3, 4 | P1 | 2h | `lib/classeur/export*.ts` | |
| 6 | [6-import-fusion.md](./6-import-fusion.md) | Import JSON, fusion avec prévisualisation, historique, retour arrière | 2, 4 | P1 | 4h | `lib/classeur/merge/*` + tests + dialogue | ⚠ |
| 7 | [7-cloture.md](./7-cloture.md) | Squelette, doc, mémoire, vérifications, revue adverse | 1-6 | P0 | 2h | CLAUDE.md, `PageShapes`, tests verts, build, contrôle en prod | ⚠ |
| 8 | [8-points-restauration.md](./8-points-restauration.md) | Points de restauration mineurs/majeurs (2026-09-26, livré, à valider) | 6 | P1 | 4h | `lib/classeur/restauration.ts`, SQL joué, dialogue | ⚠ |

## Ordre d'exécution

1. Étapes 1 et 2 (socle, contrats) — en série, par l'orchestrateur.
2. Étapes 3 et 6a (moteur d'impression ; logique de fusion pure + tests) — en
   parallèle, elles ne partagent rien.
3. Étape 4 (pages) puis 5 et 6b (dialogues d'export/import branchés sur 4).
4. Étape 7.

## Architecture cible

```
src/routes/classeur.tsx                    layout (Outlet)
src/routes/classeur/index.tsx              liste des classeurs
src/routes/classeur/$classeurId.tsx        layout : colonne chapitres + Outlet
src/routes/classeur/$classeurId/index.tsx  tableau de bord (chapitres, sommaire, exports)
src/routes/classeur/$classeurId/$chapterId.tsx           layout chapitre
src/routes/classeur/$classeurId/$chapterId/index.tsx     page chapitre (éléments)
src/routes/classeur/$classeurId/$chapterId/document.$id.tsx
src/routes/classeur/$classeurId/$chapterId/suivi.$id.tsx
src/routes/classeur/$classeurId/$chapterId/signature.$id.tsx
src/routes/classeur/$classeurId/$chapterId/intercalaire.$id.tsx

src/lib/classeur/{types,keys,service,slug,naming}.ts       métier + accès données
src/lib/classeur/print/{constants,paginate,preprocessPageBreaks,buildPrintHtml,printIframe,usePagination}.ts
src/lib/classeur/{exportMarkdown,exportJson}.ts
src/lib/classeur/merge/{schema,merge,history}.ts           fusion pure (portée du Rust)
src/components/classeur/print/*                            A4Page, pages, sommaire, aperçu
src/components/classeur/{ClasseurBoard,ClasseurList,ClasseurDashboard,ChapterBoard,...}.tsx
src/components/classeur/detail/*                           quatre pages de détail
src/components/classeur/dialogs/*
src/styles/classeur.css                                    préfixe .classeur-* + .a4-page/.pdf-prose (moteur)
supabase/classeur_2026-09-25.sql
```

## Socle déjà livré (2026-09-25, commit `df607fc`)

| # | Couche | Fichier | Nature |
|---|--------|---------|--------|
| a | Registre | `src/lib/permissions/pages.ts` | clé `classeur`, route `/classeur`, icône `NotebookTabs` |
| b | Routes | `src/routes/classeur.tsx`, `src/routes/classeur/index.tsx` | layout + page sous `PageGuard page="classeur"` |
| c | Board | `src/components/classeur/ClasseurBoard.tsx` | encart « en construction » (remplacé à l'étape 4) |
| d | Base | `supabase/page_classeur_2026-09-25.sql` | les deux CHECK avec la 9e clé, JOUÉ |
| e | Tests | permissions + squelette | 9 pages, 216 cellules |

## Critère de validation global

- `npx tsc --noEmit`, `pnpm lint`, `npx vitest run`, `pnpm build` verts.
- `supabase/verif_advisor.sql` et `verif_audit_2026-09-06.sql` inchangés (OK).
- En production, avec le compte admin : créer un classeur, un chapitre, un
  document Markdown avec tableau et formule, l'imprimer en PDF ; exporter le
  JSON, le réimporter dans un nouveau classeur ; la fusion prévisualise et
  laisse un instantané restaurable.
