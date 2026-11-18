# Étape 6 — Classeur : impression sûre et import LLM borné

## Objectif

- Ajouter un dernier filet contre le code injecté dans les pages imprimées, puisque la CSP garde `'unsafe-inline'`.
- Faire en sorte qu'une réponse de LLM ne puisse pas élargir sa portée par simple omission.

## Fichier(s) impacté(s)

- `src/lib/classeur/print/usePagination.ts` (ou l'endroit où la liste des pages est construite)
- `src/lib/classeur/print/xss.audit.test.ts`
- `src/components/classeur/print/DocumentPages.tsx`
- `src/lib/classeur/print/paginate.ts`
- `src/components/facturation/GalaxyChart.render.tsx`
- `src/lib/classeur/slug.ts`
- `src/lib/classeur/merge/changements.ts` + tests

## Travail à réaliser

### 1. Un DOMPurify final sur le HTML des pages

Un seul passage, quand la liste des pages est construite. Profils html, svg et svgFilters ; `foreignObject` comme point d'intégration HTML ; `style` et `data-*` gardés. Vérifier ensuite que Mermaid, KaTeX, les tableaux, les planches et les sauts de page s'affichent à l'identique.

### 2. Test XSS sur Mermaid

Ajouter à `xss.audit.test.ts` un libellé Mermaid piégé (gestionnaire `on*`, `foreignObject`), qui passe par `mermaid.ts`, puis `outerHTML`, puis la réinjection. Le détecteur existant ne doit rien trouver.

### 3. Petits nettoyages

- `DocumentPages.tsx:103` : retirer la branche morte `data:image/` et `blob:`.
- `paginate.ts:304` : `Number.isFinite(n) ? n : 1`.
- `GalaxyChart.render.tsx:507` : `escapeHtml(String(...))` dans l'infobulle de repli.
- `slug.ts` `sanitizeFilename` : retirer les caractères de contrôle et les points ou espaces de fin. Ne pas toucher à `slugify`, qui sert de clé de fusion.

### 4. Portée de l'import LLM

`destinationImport` (`changements.ts:275`) : sans `_metadata.portee`, rester dans le contexte du dialogue (le chapitre ou le document ouvert) au lieu de tout le classeur. Mettre à jour le commentaire C8 et ses tests, puis les consignes du LLM si elles en parlent.

## Ordre d'exécution

1. Tests (2), puis code (1, 3, 4).
2. `pnpm test` et `npx tsc --noEmit`.
3. Contrôle visuel sur localhost, sans rien enregistrer : documents 104 et 107 du classeur d'essai, comparés avant et après, sans débordement.

## Critère de validation

- Les tests `pipeline`, `paginate`, `buildPrintHtml`, `PageShapes` et `xss.audit` sont verts.
- Les pages A4 restent identiques au contrôle visuel.
- Un import sans portée depuis un chapitre ne touche que ce chapitre.

## Contrôle /borg

- Aucun style ni aucun SVG perdu à l'impression.
- `slugify` est inchangé.
