# Étape 3 — Impression : moteur A4, rendu Markdown, CSS

## Objectif

Porter tel quel le moteur de pagination de Registre et ses composants de
page, en remplaçant la génération PDF par Edge headless par le dialogue
d'impression du navigateur.

## Fichier(s) impacté(s)

- `src/lib/classeur/print/constants.ts`, `paginate.ts`,
  `preprocessPageBreaks.ts`, `buildPrintHtml.ts`, `printIframe.ts`,
  `usePagination.ts` — portés depuis `Registre/src/lib/print/`
- `src/lib/classeur/mermaid.ts` — thème Mermaid, chargement par `import()`
- `src/components/classeur/print/{A4Page,PageHeader,PageFooter,DocumentPages,
  TrackingSheetPage,SignatureSheetPage,IntercalaireSheet,CoverPage,
  ClasseurCoverPage,TableOfContentsPage,PrintPreview}.tsx`
- `src/components/classeur/MermaidBlock.tsx`
- `src/styles/classeur.css` — `.a4-page`, `.pdf-prose`, `.tracking-table`,
  `.classeur-*` ; chaîné dans `src/styles.css`
- `package.json` — `react-markdown`, `remark-gfm`, `remark-math`,
  `rehype-katex`, `katex`, `mermaid`

## Travail à réaliser

1. Copier le moteur (`paginate.ts` 382 lignes) sans le modifier au-delà des
   conventions (`#/` avec extension, simple quotes, sans point-virgule,
   named exports).
2. `DocumentPages` : `react-markdown` + GFM + math + KaTeX ; `MermaidBlock`
   charge `mermaid` par `import()` au premier diagramme seulement.
3. Les pages A4 restent BLANCHES à l'écran quel que soit le thème (l'app est
   en dark navy) : la variante `themed` de Registre n'est conservée que pour
   les miniatures.
4. `printIframe.ts` : inchangé (pur navigateur). La CSP autorise
   `style-src 'unsafe-inline'` et `frame-src blob:` ; l'iframe `about:blank`
   hérite de la CSP du parent, ce qui suffit.
5. Import de la feuille KaTeX (`katex/dist/katex.min.css`) dans
   `classeur.css` ; ses polices sont servies par notre domaine
   (`font-src 'self' data:`).

## Critère de validation

- `paginate.test.ts` en jsdom : un contenu de 3 titres + un tableau de 20
  lignes rend > 1 page, l'en-tête de tableau est répété, aucun titre seul en
  fin de page.
- Le chunk de la route `/classeur` n'inclut pas `mermaid` (vérifier
  `pnpm build`).
